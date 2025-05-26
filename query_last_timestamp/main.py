from google.cloud import bigquery
import json


def query_last_timestamp(request):
    """
    Google Cloud Function to query BigQuery and return the last timestamps for specific experiments.
    """
    # Step 1: Parse the request JSON
    print("Step 1: Parsing request JSON...")
    request_json = request.get_json(silent=True)
    # print("Step 1: Received request JSON:", request_json if request_json else "No request JSON provided")

    if not request_json:
        print("Step 1: Request JSON is missing!")  # Debugging
        return "Invalid request, JSON body required.", 400

    # Step 2: Extract parameters
    print("Step 2: Extracting parameters from request JSON...")
    dataset_id = request_json.get("owner")  # Dataset ID
    mac_address = request_json.get("mac_address")  # Table name
    experiment_names = request_json.get("experiment_names")  # List of experiment names

    # print("Step 2: Parsed dataset_id:", dataset_id if dataset_id else "Missing dataset_id")
    # print("Step 2: Parsed mac_address:", mac_address if mac_address else "Missing mac_address")
    # print("Step 2: Parsed experiment_names:", experiment_names if experiment_names else "Missing experiment_names")

    if not (dataset_id and mac_address and experiment_names):
        print("Step 2: Missing required parameters!")  # Debugging
        return "Missing required parameters: owner (dataset_id), mac_address (table_name), or experiment_names.", 400

    # Step 3: Initialize BigQuery client
    print("Step 3: Initializing BigQuery client...")
    project_id = "iucc-f4d"
    # print("Step 3: Using project_id:", project_id)
    client = bigquery.Client(project=project_id)

    # Step 4: Initialize response dictionary
    print("Step 4: Initializing response dictionary...")
    response_data = {}

    try:
        # Step 5: Loop through each experiment name and query BigQuery
        for experiment_name in experiment_names:
            print(f"Step 5: Processing experiment_name: {experiment_name}...")
            query = f"""
            SELECT 
                MAX(TimeStamp) AS last_timestamp
            FROM `{project_id}.{dataset_id}.{mac_address}`
            WHERE ExperimentData_Exp_name = @experiment_name
            """
            # print("Step 5: Generated query:", query)

            query_params = [
                bigquery.ScalarQueryParameter("experiment_name", "STRING", experiment_name)
            ]
            # print("Step 5: Query parameters for", experiment_name, ":", query_params or "None")

            job_config = bigquery.QueryJobConfig(query_parameters=query_params)

            # Step 6: Execute the query
            print(f"Step 6: Executing query for {experiment_name}...")
            query_job = client.query(query, job_config=job_config)
            results = query_job.result()
            # print(f"Step 6: Query executed successfully for {experiment_name}!")

            # Step 7: Process query results
            for row in results:
                # print(f"Step 7: Row retrieved for {experiment_name}:", row or "No data found")
                timestamp = row["last_timestamp"]
                if timestamp:
                    response_data[experiment_name] = timestamp.strftime('%Y-%m-%d %H:%M:%S')
                else:
                    response_data[experiment_name] = 0

        # Step 8: Finalize and return response
        print("Step 8: Final response data:", json.dumps(response_data))
        return json.dumps(response_data), 200

    except Exception as e:
        # Step 9: Handle errors
        print("Step 9: Error occurred during query execution:", str(e))
        return f"Error executing query: {e}", 500
