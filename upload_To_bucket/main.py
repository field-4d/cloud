import functions_framework
import json
from google.cloud import storage

# Global parameter for the destination bucket
destination_bucket = 'hu-post-process-bucket'

def upload_files_to_gcs(json_list):
    # Initialize the Cloud Storage client
    client = storage.Client()
    bucket = client.get_bucket(destination_bucket)

    for json_obj in json_list:
        # Extract _id, MAC_address, Exp_name, and UniqueID
        _id = json_obj.get('Owner', None)  # Using _id instead of oid
        mac_address = json_obj.get('ExperimentData', {}).get('MAC_address', None)
        exp_name = json_obj.get('ExperimentData', {}).get('Exp_name', None)
        unique_id = json_obj.get('UniqueID', None)

        # Only proceed if all required fields are available
        if _id and mac_address and exp_name and unique_id:
            # Define the folder path and file name
            folder_path = f"{_id}/{mac_address}/{exp_name}/"
            file_name = f"{unique_id}.json"
            full_path = folder_path + file_name

            # Convert the json_obj to a JSON string to upload as file content
            file_content = json.dumps(json_obj, indent=4)

            # Upload the file
            blob = bucket.blob(full_path)
            blob.upload_from_string(file_content, content_type='application/json')
            #print(f"Uploaded file: {full_path}")
        else:
            print("Missing required fields in JSON object, skipping upload.")

@functions_framework.http
def upload_json_to_gcs(request):
    """HTTP Cloud Function to upload JSON objects to GCS.
    Args:
        request (flask.Request): The request object.
        Returns:
        A response indicating success or failure.
    """
    try:
        # Parse the incoming JSON data from the request
        request_json = request.get_json(silent=True)

        if request_json and isinstance(request_json, list):
            # Call the function to upload the files to GCS
            upload_files_to_gcs(request_json)
            return "Upload successful!", 200
        else:
            return "Invalid input: Expected a list of JSON objects", 400
    except Exception as e:
        # Return the error message with a 500 status code if something goes wrong
        return f"An error occurred: {str(e)}", 500
