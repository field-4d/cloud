import json
import os
import shutil
import socket
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
ENV_PATH = PROJECT_ROOT / ".env"

HEARTBEAT_TIMEOUT_SECONDS = 10


def _read_env():
    values = {}

    if not ENV_PATH.exists():
        return values

    with ENV_PATH.open("r", encoding="utf-8") as f:
        for raw_line in f:
            line = raw_line.strip()

            if not line or line.startswith("#") or "=" not in line:
                continue

            key, value = line.split("=", 1)
            values[key.strip()] = value.strip().strip('"').strip("'")

    return values


def _get_boot_time():
    with open("/proc/stat", "r", encoding="utf-8") as f:
        for line in f:
            if line.startswith("btime "):
                boot_epoch = int(line.split()[1])
                return datetime.fromtimestamp(
                    boot_epoch,
                    tz=timezone.utc,
                ).isoformat().replace("+00:00", "Z")

    raise RuntimeError("Could not determine boot time from /proc/stat")


def _get_uptime_seconds():
    with open("/proc/uptime", "r", encoding="utf-8") as f:
        return int(float(f.read().split()[0]))


def _get_timezone():
    timezone_path = Path("/etc/timezone")

    if timezone_path.exists():
        value = timezone_path.read_text(encoding="utf-8").strip()
        if value:
            return value

    return "UTC"


def collect_device_health():
    env = _read_env()

    disk = shutil.disk_usage("/")

    total_gb = disk.total / (1024 ** 3)
    free_gb = disk.free / (1024 ** 3)

    free_percent = (
        (disk.free / disk.total) * 100
        if disk.total
        else 0.0
    )

    return {
        "local_ip": env.get("LOCAL_IP", ""),
        "boot_time": _get_boot_time(),
        "uptime_seconds": _get_uptime_seconds(),
        "disk_total_gb": round(total_gb, 2),
        "disk_free_gb": round(free_gb, 2),
        "disk_free_percent": round(free_percent, 1),
        "time_zone": _get_timezone(),
    }


def send_device_heartbeat():
    env = _read_env()

    api_sync_url = env.get("API_SYNC_URL", "").rstrip("/")
    mac_address = env.get("MAC_ADDRESS", "").lower()
    owner = env.get("HOSTNAME", "")
    hostname = socket.gethostname()

    if not api_sync_url:
        raise RuntimeError("API_SYNC_URL missing from .env")

    if not mac_address:
        raise RuntimeError("MAC_ADDRESS missing from .env")

    if not owner:
        raise RuntimeError("HOSTNAME missing from .env")

    payload = {
        "owner": owner,
        "mac_address": mac_address,
        "hostname": hostname,
        "health": collect_device_health(),
    }

    request = urllib.request.Request(
        url=f"{api_sync_url}/FS/device/heartbeat",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    with urllib.request.urlopen(
        request,
        timeout=HEARTBEAT_TIMEOUT_SECONDS,
    ) as response:
        body = json.loads(response.read().decode("utf-8"))

    return body