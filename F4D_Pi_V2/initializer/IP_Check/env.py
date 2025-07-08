import os
from dotenv import load_dotenv
from pathlib import Path

# env_config_file_path = Path('./.env')
env_config_file_path = Path('/home/pi/6to4/.env')
load_dotenv(dotenv_path=env_config_file_path)


## Get Mongo Clound Info
MONGO_URL = os.getenv('MONGO_CLOUD_URL_WRITE')
# Get Local Bucket
LOCAL_BUCKET = os.getenv('LOCAL_BUCKET') 
LOCAL_OWNER = os.getenv('Device_Owner')



class MONGO_CLOUD():
  url_write = MONGO_URL
class LOCAL_BUCKET():
  local_bucket = LOCAL_BUCKET
  local_owner = LOCAL_OWNER


