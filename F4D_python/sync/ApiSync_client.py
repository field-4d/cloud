import json
import os
import asyncio
import websockets
import threading
import queue
import time

ENV_PATH = "/home/pi/F4D/.env"

# Queue for packets waiting to be sent
_last_package_queue = queue.Queue(maxsize=2000)

# Prevent starting the sender thread twice
_sender_thread_started = False
_sender_thread_lock = threading.Lock()


def read_env():
    env = {}

    if not os.path.exists(ENV_PATH):
        raise FileNotFoundError(f".env file not found at {ENV_PATH}")

    with open(ENV_PATH, "r") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            env[key.strip()] = value.strip()

    return env


def get_ws_ping_url(api_sync_url: str) -> str:
    if api_sync_url.startswith("https://"):
        return api_sync_url.replace("https://", "wss://", 1) + "/ws/ping"
    elif api_sync_url.startswith("http://"):
        return api_sync_url.replace("http://", "ws://", 1) + "/ws/ping"
    else:
        raise ValueError("API_SYNC_URL must start with http:// or https://")


async def send_ping_async(lla: str):
    env = read_env()

    hostname = env.get("HOSTNAME")
    mac_address = env.get("MAC_ADDRESS")
    api_sync_url = env.get("API_SYNC_URL")

    if not hostname or not mac_address or not api_sync_url:
        raise ValueError("Missing env keys. Required: HOSTNAME, MAC_ADDRESS, API_SYNC_URL")

    ws_url = get_ws_ping_url(api_sync_url)

    payload = {
        "owner": hostname,
        "mac_address": mac_address,
        "type": "Ping",
        "LLA": lla
    }

    async with websockets.connect(ws_url) as websocket:
        await websocket.send(json.dumps(payload))
        response = await websocket.recv()
        return response


def send_ping(lla: str):
    """
    Keep ping as immediate/synchronous.
    PING is small and usually infrequent enough.
    """
    try:
        asyncio.run(send_ping_async(lla))
    except Exception as e:
        print(f"Failed to send Ping to ApiSync: {e}")


async def send_last_package_async(packet: dict):
    env = read_env()

    hostname = env.get("HOSTNAME")
    mac_address = env.get("MAC_ADDRESS")
    api_sync_url = env.get("API_SYNC_URL")

    if not hostname or not mac_address or not api_sync_url:
        raise ValueError("Missing env keys. Required: HOSTNAME, MAC_ADDRESS, API_SYNC_URL")

    ws_url = get_ws_ping_url(api_sync_url)

    payload = {
        "type": "Last_Package",
        "owner": hostname,
        "mac_address": mac_address,
        "sensors": packet
    }

    async with websockets.connect(ws_url) as websocket:
        await websocket.send(json.dumps(payload))
        response = await websocket.recv()
        return response


def transform_last_package(packet: dict) -> dict:
    """
    Transform packet from main.py into ApiSync format:
    {
        "<ipv6>": { ...sensor fields... }
    }
    """
    ipv6 = packet.get("ipv6")
    if not ipv6:
        raise ValueError("Packet must contain 'ipv6' key")

    sensor_data = {k: v for k, v in packet.items() if k != "ipv6"}
    return {ipv6: sensor_data}


def _sender_worker():
    """
    Background worker:
    waits for packets from the queue and sends them one by one.
    """
    print("[Web-Socket] Sender thread started")

    while True:
        packet = _last_package_queue.get()

        try:
            transformed_packet = transform_last_package(packet)

            start = time.time()
            response = asyncio.run(send_last_package_async(transformed_packet))
            elapsed = time.time() - start

            try:
                response = json.loads(response)
                received = response.get("received", False)
                ipv6 = packet.get("ipv6", "unknown")
                print(f"[Web-Socket] LastPackage for {ipv6} received={received}")
                print(f"[Web-Socket] Send+response time: {elapsed:.4f} seconds")
            except json.JSONDecodeError:
                print("[Web-Socket] ApiSync returned non-JSON response")

        except Exception as e:
            print(f"[Web-Socket] Failed to send LastPackage: {e}")

        finally:
            _last_package_queue.task_done()


def start_last_package_sender():
    """
    Start the background sender thread once.
    """
    global _sender_thread_started

    with _sender_thread_lock:
        if _sender_thread_started:
            return

        thread = threading.Thread(target=_sender_worker, daemon=True)
        thread.start()
        _sender_thread_started = True


def enqueue_last_package(packet: dict) -> bool:
    """
    Put packet into queue without blocking the main collector loop.
    Returns True if queued successfully.
    """
    try:
        _last_package_queue.put_nowait(packet)
        return True
    except queue.Full:
        ipv6 = packet.get("ipv6", "unknown")
        print(f"[Web-Socket] Queue full, dropping packet from {ipv6}")
        return False


def get_last_package_queue_size() -> int:
    """
    Optional helper for debugging pressure/load.
    """
    return _last_package_queue.qsize()