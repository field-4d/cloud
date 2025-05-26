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
                logging.info(f"IP address found for interface {interface}: {ip_address}")
                print(f"IP address found for interface {interface}: {ip_address}")
                return ip_address
    except Exception as e:
        logging.error(f"Could not get IP address: {e}")
        return None

    logging.error("No IP address found")
    return None


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

    # Create the dataset name
    Device_Table = f"{Device_Owner}_{MAC}" # nla bla

    # Create the dataset description
    Device_Description = f"Device {MAC} owned by {Device_Owner}"

    # Define the payload
    payload = {
        "mac_address": MAC,
        "owner": Device_Owner,
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
