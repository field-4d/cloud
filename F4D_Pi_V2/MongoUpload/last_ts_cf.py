import logging
from google.auth.transport.requests import Request
from google.oauth2 import service_account
import requests
from datetime import datetime

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
)

def query_from_gcp(credentials_path, cloud_function_url, payload):
    """
    Queries a Google Cloud Function and processes the response.

    Args:
        credentials_path (str): Path to the service account key file.
        cloud_function_url (str): URL of the target Cloud Function.
        payload (dict): Payload to send in the POST request.

        
    Returns:
        dict: Transformed response data if successful, None otherwise.
    """
    start_time = datetime.now()
    logging.info("Starting the cloud function query process.")

    try:
        # Generate ID token
        credentials = service_account.IDTokenCredentials.from_service_account_file(
            credentials_path,
            target_audience=cloud_function_url,
        )
        
        # Refresh the token
        auth_req = Request()
        credentials.refresh(auth_req)
        token = credentials.token
        logging.info("Generated ID token for last_ts_cgf successfully.")

        # Make a request to the Cloud Function
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }
        logging.info("Sending POST request to for last_ts_cf.")
        response = requests.post(cloud_function_url, headers=headers, json=payload)

        # Process the response
        if response.status_code == 200:
            logging.info("Valid response received from last_ts_cgf .")
            response_data = response.json()
            ## Log the response data
            logging.info(f"Response data: {response_data}")

            transformed_data = {
             key: 0 if value == 0 else int(datetime.strptime(value, "%Y-%m-%d %H:%M:%S").timestamp())
            for key, value in response_data.items()}

            logging.info(f"Response data transformed successfully: {transformed_data}")
            return response_data
        else:
            logging.error(f"Invalid response received: {response.status_code} - {response.content}")
            # Handle invalid response by returning a default transformed_data
            transformed_data = {key: 0 for key in payload.get("experiment_names", [])}
            logging.info(f"Returning default transformed_data due to failure: {transformed_data}")
            return transformed_data

    except Exception as e:
        logging.error(f"An error occurred: {e}")
        return None


    finally:
        end_time = datetime.now()
        logging.info(f"Execution time: {end_time - start_time}")





# # Example usage
# credentials_path = "credentials/last_ts_cf.json"
# cloud_function_url = "https://me-west1-iucc-f4d.cloudfunctions.net/query_last_timestamp"
# payload = {
#     "owner": "GrowthRoom",
#     "mac_address": "d83adde2608f",
#     "experiment_names": [
#         "exp_9_weekend_Check",
#         "exp_7_Soldering",
#         "exp_4_Check",
#         "exp_2_Light_Experiment",
#         "exp_6_check",
#         "exp_3_jumper",
#         "exp_5_Check_2",
#         "exp_1_Lab_Freezer",
#     ]
# }

# transformed_data = query_from_gcp(credentials_path, cloud_function_url, payload)
# # # if transformed_data:
# # #     logging.info(f"Transformed data: {transformed_data}")