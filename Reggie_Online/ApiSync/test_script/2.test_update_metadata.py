"""
Test script for updating sensor metadata via the /FS/sensor/update-metadata endpoint.
Install: pip install requests
"""
import requests
import json
import time
import random
import sys
import io

# Fix Windows console encoding for emoji characters
if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

# Enable unbuffered output for real-time printing
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(line_buffering=True)
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(line_buffering=True)

# Base URL for the API
BASE_URL = "http://localhost:8000"

# List of sensors to update (multiple owners with multiple MAC addresses)
# IMPORTANT: These must match the owner/MAC/LLA combinations from 1.test_websocket.py
# These sensors should exist in Firestore (either from previous pings or manual creation)
sensors_to_update = [
    # Icore_Pi owner - matches 1.test_websocket.py payload[0]
    {
        "owner": "Icore_Pi",
        "mac_address": "2ccf6730ab5f",
        "lla": "fd002124b00ccf7399b",
        "updates": {
            "exp_name": "Updated_Experiment_1",
            "exp_location": "Greenhouse_A",
            "label": "Sensor_001",
            "location": "Row_1_Position_5",
            "coordinates": {"x": 10.5, "y": 20.3, "z": 5.0}
        }
    },
    # Icore_Pi owner - matches 1.test_websocket.py payload[1]
    {
        "owner": "Icore_Pi",
        "mac_address": "2ccf6730ab5f",
        "lla": "fd002124b00ccf7399a",
        "updates": {
            "exp_name": "Updated_Experiment_1",
            "exp_location": "Greenhouse_B",
            "label": "Sensor_002",
            "location": "Row_2_Position_3",
            "coordinates": {"x": 15.2, "y": 25.7, "z": 6.5}
        }
    },
    # developerroom owner - first MAC - matches 1.test_websocket.py payload[2]
    {
        "owner": "developerroom",
        "mac_address": "2ccf6730ab8c",
        "lla": "fd002124b0021f9fecc",
        "updates": {
            "exp_name": "Updated_Experiment_1",
            "exp_location": "Greenhouse_A",
            "label": "Sensor_003_Updated",
            "location": "Row_3_Position_1",
            "coordinates": {"x": 8.0, "y": 18.0, "z": 4.5}
        }
    },
    # developerroom owner - second MAC - matches 1.test_websocket.py payload[3]
    {
        "owner": "developerroom",
        "mac_address": "d83adde26159",
        "lla": "fd002124b00d6b2703",
        "updates": {
            "exp_name": "Updated_Experiment_3",
            "exp_location": "Lab_Testing",
            "label": "Test_Sensor",
            "location": "Test_Bench_1",
            "coordinates": {"x": 0.0, "y": 0.0, "z": 0.0}
        }
    },
    # menachem_moshelion owner - first MAC - matches 1.test_websocket.py payload[4]
    {
        "owner": "menachem_moshelion",
        "mac_address": "2ccf6730ab7a",
        "lla": "fd002124b001665e500",
        "updates": {
            "exp_name": "Updated_Experiment_4",
            "exp_location": "Greenhouse_C",
            "label": "Sensor_005",
            "location": "Row_4_Position_2",
            "coordinates": {"x": 12.0, "y": 22.0, "z": 6.0}
        }
    },
    # menachem_moshelion owner - second MAC - matches 1.test_websocket.py payload[5]
    {
        "owner": "menachem_moshelion",
        "mac_address": "d83adde2608f",
        "lla": "fd002124b00aa9e4512",
        "updates": {
            "exp_name": "Updated_Experiment_5",
            "exp_location": "Greenhouse_D",
            "label": "Sensor_006",
            "location": "Row_5_Position_4",
            "coordinates": {"x": 14.0, "y": 24.0, "z": 7.0}
        }
    },
    # menachem_moshelion owner - third MAC - matches 1.test_websocket.py payload[6]
    {
        "owner": "menachem_moshelion",
        "mac_address": "d83adde261b0",
        "lla": "fd002124b00aa9e4513",
        "updates": {
            "exp_name": "Updated_Experiment_6",
            "exp_location": "Greenhouse_E",
            "label": "Sensor_007",
            "location": "Row_6_Position_6",
            "coordinates": {"x": 16.0, "y": 26.0, "z": 8.0}
        }
    }
]


def update_sensor_metadata(owner, mac_address, lla, updates):
    """
    Update sensor metadata via the API endpoint.
    
    Args:
        owner: Owner identifier
        mac_address: MAC address
        lla: LLA value (document ID)
        updates: Dictionary of fields to update
    
    Returns:
        dict: Response from the API
    """
    url = f"{BASE_URL}/FS/sensor/update-metadata"
    
    payload = {
        "owner": owner,
        "mac_address": mac_address,
        "lla": lla,
        "updates": updates
    }
    
    try:
        print(f"\n{'='*60}", flush=True)
        print(f"Updating sensor: {lla}", flush=True)
        print(f"Owner: {owner} | MAC: {mac_address}", flush=True)
        print(f"Updates: {list(updates.keys())}", flush=True)
        print(f"{'='*60}", flush=True)
        
        response = requests.post(url, json=payload, timeout=10)
        
        print(f"Status Code: {response.status_code}", flush=True)
        
        if response.status_code == 200:
            result = response.json()
            print(f"✅ Success: {result.get('message', 'Update successful')}", flush=True)
            if 'updated_fields' in result:
                print(f"   Updated fields: {', '.join(result['updated_fields'])}", flush=True)
            return result
        else:
            error_detail = response.json() if response.headers.get('content-type', '').startswith('application/json') else response.text
            print(f"❌ Error: {error_detail}", flush=True)
            return {"success": False, "error": error_detail}
    
    except requests.exceptions.ConnectionError:
        print(f"❌ Connection Error: Could not connect to {BASE_URL}", flush=True)
        print("   Make sure the server is running: python -m uvicorn src.main:app --reload", flush=True)
        return {"success": False, "error": "Connection failed"}
    except requests.exceptions.Timeout:
        print(f"❌ Timeout: Request took too long", flush=True)
        return {"success": False, "error": "Request timeout"}
    except Exception as e:
        print(f"❌ Unexpected Error: {str(e)}", flush=True)
        return {"success": False, "error": str(e)}


def test_update_metadata():
    """Test updating metadata for multiple sensors."""
    print("\n" + "="*60)
    print("SENSOR METADATA UPDATE TEST")
    print("="*60)
    print(f"Testing endpoint: {BASE_URL}/FS/sensor/update-metadata")
    print(f"Total sensors to update: {len(sensors_to_update)}")
    
    results = {
        "successful": [],
        "failed": []
    }
    
    for i, sensor in enumerate(sensors_to_update, 1):
        print(f"\n[{i}/{len(sensors_to_update)}] Processing sensor...", flush=True)
        
        result = update_sensor_metadata(
            owner=sensor["owner"],
            mac_address=sensor["mac_address"],
            lla=sensor["lla"],
            updates=sensor["updates"]
        )
        
        if result.get("success", False):
            results["successful"].append({
                "lla": sensor["lla"],
                "updated_fields": result.get("updated_fields", [])
            })
        else:
            results["failed"].append({
                "lla": sensor["lla"],
                "error": result.get("error", "Unknown error")
            })
        
        # Small delay between requests
        if i < len(sensors_to_update):
            delay = random.uniform(0.5, 1.0)
            time.sleep(delay)
    
    # Print summary
    print("\n" + "="*60, flush=True)
    print("SUMMARY", flush=True)
    print("="*60, flush=True)
    print(f"✅ Successful updates: {len(results['successful'])}", flush=True)
    for success in results["successful"]:
        print(f"   - {success['lla']}: {', '.join(success['updated_fields'])}", flush=True)
    
    print(f"\n❌ Failed updates: {len(results['failed'])}", flush=True)
    for failure in results["failed"]:
        print(f"   - {failure['lla']}: {failure['error']}", flush=True)
    
    print("\n" + "="*60, flush=True)
    print("Test completed!", flush=True)
    print("="*60, flush=True)


if __name__ == "__main__":
    test_update_metadata()

