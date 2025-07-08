import time
import socket
import logging
import os
import requests
from env import MONGO_CLOUD, LOCAL_BUCKET
import netifaces as ni

import json
from google.oauth2 import service_account
from google.auth.transport.requests import Request
import re

def Get_IP():
    """
    Get the IP address of the specified network interface.
    
    Returns:
        str: The IP address of the specified network interface.
    """
    try:
        interfaces = ni.interfaces()
        for interface in interfaces:
            # Skip the loopback interface
            if interface == 'lo':
                continue
            # Check if the interface has an IP address assigned
            ip_info = ni.ifaddresses(interface).get(ni.AF_INET)
            if ip_info:
                ip_address = ip_info[0].get('addr')
                # logging.info(f"IP address found for interface {interface}: {ip_address}")
                print(f"IP address found for interface {interface}: {ip_address}")
                return ip_address
    except Exception as e:
        logging.error(f"Could not get IP address: {e}")
        return None

    logging.error("No IP address found")
    return None

def sanitize_dataset_id(dataset_id):
    """
    Sanitizes a dataset ID to ensure compatibility with BigQuery naming rules.

    BigQuery Dataset ID Rules:
    1. Allowed: Letters (a-z, A-Z), Numbers (0-9), and Underscores (_).
    2. Must start with a letter or number (cannot start with an underscore).
    3. Spaces and special characters (-, @, #, !, $, %, etc.) are not allowed.
    4. Maximum length: 1024 characters.

    This function replaces any invalid character with an underscore (_).

    :param dataset_id: The original dataset ID string.
    :return: A sanitized dataset ID compliant with BigQuery rules.
    """
    return re.sub(r"[^a-zA-Z0-9_]", "_", dataset_id).lower()  # Replace invalid characters with "_"

def get_hostname():
    """
    Get the hostname of the device.

    :return: The hostname of the device.
    """
    return socket.gethostname()

def get_auth_token(credentials_path):
    """Fetches an identity token for authenticating with Cloud Run services."""
    
    credentials = service_account.IDTokenCredentials.from_service_account_file(
        credentials_path, target_audience="https://users-devices-permission-1000435921680.us-central1.run.app"
    )
    credentials.refresh(Request())
    return credentials.token


def send_request_to_cloud_run(credentials_path, payload):
    """Sends the payload to the Cloud Run users-devices-permission service."""
    cloud_function_url = "https://users-devices-permission-1000435921680.us-central1.run.app"

    # Get authentication token
    auth_token = get_auth_token(credentials_path)

    # Send POST request
    headers = {
        "Authorization": f"Bearer {auth_token}",
        "Content-Type": "application/json"
    }
    response = requests.post(cloud_function_url, headers=headers, json=payload)

    # Print the response
    print(f"Response Status: {response.status_code}")
    print(f"Response Data: {response.json()}")

    return response.json()


# ensure log directory exists
log_dir = "logs"
os.makedirs(log_dir, exist_ok=True)
# configure logging
log_file = os.path.join(log_dir, "mac_to_device.log")
logging.basicConfig(
    filename=log_file,
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s"
)

try:
    # Get the IP
    Device_IP = Get_IP()

    # Get the MAC address
    MAC = LOCAL_BUCKET.local_bucket

    # Get the device owner 
    Device_Owner = LOCAL_BUCKET.local_owner
    hostname = get_hostname()
    hostname_sanitized = sanitize_dataset_id(hostname)#.lower()

    # Create the dataset name
    Device_Table = f"{Device_Owner}_{MAC}" # nla bla

    # Create the dataset description
    Device_Description = f"Device {MAC} owned by {Device_Owner} and table is {Device_Table}"

    # Define the payload
    payload = {
        "mac_address": MAC,
        "owner": hostname_sanitized,
        "table_name": Device_Table,
        "description": Device_Description,
        "ip_addresses": str(Device_IP)
    }

    # Fix credentials path (removed the extra space)
    credentials_path = "/home/pi/6to4/MongoUpload/credentials/last_ts_cf.json"

    # Send request
    response = send_request_to_cloud_run(credentials_path, payload)
    # get the response
    print(response
    )
except Exception as e:
    logging.error(f"Failed to execute main block: {e}")
    print(f"Failed to execute main block: {e}")