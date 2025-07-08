import streamlit as st
import logging
from datetime import datetime, timedelta,date
import pymongo
from env import MONGO_CLOUD
import pandas as pd
from pandas import json_normalize


# myclient_global_read = pymongo.MongoClient(MONGO_CLOUD.url_read)
# set up local monmgo client
myclient_local_read = pymongo.MongoClient("mongodb://localhost:27017/")


logging.basicConfig(
    filename='logs/app_log.log',
    level=logging.INFO,
    format='%(asctime)s,%(levelname)s,%(message)s',
    datefmt='%Y-%m-%d %H:%M:%S', filemode='a'
)

# Function to convert timestamp string to formatted date
def format_date(doc):
    if doc:
        timestamp_str = doc["TimeStamp"]
        timestamp_dt = datetime.fromisoformat(timestamp_str.replace("Z", "+00:00"))
        return timestamp_dt.strftime("%Y-%m-%d")
    return None


@st.cache_data
def get_dbs_and_collections(db_name):
    """
    Retrieves a list of databases and their collections from MongoDB,
    excluding specified databases. For each collection, it retrieves the
    first and last document based on the TimeStamp field to determine
    the date range.
    
    Returns:
        dbs_list (list): List of database names.
        collection_dict (dict): Dictionary with database names as keys and
                                collections info (first and last document dates) as values.
    """
    # Get the list of databases and collections
    logging.info("Getting the list of databases")


    dbs_list = [db_name]
    collection_dict = {}
    for db in dbs_list:
        collection_list = myclient_local_read[db].list_collection_names()
        # exlude "exp_0_BOOT" and any collection that end with "_DATA"
        collection_list = [col for col in collection_list if not col.endswith("_DATA") and not col.endswith("_BOOT")]
        collection_info = {}
        for collection in collection_list:
            # add to the collectinon name _Data in order to get the data collection
            collection = collection + "_DATA"
            col = myclient_local_read[db][f"{collection}"]
            # Get the first and last documents based on TimeStamp
            first_doc = col.find_one(sort=[("TimeStamp", pymongo.ASCENDING)])
            last_doc = col.find_one(sort=[("TimeStamp", pymongo.DESCENDING)])
    
            # first_date = first_doc["TimeStamp"].strftime("%Y-%m-%d") if first_doc else None
            # last_date = last_doc["TimeStamp"].strftime("%Y-%m-%d") if last_doc else None

            # Convert the TimeStamp strings to datetime objects and format them
            first_date = datetime.fromisoformat(first_doc["TimeStamp"]["$date"].replace("Z", "+00:00")).strftime("%Y-%m-%d") if first_doc else None
            last_date = datetime.fromisoformat(last_doc["TimeStamp"]["$date"].replace("Z", "+00:00")).strftime("%Y-%m-%d") if last_doc else None


            # get unique Sensor.Name valeus
            unique_sensor_names  = col.distinct("SensorData.Name")
            # get the LabelOptions from SensorData
            label_options = col.distinct("SensorData.LabelOptions") 
            spesiific_Label = col.distinct("SensorData.Labels")
            #### loop through the unique_sensor_names and get the Labels for each sensor to a dictionary
            sensor_label = {}
            for sensor in unique_sensor_names:
                sensor_label[sensor] = col.find_one({"SensorData.Name": sensor})["SensorData"]["Labels"]

            collection_info[collection] = {
                "first_date": first_date,
                "last_date": last_date,
                "sensor_names": unique_sensor_names,
                "label_options": label_options,
                "Sensor_Label": sensor_label
            }
        collection_dict[db] = collection_info
    logging.info("Databases and collections fetched successfully")
    return dbs_list, collection_dict

def fetch_data(start_date, end_date, db_name, col_name, sensor_names):
    """
    Fetches data from the specified MongoDB collection within the given date range.
    
    Args:
        start_date (str): The start date for data fetching in 'YYYY-MM-DD' format.
        end_date (str): The end date for data fetching in 'YYYY-MM-DD' format.
        db_name (str): The name of the database.
        col_name (str): The name of the collection.
        sensor_names (list): The list of sensors to pull
    
    Returns:
        pd.DataFrame: DataFrame containing the fetched data, with 'TimeStamp' converted
                      to the specified timezone and 'SensorData' fields flattened.
    """
    mydb = myclient_local_read[db_name]
    mycol = mydb[col_name]
    projection = {"TimeStamp": 1, "SensorData": 1, "_id": 0}
    
    # Convert the start_date and end_date to strings if they are datetime.date objects
    if isinstance(start_date, (date, datetime)):
        start_date = start_date.strftime("%Y-%m-%d")
    if isinstance(end_date, (date, datetime)):
        end_date = end_date.strftime("%Y-%m-%d")

    start_dt = datetime.strptime(start_date, "%Y-%m-%d").isoformat() + "Z"
    # Parse the end_date and set the time to the end of the day
    end_dt = (datetime.strptime(end_date, "%Y-%m-%d") + timedelta(days=1) - timedelta(milliseconds=1)).isoformat() + "Z"

    # If sensor_names is empty, set sensor_names_list to all available sensors
    if not sensor_names:
        sensor_names_list = mycol.distinct("SensorData.Name")
    else:
        sensor_names_list = sensor_names

    query = {
        "TimeStamp.$date": {
            "$gte": start_dt,
            "$lte": end_dt
        },
        "SensorData.Name": {"$in": sensor_names_list}
    }

    try:
        data = list(mycol.find(query, projection))
        if not data:
            return pd.DataFrame()
        
        df = json_normalize(data)
        df['TimeStamp'] = pd.to_datetime(df['TimeStamp.$date']) #utc=True).dt.tz_convert('Asia/Jerusalem')
        df.rename(columns=lambda x: x.replace('SensorData.', ''), inplace=True)
        logging.info("Data fetched successfully")
        return df
    except Exception as e:
        logging.error(f"Error Fetching the data: {e}")
        st.error(f"Error Fetching the data, try shorter period (site under development)")
        return pd.DataFrame()

def reload_dbs_and_collections():
    try:
        logging.info("Reloading databases and collections")
        st.cache_data.clear()
        global dbs_list, collection_dict
        dbs_list, collection_dict = get_dbs_and_collections()
        logging.info("Databases and collections reloaded successfully")
    except Exception as e:
        logging.error(F"Error Reloading databases and collections: {e}")


