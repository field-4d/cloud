import functions_framework
from google.cloud import bigquery
from datetime import datetime, timedelta
from flask import make_response
import json

@functions_framework.http
def hello_http(request):
    """HTTP Cloud Function.
    Args:
        request (flask.Request): The request object.
        <https://flask.palletsprojects.com/en/1.1.x/api/#incoming-request-data>
    Returns:
        The response text, or any set of values that can be turned into a
        Response object using `make_response`
        <https://flask.palletsprojects.com/en/1.1.x/api/#flask.make_response>.
    """

    update_labels()
    # Construct a response
    response_data = {"message": "Hello, Cloud Function!"}
    response = make_response(response_data, 200)
    response.headers["Content-Type"] = "application/json"

    return response



def execute_query(dataset_id, table_id):
    try:
        # Create a BigQuery client
        client = bigquery.Client()

        # Define the full table name
        table_full_name = f"`{dataset_id}.{table_id}`"

        # Define the query
        query = f"""
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
        """

        # Execute the query
        query_job = client.query(query)

        # Wait for the job to complete
        query_job.result()

        print(f"Table `{table_full_name}` has been updated successfully.")

    except Exception as e:
        print(f"An error occurred: {e}")


def update_labels():
    try:
        # Create a BigQuery client
        client = bigquery.Client()

        # Iterate over all datasets in the project
        datasets = client.list_datasets()
        for dataset in datasets:
            dataset_id = dataset.dataset_id

            # Iterate over all tables in the dataset
            tables = client.list_tables(dataset_id)
            for table in tables:
                table_id = table.table_id

                # Call execute_query for each dataset and table
                execute_query(dataset_id, table_id)

    except Exception as e:
        print(f"An error occurred while updating labels: {e}")