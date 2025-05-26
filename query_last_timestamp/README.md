
# Google Cloud Function: Query Last Timestamps

This Google Cloud Function queries a BigQuery table to retrieve the most recent timestamp for specified experiments. It takes a JSON payload with experiment information and responds with the last recorded timestamps for each experiment.

---

## Overview

This Cloud Function is triggered by an HTTP request. It processes the provided JSON payload to:
1. Extract parameters like the dataset ID (`owner`), table name (`mac_address`), and a list of experiment names.
2. Query BigQuery for the latest timestamp for each experiment.
3. Return the results as a JSON response.

---

## Key Features
- **Flexible Input**: Accepts any combination of dataset ID, table name, and experiment names.
- **Dynamic Queries**: Queries BigQuery dynamically based on provided input.
- **Error Handling**: Validates input and provides meaningful error messages for missing or incorrect parameters.

---

## How It Works
1. **Input Payload**:  
   The HTTP request includes a JSON payload with the following fields:  
   - `owner`: The BigQuery dataset ID (e.g., `"GrowthRoom"`).  
   - `mac_address`: The BigQuery table name (e.g., `"d83adde2608f"`).  
   - `experiment_names`: A list of experiment names to query for their last timestamps.

2. **Query BigQuery**:  
   For each experiment name, the function queries the specified BigQuery table for the most recent timestamp (`MAX(TimeStamp)`).

3. **Response**:  
   Returns a JSON object where keys are experiment names and values are the corresponding last timestamps.

4. **Error Handling**:  
   The function checks for missing input parameters and handles query errors gracefully.

---

## Setup Instructions
1. **Google Cloud Services Required**:
   - BigQuery
   - Cloud Functions

2. **Environment Configuration**:
   - Enable the required Google Cloud APIs (e.g., BigQuery API).  
   - Deploy the function using the following command:
     ```bash
     gcloud functions deploy query_last_timestamp \
         --runtime python39 \
         --trigger-http \
         --allow-unauthenticated
     ```

3. **Authentication**:
   - If running the function locally, authenticate using:
     ```bash
     gcloud auth application-default login
     ```

4. **Test the Function**:  
   Use a tool like `curl` or Postman to test the function. Example `curl` command:
   ```bash
   curl -X POST https://YOUR_FUNCTION_URL \
       -H "Content-Type: application/json" \
       -d '{
           "owner": "GrowthRoom",
           "mac_address": "d83adde2608f",
           "experiment_names": [
               "exp_9_weekend_Check",
               "exp_7_Soldering"
           ]
       }'
   ```

---

## Example Payload
```json
{
  "owner": "GrowthRoom",
  "mac_address": "example_mac_address",
  "experiment_names": [
    "exp_1_Lab_Experiment",
    "exp_2_Field_Test",
    "exp_3_Sensor_Check"
  ]
}
```

---

## Example Response
The response is a JSON object where each key is an experiment name and the value is the latest timestamp for that experiment.

```json
{
  "exp_1_Lab_Experiment": "2025-01-20 13:19:00",
  "exp_2_Field_Test": "2025-01-19 18:35:00",
  "exp_3_Sensor_Check": 0
}
```
Note: A value of `0` indicates that no data was found for the experiment.

---

## Code Highlights
- **`query_last_timestamp`**: Main function to process the request and query BigQuery.
- **Error Handling**: Provides detailed errors for invalid input or query execution issues.
- **Dynamic Querying**: Generates BigQuery queries dynamically for the given input.

---

## Error Handling
- **Missing Input**:  
   Returns a `400` status code with a message if required parameters are missing.
- **BigQuery Errors**:  
   Returns a `500` status code if an error occurs while querying BigQuery.

---

## Future Enhancements
- Add support for batch queries to optimize performance for large experiment lists.
- Improve response structure to include metadata about the query execution.
- Enable authentication to restrict access to the function.

---
