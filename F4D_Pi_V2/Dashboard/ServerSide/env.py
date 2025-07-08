import os
from dotenv import load_dotenv
from pathlib import Path

env_config_file_path = Path('/home/pi/6to4/.env')

# env_config_file_path = Path('./.env') -> used to get from inside the directory
load_dotenv(dotenv_path=env_config_file_path)


## Get Mongo Clound Info
MONGO_URL = os.getenv('MONGO_CLOUD_URL_READ')
# Get Local Bucket
LOCAL_BUCKET = os.getenv('BUCKET_NAME') 



class MONGO_CLOUD():
  url_read = MONGO_URL
class LOCAL_BUCKET():
  local_bucket = LOCAL_BUCKET


