const { InfluxDB, HttpError } = require('@influxdata/influxdb-client');
const { OrgsAPI, BucketsAPI } = require('@influxdata/influxdb-client-apis');
const path = require('path');
const fs = require('fs');
const os = require('os');
const dotenv = require('dotenv');

// Set the DEBUG environment variable to enable debug logs for the InfluxDB client
process.env.DEBUG = '@influxdata/*';

// Get the MAC address of the machine
const getMacAddress = () => {
  const interfaces = os.networkInterfaces();
  for (const interfaceName in interfaces) {
    const iface = interfaces[interfaceName];
    const mac = iface.find((i) => !i.internal && i.mac !== '00:00:00:00:00:00');
    if (mac) return mac.mac.replace(/:/g,"");
  }
  return 'UNKNOWN';
};

// Specify the custom path for .env file (assuming it's in the parent directory)
const envPath = path.resolve('../.env');
const envConfig = dotenv.parse(fs.readFileSync(envPath));

const local_token = envConfig.LOCAL_TOKEN;
const local_url = envConfig.LOCAL_URL;
const local_influxDB = new InfluxDB({ url:local_url , token:local_token });

const cloud_token = envConfig.CLOUD_TOKEN;
const cloud_url = envConfig.CLOUD_URL;
const cloud_influxDB = new InfluxDB({ url:cloud_url , token:cloud_token });

// Function to create a new bucket with the specified name
const createBucket = async (bucketName, influxDB) => {
  try {
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    const bucketsAPI = new BucketsAPI(influxDB);

    // Get the organization ID
    const orgsAPI = new OrgsAPI(influxDB);
    const organizations = await orgsAPI.getOrgs();
    if (!organizations || !organizations.orgs || organizations.orgs.length === 0) {
      console.error('No organizations found!');
      return;
    }
    const orgID = organizations.orgs[0].id; // Assuming you want to use the first organization in the list
    console.log(`Using organization "${organizations.orgs[0].name}" identified by "${orgID}"`);

    // Check if a bucket with the name of the MAC address already exists
    const buckets = await bucketsAPI.getBuckets();
    
    const bucketExists = buckets.buckets.some((bucket) => bucket.name === bucketName);
    if (bucketExists) {
      console.log(`Bucket "${bucketName}" already exists.`);
    } else {
      console.log(`Bucket "${bucketName}" does not exist. Creating...`);

      const bucket = await bucketsAPI.postBuckets({body: {OrgID:orgID,name:bucketName}});
      console.log(
        JSON.stringify(
          bucket,
          (key, value) => (key === 'links' ? undefined : value),
          2
        )
      )
      console.log(`Bucket "${bucketName}" created successfully.`);
    }
    updateEnvFile(bucketName);
  } catch (error) {
    console.error('Error creating bucket:', error.message);
  }
};


// Function to update the .env file with the new bucket name
const updateEnvFile = (bucketName) => {
  try {
    const updatedEnvConfig = {
      ...envConfig,
      BUCKET_NAME: bucketName,
    };
    const updatedEnvContent = Object.entries(updatedEnvConfig)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');
    fs.writeFileSync(envPath, updatedEnvContent, 'utf8');
    console.log('Updated .env file with the new bucket name.');
  } catch (error) {
    console.error('Error updating .env file:', error.message);
  }
};

// Get the bucket name from the environment variables
const bucketName = getMacAddress();

// Call the function to create the bucket localy
createBucket(bucketName,local_influxDB);


// Call the function to create the bucket on cloud
createBucket(bucketName,cloud_influxDB);

