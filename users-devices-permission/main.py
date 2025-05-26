import functions_framework
import logging
import time
from google.cloud import bigquery
from google.cloud.exceptions import NotFound, GoogleCloudError

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# BigQuery settings
DATASET_ID = "user_device_permission"
TABLE_ID = "mac_to_device"

TABLE_SCHEMA = [
    bigquery.SchemaField("mac_address", "STRING", mode="REQUIRED"),
    bigquery.SchemaField("owner", "STRING", mode="NULLABLE"),
    bigquery.SchemaField("table_name", "STRING", mode="NULLABLE"),
    bigquery.SchemaField("description", "STRING", mode="NULLABLE"),
    bigquery.SchemaField("ip_addresses", "STRING", mode="REPEATED"),
]

@functions_framework.http
def create_or_update_mac_entry(request):
    """Cloud Function to manage MAC address and associated data in BigQuery."""
    
    print("Step.1 - Received request")  

    try:
        request_json = request.get_json(silent=True)
        print(f"Step.2 - Raw Request Data: {request_json}")

        if not request_json:
            print("Step.3 - Invalid request: No JSON body found.")
            return {"error": "Invalid request. No JSON body found."}, 400

        if isinstance(request_json.get("ip_addresses"), str):
            request_json["ip_addresses"] = [request_json["ip_addresses"]]

        if "mac_address" not in request_json or not request_json["mac_address"]:
            print("Step.4 - mac_address is missing in request.")
            return {"error": "mac_address is required."}, 400

        client = bigquery.Client()
    
        print("Step.5 - Ensuring dataset and table exist...")
        create_dataset_and_table(client)

        mac_address = request_json["mac_address"]
        new_ip = request_json["ip_addresses"][0] if request_json["ip_addresses"] else None
        new_owner = request_json.get("owner")
        new_table_name = request_json.get("table_name")
        new_description = request_json.get("description")

        print(f"Step.6 - Checking if MAC exists: {mac_address}")
        if check_mac_exists(client, mac_address):
            print(f"Step.7 - MAC {mac_address} found in database.")
            if new_owner and not does_device_exist(client, mac_address, new_owner):
                print(f"Step.8 - New device detected (mac + owner). Updating metadata.")
                update_owner_and_metadata(client, mac_address, new_owner, new_table_name, new_description)
            else:
                print("Step.8 - Device already exists with this mac + owner. Skipping table_name update.")

            # # Check if the owner has changed
            # current_owner = get_current_owner(client, mac_address)
            # if new_owner and new_owner != current_owner:
            #     print(f"Step.8 - Updating owner for MAC {mac_address} to {new_owner}")
            #     update_owner_and_metadata(client, mac_address, new_owner, new_table_name, new_description)
            
            if new_ip:
                print(f"Step.9 - Checking if IP {new_ip} exists for MAC {mac_address}")
                if check_ip_exists(client, mac_address, new_ip):
                    print("Step.10 - MAC and IP already exist. No update performed.")
                    return {"message": "MAC and IP already exist. No update performed."}, 200
                else:
                    print(f"Step.11 - Adding new IP {new_ip} to existing MAC record.")
                    update_ip_array(client, mac_address, new_ip)
                    return {"message": "IP added to existing MAC record."}, 200
            else:
                print("Step.12 - No new IP provided in request.")
                return {"message": "No new IP provided. No update performed."}, 200
        else:
            print(f"Step.13 - Creating new MAC entry: {mac_address}")
            insert_new_row(client, request_json)
            return {"message": "New MAC entry created successfully."}, 201

    except Exception as e:
        print(f"Step.14 - ERROR: {e}")  # Print full error
        import traceback
        traceback.print_exc()  # Print full stack trace
        return {"error": "Internal server error."}, 500

def create_dataset_and_table(client):
    dataset_id = f"{client.project}.{DATASET_ID}"
    table_ref = f"{dataset_id}.{TABLE_ID}"

    try:
        client.get_dataset(dataset_id)
    except NotFound:
        print(f"Step.15 - Creating dataset: {dataset_id}")
        dataset = bigquery.Dataset(dataset_id)
        dataset.location = "US"
        client.create_dataset(dataset)

    try:
        client.get_table(table_ref)
    except NotFound:
        print(f"Step.16 - Creating table: {table_ref}")
        table = bigquery.Table(table_ref, schema=TABLE_SCHEMA)
        client.create_table(table)

def check_mac_exists(client, mac_address):
    query = f"""
    SELECT COUNT(1) FROM `{client.project}.{DATASET_ID}.{TABLE_ID}` 
    WHERE mac_address = @mac_address
    """
    job_config = bigquery.QueryJobConfig(
        query_parameters=[bigquery.ScalarQueryParameter("mac_address", "STRING", mac_address)]
    )
    result = client.query(query, job_config=job_config).result()
    
    for row in result:
        return row[0] > 0
    return False

def check_ip_exists(client, mac_address, ip):
    query = f"""
    SELECT COUNT(1) FROM `{client.project}.{DATASET_ID}.{TABLE_ID}`
    WHERE mac_address = @mac_address AND @ip IN UNNEST(ip_addresses)
    """
    job_config = bigquery.QueryJobConfig(
        query_parameters=[ 
            bigquery.ScalarQueryParameter("mac_address", "STRING", mac_address),
            bigquery.ScalarQueryParameter("ip", "STRING", ip)
        ]
    )
    result = client.query(query, job_config=job_config).result()

    for row in result:
        return row[0] > 0
    return False

def insert_new_row(client, data):
    table_ref = f"{client.project}.{DATASET_ID}.{TABLE_ID}"
    try:
        print(f"Step.17 - Inserting new row into {table_ref}: {data}")
        errors = client.insert_rows_json(table_ref, [data])
        if errors:
            logger.error(f"Step.18 - BigQuery insertion errors: {errors}")
            raise RuntimeError(f"BigQuery insertion errors: {errors}")
    except GoogleCloudError as e:
        logger.error(f"Step.19 - Error inserting new row: {e}")
        raise RuntimeError(f"Error inserting new row: {e}")

def update_ip_array(client, mac_address, new_ip):
    """Safely updates IP addresses using a temporary table."""
    dataset_id = f"{client.project}.{DATASET_ID}"
    table_id = f"{dataset_id}.{TABLE_ID}"
    temp_table_id = f"{dataset_id}.{TABLE_ID}_temp"

    print("Step.20 - Creating temporary table for update...")

    copy_query = f"""
    CREATE OR REPLACE TABLE `{temp_table_id}` AS
    SELECT * FROM `{table_id}`
    """
    client.query(copy_query).result()

    print("Step.21 - Updating IPs in temporary table...")

    update_query = f"""
    UPDATE `{temp_table_id}`
    SET ip_addresses = ARRAY(SELECT DISTINCT ip FROM UNNEST(ip_addresses || [@new_ip]) AS ip)
    WHERE mac_address = @mac_address
    """
    job_config = bigquery.QueryJobConfig(
        query_parameters=[ 
            bigquery.ScalarQueryParameter("mac_address", "STRING", mac_address),
            bigquery.ScalarQueryParameter("new_ip", "STRING", new_ip)
        ]
    )
    client.query(update_query, job_config=job_config).result()

    print("Step.22 - Replacing original table with updated temporary table...")

    replace_query = f"""
    CREATE OR REPLACE TABLE `{table_id}` AS
    SELECT * FROM `{temp_table_id}`
    """
    client.query(replace_query).result()

    print("Step.23 - Successfully updated IPs using temporary table!")

def get_current_owner(client, mac_address):
    query = f"""
    SELECT owner, table_name, description FROM `{client.project}.{DATASET_ID}.{TABLE_ID}`
    WHERE mac_address = @mac_address
    """
    job_config = bigquery.QueryJobConfig(
        query_parameters=[bigquery.ScalarQueryParameter("mac_address", "STRING", mac_address)]
    )
    result = client.query(query, job_config=job_config).result()

    for row in result:
        return row["owner"], row["table_name"], row["description"]
    return None, None, None

def does_device_exist(client, mac_address, owner):
    query = f"""
    SELECT COUNT(1) FROM `{client.project}.{DATASET_ID}.{TABLE_ID}`
    WHERE mac_address = @mac_address AND owner = @owner
    """
    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("mac_address", "STRING", mac_address),
            bigquery.ScalarQueryParameter("owner", "STRING", owner),
        ]
    )
    result = client.query(query, job_config=job_config).result()
    for row in result:
        return row[0] > 0
    return False


def update_owner_and_metadata(client, mac_address, new_owner, new_table_name, new_description):
    """Updates the owner, table_name, and description fields for the given MAC address."""
    query = f"""
    UPDATE `{client.project}.{DATASET_ID}.{TABLE_ID}`
    SET owner = @new_owner,
        table_name = @new_table_name,
        description = @new_description
    WHERE mac_address = @mac_address AND owner = @new_owner
    """
    job_config = bigquery.QueryJobConfig(
        query_parameters=[ 
            bigquery.ScalarQueryParameter("mac_address", "STRING", mac_address),
            bigquery.ScalarQueryParameter("new_owner", "STRING", new_owner),
            bigquery.ScalarQueryParameter("new_table_name", "STRING", new_table_name),
            bigquery.ScalarQueryParameter("new_description", "STRING", new_description)
        ]
    )
    client.query(query, job_config=job_config).result()
    print(f"Step.24 - Successfully updated owner, table_name, and description for MAC address {mac_address}.")
