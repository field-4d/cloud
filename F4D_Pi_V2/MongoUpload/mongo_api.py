from influxdb_client.client.exceptions import InfluxDBError
from influxdb_client import InfluxDBClient

from pymongo import MongoClient
from pymongo.errors import DuplicateKeyError, BulkWriteError

from datetime import datetime, timedelta
import pytz

import pandas as pd

import uuid
import logging

from env import LOCAL, CLOUD
import json
from bson import ObjectId
from last_ts_cf import query_from_gcp


####################################
##################################

from google.cloud import storage
# Uploads a JSON file to a Google Cloud Storage bucket.
def upload_json_batch_to_gcs(bucket_name: str, json_batch: list, destination_blob_name: str):
    """
    Uploads the batch of JSON objects as a single file to a Google Cloud Storage bucket.
    """
    # Set the path to your credentials.json file
    try:
        loggerSerializer.info(f"wideops: {bucket_name} {destination_blob_name}")
        credentials_path = "credentials/big_query_ts.json"

        # Initialize the storage client
        storage_client = storage.Client.from_service_account_json(credentials_path)

        # Get the bucket
        bucket = storage_client.bucket(bucket_name)

        # Convert the list of JSONs to a JSON string
        json_string = json.dumps(json_batch, indent=4)

        # Upload the JSON string as a file to the bucket
        blob = bucket.blob(destination_blob_name)
        blob.upload_from_string(json_string, content_type='application/json')

        #loggerSerializer.info(f"Wideops:Batch file uploaded to {blob.public_url}")
    except Exception as e:
        loggerSerializer.error(f"wideops: Error while uploading to GCS: {e}")

        # Custom JSON encoder to handle ObjectId conversion

# Custom JSON encoder to handle ObjectId conversion


#########################################################
###################################################

logging.basicConfig(level=logging.INFO, format='%(asctime)s | %(levelname)s | %(message)s')
loggerSerializer = logging.getLogger('MongoUpload-Serializer')

# Function to get the collection names from the local MongoDB
def get_local_collection():
    client = MongoClient(LOCAL.url_mongo)
    db = client[LOCAL.bucket]
    collections = db.list_collection_names()
    return collections

# Function to check the last timestamp from the local MongoDB collection
def check_exp_name_exists_local(exp_name_list):
    last_entry = {}
    client = MongoClient(LOCAL.url_mongo)
    db = client[LOCAL.bucket]
    
    for exp_name in exp_name_list:
        if not exp_name.endswith("_DATA"):
            continue
        
        collection = db[exp_name]
        last_doc = collection.find_one({}, sort=[('_id', -1)])
        first_doc = collection.find_one({}, sort=[('_id', 1)])
        
        if last_doc:
            last_timestamp = last_doc["TimeStamp"]["$date"]
            date_time_obj_last = datetime.strptime(last_timestamp, "%Y-%m-%dT%H:%M:%SZ")
        else:
            date_time_obj_last = 0
        
        if first_doc:
            first_timestamp = first_doc["TimeStamp"]["$date"]
            date_time_obj_first = datetime.strptime(first_timestamp, "%Y-%m-%dT%H:%M:%SZ")
        else:
            date_time_obj_first = 0
        
        last_entry[exp_name] = {
            "last_local": date_time_obj_last,
            "first_local": date_time_obj_first
        }
    
    return last_entry
    
# check deltaTine from GCP
def check_deltaTime_GCP(dicty_local,exp_name_list):
    client = MongoClient(LOCAL.url_mongo)
    db = client[LOCAL.bucket]
    owner = LOCAL.owner
    # take only the experiment names that does not ends with _DATA
    filtered_experiment_names = [
    exp_name.replace("_DATA", "") for exp_name in exp_name_list if exp_name.endswith("_DATA")
    ]
    payload = {
        "owner": owner,
        "mac_address": LOCAL.bucket,
        "experiment_names": filtered_experiment_names
    }
    # print("the payload is\n", payload)
    credentials_path = "credentials/last_ts_cf.json"
    cloud_function_url = "https://me-west1-iucc-f4d.cloudfunctions.net/query_last_timestamp"
    transformed_data = query_from_gcp(credentials_path, cloud_function_url, payload)
    

    dicty_diff = {}
    for exp_name in dicty_local.keys():
        local_time_last = dicty_local[exp_name]["last_local"]
        local_time_first = dicty_local[exp_name]["first_local"]
        global_time = transformed_data[exp_name.replace("_DATA", "")]
    
        try:
            if global_time == 0:
                global_time_new = local_time_first  # Handle `0` case by using first_local as fallback
            else:
                # converrt to datetime object
                global_time_new = datetime.strptime(global_time, "%Y-%m-%d %H:%M:%S")

            # calculate the delta difference
            delta_seconds = (local_time_last - global_time_new).total_seconds()
            if delta_seconds > 0:
                # now add the _DATA suffix to the exp_name
                dicty_diff[exp_name] = global_time_new
                # dicty_diff[exp_name] = global_time_new
            # print(f"{exp_name} - the transformed data is {global_time_new}")
            # print(f"{exp_name} - the local time last is {local_time_last}")
            # print(f"{exp_name} - the delta_seconds is {delta_seconds}")
            else:
                continue  # Skip to the next experiment if the delta is not positive
        except Exception as e:
            # print(f"Error while calculating delta time for {exp_name}: {e}")
            dicty_diff[exp_name] = local_time_first
    # print("\n\nthe dicty_diff is ", dicty_diff)
    return dicty_diff

## function to check the last timestamp and delta time from the local MongoDB collection
def check_deltaTime_Global(dicty_local):
    last_entry = {}
    client = MongoClient(CLOUD.url_mongo)
    db = client[CLOUD.bucket]
    owner = LOCAL.bucket 
    # print and of the db collection names
    exp_name_list_global = db.list_collection_names()
    filtered_experiment_names = []
    for exp_name in exp_name_list_global:
        if not exp_name.endswith("_DATA"):
            continue
        filtered_experiment_names.append(exp_name)


    for exp_name in dicty_local.keys():
        # create new variable which stores the exp_name without the _DATA suffix
        exp_name_global = exp_name[:-5]
        # check if the exp_name is in the global collectionq
        collection = db[exp_name_global]
        # get the last document from th goobal collection baaed on the TimeStamp field
        last_doc = collection.find_one({}, sort=[('_id', -1)])
        if last_doc:
            last_timestamp = last_doc["TimeStamp"]
            dt_object = datetime.strptime(last_timestamp, "%Y-%m-%dT%H:%M:%SZ")
            last_entry[exp_name] = {"mongo": dt_object}

        else:
            last_entry[exp_name] = {"mongo": 0}

    dicty_diff = {}
    for exp_name in dicty_local.keys():
        local_time_last = dicty_local[exp_name]["last_local"]
        local_time_first = dicty_local[exp_name]["first_local"]
        global_time = last_entry[exp_name]["mongo"]
        try:
            # add 3hours to global_time
            global_time = global_time #+ timedelta(hours=3)
            delta_seconds = (local_time_last - global_time).total_seconds()
            if delta_seconds >0:
                dicty_diff[exp_name] = global_time
            # dicty_diff[exp_name] = {"delta_seconds": delta_seconds}
        except Exception as e:
            dicty_diff[exp_name] = local_time_first
    # print("\n\nthe dicty_diff  from mongo_delta is ", dicty_diff)
    return dicty_diff    


def Push_To_Mongo(dicty_diff):
    client_local = MongoClient(LOCAL.url_mongo)
    client_global = MongoClient(CLOUD.url_mongo)
    db_local = client_local[LOCAL.bucket]
    db_global = client_global[CLOUD.bucket]
    
    #########################################
    bucket_name = "hu-processing-bucket"
    # destination_blob_name = "jsoncheck.json"
    #################################################

    for exp_name, last_sync_time in dicty_diff.items():
        counter= 0
        exp_name_global = exp_name[:-5]  # Remove the _DATA suffix


        if last_sync_time == 0:
            query = {}  # Pull all data if no sync time is available
            # print(f"No sync time provided for {exp_name}. Pulling all data.")
        else:
            if isinstance(last_sync_time, datetime):
                last_sync_time_format = last_sync_time.isoformat() + "Z"
                query = {"TimeStamp.$date": {"$gt": last_sync_time_format}} # used to be gte which caused to duplicate data
                # print(f"The last_sync_time_format is {last_sync_time_format}")
            else:
                # print(f"Invalid last_sync_time for {exp_name}. Skipping...")
                continue  # Skip to the next experiment if the time is invalid

        collection_local = db_local[exp_name]
        collection_global = db_global[exp_name_global]
        batch = []
        batch_size = 5_000
        batch_google = []
        loggerSerializer.info(f"Starting to push data from {exp_name} to {exp_name_global}, from {last_sync_time}")
        last_seen_doc_by_LLa = {}  # Dictionary to keep track of the last document for each LLA
        # fethch the query result and print it
        try:
            query_result = collection_local.find(query) # query the local collection
            for doc in query_result:
                # upload_json_to_gcs(bucket_name, doc, destination_blob_name)

                if "TimeStamp" in doc:
                    if isinstance(doc["TimeStamp"], dict) and "$date" in doc["TimeStamp"]:
                        local_timestamp_str = doc["TimeStamp"]["$date"]
                    else:
                        local_timestamp_str = doc["TimeStamp"]

                   
                    doc["TimeStamp"] = local_timestamp_str
                    # Track the last document for each LLA
                   
                    if "MetaData" in doc and "LLA" in doc["MetaData"]:
                        lla_value = doc["MetaData"]["LLA"]
                        last_seen_doc_by_LLa[lla_value] = doc  # Keep the last document seen for this LLA
                
                doc_modfiy = doc
                doc_modfiy["_id"] = str(ObjectId())
                doc_modfiy["UniqueID"] = str(uuid.uuid4())

                batch.append(doc)
                batch_google.append(doc_modfiy)
                # if the batch size is equal to the batch size
                if len(batch) == batch_size:
                    loggerSerializer.info(f"Inserted {len(batch)} documents into {exp_name_global}") # log the number of documents inserted
                    # print(f"Inserted {len(batch)} documents into {exp_name_global}")
                    collection_global.insert_many(batch,ordered=False)

                    ## wideops
                    timestamp_now = datetime.now().strftime("%Y%m%d%H%M%S")
                    destination_blob_name = f"{exp_name_global}/{exp_name_global}_{timestamp_now}.json"
                    print("the destination_blob_name is ", destination_blob_name)
                    loggerSerializer.info(f"wideops:Uploading batch to GCS") # log the number of documents inserted
                    upload_json_batch_to_gcs(bucket_name, batch_google, destination_blob_name) # upload the batch to GCS
                    print("passed the upload to GCS")
                    counter+=1
                    batch = [] # Reset the batch for MongoDB 
                    batch_google = [] # Reset the batch for GCS
                        # Clear the batch immediately
                    batch.clear()
                    batch_google.clear()


            # any remaining documents in the batch
            if batch:
                loggerSerializer.info(f"Inserted {len(batch)} documents into {exp_name_global}") # log the number of documents inserted
                # print(f"Inserted {len(batch)} documents into {exp_name_global}")

                collection_global.insert_many(batch,ordered=False)

                ## wideops
                loggerSerializer.info(f"wideops:Uploading batch to GCS") # log the number of documents inserted
                counter+=1
                timestamp_now = datetime.now().strftime("%Y%m%d%H%M%S")
                destination_blob_name = f"{exp_name_global}/{exp_name_global}_{timestamp_now}.json"
                upload_json_batch_to_gcs(bucket_name, batch_google, destination_blob_name)
                print("passed the upload to GCS remaining")
                counter+=1
                batch = [] # Reset the batch for MongoDB
                batch_google = []

            # apply updates forr the Labels, and LabelsOption based on last_seen_doc_by_LLa
            for lla_value, last_doc in last_seen_doc_by_LLa.items():
                label = last_doc["SensorData"].get("Labels", [])
                label_options = last_doc["SensorData"].get("LabelOptions", [])

                # Update all matching documents in the global collection
                update_result = collection_global.update_many(
                    {"MetaData.LLA": lla_value},
                    {
                        "$set": {
                            "SensorData.Labels": label,
                            "SensorData.LabelOptions": label_options
                        }
                    }
                )
                #loggerSerializer.info(f"Updated Labels! {update_result.modified_count} documents in {exp_name_global} for LLA {lla_value}")

        except Exception as e:
            loggerSerializer.error(f"Error while pushing data to {exp_name_global}")
            # print(f"Error while pushing data to {exp_name_global}: {e}")
                



def Mongo_Push_Cloud():

    try:
        exp_names = sorted(get_local_collection())[1:] # get the collection names from the local MongoD
        dicty_local = check_exp_name_exists_local(exp_names) # check the last timestamp from the local MongoDB
        #dicty_diff = check_deltaTime_Global(dicty_local) # check the last timestamp from the global MongoDB
        dicty_diff_gcp = check_deltaTime_GCP(dicty_local,exp_names)
        Push_To_Mongo(dicty_diff_gcp) # push the data to the global MongoDB
        return True
    except Exception as e:
        loggerSerializer.error(f"Error while pushing data to global MongoDB: {e}")

    
# # test out the function
# exp_names = sorted(get_local_collection())[1:] # get the collection names from the local MongoD
# dicty_local = check_exp_name_exists_local(exp_names) # check the last timestamp from the local MongoDB
# dicty_diff_gcp = check_deltaTime_GCP(dicty_local,exp_names)
# # # dicty_diff = check_deltaTime_Global(dicty_local) # check the last timestamp from the global MongoDB
# Push_To_Mongo(dicty_diff_gcp) # push the data to the global MongoDB
