from env import LOCAL, CLOUD
from pymongo import MongoClient
import mongo_api as MA
import time

import time
from datetime import datetime
import logging


loggerSerializer = logging.getLogger('MongoUpload-Serializer')
loggerSerializer.setLevel(logging.DEBUG)
handler = logging.StreamHandler()
handler.setFormatter(logging.Formatter('%(asctime)s | %(message)s'))
loggerSerializer.addHandler(handler)



# Initialize wait_time to 15 minutes at the start
MINUTE = 60  # seconds
wait_time = MINUTE * 15  # 15 minutes in seconds
first_try = True  # Flag to check if it's the first attempt

# Initial sleep for 15 minutes
loggerSerializer.info(f"Initialization: Sleeping for {wait_time // MINUTE} minutes")
# time.sleep(wait_time)

while True:
    try:
        loggerSerializer.info("Try to push data to cloud")
        # print(f"{datetime.now()} Try to push data to cloud")
        success = MA.Mongo_Push_Cloud()
        if success:
            loggerSerializer.info("Data pushed to cloud")
            # print(f"{datetime.now()} Data pushed to cloud")
            wait_time = MINUTE * 15  # Reset wait time to 15 minutes after successful push
            first_try = True  # Reset first try flag after successful push
        else:
            if not first_try:
                # Only increase wait time if it's not the first try
                if wait_time <= 3 * 60 * MINUTE:
                    loggerSerializer.info("Data not pushed to cloud, wait for the next attempt")
                    # print(f"{datetime.now()} Data not pushed to cloud, wait for the next attempt")
                    wait_time += MINUTE * 15  # Add 15 minutes to wait time
                else:
                    # If wait time is longer than 3 hours, reset it
                    loggerSerializer.info("Wait time is longer than 3 hours, reset wait time to 15 minutes")
                    # print(f"{datetime.now()} Wait time is longer than 3 hours, reset wait time to 15 minutes")
                    wait_time = MINUTE * 15
            else:
                loggerSerializer.info("Data not pushed to cloud on the first try, will try again in 15 minutes")
                # print(f"{datetime.now()} Data not pushed to cloud on the first try, will try again in 15 minutes")
                first_try = False  # Set first try flag to False after the first attempt
    except Exception as e:
        loggerSerializer.error(f"An error occurred: {e}")
        # print(f"{datetime.now()} An error occurred: {e}")
        if not first_try:
            # Only increase wait time if it's not the first try
            wait_time += MINUTE * 15  # Add 15 minutes to wait time
        else:
            loggerSerializer.info("An error occurred on the first try, will try again in 15 minutes")
            # print(f"{datetime.now()} An error occurred on the first try, will try again in 15 minutes")
            first_try = False  # Set first try flag to False after the first attempt

    # Sleep for wait time
    loggerSerializer.info(f"Sleeping for {wait_time // MINUTE} minutes")
    # print(f"{datetime.now()} Sleeping for {wait_time // MINUTE} minutes")
    time.sleep(wait_time)