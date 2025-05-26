
# Google Cloud Function: Update Labels in BigQuery

This Google Cloud Function updates the labels and label options in all tables across all datasets in a BigQuery project. It ensures that each table has the latest label information based on specific criteria.

---

## Overview

This Cloud Function is triggered via an HTTP request. It performs the following actions:
1. Iterates over all datasets and tables in the BigQuery project.
2. Executes a SQL query on each table to update the `SensorData_Labels` and `SensorData_LabelOptions` fields.
3. Updates tables in place using the `CREATE OR REPLACE` statement.

---

## Key Features
- **Project-Wide Updates**: Applies updates across all datasets and tables in the BigQuery project.
- **SQL-Based Logic**: Uses a SQL query to identify and replace outdated label data with the most recent information.
- **Error Handling**: Provides error messages if a table or dataset cannot be processed.

---

## How It Works
1. **Trigger**:  
   This function is triggered via an HTTP POST request. The `hello_http` function handles the request and calls the `update_labels` function.

2. **Dataset and Table Iteration**:  
   The `update_labels` function:
   - Iterates over all datasets in the BigQuery project.
   - For each dataset, iterates over all tables.

3. **Table Update Logic**:  
   The `execute_query` function:
   - Runs a SQL query on each table to:
     - Partition the table data by `MetaData_LLA` and `ExperimentData_Exp_name`.
     - Use the most recent `InsertDate` to update `SensorData_Labels` and `SensorData_LabelOptions` fields.

4. **Response**:  
   Returns a JSON response confirming the execution of the function.

---

## Setup Instructions
1. **Google Cloud Services Required**:
   - BigQuery
   - Cloud Functions

2. **Environment Configuration**:
   - Ensure the required Google Cloud APIs are enabled (e.g., BigQuery API).  
   - Deploy the function using the following command:
     ```bash
     gcloud functions deploy update_labels \
         --runtime python39 \
         --trigger-http \
         --allow-unauthenticated
     ```

3. **Authentication**:
   - If running locally, authenticate using:
     ```bash
     gcloud auth application-default login
     ```

4. **Test the Function**:  
   Use a tool like `curl` or Postman to test the function. Example `curl` command:
   ```bash
   curl -X POST https://YOUR_FUNCTION_URL
   ```

---

## Example Query Logic
The SQL query used in `execute_query` is as follows:

```sql
CREATE OR REPLACE TABLE {table_full_name} AS
WITH LatestSensorData AS (
  SELECT 
    MetaData_LLA,
    ExperimentData_Exp_name,
    SensorData_Labels,
    SensorData_LabelOptions,
    InsertDate,
    ROW_NUMBER() OVER (PARTITION BY MetaData_LLA, ExperimentData_Exp_name ORDER BY InsertDate DESC) AS rn
  FROM 
    {table_full_name}
  WHERE
    SensorData_Labels IS NOT NULL
    AND SensorData_LabelOptions IS NOT NULL
)

SELECT 
  t.* REPLACE(
    lsd.SensorData_Labels AS SensorData_Labels,
    lsd.SensorData_LabelOptions AS SensorData_LabelOptions
  )
FROM {table_full_name} AS t
LEFT JOIN LatestSensorData AS lsd
ON t.MetaData_LLA = lsd.MetaData_LLA
  AND t.ExperimentData_Exp_name = lsd.ExperimentData_Exp_name
  AND lsd.rn = 1;
```

---

## Code Highlights
- **`hello_http`**: Handles the HTTP request and triggers the `update_labels` function.
- **`update_labels`**: Iterates over all datasets and tables in BigQuery and calls `execute_query` for each.
- **`execute_query`**: Runs the SQL query to update the table.

---

## Error Handling
- **Dataset/Table Errors**: Logs errors if a dataset or table cannot be accessed or updated.
- **SQL Execution Errors**: Logs exceptions raised during query execution.

---


