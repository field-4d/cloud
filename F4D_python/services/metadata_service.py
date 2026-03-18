from DB.firestore_client import sync_sensor_metadata_to_duckdb


def sync_metadata_for_interval() -> dict:
    """
    Refresh local metadata immediately before the 3-minute interval write.
    """
    try:
        result = sync_sensor_metadata_to_duckdb()
        return {
            "status": "ok",
            "result": result
        }
    except Exception as e:
        return {
            "status": "error",
            "error": str(e)
        }