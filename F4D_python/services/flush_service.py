from datetime import datetime, timezone
from threading import Thread

from DB import (
    pop_flash_memory_snapshot,
    restore_flash_memory_snapshot,
    write_flash_buffer_to_sensors_data,
    run_sync # this for upload to BQ
)
from services.metadata_service import sync_metadata_for_interval
from helpers import get_next_3min_boundary, format_dt, sleep_until

from services.device_service import send_device_heartbeat
from services.device_state import update_stream_state, is_live

from services.last_package_cache import pop_last_package_cache_snapshot
from sync.ApiSync_client import enqueue_last_package_batch


def flush_worker():
    next_flush_time = get_next_3min_boundary(datetime.now())
    
    print(f"[SYNC] Waiting for 3-minute sync clock. First flush scheduled at: {format_dt(next_flush_time)}")
    print(f"[COLLECT] New collection window opened for interval ending at {format_dt(next_flush_time)}")

    while True:
        sleep_until(next_flush_time)

        # boundary_time = next_flush_time.replace(tzinfo=timezone.utc) if next_flush_time.tzinfo is None else next_flush_time
        boundary_time = next_flush_time # Assuming all times are already in UTC and timezone-aware, we can use next_flush_time directly without modification.
        print(f"[SYNC] 3-minute boundary reached at: {format_dt(boundary_time)}")
        
        state_result = None

        ## adding the Device heartbeat here to ensure that the device is alive and responsive before proceeding with the flush operation.
        try:
            print("[DEVICE] Sending heartbeat...")

            heartbeat = send_device_heartbeat()
            stream = heartbeat.get("stream") or {}

            print(
                "[DEVICE] Heartbeat OK | "
                f"active={stream.get('active')} | "
                f"open_until={stream.get('open_until')} | "
                f"remaining_seconds={stream.get('remaining_seconds')}"
            )

            state_result = update_stream_state(stream)

            if state_result["old_mode"] != state_result["new_mode"]:
                print(
                    "[DEVICE STATE] "
                    f"{state_result['old_mode']} -> {state_result['new_mode']}"
                )
            else:
                print(
                    "[DEVICE STATE] "
                    f"Mode remains {state_result['new_mode']}"
                )

        except Exception as exc:
            print(f"[DEVICE] Heartbeat failed: {exc}")

        # Flush the NORMAL Last_Package cache when:
        # 1. the device is currently in NORMAL mode, or
        # 2. this heartbeat just changed the device from NORMAL -> LIVE.
        transitioned_normal_to_live = (
            state_result is not None
            and state_result["old_mode"] == "NORMAL"
            and state_result["new_mode"] == "LIVE"
        )

        should_flush_last_package_cache = (
            not is_live()
            or transitioned_normal_to_live
        )

        if should_flush_last_package_cache:
            last_package_batch = pop_last_package_cache_snapshot()

            if last_package_batch:
                queued = enqueue_last_package_batch(last_package_batch)

                if queued:
                    print(
                        f"[Last-Package Batch] Queued "
                        f"{len(last_package_batch)} sensors for upload"
                    )
                else:
                    print(
                        f"[Last-Package Batch] Failed to queue "
                        f"{len(last_package_batch)} sensors"
                    )
            else:
                print(
                    "[Last-Package Batch] Cache empty. Nothing to send."
                )
                      
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
                try:
                    print("[BQ SYNC] - Starting Automatic BigQuery sync for active experiments...")
                    bq_result =  run_sync(
                        table="both", # Sync both sensors_data and packet_events
                        exp_name=None, # Sync all active experiments
                        dry_run=False # Set to False to perform actual sync
                    )
                    print(f"[BQ SYNC RESULT] {bq_result}")
                except Exception as e:
                    print(f"[BQ SYNC ERROR] Automatic BigQuery sync failed: {e}")
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