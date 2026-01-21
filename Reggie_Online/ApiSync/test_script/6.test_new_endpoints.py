"""
Test script for the new GET endpoints:
- GET /GCP-FS/metadata/sensors - Get all sensors metadata with optional exp_name filter
- GET /GCP-FS/metadata/experiments - Get all experiment names with details

Install: pip install requests
"""
import requests
import json
import time
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

# Test configuration - using multiple owners and MAC addresses
TEST_OWNERS = [
    {"owner": "Icore_Pi", "mac_address": "2ccf6730ab5f"},
    {"owner": "developerroom", "mac_address": "2ccf6730ab8c"},
    {"owner": "developerroom", "mac_address": "d83adde26159"},
    {"owner": "menachem_moshelion", "mac_address": "2ccf6730ab7a"},
]
TEST_OWNER = TEST_OWNERS[0]["owner"]  # Default for backward compatibility
TEST_MAC_ADDRESS = TEST_OWNERS[0]["mac_address"]  # Default for backward compatibility
TEST_EXP_NAME = "Image_V2"  # Example experiment name to filter by


def test_get_all_sensors(owner, mac_address, exp_name=None):
    """
    Test GET /GCP-FS/metadata/sensors endpoint.
    
    Args:
        owner: Owner identifier
        mac_address: MAC address
        exp_name: Optional experiment name filter
    
    Returns:
        dict: Test result with success status and response data
    """
    try:
        print(f"\n{'='*60}", flush=True)
        if exp_name:
            print(f"Testing GET /GCP-FS/metadata/sensors (with exp_name filter)", flush=True)
            print(f"Owner: {owner} | MAC: {mac_address} | Exp_Name: {exp_name}", flush=True)
        else:
            print(f"Testing GET /GCP-FS/metadata/sensors (all sensors)", flush=True)
            print(f"Owner: {owner} | MAC: {mac_address}", flush=True)
        print(f"{'='*60}", flush=True)
        
        # Build URL with query parameters
        url = f"{BASE_URL}/GCP-FS/metadata/sensors"
        params = {
            "owner": owner,
            "mac_address": mac_address
        }
        if exp_name:
            params["exp_name"] = exp_name
        
        request_start = time.time()
        response = requests.get(url, params=params, timeout=10)
        request_duration = time.time() - request_start
        
        print(f"Status Code: {response.status_code}", flush=True)
        print(f"Request Duration: {request_duration:.3f}s", flush=True)
        
        if response.status_code == 200:
            result = response.json()
            success = result.get("success", False)
            count = result.get("count", 0)
            data = result.get("data", [])
            
            if success:
                print(f"✅ Success: Found {count} sensor(s)", flush=True)
                
                if count > 0:
                    display_count = min(5, count)
                    print(f"\nFirst {display_count} sensor(s) preview:", flush=True)
                    
                    for i in range(display_count):
                        sensor = data[i]
                        print(f"\n  [{i+1}] Sensor:", flush=True)
                        print(f"      - LLA: {sensor.get('LLA', 'N/A')}", flush=True)
                        print(f"      - Owner: {sensor.get('Owner', 'N/A')}", flush=True)
                        print(f"      - Exp_Name: {sensor.get('Exp_Name', 'N/A')}", flush=True)
                        print(f"      - Active_Exp: {sensor.get('Active_Exp', 'N/A')}", flush=True)
                        print(f"      - Label: {sensor.get('Label', 'N/A')}", flush=True)
                    
                    if count > 5:
                        print(f"\n  ... and {count - 5} more sensor(s)", flush=True)
                else:
                    print(f"⚠️  No sensors found for the given criteria", flush=True)
                
                return {
                    "success": True,
                    "count": count,
                    "data": data,
                    "duration": request_duration
                }
            else:
                print(f"❌ Error: {result.get('message', 'Unknown error')}", flush=True)
                return {
                    "success": False,
                    "error": result.get("message", "Unknown error"),
                    "duration": request_duration
                }
        else:
            error_detail = response.json() if response.headers.get('content-type', '').startswith('application/json') else response.text
            print(f"❌ Error: HTTP {response.status_code}", flush=True)
            print(f"   Details: {error_detail}", flush=True)
            return {
                "success": False,
                "error": f"HTTP {response.status_code}: {error_detail}",
                "duration": request_duration
            }
    
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


def test_get_experiments(owner, mac_address):
    """
    Test GET /GCP-FS/metadata/experiments endpoint.
    
    Args:
        owner: Owner identifier
        mac_address: MAC address
    
    Returns:
        dict: Test result with success status and response data
    """
    try:
        print(f"\n{'='*60}", flush=True)
        print(f"Testing GET /GCP-FS/metadata/experiments", flush=True)
        print(f"Owner: {owner} | MAC: {mac_address}", flush=True)
        print(f"{'='*60}", flush=True)
        
        # Build URL with query parameters
        url = f"{BASE_URL}/GCP-FS/metadata/experiments"
        params = {
            "owner": owner,
            "mac_address": mac_address
        }
        
        request_start = time.time()
        response = requests.get(url, params=params, timeout=10)
        request_duration = time.time() - request_start
        
        print(f"Status Code: {response.status_code}", flush=True)
        print(f"Request Duration: {request_duration:.3f}s", flush=True)
        
        if response.status_code == 200:
            result = response.json()
            success = result.get("success", False)
            count = result.get("count", 0)
            experiments = result.get("experiments", [])
            
            if success:
                print(f"✅ Success: Found {count} unique experiment(s)", flush=True)
                
                if count > 0:
                    print(f"\nExperiment Details:", flush=True)
                    for i, exp in enumerate(experiments, 1):
                        exp_name = exp.get("exp_name", "N/A")
                        total = exp.get("total_sensors", 0)
                        active = exp.get("active_count", 0)
                        inactive = exp.get("inactive_count", 0)
                        
                        print(f"\n  [{i}] {exp_name}", flush=True)
                        print(f"      Total Sensors: {total}", flush=True)
                        print(f"      Active: {active} | Inactive: {inactive}", flush=True)
                else:
                    print(f"⚠️  No experiments found for the given criteria", flush=True)
                
                return {
                    "success": True,
                    "count": count,
                    "experiments": experiments,
                    "duration": request_duration
                }
            else:
                print(f"❌ Error: {result.get('message', 'Unknown error')}", flush=True)
                return {
                    "success": False,
                    "error": result.get("message", "Unknown error"),
                    "duration": request_duration
                }
        else:
            error_detail = response.json() if response.headers.get('content-type', '').startswith('application/json') else response.text
            print(f"❌ Error: HTTP {response.status_code}", flush=True)
            print(f"   Details: {error_detail}", flush=True)
            return {
                "success": False,
                "error": f"HTTP {response.status_code}: {error_detail}",
                "duration": request_duration
            }
    
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


def test_new_endpoints():
    """Test the new GET endpoints."""
    print("\n" + "="*60, flush=True)
    print("NEW ENDPOINTS TEST", flush=True)
    print("="*60, flush=True)
    print(f"Testing endpoints:")
    print(f"  1. GET /GCP-FS/metadata/sensors")
    print(f"  2. GET /GCP-FS/metadata/experiments")
    print(f"\nTest Configuration:")
    print(f"  Owner: {TEST_OWNER}")
    print(f"  MAC Address: {TEST_MAC_ADDRESS}")
    print(f"  Exp Name (for filter): {TEST_EXP_NAME}")
    
    results = {
        "sensors_all": None,
        "sensors_filtered": None,
        "experiments": None
    }
    
    # Test 1: Get all sensors
    print(f"\n{'='*60}", flush=True)
    print("TEST 1: Get All Sensors (no filter)", flush=True)
    print(f"{'='*60}", flush=True)
    results["sensors_all"] = test_get_all_sensors(TEST_OWNER, TEST_MAC_ADDRESS)
    
    # Test 2: Get sensors filtered by exp_name
    print(f"\n{'='*60}", flush=True)
    print("TEST 2: Get Sensors Filtered by Exp_Name", flush=True)
    print(f"{'='*60}", flush=True)
    results["sensors_filtered"] = test_get_all_sensors(TEST_OWNER, TEST_MAC_ADDRESS, TEST_EXP_NAME)
    
    # Test 3: Get experiment names
    print(f"\n{'='*60}", flush=True)
    print("TEST 3: Get Experiment Names", flush=True)
    print(f"{'='*60}", flush=True)
    results["experiments"] = test_get_experiments(TEST_OWNER, TEST_MAC_ADDRESS)
    
    # Print summary
    print("\n" + "="*60, flush=True)
    print("SUMMARY", flush=True)
    print("="*60, flush=True)
    
    # Test 1 summary
    if results["sensors_all"]:
        if results["sensors_all"].get("success"):
            count = results["sensors_all"].get("count", 0)
            duration = results["sensors_all"].get("duration", 0)
            print(f"✅ Test 1 (All Sensors): SUCCESS - Found {count} sensor(s) in {duration:.3f}s", flush=True)
        else:
            print(f"❌ Test 1 (All Sensors): FAILED - {results['sensors_all'].get('error', 'Unknown error')}", flush=True)
    else:
        print(f"❌ Test 1 (All Sensors): FAILED - No result", flush=True)
    
    # Test 2 summary
    if results["sensors_filtered"]:
        if results["sensors_filtered"].get("success"):
            count = results["sensors_filtered"].get("count", 0)
            duration = results["sensors_filtered"].get("duration", 0)
            print(f"✅ Test 2 (Filtered Sensors): SUCCESS - Found {count} sensor(s) in {duration:.3f}s", flush=True)
        else:
            print(f"❌ Test 2 (Filtered Sensors): FAILED - {results['sensors_filtered'].get('error', 'Unknown error')}", flush=True)
    else:
        print(f"❌ Test 2 (Filtered Sensors): FAILED - No result", flush=True)
    
    # Test 3 summary
    if results["experiments"]:
        if results["experiments"].get("success"):
            count = results["experiments"].get("count", 0)
            duration = results["experiments"].get("duration", 0)
            print(f"✅ Test 3 (Experiments): SUCCESS - Found {count} experiment(s) in {duration:.3f}s", flush=True)
        else:
            print(f"❌ Test 3 (Experiments): FAILED - {results['experiments'].get('error', 'Unknown error')}", flush=True)
    else:
        print(f"❌ Test 3 (Experiments): FAILED - No result", flush=True)
    
    # Overall result
    all_success = all(
        r and r.get("success", False) 
        for r in [results["sensors_all"], results["sensors_filtered"], results["experiments"]]
    )
    
    print("\n" + "="*60, flush=True)
    if all_success:
        print("✅ ALL TESTS PASSED", flush=True)
    else:
        print("❌ SOME TESTS FAILED", flush=True)
    print("="*60, flush=True)
    print("Test completed!", flush=True)


if __name__ == "__main__":
    test_new_endpoints()

