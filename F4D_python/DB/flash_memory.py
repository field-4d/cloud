from datetime import datetime, timezone
from copy import deepcopy
from threading import Lock


FLASH_MEMORY_BUFFER = {}
FLASH_MEMORY_LOCK = Lock()


def update_flash_memory(packet: dict) -> None:
    """
    Update the in-memory interval buffer with:
    - latest packet info for sensors_data
    - packet event log for packet_events

    Rules:
    - packet must contain 'ipv6'
    - latest packet overwrites previous values for that sensor
    - packet_count increments every time a packet arrives in the interval
    - packet_events appends one event per arrival
    """
    ipv6 = packet.get("ipv6")
    if not ipv6:
        raise ValueError("Packet must contain 'ipv6'")

    sensor_payload = {k: v for k, v in packet.items() if k != "ipv6"}
    now_dt = datetime.now() # device local time is fine for ordering events, but store in ISO format for consistency
    now_str = now_dt.isoformat(timespec="milliseconds")

    with FLASH_MEMORY_LOCK:
        if ipv6 not in FLASH_MEMORY_BUFFER:
            FLASH_MEMORY_BUFFER[ipv6] = {
                "packet_count": 0,
                "last_packet_time": None,
                "packet": {},
                "packet_events": [],
            }

        entry = FLASH_MEMORY_BUFFER[ipv6]
        entry["packet_count"] += 1
        entry["last_packet_time"] = now_str
        entry["packet"] = deepcopy(sensor_payload)

        entry["packet_events"].append({
            "LLA": ipv6,
            "Packet_Arrival_Time": now_str,
            "Packet_Order_In_LLA_Interval": entry["packet_count"],
        })


def get_flash_memory() -> dict:
    with FLASH_MEMORY_LOCK:
        return deepcopy(FLASH_MEMORY_BUFFER)


def clear_flash_memory() -> None:
    with FLASH_MEMORY_LOCK:
        FLASH_MEMORY_BUFFER.clear()


def pop_flash_memory_snapshot() -> dict:
    """
    Atomically take the current flash-memory buffer and clear it.
    New packets after this point go into a fresh interval buffer.
    """
    with FLASH_MEMORY_LOCK:
        snapshot = deepcopy(FLASH_MEMORY_BUFFER)
        FLASH_MEMORY_BUFFER.clear()
        return snapshot


def restore_flash_memory_snapshot(snapshot: dict) -> None:
    """
    Restore a previously popped snapshot back into the current buffer.
    If the same sensor already has new data in the fresh buffer, merge:
    - packet_count
    - packet_events
    - keep newest packet by last_packet_time
    """
    if not snapshot:
        return

    with FLASH_MEMORY_LOCK:
        for ipv6, old_data in snapshot.items():
            if ipv6 not in FLASH_MEMORY_BUFFER:
                FLASH_MEMORY_BUFFER[ipv6] = deepcopy(old_data)
                continue

            current_data = FLASH_MEMORY_BUFFER[ipv6]

            merged_events = old_data.get("packet_events", []) + current_data.get("packet_events", [])
            merged_events.sort(key=lambda x: x.get("Packet_Arrival_Time", ""))

            for idx, event in enumerate(merged_events, start=1):
                event["Packet_Order_In_LLA_Interval"] = idx

            current_data["packet_events"] = merged_events
            current_data["packet_count"] = len(merged_events)

            current_time = current_data.get("last_packet_time", "") or ""
            old_time = old_data.get("last_packet_time", "") or ""

            if old_time > current_time:
                current_data["last_packet_time"] = old_time
                current_data["packet"] = deepcopy(old_data.get("packet", {}))