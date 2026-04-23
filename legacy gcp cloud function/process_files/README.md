
# Cloud Function for Processing JSON Files

This project automates the processing of JSON files uploaded to a Google Cloud Storage bucket, including cataloging, splitting data, and inserting it into BigQuery tables.

---

## Overview

When a JSON file is uploaded to a designated Cloud Storage bucket, this Cloud Function is triggered. The function processes the file in multiple steps:  
1. Extracting metadata from the JSON data.  
2. Dynamically creating datasets and tables in BigQuery.  
3. Splitting and distributing data for parallel processing.  
4. Flattening nested JSON objects for BigQuery compatibility.  
5. Batch inserting the data into BigQuery tables.  

---

## Key Features
- **Cloud Trigger**: Automatically triggered by file uploads to a specified bucket.
- **Dynamic BigQuery Management**: Automatically creates datasets, tables, and updates schemas based on the data structure.
- **Parallel Processing**: Splits data into smaller chunks and sends it to additional Cloud Functions.
- **JSON Flattening**: Handles nested JSON structures to ensure compatibility with BigQuery.
- **Error Handling**: Logs JSON decoding errors and updates schemas dynamically for new fields.

---

## How It Works
1. **Trigger**:  
   When a file is uploaded, the function retrieves event details, such as the bucket and file name.

2. **Download and Parse JSON**:  
   The uploaded file is downloaded and parsed as a list of JSON objects.

3. **Process Data**:  
   - Extracts metadata (IDs, MAC addresses, experiment names).  
   - Sends smaller chunks of data to a separate Cloud Function for additional processing.  
   - Creates necessary datasets and tables in BigQuery.  
   - Maps JSON data to appropriate tables and inserts it in batches.  

4. **Clean-Up**:  
   Deletes the file from the bucket after processing.

---

## Setup Instructions
1. **Google Cloud Services Required**:
   - Cloud Storage
   - Cloud Functions
   - BigQuery

2. **Environment Configuration**:
   - Ensure the required Google Cloud APIs are enabled (e.g., BigQuery API, Cloud Storage API).  
   - Set up a Cloud Storage bucket to trigger the function.

3. **Deploy the Cloud Function**:
   Use the following command to deploy the function:  
   ```bash
   gcloud functions deploy catalog_and_insert        --runtime python39        --trigger-resource YOUR_BUCKET_NAME        --trigger-event google.storage.object.finalize
   ```

4. **Authentication**:
   - Ensure the service account associated with the function has appropriate permissions for BigQuery, Cloud Storage, and invoking other Cloud Functions.

---

## Code Highlights
- **`catalog_and_insert`**: Main function triggered by Cloud Storage events.
- **`process_data`**: Orchestrates the end-to-end processing of the JSON data.
- **`create_bq_datasets_and_tables`**: Dynamically manages BigQuery datasets and tables.
- **`batch_insert_to_bq`**: Handles batch insertion of JSON data into BigQuery.
- **`send_lists_to_gcs`**: Splits large data into smaller chunks and sends them to a helper Cloud Function.

---

## Error Handling
- **Invalid JSON Files**: Logs errors when JSON decoding fails.  
- **Schema Updates**: Dynamically adds new fields to BigQuery tables when necessary.  

---

## Future Enhancements
- Add unit tests for JSON validation and schema management.  
- Improve performance by parallelizing more tasks.  
- Integrate monitoring tools like Stackdriver for real-time error tracking.


## Example JSON
```json
{
  "_id": {
    "$oid": "678e312a9f3ada34d801ed18"
  },
  "UniqueID": "exp_g8_example_fd002124b00120529b4_2025-01-20T11:19:00.000Z_fd002124b00120529b4",
  "Owner": "example_owner",
  "MetaData": {
    "LLA": "example_lla",
    "Location": "Example_Sensor",
    "Coordinates": {
      "x": 0,
      "y": 0,
      "z": 0
    },
    "Version": "V1",
    "GeneralData": {
      "Project": "Example Project",
      "Researcher": "Example Researcher",
      "Institution": "Example Institution",
      "Description": "Example description for collecting sensor data"
    }
  },
  "ExperimentData": {
    "MAC_address": "example_mac_address",
    "Exp_id": 1,
    "Exp_name": "example_exp"
  },
  "TimeStamp": {
    "$date": "2025-01-20T13:19:00Z"
  },
  "SensorData": {
    "Name": "Example_Sensor",
    "battery": 3000,
    "temperature": 25.0,
    "humidity": 60.0,
    "light": 500.0,
    "barometric_pressure": 1015.0,
    "barometric_temp": 24.0,
    "Coordinates": {
      "x": 0,
      "y": 0,
      "z": 0
    },
    "Labels": [],
    "LabelOptions": [],
    "tmp107_amb": null,
    "tmp107_obj": null,
    "rssi": null,
    "bmp_390_u18_pressure": null,
    "bmp_390_u18_temperature": null,
    "bmp_390_u19_pressure": null,
    "bmp_390_u19_temperature": null,
    "hdc_2010_u13_temperature": null,
    "hdc_2010_u13_humidity": null,
    "hdc_2010_u16_temperature": null,
    "hdc_2010_u16_humidity": null,
    "hdc_2010_u17_temperature": null,
    "hdc_2010_u17_humidity": null,
    "opt_3001_u1_light_intensity": null,
    "opt_3001_u2_light_intensity": null,
    "opt_3001_u3_light_intensity": null,
    "opt_3001_u4_light_intensity": null,
    "opt_3001_u5_light_intensity": null,
    "batmon_temperature": null,
    "batmon_battery_voltage": null,
    "co2_ppm": null,
    "air_velocity": null
  }
}
```