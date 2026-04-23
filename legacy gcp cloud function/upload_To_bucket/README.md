
# Google Cloud Function: Upload JSON to GCS

This Google Cloud Function uploads JSON objects to a specified Google Cloud Storage (GCS) bucket. Each JSON object is stored in a hierarchical folder structure based on its metadata fields.

---

## Overview

This function is triggered by an HTTP request and processes a list of JSON objects sent in the request body. For each JSON object, the function:
1. Extracts specific metadata fields to define a folder structure in the destination GCS bucket.
2. Converts the JSON object into a formatted JSON file.
3. Uploads the JSON file to the specified GCS bucket.

---

## Key Features
- **Flexible Folder Structure**: The folder hierarchy is dynamically created based on the `_id`, `MAC_address`, and `Exp_name` fields from each JSON object.
- **Batch Processing**: Processes and uploads multiple JSON objects in a single request.
- **Error Handling**: Skips JSON objects with missing fields and provides meaningful error responses.

---

## How It Works
1. **Trigger**:  
   This function is triggered via an HTTP POST request.

2. **Input**:  
   The HTTP request should contain a JSON array of objects. Each object must include the following fields:  
   - `_id` (as `Owner`): Unique identifier for the owner.
   - `MAC_address`: The MAC address associated with the experiment.
   - `Exp_name`: The name of the experiment.
   - `UniqueID`: A unique identifier for the object.

3. **Folder Structure**:  
   The uploaded files are organized in the following folder hierarchy:  
   `/{_id}/{MAC_address}/{Exp_name}/{UniqueID}.json`

4. **Response**:  
   Returns a success message (`200 OK`) if all JSON objects are uploaded successfully. Provides an error message (`400` or `500`) for invalid inputs or exceptions.

---

## Setup Instructions
1. **Google Cloud Services Required**:
   - Cloud Storage
   - Cloud Functions

2. **Environment Configuration**:
   - Ensure the required Google Cloud APIs are enabled (e.g., Cloud Storage API).  
   - Replace the `destination_bucket` variable with the name of your target GCS bucket.
   - Deploy the function using the following command:
     ```bash
     gcloud functions deploy upload_json_to_gcs          --runtime python39          --trigger-http          --allow-unauthenticated
     ```

3. **Authentication**:
   - If running locally, authenticate using:
     ```bash
     gcloud auth application-default login
     ```

4. **Test the Function**:  
   Use a tool like `curl` or Postman to test the function. Example `curl` command:
   ```bash
   curl -X POST https://YOUR_FUNCTION_URL        -H "Content-Type: application/json"        -d '[
           {
               "Owner": "example_owner",
               "ExperimentData": {
                   "MAC_address": "example_mac_address",
                   "Exp_name": "example_experiment"
               },
               "UniqueID": "example_unique_id"
           }
       ]'
   ```

---

## Example Payload
```json
[
  {
    "Owner": "example_owner",
    "ExperimentData": {
      "MAC_address": "example_mac_address",
      "Exp_name": "example_experiment"
    },
    "UniqueID": "example_unique_id"
  }
]
```

---

## Example Folder Structure
Given the example payload above, the JSON file would be uploaded to the following path in the GCS bucket:  
```
/example_owner/example_mac_address/example_experiment/example_unique_id.json
```

---

## Code Highlights
- **`upload_json_to_gcs`**: Handles the HTTP request and calls the `upload_files_to_gcs` function.
- **`upload_files_to_gcs`**: Processes each JSON object, creates the folder structure, and uploads the file to GCS.

---

## Error Handling
- **Missing Fields**: Skips JSON objects missing any of the required fields (`_id`, `MAC_address`, `Exp_name`, `UniqueID`) and logs a message.
- **Invalid Input**: Returns a `400` status code if the input is not a valid JSON array.
- **Exceptions**: Returns a `500` status code for other errors during execution.

---
