import json
import os
from urllib import request, parse, error

from DB.duckdb_client import apply_sensor_metadata_payload


ENV_PATH = "/home/pi/F4D/.env"


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


def get_base_url() -> str:
    env = read_env()
    api_sync_url = env.get("API_SYNC_URL")

    if not api_sync_url:
        raise ValueError("Missing API_SYNC_URL in .env")

    return api_sync_url.rstrip("/")


def build_sensor_metadata_url(
    owner: str,
    mac_address: str,
    exp_name: str | None = None
) -> str:
    params = {
        "owner": owner,
        "mac_address": mac_address,
    }

    if exp_name:
        params["exp_name"] = exp_name

    query_string = parse.urlencode(params)
    return f"{get_base_url()}/GCP-FS/metadata/sensors?{query_string}"


def get_sensor_metadata(
    owner: str | None = None,
    mac_address: str | None = None,
    exp_name: str | None = None
) -> dict:
    env = read_env()

    owner = owner or env.get("HOSTNAME")
    mac_address = mac_address or env.get("MAC_ADDRESS")

    if not owner:
        raise ValueError("Missing owner argument and HOSTNAME in .env")

    if not mac_address:
        raise ValueError("Missing mac_address argument and MAC_ADDRESS in .env")

    url = build_sensor_metadata_url(
        owner=owner,
        mac_address=mac_address,
        exp_name=exp_name
    )

    print(f"Querying Firestore metadata endpoint: {url}")

    req = request.Request(url=url, method="GET")

    try:
        with request.urlopen(req, timeout=15) as response:
            body = response.read().decode("utf-8")
            status_code = response.getcode()

            try:
                parsed_body = json.loads(body)
            except json.JSONDecodeError:
                parsed_body = {"raw_response": body}

            return {
                "ok": True,
                "status_code": status_code,
                "url": url,
                "data": parsed_body
            }

    except error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")

        try:
            parsed_body = json.loads(body)
        except json.JSONDecodeError:
            parsed_body = {"raw_response": body}

        return {
            "ok": False,
            "status_code": e.code,
            "url": url,
            "error": parsed_body
        }

    except error.URLError as e:
        return {
            "ok": False,
            "status_code": None,
            "url": url,
            "error": str(e)
        }


def post_json(url: str, payload: dict, timeout: int = 20) -> dict:
    data = json.dumps(payload).encode("utf-8")

    req = request.Request(
        url=url,
        data=data,
        method="POST",
        headers={"Content-Type": "application/json"}
    )

    try:
        with request.urlopen(req, timeout=timeout) as response:
            body = response.read().decode("utf-8")
            status_code = response.getcode()

            try:
                parsed_body = json.loads(body)
            except json.JSONDecodeError:
                parsed_body = {"raw_response": body}

            return {
                "ok": True,
                "status_code": status_code,
                "url": url,
                "data": parsed_body
            }

    except error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")

        try:
            parsed_body = json.loads(body)
        except json.JSONDecodeError:
            parsed_body = {"raw_response": body}

        return {
            "ok": False,
            "status_code": e.code,
            "url": url,
            "error": parsed_body
        }

    except error.URLError as e:
        return {
            "ok": False,
            "status_code": None,
            "url": url,
            "error": str(e)
        }


def push_exp_id_batch_to_firestore(exp_name: str, exp_id: int, rows: list[dict]) -> dict:
    """
    Push DuckDB-assigned Exp_ID back to Firestore using:
    POST /FS/sensor/update-metadata

    Only pushes rows where Firestore Exp_ID is missing or different.
    """
    if not rows:
        return {
            "status": "skipped",
            "reason": "no_rows"
        }

    sensors_payload = []

    for row in rows:
        lla = row.get("LLA")
        owner = row.get("Owner")
        mac_address = row.get("Mac_Address")

        if not lla or not owner or not mac_address:
            continue

        firestore_exp_id = row.get("Exp_ID")

        try:
            firestore_exp_id = int(firestore_exp_id) if firestore_exp_id not in (None, "", "null") else None
        except (TypeError, ValueError):
            firestore_exp_id = None

        if firestore_exp_id == exp_id:
            continue

        sensors_payload.append({
            "lla": lla,
            "hostname": owner,
            "mac_address": mac_address,
            "updates": {
                "exp_id": exp_id,
                "exp_name": exp_name
            }
        })

    if not sensors_payload:
        return {
            "status": "skipped",
            "reason": "all_rows_already_synced",
            "exp_name": exp_name,
            "exp_id": exp_id,
            "rows_checked": len(rows),
            "rows_to_update": 0
        }

    url = f"{get_base_url()}/FS/sensor/update-metadata"
    payload = {"sensors": sensors_payload}

    print(
        f"Pushing Exp_ID back to Firestore | exp_name={exp_name} | "
        f"exp_id={exp_id} | sensors={len(sensors_payload)}"
    )

    response = post_json(url, payload)

    return {
        "status": "ok" if response.get("ok") else "error",
        "exp_name": exp_name,
        "exp_id": exp_id,
        "rows_checked": len(rows),
        "rows_to_update": len(sensors_payload),
        "firestore_response": response
    }


def sync_sensor_metadata_to_duckdb(
    owner: str | None = None,
    mac_address: str | None = None,
    exp_name: str | None = None
) -> dict:
    """
    1. Query Firestore metadata endpoint
    2. Apply payload into DuckDB sensors_metadata table
    3. If DuckDB assigns a new Exp_ID / corrected Exp_ID, push it back to Firestore
    """
    response_payload = get_sensor_metadata(
        owner=owner,
        mac_address=mac_address,
        exp_name=exp_name
    )
    print(f"Firestore metadata response: {json.dumps(response_payload, indent=2, default=str)}")

    if not response_payload.get("ok"):
        return {
            "request_ok": response_payload.get("ok"),
            "status_code": response_payload.get("status_code"),
            "url": response_payload.get("url"),
            "error": response_payload.get("error"),
            "db_result": None
        }

    result = apply_sensor_metadata_payload(
        response_payload,
        exp_id_sync_callback=push_exp_id_batch_to_firestore
    )

    return {
        "request_ok": response_payload.get("ok"),
        "status_code": response_payload.get("status_code"),
        "url": response_payload.get("url"),
        "db_result": result
    }


if __name__ == "__main__":
    sync_result = sync_sensor_metadata_to_duckdb()
    print(f"Sync result: {json.dumps(sync_result, indent=2, default=str)}")