import os
from dotenv import load_dotenv
from pathlib import Path

# env_config_file_path = Path( "/home/pi/.config/env")
# env_config_file_path = Path( "/home/pi/6to4/MongoUpload/.env")
env_config_file_path = Path('/home/pi/6to4/.env')

load_dotenv(dotenv_path=env_config_file_path)



## local variables of local influxdb
LOCAL_TOKEN = os.getenv('LOCAL_TOKEN')
LOCAL_ORG = os.getenv('LOCAL_ORG')
LOCAL_BUCKET = os.getenv('LOCAL_BUCKET')
LOCAL_URL = os.getenv('LOCAL_URL')
LOCAL_OWNER = os.getenv('Device_Owner')

# local variable of local mongodb
LOCAL_MONGO_URL = os.getenv('MONGO_LOCAL_URL')

## cloud variables of cloud mongodb -> URL, DB
CLOUD_URL = os.getenv('MONGO_CLOUD_URL_WRITE')
CLOUD_DB = os.getenv('BUCKET_NAME') # the DB is the same as the bucket in influxdb


class LOCAL():
  token = LOCAL_TOKEN
  org = LOCAL_ORG
  bucket = LOCAL_BUCKET
  url_influx = LOCAL_URL
  url_mongo = LOCAL_MONGO_URL
  owner = LOCAL_OWNER

class CLOUD():
    url_mongo = CLOUD_URL
    bucket = CLOUD_DB


    