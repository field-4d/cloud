from datetime import datetime, timezone
from threading import Thread

from DB import (
    pop_flash_memory_snapshot,
    restore_flash_memory_snapshot,
    write_flash_buffer_to_sensors_data,
)
from services.metadata_service import sync_metadata_for_interval
from helpers import get_next_3min_boundary, format_dt, sleep_until


def flush_worker():
    next_flush_time = get_next_3min_boundary()

    print(f"[SYNC] Waiting for 3-minute sync clock. First flush scheduled at: {format_dt(next_flush_time)}")
    print(f"[COLLECT] New collection window opened for interval ending at {format_dt(next_flush_time)}")

    while True:
        sleep_until(next_flush_time)

        # boundary_time = next_flush_time.replace(tzinfo=timezone.utc) if next_flush_time.tzinfo is None else next_flush_time
        boundary_time = next_flush_time # Assuming all times are already in UTC and timezone-aware, we can use next_flush_time directly without modification.
        print(f"[SYNC] 3-minute boundary reached at: {format_dt(boundary_time)}")

        flash_buffer = pop_flash_memory_snapshot()
        print(f"[FLASH] Snapshot popped. Buffered sensors in frozen interval: {len(flash_buffer)}")

        print("[METADATA] Starting metadata refresh before interval write...")
        metadata_result = sync_metadata_for_interval()

        if metadata_result.get("status") == "ok":
            print(f"[META SYNC RESULT] {metadata_result.get('result')}")
            print("[METADATA] Local metadata is ready for enrichment.")
        else:
            print(f"[META SYNC ERROR] Metadata refresh failed: {metadata_result.get('error')}")
            print("[METADATA] Continuing flush using last known local metadata.")

        if flash_buffer:
            write_result = write_flash_buffer_to_sensors_data(
                flash_buffer=flash_buffer,
                interval_timestamp=boundary_time
            )

            print(f"[WRITE:sensors_data] Inserted {write_result.get('sensors_data_rows_inserted', 0)} rows from {write_result.get('processed_sensors', 0)} active sensors.")
            print(f"[WRITE:packet_events] Inserted {write_result.get('packet_event_rows_inserted', 0)} packet event rows.")
            print(f"[WRITE RESULT] {write_result}")

            if write_result.get("status") == "ok":
                print("[FLASH] Buffer handed off successfully for timed write to sensors_data + packet_events.")
            else:
                print("[FLASH] Timed write failed. Restoring snapshot into flash buffer.")
                restore_flash_memory_snapshot(flash_buffer)
        else:
            print("[FLUSH] Flash buffer is empty. Nothing to write.")

        next_flush_time = get_next_3min_boundary(datetime.now())
        print(f"[SYNC] Next 3-minute flush scheduled at: {format_dt(next_flush_time)}")
        print(f"[COLLECT] New collection window opened for interval ending at {format_dt(next_flush_time)}")


def start_flush_thread():
    thread = Thread(target=flush_worker, daemon=True, name="flush-thread")
    thread.start()
    return thread