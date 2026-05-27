def handle_get_last_timestamp(payload: Dict[str, Any]) -> Tuple[Dict[str, Any], int]:
    """
    Return the latest uploaded timestamp for one logical stream.
    Uses a 2-step query process to save BigQuery costs.
    """
    table_name = payload.get("table_name")
    owner = payload.get("owner")
    mac_address = payload.get("mac_address")
    experiment_name = payload.get("experiment_name")

    table_error = validate_table_name(table_name)
    if table_error:
        return {"status": "error", "message": table_error}, 400

    if not owner or not mac_address or not experiment_name:
        return {
            "status": "error",
            "message": "Missing required fields: owner, mac_address, experiment_name.",
        }, 400

    client = get_bq_client()
    table_ref = get_table_ref(table_name)

    if not check_table_exists(client, table_ref):
        return {
            "status": "success",
            "action": "get_last_timestamp",
            "table_name": table_name,
            "table_exists": False,
            "stream_exists": False,
            "last_timestamp": None,
        }, 200

    timestamp_column = TABLE_CONFIG[table_name]["timestamp_column"]

    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("owner", "STRING", owner),
            bigquery.ScalarQueryParameter("mac_address", "STRING", mac_address),
            bigquery.ScalarQueryParameter("experiment_name", "STRING", experiment_name),
        ]
    )

    # Step 1: Fast Query (Limit scan to the last 14 days to save costs)
    fast_query = f"""
        SELECT MAX({timestamp_column}) AS last_timestamp
        FROM `{table_ref}`
        WHERE Owner = @owner
          AND Mac_Address = @mac_address
          AND Exp_Name = @experiment_name
          AND {timestamp_column} >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 14 DAY)
    """

    query_job = client.query(fast_query, job_config=job_config)
    results = list(query_job.result())

    last_timestamp = None
    if results and results[0]["last_timestamp"] is not None:
        last_timestamp = results[0]["last_timestamp"]
    else:
        # Step 2: Fallback Query (Full table scan if device was offline > 14 days)
        fallback_query = f"""
            SELECT MAX({timestamp_column}) AS last_timestamp
            FROM `{table_ref}`
            WHERE Owner = @owner
              AND Mac_Address = @mac_address
              AND Exp_Name = @experiment_name
        """
        fallback_job = client.query(fallback_query, job_config=job_config)
        fallback_results = list(fallback_job.result())
        
        if fallback_results and fallback_results[0]["last_timestamp"] is not None:
            last_timestamp = fallback_results[0]["last_timestamp"]

    return {
        "status": "success",
        "action": "get_last_timestamp",
        "table_name": table_name,
        "table_exists": True,
        "stream_exists": last_timestamp is not None,
        "last_timestamp": last_timestamp.isoformat() if last_timestamp else None,
    }, 200