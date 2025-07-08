from datetime import datetime, timedelta, date
import pymongo
import pandas as pd
from pandas import json_normalize
import time
import socket
import logging
import os
import requests
from env import MONGO_CLOUD, LOCAL_BUCKET
import netifaces as ni



# Ensure the logs directory exists
os.makedirs('/home/pi/6to4/initializer/IP_Check/logs', exist_ok=True)

# Configure logging
logging.basicConfig(
    filename='/home/pi/6to4/initializer/IP_Check/logs/IP_Update.log',
    level=logging.INFO,
    format='%(asctime)s,%(levelname)s,%(message)s',
    datefmt='%Y-%m-%d %H:%M:%S',
    filemode='a'
)

def Get_IP():
    """
    Get the IP address of the specified network interface.
    
    Args:
        interface (str): The network interface to get the IP address for.
        
    Returns:
        str: The IP address of the specified network interface.
    """
    try:
        interfaces = ni.interfaces()
        for interface in interfaces:
            # skp the looppack interface
            if interface == 'lo':
                continue
            # check if the interface has an IP addressas assigned
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
        


def Get_Location(ip):
    """
    Get the location information for the given IP address.
    
    Args:
        ip (str): The IP address to get location information for.
        
    Returns:
        dict: A dictionary containing country and city information.
    """
    try:
        response = requests.get(f"https://ipinfo.io/{ip}/json")
        data = response.json()
        location = {
            "country": data.get("country"),
            "city": data.get("city")
        }
        logging.info(f"Location retrieved for IP {ip}: {location}")
        print(f"Location retrieved for IP {ip}: {location}")
        return location
    except Exception as e:
        logging.error(f"Could not get location for IP {ip}: {e}")
        return None


try:
    print("Script started")
    # Initialize MongoDB client
    myclient_global_write = pymongo.MongoClient(MONGO_CLOUD.url_write)
    logging.info("MongoDB client initialized successfully")

    local_bcucket = LOCAL_BUCKET.local_bucket
    logging.info("Local bucket value retrieved")

    # Load the Devices_And_Users collectioncd 
    mydb = myclient_global_write["Devices_And_Users"]
    mycol = mydb["Devices"]
    logging.info("Accessed Devices_And_Users collection")

    # Get the IP address
    IP = Get_IP()
    logging.info(f"Retrieved IP address: {IP}")

    # Get the location based on IP address
    location = Get_Location(IP)
    if location:
        logging.info(f"Retrieved location: {location}")
    else:
        logging.error("Failed to retrieve location")

    # Query and update logic
    myquery = {"MAC_Address": local_bcucket}
    mydoc = mycol.find(myquery)
    # check is mydoc is empty or not
    documnets_count = mycol.count_documents(myquery)
    if documnets_count == 0:
        logging.error("No document found with the MAC address")
        new_document = {
            "device_owner": "",  # Add appropriate default or retrieved values
            "device_location": "",  # Add appropriate default or retrieved values
            "owner_email": "",  # Add appropriate default or retrieved values
            "MAC_Address": local_bcucket,
            "Experiments": [],  # Add appropriate default or retrieved values
            "Pi_Version": "",  # Add appropriate default or retrieved values
            "device_frequency": "",  # Add appropriate default or retrieved values
            "IP": [IP],
            "Geographic info": location
        }
        mycol.insert_one(new_document)
        logging.info("New document created")
    else:
        logging.info("Document found with the MAC address")
        for x in mydoc:
            # Update IP if needed
            if 'IP' in x and x['IP'] and x['IP'][-1] != IP:
                newvalues = {"$push": {"IP": IP}}
                mycol.update_one(myquery, newvalues)
                logging.info("IP address added to the document")
                print("IP address added")

            elif 'IP' not in x or not x['IP']:
                newvalues = {"$set": {"IP": [IP]}}
                mycol.update_one(myquery, newvalues)
                logging.info("IP address array created and added to the document")
                print("IP address array created and added")

            # Update Geographic info if needed
            if location:
                if 'Geographic info' in x:
                    if x['Geographic info'] != location:
                        newvalues = {"$set": {"Geographic info": location}}
                        mycol.update_one(myquery, newvalues)
                        logging.info("Geographic info updated in the document")
                        print("Geographic info updated")
                else:
                    newvalues = {"$set": {"Geographic info": location}}
                    mycol.update_one(myquery, newvalues)
                    logging.info("Geographic info added to the document")
                    print("Geographic info added")

            if 'IP' in x and x['IP'] and x['IP'][-1] == IP:
                logging.info("IP address already exists in the document")
                print("IP address already exists")

except Exception as e:
    logging.error(f"An error occurred: {e}")

print("Script executed, check logs for details")


