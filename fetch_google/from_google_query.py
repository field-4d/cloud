import os
from google.cloud import bigquery
from google.oauth2 import service_account
import pandas as pd

def query_combined_data(client, dataset_id, table_id, print_cost=False):
    """
    Execute a combined query to get distinct sensors, total entries, and last timestamp grouped by ExperimentData_Exp_name.

    Parameters:
        client (bigquery.Client): Initialized BigQuery client.
        dataset_id (str): The ID of the dataset.
        table_id (str): The ID of the table.
        print_cost (bool): Flag to print query cost.

    Returns:
        tuple: (query results, estimated cost in USD)
    """
    # Define the combined SQL query
    query = f"""
    SELECT
      ExperimentData_Exp_name,
      COUNT(DISTINCT SensorData_Name) AS sensor_count,
      COUNT(*) AS num_entries,
      MAX(TimeStamp) AS last_timestamp
    FROM
      `iucc-f4d.{dataset_id}.{table_id}`
    GROUP BY
      ExperimentData_Exp_name
    ORDER BY
      ExperimentData_Exp_name;
    """

    # Configure the query for a dry run to estimate costs
    job_config = bigquery.QueryJobConfig(dry_run=True, use_query_cache=False)
    query_job = client.query(query, job_config=job_config)

    # Calculate estimated cost
    bytes_processed = query_job.total_bytes_processed
    estimated_cost = (bytes_processed / (1024 ** 4)) * 5  # Cost in USD ($5 per TB)

    if print_cost:
        print(f"Estimated cost for table {table_id} in dataset {dataset_id}: ${estimated_cost:.4f}")

    # Execute the actual query
    query_job = client.query(query)
    return query_job.result(), estimated_cost



# Path to your credentials JSON file
credentials_path = "read_BQ.json"

# Load credentials from the JSON file
credentials = service_account.Credentials.from_service_account_file(credentials_path)

# Initialize BigQuery client
client = bigquery.Client(credentials=credentials, project="iucc-f4d")

# Initialize an empty list to store data for the DataFrame
data = []

dataset_costs = {}  # Dictionary to store costs per dataset
combined_cost = 0   # Variable to track the combined cost

# Iterate through datasets and tables, then run the query for each
for dataset in client.list_datasets():
    dataset_id = dataset.dataset_id
    dataset_total_cost = 0

    for table in client.list_tables(dataset_id):
        table_id = table.table_id
        print(f"Running query for dataset: {dataset_id}, table: {table_id}")
        results, estimated_cost = query_combined_data(client, dataset_id, table_id, print_cost=True)

        # Add query results to the data list
        for row in results:
            data.append({
                "dataset_id": dataset_id,
                "table_id": table_id,
                "ExperimentData_Exp_name": row.ExperimentData_Exp_name,
                "sensor_count": row.sensor_count,
                "num_entries": row.num_entries,
                "last_timestamp": row.last_timestamp,
                "estimated_cost": estimated_cost
            })

        dataset_total_cost += estimated_cost

    # Store total cost for the dataset
    dataset_costs[dataset_id] = dataset_total_cost
    combined_cost += dataset_total_cost

    print(f"Total estimated cost for dataset {dataset_id}: ${dataset_total_cost:.4f}")

# Print combined cost for all datasets
print(f"Combined estimated cost for all datasets: ${combined_cost:.10f}")

# Create a DataFrame from the collected data
df = pd.DataFrame(data)

# Display the DataFrame
print(df)
