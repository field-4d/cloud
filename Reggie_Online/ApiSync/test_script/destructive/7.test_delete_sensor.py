"""
Test script for deleting a sensor document via /FS/sensor/delete.
Install: pip install requests
"""
import requests
import time
import uuid

# Base URL for the API - deployed backend
BASE_URL = "https://apisync-1000435921680.us-central1.run.app"

TEST_OWNER = "f4d_test_delete"
TEST_MAC = "aaaaaaaaaaaa"


def _post(path: str, payload: dict) -> requests.Response:
    return requests.post(f"{BASE_URL}{path}", json=payload, timeout=15)


def register_sensor(hostname: str, mac_address: str, lla: str) -> bool:
    payload = {
        "hostname": hostname,
        "mac_address": mac_address,
        "lla": lla,
    }
    response = _post("/FS/sensor/register", payload)
    if response.status_code == 200:
        return True
    # Treat "already exists" as a usable precondition for delete tests
    if response.status_code == 400 and "already exists" in response.text:
        return True
    print(f"Register failed [{response.status_code}]: {response.text}")
    return False


def delete_sensor(hostname: str, mac_address: str, lla: str) -> tuple[int, dict]:
    payload = {
        "hostname": hostname,
        "mac_address": mac_address,
        "lla": lla,
    }
    response = _post("/FS/sensor/delete", payload)
    try:
        body = response.json()
    except Exception:
        body = {"raw": response.text}
    return response.status_code, body


def test_delete_sensor_endpoint():
    print("\n" + "=" * 60)
    print("DELETE SENSOR ENDPOINT TEST")
    print("=" * 60)

    # Unique test sensor to avoid clashing with production-like data
    lla = f"delete-test-{uuid.uuid4().hex[:12]}"
    print(f"Using test LLA: {lla}")

    # Setup: ensure sensor exists
    if not register_sensor(TEST_OWNER, TEST_MAC, lla):
        print("❌ Setup failed: could not create test sensor.")
        return

    results = []

    # Case 1: Owner mismatch should fail with 400
    status, body = delete_sensor("wrong_owner", TEST_MAC, lla)
    ok = status == 400
    results.append(("owner mismatch", ok, status, body))

    # Case 2: Valid delete should succeed with 200
    status, body = delete_sensor(TEST_OWNER, TEST_MAC, lla)
    ok = status == 200
    results.append(("successful delete", ok, status, body))

    # Case 3: Deleting again should return 404 not found
    status, body = delete_sensor(TEST_OWNER, TEST_MAC, lla)
    ok = status == 404
    results.append(("not found after delete", ok, status, body))

    print("\nResults:")
    all_passed = True
    for name, ok, status, body in results:
        icon = "✅" if ok else "❌"
        print(f"{icon} {name}: HTTP {status} | body={body}")
        all_passed = all_passed and ok

    print("\n" + "=" * 60)
    print("✅ ALL TESTS PASSED" if all_passed else "❌ SOME TESTS FAILED")
    print("=" * 60)


if __name__ == "__main__":
    start = time.time()
    test_delete_sensor_endpoint()
    print(f"Completed in {time.time() - start:.2f}s")
