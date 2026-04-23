import functions_framework
from google.cloud import storage
import json
from google.cloud import bigquery
from datetime import datetime, timezone
from google.cloud.exceptions import NotFound
import google.auth.transport.requests
import google.oauth2.id_token
import os
import requests
import time
import numpy as np

# Triggered by a change in a storage bucket
@functions_framework.cloud_event
def catalog_and_insert(cloud_event):
    data = cloud_event.data

    event_id = cloud_event["id"]
    event_type = cloud_event["type"]

    bucket_name = data["bucket"]
    file_name = data["name"]

    print(f"Event Details:\nID: {event_id}\nType: {event_type}\nBucket: {bucket_name}\nFile: {file_name}")

    # Access the Cloud Storage client
    storage_client = storage.Client()

    # Get the bucket object
    bucket = storage_client.bucket(bucket_name)

    # Get the file object
    blob = bucket.blob(file_name)

    # Download the file contents as a string
    contents = blob.download_as_string()

    try:
        # Assuming the file contains a list of JSON objects
        json_data_list = json.loads(contents.decode("utf-8"))

        if isinstance(json_data_list, list):
            # Call process_data and pass the list of JSON objects
            process_data(json_data_list)
        else:
            print("The uploaded file does not contain a list of JSON objects.")

    except json.JSONDecodeError as e:
        print(f"Error decoding JSON: {e}")

    # Deleting the file from the bucket after processing
    blob.delete()
    print(f"Blob {file_name} deleted.")

# Returns 3 sets of strings to catalog by
def extract_paths(json_list):
    _id_set = set()
    mac_address_set = set()
    exp_name_set = set()

    for json_obj in json_list:
        # Extract _id
        _id = json_obj.get('Owner', None)
        if _id:
            _id_set.add(_id)

        # Extract MAC_address
        mac_address = json_obj.get('ExperimentData', {}).get('MAC_address', None)
        if mac_address:
            mac_address_set.add(mac_address)

        # Extract Exp_name
        exp_name = json_obj.get('ExperimentData', {}).get('Exp_name', None)
        if exp_name:
            exp_name_set.add(exp_name)

    return _id_set, mac_address_set, exp_name_set


# Splits the lists into smaller lists to be processed by a separate cloud function
def send_lists_to_gcs(json_list, size_of_list):
    # Cloud Function URL
    cloud_function_url = "https://me-west1-iucc-f4d.cloudfunctions.net/upload_To_bucket"

    # Function to split the list into smaller lists
    def split_into_lists(lst, size_of_list):
        for i in range(0, len(lst), size_of_list):
            yield lst[i:i + size_of_list]

    # Function to get the ID token for authentication
    def get_id_token(audience):
        auth_req = google.auth.transport.requests.Request()
        id_token = google.oauth2.id_token.fetch_id_token(auth_req, audience)
        return id_token

    # Split json_list into smaller lists
    lists = split_into_lists(json_list, size_of_list)

    # Get the ID token for authorization
    id_token = get_id_token(cloud_function_url)

    for list_number, current_list in enumerate(lists, start=1):
        # Convert the current list to a JSON payload
        payload = json.dumps(current_list)
        headers = {
            'Content-Type': 'application/json',
            'Authorization': f'Bearer {id_token}'  # Add ID token to the headers
        }

        try:
            # Send the current list via HTTP POST request to the cloud function
            response = requests.post(cloud_function_url, data=payload, headers=headers)

            # Check if the request was successful
            if response.status_code == 200:
                continue
            else:
                print(f"Failed to send list {list_number}. Status code: {response.status_code}")
                print(f"Response: {response.text}")
        except requests.exceptions.RequestException as e:
            print(f"An error occurred while sending list {list_number}: {e}")


def create_bq_datasets_and_tables(_id_set, mac_address_set, json_sample):
    # Initialize the BigQuery client
    client = bigquery.Client()

    # Helper function to create dataset if it doesn't exist
    def create_dataset_if_not_exists(dataset_id):
        try:
            client.get_dataset(dataset_id)
            print(f"Dataset {dataset_id} already exists.")
        except NotFound:
            dataset = bigquery.Dataset(dataset_id)
            dataset.location = "US"  # Set location; you can customize this
            client.create_dataset(dataset)
            print(f"Created dataset {dataset_id}.")

    # Helper function to create table if it doesn't exist
    def create_table_if_not_exists(dataset_id, table_id, schema):
        table_ref = f"{dataset_id}.{table_id}"
        try:
            client.get_table(table_ref)
            print(f"Table {table_id} already exists in dataset {dataset_id}.")
        except NotFound:
            table = bigquery.Table(table_ref, schema=schema)
            client.create_table(table)
            print(f"Created table {table_id} in dataset {dataset_id}.")

    # Recursive function to build schema from JSON structure
    def create_schema(json_obj, prefix=""):
        schema = []
        for key, value in json_obj.items():
            # Sanitize the key by replacing invalid characters like '$' and '.' with '_'
            sanitized_key = key.replace('$', '_').replace('.', '_')
            field_name = f"{prefix}{sanitized_key}" if prefix else sanitized_key

            if isinstance(value, dict):
                # Recursively process nested fields
                schema.extend(create_schema(value, prefix=f"{field_name}_"))
            elif isinstance(value, list):
                # Treat lists as repeated fields
                schema.append(bigquery.SchemaField(field_name, "STRING", mode="REPEATED"))
            else:
                # Determine field type and add it to the schema
                if isinstance(value, int): # nir change 20241217
                    field_type = "FLOAT64"
                elif isinstance(value, float):
                    field_type = "FLOAT64"
                elif isinstance(value, str):
                    # Check for timestamp fields
                    if 'TimeStamp' in key:
                        field_type = "TIMESTAMP"
                    else:
                        field_type = "STRING"
                else:
                    field_type = "STRING"

                schema.append(bigquery.SchemaField(field_name, field_type))

        return schema

    # Loop through each _id (dataset) and MAC_address (table)
    for _id in _id_set:
        dataset_id = f"{client.project}.{_id}"
        # Create dataset if it doesn't exist
        create_dataset_if_not_exists(dataset_id)

        for mac_address in mac_address_set:
            # Create schema from the sample JSON object
            schema = create_schema(json_sample)
            # Add the InsertDate field
            schema.append(bigquery.SchemaField("InsertDate", "TIMESTAMP"))
            # Create table if it doesn't exist
            create_table_if_not_exists(dataset_id, mac_address, schema)


# function that maps the datasets\tables to a list of JSONs to be batch inserted into BigQuery
def map_tables_to_lists(json_list):
    # Initialize the BigQuery client
    client = bigquery.Client()

    # Map to hold the result
    table_map = {}

    # Fetch all datasets in the project
    datasets = client.list_datasets()  # List of DatasetListItem
    for dataset in datasets:
        dataset_id = dataset.dataset_id

        # Fetch all tables in the dataset
        tables = client.list_tables(dataset_id)
        for table in tables:
            table_id = table.table_id

            # Create a key for the map in the format "dataset_id;table_id"
            key = f"{dataset_id};{table_id}"
            # Initialize an empty list for this key
            table_map[key] = []

    # Go over the json_list and map each JSON to the correct key
    for json_obj in json_list:
        # Extract the _id and MAC_address from the JSON
        _id = json_obj.get('Owner', None)
        mac_address = json_obj.get('ExperimentData', {}).get('MAC_address', None)

        if _id and mac_address:
            # Create the corresponding key for the JSON in the format "_id;mac_address"
            key = f"{_id};{mac_address}"

            # Add the JSON to the map under the correct key
            if key in table_map:
                table_map[key].append(json_obj)
            else:
                print(f"Warning: No matching dataset and table found for key {key}")

    return table_map

# this function adds new columns if needed
def update_table_schema_if_needed(table_ref, flattened_rows):
    """
    Check if new columns exist in the data and add them dynamically to the table schema.
    """
    client = bigquery.Client()
    table = client.get_table(table_ref)  # Fetch the current table schema
    existing_fields = {field.name for field in table.schema}
    new_fields = []

    # Identify new fields from the data
    for row in flattened_rows:
        for field_name, value in row.items():
            if field_name not in existing_fields:
                # Dynamically determine the field type
                if isinstance(value, int):
                    field_type = "FLOAT64"  # Use FLOAT64 for integers - for edge cases 
                elif isinstance(value, float):
                    field_type = "FLOAT64"  # Use FLOAT64 for floating-point numbers
                elif isinstance(value, str):
                    field_type = "STRING"  # Use STRING for text
                else:
                    field_type = "STRING"  # Default to STRING for unsupported types

                new_fields.append(bigquery.SchemaField(field_name, field_type))

    if new_fields:
        # Update the table schema
        updated_schema = table.schema + new_fields
        table.schema = updated_schema
        client.update_table(table, ["schema"])
        print(f"4.5 - Added new columns to table {table_ref}: {[field.name for field in new_fields]}")


def batch_insert_to_bq(table_map):
    # Initialize the BigQuery client
    client = bigquery.Client()

    # Iterate over the table_map
    for key, json_list in table_map.items():
        # Split the key to get dataset_id and table_id
        dataset_id, table_id = key.split(";")

        # Create the full table reference
        table_ref = f"{client.project}.{dataset_id}.{table_id}"

        # Prepare the rows to insert
        rows_to_insert = []
        for json_obj in json_list:
            # Add InsertDate field with the current timestamp

            # Getting current time
            current_timestamp = datetime.now(timezone.utc)

            # Format the timestamp as a string suitable for BigQuery (removing the timezone offset)
            formatted_timestamp = current_timestamp.strftime('%Y-%m-%d %H:%M:%S.%f')[:-3]  # Microsecond precision

            json_obj["InsertDate"] = formatted_timestamp

            # Flatten the JSON object to match BigQuery schema (no nested structures)
            flattened_row = flatten_json(json_obj)
            rows_to_insert.append(flattened_row)

        if rows_to_insert:
            # 20241218 - update chema if neede before insering rows
            update_table_schema_if_needed(table_ref, rows_to_insert)


            # Insert rows into BigQuery table
            errors = client.insert_rows_json(table_ref, rows_to_insert)

            if errors:
                print(f"Errors occurred while inserting into {table_ref}: {errors}")
            else:
                print(f"Successfully inserted {len(rows_to_insert)} rows into {table_ref}")


# Helper function to flatten JSON objects (handle nested structures)
def flatten_json(json_obj, parent_key='', sep='_'):
    flattened = {}
    for key, value in json_obj.items():
        # Sanitize the key by replacing invalid characters like '$' and '.' with '_'
        sanitized_key = key.replace('$', '_').replace('.', '_')
        new_key = f"{parent_key}{sep}{sanitized_key}" if parent_key else sanitized_key
        
        if isinstance(value, dict):
            # Recursively flatten nested dictionaries
            flattened.update(flatten_json(value, new_key, sep=sep))
        elif isinstance(value, list):
            # Option 1: Convert lists to strings by joining elements with a comma
            # flattened[new_key] = ', '.join(map(str, value))

            # Option 2: Treat lists as repeated fields (if using BigQuery's REPEATED mode)
            flattened[new_key] = value

        elif isinstance(value, str) and 'TimeStamp' in key:
            # Convert timestamp strings to a proper timestamp format if needed
            try:
                # Assuming the value is in ISO format, customize as needed
                flattened[new_key] = datetime.strptime(value, '%Y-%m-%dT%H:%M:%S.%fZ').isoformat()
            except ValueError:
                # If parsing fails, keep the original value
                flattened[new_key] = value
        else:
            flattened[new_key] = value

    return flattened

def convert_ndarray_to_list(data):
    """
    Recursively converts all NumPy ndarray elements in the payload to lists.
    """
    if isinstance(data, dict):
        return {key: convert_ndarray_to_list(value) for key, value in data.items()}
    elif isinstance(data, list):
        return [convert_ndarray_to_list(element) for element in data]
    elif isinstance(data, np.ndarray):
        return data.tolist()
    else:
        return data


def update_labels_cf(payload):
    import requests
    import google.auth.transport.requests
    import google.oauth2.id_token

    # Cloud Function URL
    cloud_function_url = "https://me-west1-iucc-f4d.cloudfunctions.net/update-labels"

    # Function to get the ID token for authentication
    def get_id_token(audience):
        auth_req = google.auth.transport.requests.Request()
        id_token = google.oauth2.id_token.fetch_id_token(auth_req, audience)
        return id_token

    # Convert ndarray elements in the payload to lists
    payload = convert_ndarray_to_list(payload)

    id_token = get_id_token(cloud_function_url)

    headers = {
        'Content-Type': 'application/json',
        'Authorization': f'Bearer {id_token}'
    }

    try:
        response = requests.post(cloud_function_url, json=payload, headers=headers)

        if response.status_code == 200:
            print("Successfully sent the JSON payload.")
            print("Response:", response.json())
        else:
            print(f"Failed to send JSON. Status code: {response.status_code}")
            print("Response:", response.text)
    except requests.exceptions.RequestException as e:
        print("An error occurred:", e)


def process_data(json_list):
    start_time = time.time()
    # Step 1: extract_paths (process_json_data)
    _id_set, mac_address_set, exp_name_set = extract_paths(json_list)
    print("Completed path extraction (step 1)")

    # Step 2: send_lists_to_gcs
    size_of_list = 50
    send_lists_to_gcs(json_list, size_of_list)
    print("JSON list split and sent to multiple cloud functions (step 2)") 

    # Step 3: create_bq_datasets_and_tables
    # Use the first JSON object as a sample for creating the schema
    create_bq_datasets_and_tables(_id_set, mac_address_set, json_list[0])
    print("Completed dataset and table creation (step 3)")

    # Step 4: map_tables_to_lists
    table_map = map_tables_to_lists(json_list)
    print("Completed JSON list mapping (step 4)")

    # Step 5: batch_insert_to_bq
    batch_insert_to_bq(table_map)
    print("Completed BigQuery batch inserts (step 5)")

    #Step 6: sends the first JSON to udpate labels CF
    #update_labels_cf(json_list[0])
    #print("Completed Sending to update labels CF (step 6)")
    
    end_time = time.time()
    execution_time = end_time - start_time
    print(f"Execution time: {execution_time} seconds")
