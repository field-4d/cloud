"""
Test script for batch updating last_package via WebSocket Last_Package endpoint.
Similar structure to 2.test_update_metadata.py but for batch last_package updates.
Install: pip install websockets
"""
import asyncio
import json
import websockets
import random
import time
import sys
import io
from typing import List

# Fix Windows console encoding for emoji characters
if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

# Enable unbuffered output for real-time printing
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(line_buffering=True)
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(line_buffering=True)

# WebSocket URI
WS_URI = "ws://localhost:8000/ws/ping"
TIMEOUT = 10

# List of sensors to update with last_package data
# These sensors should exist in Firestore (either from previous pings or manual creation)
# Owner and MAC address mapping based on test_script/1.test_websocket.py
sensors_to_update = [
    # Icore_Pi owner
    {
        "lla": "fd002124b00ccf7399b",
        "owner": "Icore_Pi",
        "mac_address": "2ccf6730ab5f",
        "package_data": {
            "temperature": 23.5,
            "humidity": 65.2,
            "solar_intensity": 850.0,
            "battery": 3750  # mV (valid: >2700)
        }
    },
    {
        "lla": "fd002124b00ccf7399a",
        "owner": "Icore_Pi",
        "mac_address": "2ccf6730ab5f",
        "package_data": {
            "temperature": 24.1,
            "humidity": 68.5,
            "solar_intensity": 920.0,
            "battery": 3900  # mV (valid: >2700)
        }
    },
    # developerroom owner - first MAC
    {
        "lla": "fd002124b0021f9fecc",
        "owner": "developerroom",
        "mac_address": "2ccf6730ab8c",
        "package_data": {
            "temperature": 22.8,
            "humidity": 62.3,
            "solar_intensity": 780.0,
            "battery": 3400,  # mV (valid: >2700)
            "pressure": 1013.25  # Additional field
        }
    },
    # developerroom owner - second MAC
    {
        "lla": "fd002124b00d6b2703",
        "owner": "developerroom",
        "mac_address": "d83adde26159",
        "package_data": {
            "temperature": 25.3,
            "humidity": 70.1,
            "solar_intensity": 950.0,
            "battery": 3800  # mV (valid: >2700)
        }
    },
    # menachem_moshelion owner - first MAC
    {
        "lla": "fd002124b001665e500",
        "owner": "menachem_moshelion",
        "mac_address": "2ccf6730ab7a",
        "package_data": {
            "temperature": 21.9,
            "humidity": 58.7,
            "solar_intensity": 720.0,
            "battery": 3600,  # mV (valid: >2700)
            "soil_moisture": 45.2,
            "ph_level": 6.8
        }
    },
    # menachem_moshelion owner - second MAC
    {
        "lla": "fd002124b00aa9e4512",
        "owner": "menachem_moshelion",
        "mac_address": "d83adde2608f",
        "package_data": {
            "temperature": 26.2,
            "humidity": 72.4,
            "solar_intensity": 980.0,
            "battery": 4000,  # mV (valid: >2700)
            "wind_speed": 3.5
        }
    },
    # menachem_moshelion owner - third MAC
    {
        "lla": "fd002124b00aa9e4513",
        "owner": "menachem_moshelion",
        "mac_address": "d83adde261b0",
        "package_data": {
            "temperature": 20.5,
            "humidity": 55.8,
            "solar_intensity": 650.0,
            "battery": 3300  # mV (valid: >2700)
        }
    },
    # yakir owner
    {
        "lla": "1234567890",
        "owner": "yakir",
        "mac_address": "d83adde260d1",
        "package_data": {
            "temperature": 19.8,
            "humidity": 52.1,
            "solar_intensity": 600.0,
            "battery": 3200  # mV (valid: >2700)
        }
    },
    # f4d_test owner
    {
        "lla": "1234567892",
        "owner": "f4d_test",
        "mac_address": "2ccf6730ab71",
        "package_data": {
            "temperature": 18.5,
            "humidity": 50.0,
            "solar_intensity": 580.0,
            "battery": 3100  # mV (valid: >2700)
        }
    },
    # test_lla_* sensors - using Icore_Pi (assumed, since they work with that combination)
    {
        "lla": "test_lla_001",
        "owner": "Icore_Pi",
        "mac_address": "2ccf6730ab5f",
        "package_data": {
            "temperature": 22.0,
            "humidity": 60.0,
            "solar_intensity": 800.0,
            "battery": 3700,
            "pressure": 1015.0
        }
    },
    {
        "lla": "test_lla_002",
        "owner": "Icore_Pi",
        "mac_address": "2ccf6730ab5f",
        "package_data": {
            "temperature": 21.5,
            "humidity": 58.0,
            "solar_intensity": 750.0,
            "battery": 3650,
            "wind_speed": 2.5
        }
    },
    {
        "lla": "test_lla_003",
        "owner": "Icore_Pi",
        "mac_address": "2ccf6730ab5f",
        "package_data": {
            "temperature": 24.0,
            "humidity": 70.0,
            "solar_intensity": 900.0,
            "battery": 3850,
            "soil_moisture": 50.0
        }
    },
    {
        "lla": "test_lla_004",
        "owner": "Icore_Pi",
        "mac_address": "2ccf6730ab5f",
        "package_data": {
            "temperature": 20.0,
            "humidity": 55.0,
            "solar_intensity": 700.0,
            "battery": 3550,
            "ph_level": 7.0
        }
    },
    {
        "lla": "test_lla_005",
        "owner": "Icore_Pi",
        "mac_address": "2ccf6730ab5f",
        "package_data": {
            "temperature": 23.0,
            "humidity": 65.0,
            "solar_intensity": 850.0,
            "battery": 3750
        }
    },
    {
        "lla": "test_lla_006",
        "owner": "Icore_Pi",
        "mac_address": "2ccf6730ab5f",
        "package_data": {
            "temperature": 22.5,
            "humidity": 62.0,
            "solar_intensity": 820.0,
            "battery": 3700,
            "pressure": 1012.5
        }
    },
    {
        "lla": "test_lla_007",
        "owner": "Icore_Pi",
        "mac_address": "2ccf6730ab5f",
        "package_data": {
            "temperature": 21.0,
            "humidity": 57.0,
            "solar_intensity": 730.0,
            "battery": 3600,
            "wind_speed": 3.0
        }
    },
    {
        "lla": "test_lla_008",
        "owner": "Icore_Pi",
        "mac_address": "2ccf6730ab5f",
        "package_data": {
            "temperature": 25.0,
            "humidity": 72.0,
            "solar_intensity": 950.0,
            "battery": 3900,
            "soil_moisture": 48.0
        }
    },
    {
        "lla": "test_lla_009",
        "owner": "Icore_Pi",
        "mac_address": "2ccf6730ab5f",
        "package_data": {
            "temperature": 19.5,
            "humidity": 51.0,
            "solar_intensity": 590.0,
            "battery": 3150,
            "ph_level": 6.5
        }
    },
    {
        "lla": "test_lla_010",
        "owner": "Icore_Pi",
        "mac_address": "2ccf6730ab5f",
        "package_data": {
            "temperature": 23.5,
            "humidity": 66.0,
            "solar_intensity": 860.0,
            "battery": 3760
        }
    },
    {
        "lla": "test_lla_011",
        "owner": "Icore_Pi",
        "mac_address": "2ccf6730ab5f",
        "package_data": {
            "temperature": 22.2,
            "humidity": 61.0,
            "solar_intensity": 810.0,
            "battery": 3710,
            "pressure": 1014.0
        }
    },
    {
        "lla": "test_lla_012",
        "owner": "Icore_Pi",
        "mac_address": "2ccf6730ab5f",
        "package_data": {
            "temperature": 21.8,
            "humidity": 59.0,
            "solar_intensity": 780.0,
            "battery": 3620,
            "wind_speed": 2.8
        }
    },
    {
        "lla": "test_lla_013",
        "owner": "Icore_Pi",
        "mac_address": "2ccf6730ab5f",
        "package_data": {
            "temperature": 24.5,
            "humidity": 71.0,
            "solar_intensity": 920.0,
            "battery": 3880,
            "soil_moisture": 49.0
        }
    },
    {
        "lla": "test_lla_014",
        "owner": "Icore_Pi",
        "mac_address": "2ccf6730ab5f",
        "package_data": {
            "temperature": 20.5,
            "humidity": 56.0,
            "solar_intensity": 710.0,
            "battery": 3560,
            "ph_level": 6.8
        }
    },
    {
        "lla": "test_lla_015",
        "owner": "Icore_Pi",
        "mac_address": "2ccf6730ab5f",
        "package_data": {
            "temperature": 23.2,
            "humidity": 64.0,
            "solar_intensity": 840.0,
            "battery": 3740
        }
    },
    {
        "lla": "test_lla_016",
        "owner": "Icore_Pi",
        "mac_address": "2ccf6730ab5f",
        "package_data": {
            "temperature": 22.8,
            "humidity": 63.0,
            "solar_intensity": 830.0,
            "battery": 3720,
            "pressure": 1013.0
        }
    },
    {
        "lla": "test_lla_017",
        "owner": "Icore_Pi",
        "mac_address": "2ccf6730ab5f",
        "package_data": {
            "temperature": 21.2,
            "humidity": 58.0,
            "solar_intensity": 740.0,
            "battery": 3610,
            "wind_speed": 2.7
        }
    },
    {
        "lla": "test_lla_018",
        "owner": "Icore_Pi",
        "mac_address": "2ccf6730ab5f",
        "package_data": {
            "temperature": 24.8,
            "humidity": 73.0,
            "solar_intensity": 930.0,
            "battery": 3910,
            "soil_moisture": 47.0
        }
    },
    {
        "lla": "test_lla_019",
        "owner": "Icore_Pi",
        "mac_address": "2ccf6730ab5f",
        "package_data": {
            "temperature": 19.2,
            "humidity": 50.5,
            "solar_intensity": 585.0,
            "battery": 3120,
            "ph_level": 6.3
        }
    },
    {
        "lla": "test_lla_020",
        "owner": "Icore_Pi",
        "mac_address": "2ccf6730ab5f",
        "package_data": {
            "temperature": 23.8,
            "humidity": 67.0,
            "solar_intensity": 870.0,
            "battery": 3770
        }
    }
]


async def send_batch_last_package(websocket, sensors_batch, batch_index, total_batches):
    """
    Send a batch of last_package updates via WebSocket.
    
    Args:
        websocket: WebSocket connection
        sensors_batch: List of sensor dicts with 'lla', 'owner', 'mac_address', 'package_data'
        batch_index: Current batch index (1-based)
        total_batches: Total number of batches
    
    Returns:
        dict: Result with success status and response data
    """
    try:
        # Extract owner/mac from first sensor (all in batch must have the same owner/mac)
        owner = sensors_batch[0]["owner"]
        mac_address = sensors_batch[0]["mac_address"]
        
        print(f"\n{'='*60}", flush=True)
        print(f"[Batch {batch_index}/{total_batches}] Sending batch update", flush=True)
        print(f"Sensors in batch: {len(sensors_batch)}", flush=True)
        print(f"Owner: {owner}, MAC: {mac_address}", flush=True)
        print(f"LLAs: {', '.join([s['lla'] for s in sensors_batch[:3]])}{'...' if len(sensors_batch) > 3 else ''}", flush=True)
        print(f"{'='*60}", flush=True)
        
        # Build payload in dictionary format (keyed by LLA)
        sensors_dict = {}
        for sensor in sensors_batch:
            sensors_dict[sensor["lla"]] = sensor["package_data"]
        
        payload = {
            "type": "Last_Package",
            "owner": owner,
            "mac_address": mac_address,
            "sensors": sensors_dict
        }
        
        # Generate random delay between 0.5 and 1.5 seconds
        delay = random.uniform(0.5, 1.5)
        delay = 0.01
        # await asyncio.sleep(delay)
        
        send_start = time.time()
        await websocket.send(json.dumps(payload))
        send_duration = time.time() - send_start
        
        print(f"Sent in {send_duration:.3f}s | Delay: {delay:.3f}s", flush=True)
        
        # Wait for response
        receive_start = time.time()
        response_text = await websocket.recv()
        receive_duration = time.time() - receive_start
        
        try:
            response = json.loads(response_text)
            response_type = response.get("type", "Unknown")
            updated_llas = response.get("updated_llas", [])
            registered_llas = response.get("registered_llas") or []
            errors = response.get("errors")
            
            print(f"Received in {receive_duration:.3f}s", flush=True)
            print(f"Response Type: {response_type}", flush=True)
            print(f"Updated Sensors: {len(updated_llas)}/{len(sensors_batch)}", flush=True)
            if registered_llas:
                print(f"Registered Sensors: {len(registered_llas)}", flush=True)
            
            if updated_llas or registered_llas:
                all_llas = updated_llas + registered_llas
                print(f"✅ Updated/Registered LLAs: {', '.join(all_llas[:5])}{'...' if len(all_llas) > 5 else ''}", flush=True)
                if updated_llas:
                    print(f"   📝 Updated: {', '.join(updated_llas[:3])}{'...' if len(updated_llas) > 3 else ''}", flush=True)
                if registered_llas:
                    print(f"   ✨ Registered: {', '.join(registered_llas[:3])}{'...' if len(registered_llas) > 3 else ''}", flush=True)
            
            if errors:
                print(f"⚠️  Errors: {len(errors)}", flush=True)
                for error in errors[:3]:  # Show first 3 errors
                    print(f"   - {error}", flush=True)
                if len(errors) > 3:
                    print(f"   ... and {len(errors) - 3} more", flush=True)
            
            # Show package data fields for processed sensors (updated + registered)
            sensors_data_response = response.get("sensors", {})
            if sensors_data_response:
                print(f"\nPackage Data Fields:", flush=True)
                for lla, package_data in list(sensors_data_response.items())[:2]:  # Show first 2
                    fields = list(package_data.keys())
                    print(f"   {lla}: {', '.join(fields)}", flush=True)
                if len(sensors_data_response) > 2:
                    print(f"   ... and {len(sensors_data_response) - 2} more sensors", flush=True)
            
            total_processed = len(updated_llas) + len(registered_llas)
            success = total_processed > 0 and (not errors or len(errors) == 0)
            
            if success and total_processed == len(sensors_batch):
                print(f"✅ Success: All {len(sensors_batch)} sensors processed successfully", flush=True)
            elif total_processed > 0:
                print(f"⚠️  Partial Success: {total_processed}/{len(sensors_batch)} sensors processed", flush=True)
            else:
                print(f"❌ Failed: No sensors processed", flush=True)
            
            return {
                "success": success,
                "updated_llas": updated_llas,
                "registered_llas": registered_llas,
                "errors": errors,
                "sensors_data": sensors_data_response,
                "response": response,
                "send_duration": send_duration,
                "receive_duration": receive_duration,
                "total_sensors": len(sensors_batch)
            }
        except json.JSONDecodeError:
            print(f"⚠️  Warning: Received non-JSON response", flush=True)
            print(f"Response: {response_text[:100]}", flush=True)
            return {
                "success": False,
                "is_valid": False,
                "message": "Non-JSON response",
                "response": response_text,
                "send_duration": send_duration,
                "receive_duration": receive_duration,
                "total_sensors": len(sensors_batch)
            }
    
    except websockets.exceptions.ConnectionClosed:
        print(f"❌ Error: WebSocket connection closed", flush=True)
        return {
            "success": False,
            "error": "Connection closed",
            "sensors_batch": sensors_batch
        }
    except Exception as e:
        print(f"❌ Error: {str(e)}", flush=True)
        return {
            "success": False,
            "error": str(e),
            "sensors_batch": sensors_batch
        }


async def ping_sensors(websocket, sensors: List[dict]):
    """
    Send ping messages for sensors to ensure they exist in Firestore.
    
    Args:
        websocket: WebSocket connection
        sensors: List of sensor dicts with 'lla', 'owner', 'mac_address'
    
    Returns:
        dict: Results with success count and updated LLAs
    """
    print(f"\n{'='*60}", flush=True)
    print(f"PINGING SENSORS ({len(sensors)} sensors)", flush=True)
    print(f"{'='*60}", flush=True)
    
    success_count = 0
    updated_llas = []
    errors = []
    
    for i, sensor in enumerate(sensors, 1):
        try:
            lla = sensor["lla"]
            owner = sensor["owner"]
            mac_address = sensor["mac_address"]
            
            payload = {
                "owner": owner,
                "mac_address": mac_address,
                "type": "Ping",
                "LLA": lla
            }
            
            await websocket.send(json.dumps(payload))
            response = await asyncio.wait_for(websocket.recv(), timeout=TIMEOUT)
            data = json.loads(response)
            
            if data.get("received") and "payload" in data:
                validation = data.get("payload", {}).get("validation", {})
                if validation.get("is_valid") or "Sensor added" in validation.get("message", ""):
                    success_count += 1
                    updated_llas.append(lla)
                    print(f"  [{i}/{len(sensors)}] ✅ {lla} ({owner}/{mac_address})", flush=True)
                else:
                    errors.append(f"{lla}: {validation.get('message', 'Validation failed')}")
                    print(f"  [{i}/{len(sensors)}] ⚠️  {lla}: {validation.get('message', 'Validation failed')}", flush=True)
            else:
                errors.append(f"{lla}: Invalid response")
                print(f"  [{i}/{len(sensors)}] ❌ {lla}: Invalid response", flush=True)
        except Exception as e:
            lla = sensor.get("lla", "unknown")
            errors.append(f"{lla}: {str(e)}")
            print(f"  [{i}/{len(sensors)}] ❌ {lla}: {str(e)}", flush=True)
        
        # Small delay between pings
        if i < len(sensors):
            await asyncio.sleep(0.1)
    
    print(f"\n✅ Successfully pinged: {success_count}/{len(sensors)}", flush=True)
    if errors:
        print(f"⚠️  Errors: {len(errors)}", flush=True)
    
    return {
        "success_count": success_count,
        "updated_llas": updated_llas,
        "errors": errors
    }


async def test_batch_last_package(batch_size: int = 3, skip_ping: bool = False):
    """
    Test batch updating last_package for multiple sensors.
    
    Args:
        batch_size: Number of sensors to include in each batch
        skip_ping: If True, skip the ping step (sensors already pinged)
    
    Returns:
        dict: Test results with performance metrics
    """
    print("\n" + "="*60)
    print(f"BATCH LAST_PACKAGE UPDATE TEST (Batch Size: {batch_size})")
    print("="*60)
    print(f"Testing endpoint: {WS_URI}")
    print(f"Total sensors to update: {len(sensors_to_update)}")
    print(f"Batch size: {batch_size}")
    print(f"Total batches: {(len(sensors_to_update) + batch_size - 1) // batch_size}")
    
    results = {
        "successful": [],
        "partially_successful": [],
        "failed": []
    }
    
    total_sensors_updated = 0
    total_sensors_registered = 0
    total_sensors_failed = 0
    test_start_time = time.time()
    batch_durations = []
    
    try:
        print(f"\nConnecting to {WS_URI}...", flush=True)
        async with websockets.connect(WS_URI) as websocket:
            print("✅ Connected successfully\n", flush=True)
            
            # Step 1: Ping all sensors (only if not skipped)
            if not skip_ping:
                print("\n" + "="*60, flush=True)
                print("STEP 1: PINGING SENSORS TO ENSURE THEY EXIST", flush=True)
                print("="*60, flush=True)
                
                # Pass all sensors (with owner/mac) to ping function
                ping_result = await ping_sensors(websocket, sensors_to_update)
                
                if ping_result["success_count"] == 0:
                    print("\n❌ ERROR: No sensors were successfully pinged. Cannot proceed with last_package updates.", flush=True)
                    return None
                
                print(f"\n✅ Ready to update last_package for {ping_result['success_count']} sensors", flush=True)
                
                # Small delay before starting last_package updates
                await asyncio.sleep(1.0)
            else:
                print("\n⏭️  Skipping ping step (sensors already registered)", flush=True)
            
            # Step 2: Split sensors into batches and update last_package
            print("\n" + "="*60, flush=True)
            print("STEP 2: UPDATING LAST_PACKAGE IN BATCHES", flush=True)
            print("="*60, flush=True)
            
            # Group sensors by owner/MAC combination
            sensors_by_owner_mac = {}
            for sensor in sensors_to_update:
                key = (sensor["owner"], sensor["mac_address"])
                if key not in sensors_by_owner_mac:
                    sensors_by_owner_mac[key] = []
                sensors_by_owner_mac[key].append(sensor)
            
            # Create batches within each owner/MAC group
            all_batches = []
            for (owner, mac), sensors_group in sensors_by_owner_mac.items():
                for i in range(0, len(sensors_group), batch_size):
                    batch = sensors_group[i:i + batch_size]
                    all_batches.append(batch)
            
            total_batches = len(all_batches)
            
            if len(sensors_by_owner_mac) > 1:
                print(f"Grouped sensors by owner/MAC: {len(sensors_by_owner_mac)} groups", flush=True)
                for (owner, mac), sensors_group in sensors_by_owner_mac.items():
                    print(f"  {owner}/{mac}: {len(sensors_group)} sensors", flush=True)
            
            for batch_index, sensors_batch in enumerate(all_batches, 1):
                batch_start = time.time()
                result = await send_batch_last_package(
                    websocket, 
                    sensors_batch, 
                    batch_index, 
                    total_batches
                )
                batch_duration = time.time() - batch_start
                batch_durations.append(batch_duration)
                
                if result.get("success", False):
                    updated_llas = result.get("updated_llas", [])
                    registered_llas = result.get("registered_llas", [])
                    total_sensors_updated += len(updated_llas)
                    total_sensors_registered += len(registered_llas)
                    
                    total_processed = len(updated_llas) + len(registered_llas)
                    if total_processed == result.get("total_sensors", 0):
                        results["successful"].append({
                            "batch_index": batch_index,
                            "updated_llas": updated_llas,
                            "registered_llas": registered_llas,
                            "sensor_count": len(sensors_batch)
                        })
                    else:
                        # Partially successful
                        errors = result.get("errors", [])
                        total_sensors_failed += len(errors)
                        
                        results["partially_successful"].append({
                            "batch_index": batch_index,
                            "updated_llas": updated_llas,
                            "registered_llas": registered_llas,
                            "errors": errors,
                            "sensor_count": len(sensors_batch)
                        })
                elif result.get("updated_llas") or result.get("registered_llas"):
                    # Partially successful (some sensors updated/registered, some failed)
                    updated_llas = result.get("updated_llas", [])
                    registered_llas = result.get("registered_llas", [])
                    errors = result.get("errors", [])
                    total_sensors_updated += len(updated_llas)
                    total_sensors_registered += len(registered_llas)
                    total_sensors_failed += len(errors)
                    
                    results["partially_successful"].append({
                        "batch_index": batch_index,
                        "updated_llas": updated_llas,
                        "registered_llas": registered_llas,
                        "errors": errors
                    })
                else:
                    errors = result.get("errors", [])
                    if errors:
                        total_sensors_failed += len(errors)
                    
                    results["failed"].append({
                        "batch_index": batch_index,
                        "error": result.get("error", "Unknown error"),
                        "errors": errors,
                        "sensor_count": len(sensors_batch)
                    })
                
                # Small delay between batches
                if batch_index < total_batches:
                    delay = random.uniform(0.5, 1.0)
                    # await asyncio.sleep(delay)
            
            total_duration = time.time() - test_start_time
            
            print("\n" + "="*60, flush=True)
            print("SUMMARY", flush=True)
            print("="*60, flush=True)
            print(f"✅ Fully successful batches: {len(results['successful'])}/{total_batches}", flush=True)
            print(f"⚠️  Partially successful batches: {len(results['partially_successful'])}", flush=True)
            print(f"❌ Failed batches: {len(results['failed'])}", flush=True)
            print(f"\nTotal sensors updated: {total_sensors_updated}", flush=True)
            print(f"Total sensors registered: {total_sensors_registered}", flush=True)
            print(f"Total sensors failed: {total_sensors_failed}", flush=True)
            total_processed = total_sensors_updated + total_sensors_registered
            print(f"Total sensors processed: {total_processed}/{len(sensors_to_update)}", flush=True)
            
            # Performance metrics
            if batch_durations:
                avg_batch_duration = sum(batch_durations) / len(batch_durations)
                min_batch_duration = min(batch_durations)
                max_batch_duration = max(batch_durations)
                sensors_per_second = total_processed / total_duration if total_duration > 0 else 0
                
                print(f"\nPerformance Metrics:", flush=True)
                print(f"   Total Duration: {total_duration:.2f}s", flush=True)
                print(f"   Avg Batch Duration: {avg_batch_duration:.3f}s", flush=True)
                print(f"   Min Batch Duration: {min_batch_duration:.3f}s", flush=True)
                print(f"   Max Batch Duration: {max_batch_duration:.3f}s", flush=True)
                print(f"   Throughput: {sensors_per_second:.2f} sensors/s", flush=True)
            
            if results["successful"]:
                print(f"\n   Successful Batches:", flush=True)
                for success in results["successful"]:
                    all_llas = success['updated_llas'] + success.get('registered_llas', [])
                    print(f"      ✅ Batch #{success['batch_index']}: {len(all_llas)} sensors processed", flush=True)
                    if success['updated_llas']:
                        print(f"         📝 Updated: {len(success['updated_llas'])} - {', '.join(success['updated_llas'][:3])}{'...' if len(success['updated_llas']) > 3 else ''}", flush=True)
                    if success.get('registered_llas'):
                        print(f"         ✨ Registered: {len(success['registered_llas'])} - {', '.join(success['registered_llas'][:3])}{'...' if len(success['registered_llas']) > 3 else ''}", flush=True)
            
            if results["partially_successful"]:
                print(f"\n   Partially Successful Batches:", flush=True)
                for partial in results["partially_successful"]:
                    all_llas = partial['updated_llas'] + partial.get('registered_llas', [])
                    print(f"      ⚠️  Batch #{partial['batch_index']}: {len(all_llas)} processed, {len(partial.get('errors', []))} failed", flush=True)
                    if partial['updated_llas']:
                        print(f"         📝 Updated: {len(partial['updated_llas'])}", flush=True)
                    if partial.get('registered_llas'):
                        print(f"         ✨ Registered: {len(partial['registered_llas'])}", flush=True)
            
            if results["failed"]:
                print(f"\n   Failed Batches:", flush=True)
                for failure in results["failed"]:
                    print(f"      ❌ Batch #{failure['batch_index']}: {failure.get('error', 'Unknown error')}", flush=True)
                    if failure.get("errors"):
                        for error in failure["errors"][:2]:
                            print(f"         - {error}", flush=True)
            
            print("\n" + "="*60, flush=True)
            print("Test completed!", flush=True)
            print("="*60, flush=True)
            
            total_processed = total_sensors_updated + total_sensors_registered
            return {
                "batch_size": batch_size,
                "total_sensors": len(sensors_to_update),
                "total_batches": total_batches,
                "total_sensors_updated": total_sensors_updated,
                "total_sensors_registered": total_sensors_registered,
                "total_sensors_failed": total_sensors_failed,
                "total_duration": total_duration,
                "avg_batch_duration": sum(batch_durations) / len(batch_durations) if batch_durations else 0,
                "sensors_per_second": total_processed / total_duration if total_duration > 0 else 0,
                "successful_batches": len(results['successful']),
                "partially_successful_batches": len(results['partially_successful']),
                "failed_batches": len(results['failed'])
            }
    
    except websockets.exceptions.InvalidURI:
        print(f"❌ Error: Invalid WebSocket URI: {WS_URI}", flush=True)
        print("   Check that the URI is correct (ws:// or wss://)", flush=True)
        return None
    except websockets.exceptions.InvalidHandshake:
        print(f"❌ Error: WebSocket handshake failed", flush=True)
        print("   Make sure the server is running and supports WebSocket connections", flush=True)
        return None
    except ConnectionRefusedError:
        print(f"❌ Error: Connection refused", flush=True)
        print("   Make sure the server is running: python -m uvicorn src.main:app --reload", flush=True)
        return None
    except Exception as e:
        print(f"❌ Unexpected Error: {str(e)}", flush=True)
        print(f"   Error type: {type(e).__name__}", flush=True)
        return None


async def run_all_batch_sizes():
    """Run tests with multiple batch sizes and compare performance."""
    batch_sizes = [5, 10, 15, 20]
    
    print("\n" + "="*70)
    print("BATCH LAST_PACKAGE UPDATE TEST - MULTIPLE BATCH SIZES")
    print("="*70)
    print(f"Testing endpoint: {WS_URI}")
    print(f"Total sensors available: {len(sensors_to_update)}")
    print(f"Batch sizes to test: {batch_sizes}")
    print("="*70)
    
    # Step 1: Ping all sensors ONCE before running batch size tests
    print("\n" + "="*70)
    print("STEP 1: PINGING ALL SENSORS (ONE TIME)")
    print("="*70)
    
    ping_success = False
    
    try:
        print(f"\nConnecting to {WS_URI}...", flush=True)
        async with websockets.connect(WS_URI) as websocket:
            print("✅ Connected successfully\n", flush=True)
            
            # Pass all sensors (with owner/mac) to ping function
            ping_result = await ping_sensors(websocket, sensors_to_update)
            
            if ping_result["success_count"] == 0:
                print("\n❌ ERROR: No sensors were successfully pinged. Cannot proceed with last_package updates.", flush=True)
                return
            
            print(f"\n✅ Successfully pinged {ping_result['success_count']}/{len(sensors_to_update)} sensors", flush=True)
            ping_success = True
            
            # Small delay before starting batch tests
            # await asyncio.sleep(1.0)
    except Exception as e:
        print(f"\n❌ Error during ping: {str(e)}", flush=True)
        return
    
    if not ping_success:
        return
    
    # Step 2: Run batch size tests (skip ping for all subsequent tests)
    print("\n" + "="*70)
    print("STEP 2: RUNNING BATCH SIZE TESTS")
    print("="*70)
    
    all_results = []
    
    for batch_size in batch_sizes:
        print(f"\n{'='*70}")
        print(f"Testing with batch size: {batch_size}")
        print("="*70)
        
        # Skip ping for all batch size tests (already pinged once)
        result = await test_batch_last_package(batch_size=batch_size, skip_ping=True)
        if result:
            all_results.append(result)
        
        # Delay between different batch size tests
        if batch_size != batch_sizes[-1]:
            delay = random.uniform(1.0, 2.0)
            print(f"\nWaiting {delay:.1f}s before next test...", flush=True)
            # await asyncio.sleep(delay)
    
    # Performance comparison
    if all_results:
        print("\n" + "="*70)
        print("PERFORMANCE COMPARISON")
        print("="*70)
        print(f"{'Batch Size':<12} {'Duration (s)':<15} {'Sensors/s':<12} {'Avg Batch (s)':<15} {'Success Rate':<12}")
        print("-"*70)
        
        for result in all_results:
            total_processed = result['total_sensors_updated'] + result.get('total_sensors_registered', 0)
            success_rate = (total_processed / result['total_sensors']) * 100 if result['total_sensors'] > 0 else 0
            print(f"{result['batch_size']:<12} "
                  f"{result['total_duration']:<15.2f} "
                  f"{result['sensors_per_second']:<12.2f} "
                  f"{result['avg_batch_duration']:<15.3f} "
                  f"{success_rate:<12.1f}%")
        
        print("="*70)
        
        # Find best performing batch size
        best_throughput = max(all_results, key=lambda x: x['sensors_per_second'])
        fastest = min(all_results, key=lambda x: x['total_duration'])
        
        print(f"\n🏆 Best Throughput: Batch size {best_throughput['batch_size']} "
              f"({best_throughput['sensors_per_second']:.2f} sensors/s)")
        print(f"⚡ Fastest Total Time: Batch size {fastest['batch_size']} "
              f"({fastest['total_duration']:.2f}s)")
        print("="*70 + "\n")


if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Test batch last_package updates")
    parser.add_argument(
        "--batch-size",
        type=int,
        default=None,
        help="Number of sensors per batch (if not specified, tests all: 5, 10, 15, 20)"
    )
    parser.add_argument(
        "--all",
        action="store_true",
        help="Test all batch sizes (5, 10, 15, 20) - default behavior"
    )
    
    args = parser.parse_args()
    
    if args.batch_size:
        # Test single batch size
        asyncio.run(test_batch_last_package(batch_size=args.batch_size))
    else:
        # Test all batch sizes
        asyncio.run(run_all_batch_sizes())

