"""
Test script for WebSocket Last_Package endpoint using websockets library.
Install: pip install websockets
"""
import asyncio
import json
import websockets
import random
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

# WebSocket URI
WS_URI = "ws://localhost:8000/ws/ping"

# List of Last_Package payloads to test (multiple owners with multiple MAC addresses)
# Each payload contains a "sensors" field with sensor readings
# Sensors can be provided as a dictionary (keyed by LLA) or as an array
# IMPORTANT: Owner/MAC/LLA combinations must match test_script/1.test_websocket.py
last_package_payloads = [
    # Payload 1: Dictionary format with multiple sensors - Icore_Pi owner
    # Matches 1.test_websocket.py payloads[0] and payloads[1]
    {
        "type": "Last_Package",
        "owner": "Icore_Pi",
        "mac_address": "2ccf6730ab5f",
        "sensors": {
            "fd002124b00ccf7399b": {
                "temperature": 23.5,
                "humidity": 65.2,
                "solar_intensity": 850.0,
                "battery": 3750  # mV (valid: >2700)
            },
            "fd002124b00ccf7399a": {
                "temperature": 24.1,
                "humidity": 68.5,
                "solar_intensity": 920.0,
                "battery": 3900  # mV (valid: >2700)
            }
        }
    },
    # Payload 2: Single sensor - developerroom owner (first MAC)
    # Matches 1.test_websocket.py payloads[2]
    {
        "type": "Last_Package",
        "owner": "developerroom",
        "mac_address": "2ccf6730ab8c",
        "sensors": {
            "fd002124b0021f9fecc": {
                "temperature": 22.8,
                "humidity": 62.3,
                "solar_intensity": 780.0,
                "battery": 3400,  # mV (valid: >2700)
                "pressure": 1013.25  # Additional field to test extendability
            }
        }
    },
    # Payload 3: Single sensor - developerroom owner (second MAC)
    # Matches 1.test_websocket.py payloads[3]
    {
        "type": "Last_Package",
        "owner": "developerroom",
        "mac_address": "d83adde26159",
        "sensors": {
            "fd002124b00d6b2703": {
                "temperature": 25.3,
                "humidity": 70.1,
                "solar_intensity": 950.0,
                "battery": 3800  # mV (valid: >2700)
            }
        }
    },
    # Payload 4: Single sensor - menachem_moshelion owner (first MAC)
    # Matches 1.test_websocket.py payloads[4]
    {
        "type": "Last_Package",
        "owner": "menachem_moshelion",
        "mac_address": "2ccf6730ab7a",
        "sensors": {
            "fd002124b001665e500": {
                "temperature": 21.9,
                "humidity": 58.7,
                "solar_intensity": 720.0,
                "battery": 3600,  # mV (valid: >2700)
                "soil_moisture": 45.2,
                "ph_level": 6.8
            }
        }
    },
    # Payload 5: Single sensor - menachem_moshelion owner (second MAC)
    # Matches 1.test_websocket.py payloads[5]
    {
        "type": "Last_Package",
        "owner": "menachem_moshelion",
        "mac_address": "d83adde2608f",
        "sensors": {
            "fd002124b00aa9e4512": {
                "temperature": 26.2,
                "humidity": 72.4,
                "solar_intensity": 980.0,
                "battery": 4000,  # mV (valid: >2700)
                "wind_speed": 3.5  # Additional field
            }
        }
    },
    # Payload 6: Single sensor - menachem_moshelion owner (third MAC)
    # Matches 1.test_websocket.py payloads[6]
    {
        "type": "Last_Package",
        "owner": "menachem_moshelion",
        "mac_address": "d83adde261b0",
        "sensors": {
            "fd002124b00aa9e4513": {
                "temperature": 20.5,
                "humidity": 55.8,
                "solar_intensity": 650.0,
                "battery": 3300,  # mV (valid: >2700)
                "soil_moisture": 45.2,
                "ph_level": 6.8
            }
        }
    },
    # Payload 7: Single sensor - yakir owner
    # Matches 1.test_websocket.py payloads[7]
    {
        "type": "Last_Package",
        "owner": "yakir",
        "mac_address": "d83adde260d1",
        "sensors": {
            "1234567890": {
                "temperature": 19.8,
                "humidity": 52.1,
                "solar_intensity": 600.0,
                "battery": 3200  # mV (valid: >2700)
            }
        }
    },
    # Payload 8: Single sensor - f4d_test owner
    # Matches 1.test_websocket.py payloads[8]
    {
        "type": "Last_Package",
        "owner": "f4d_test",
        "mac_address": "2ccf6730ab71",
        "sensors": {
            "1234567892": {
                "temperature": 18.5,
                "humidity": 50.0,
                "solar_intensity": 580.0,
                "battery": 3100  # mV (valid: >2700)
            }
        }
    },
    # Payload 9: Array format test - Icore_Pi owner (testing array format)
    {
        "type": "Last_Package",
        "owner": "Icore_Pi",
        "mac_address": "2ccf6730ab5f",
        "sensors": [
            {
                "LLA": "fd002124b00ccf7399b",
                "temperature": 20.0,
                "battery": 3500
            },
            {
                "LLA": "fd002124b00ccf7399a",
                "temperature": 21.0,
                "battery": 3600
            }
        ]
    }
]


async def send_last_package_payload(websocket, payload, index, total):
    """
    Send a Last_Package payload via WebSocket and receive response.
    
    Args:
        websocket: WebSocket connection
        payload: Payload dictionary to send
        index: Current payload index (1-based)
        total: Total number of payloads
    
    Returns:
        dict: Result with success status and response data
    """
    try:
        print(f"\n{'='*60}", flush=True)
        print(f"[{index}/{total}] Sending Last_Package payload", flush=True)
        
        # Determine format and count sensors
        sensors_data = payload.get("sensors", {})
        if isinstance(sensors_data, dict):
            sensor_count = len(sensors_data)
            sensor_llas = list(sensors_data.keys())
            format_type = "Dictionary"
        elif isinstance(sensors_data, list):
            sensor_count = len(sensors_data)
            sensor_llas = [s.get("LLA", "N/A") for s in sensors_data if isinstance(s, dict)]
            format_type = "Array"
        else:
            sensor_count = 0
            sensor_llas = []
            format_type = "Unknown"
        
        print(f"Format: {format_type} | Sensors: {sensor_count}", flush=True)
        print(f"LLAs: {', '.join(sensor_llas[:3])}{'...' if len(sensor_llas) > 3 else ''}", flush=True)
        print(f"{'='*60}", flush=True)
        
        # Generate random delay between 0.5 and 1.5 seconds
        delay = random.uniform(0.5, 1.5)
        await asyncio.sleep(delay)
        
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
            print(f"Updated Sensors: {len(updated_llas)}/{sensor_count}", flush=True)
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
            
            # Show package data for processed sensors (updated + registered)
            sensors_data_response = response.get("sensors", {})
            if sensors_data_response:
                print(f"\nPackage Data:", flush=True)
                for lla, package_data in list(sensors_data_response.items())[:2]:  # Show first 2
                    fields = list(package_data.keys())
                    print(f"   {lla}: {', '.join(fields)}", flush=True)
                if len(sensors_data_response) > 2:
                    print(f"   ... and {len(sensors_data_response) - 2} more sensors", flush=True)
            
            total_processed = len(updated_llas) + len(registered_llas)
            success = total_processed > 0 and (not errors or len(errors) == 0)
            
            if success:
                if total_processed == sensor_count:
                    print(f"✅ Success: All {sensor_count} sensors processed successfully", flush=True)
                else:
                    print(f"✅ Success: {total_processed}/{sensor_count} sensors processed successfully", flush=True)
            else:
                print(f"⚠️  Warning: Some sensors failed to process", flush=True)
            
            return {
                "success": success,
                "updated_llas": updated_llas,
                "registered_llas": registered_llas,
                "errors": errors,
                "sensors_data": sensors_data_response,
                "response": response,
                "send_duration": send_duration,
                "receive_duration": receive_duration
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
                "receive_duration": receive_duration
            }
    
    except websockets.exceptions.ConnectionClosed:
        print(f"❌ Error: WebSocket connection closed", flush=True)
        return {
            "success": False,
            "error": "Connection closed",
            "payload": payload
        }
    except Exception as e:
        print(f"❌ Error: {str(e)}", flush=True)
        return {
            "success": False,
            "error": str(e),
            "payload": payload
        }


async def test_last_package():
    """Test WebSocket Last_Package endpoint with multiple payloads."""
    print("\n" + "="*60)
    print("WEBSOCKET LAST_PACKAGE TEST")
    print("="*60)
    print(f"Testing endpoint: {WS_URI}")
    print(f"Total payloads to send: {len(last_package_payloads)}")
    
    results = {
        "successful": [],
        "partially_successful": [],
        "failed": []
    }
    
    total_sensors_updated = 0
    total_sensors_registered = 0
    total_sensors_failed = 0
    
    try:
        print(f"\nConnecting to {WS_URI}...", flush=True)
        async with websockets.connect(WS_URI) as websocket:
            print("✅ Connected successfully\n", flush=True)
            
            for i, payload in enumerate(last_package_payloads, 1):
                result = await send_last_package_payload(websocket, payload, i, len(last_package_payloads))
                
                if result.get("success", False):
                    updated_llas = result.get("updated_llas", [])
                    registered_llas = result.get("registered_llas", [])
                    total_sensors_updated += len(updated_llas)
                    total_sensors_registered += len(registered_llas)
                    
                    results["successful"].append({
                        "payload_index": i,
                        "updated_llas": updated_llas,
                        "registered_llas": registered_llas,
                        "sensor_count": len(payload.get("sensors", {})) if isinstance(payload.get("sensors"), dict) else len(payload.get("sensors", []))
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
                        "payload_index": i,
                        "updated_llas": updated_llas,
                        "registered_llas": registered_llas,
                        "errors": errors
                    })
                else:
                    errors = result.get("errors", [])
                    if errors:
                        total_sensors_failed += len(errors)
                    
                    results["failed"].append({
                        "payload_index": i,
                        "error": result.get("error", "Unknown error"),
                        "errors": errors
                    })
                
                # Small delay between payloads
                if i < len(last_package_payloads):
                    delay = random.uniform(0.5, 1.0)
                    await asyncio.sleep(delay)
            
            print("\n" + "="*60, flush=True)
            print("SUMMARY", flush=True)
            print("="*60, flush=True)
            print(f"✅ Fully successful payloads: {len(results['successful'])}/{len(last_package_payloads)}", flush=True)
            print(f"⚠️  Partially successful payloads: {len(results['partially_successful'])}", flush=True)
            print(f"❌ Failed payloads: {len(results['failed'])}", flush=True)
            print(f"\nTotal sensors updated: {total_sensors_updated}", flush=True)
            print(f"Total sensors registered: {total_sensors_registered}", flush=True)
            print(f"Total sensors failed: {total_sensors_failed}", flush=True)
            
            if results["successful"]:
                print(f"\n   Successful Payloads:", flush=True)
                for success in results["successful"]:
                    all_llas = success['updated_llas'] + success.get('registered_llas', [])
                    print(f"      ✅ Payload #{success['payload_index']}: {len(all_llas)} sensors processed", flush=True)
                    if success['updated_llas']:
                        print(f"         📝 Updated: {len(success['updated_llas'])} - {', '.join(success['updated_llas'][:3])}{'...' if len(success['updated_llas']) > 3 else ''}", flush=True)
                    if success.get('registered_llas'):
                        print(f"         ✨ Registered: {len(success['registered_llas'])} - {', '.join(success['registered_llas'][:3])}{'...' if len(success['registered_llas']) > 3 else ''}", flush=True)
            
            if results["partially_successful"]:
                print(f"\n   Partially Successful Payloads:", flush=True)
                for partial in results["partially_successful"]:
                    all_llas = partial['updated_llas'] + partial.get('registered_llas', [])
                    print(f"      ⚠️  Payload #{partial['payload_index']}: {len(all_llas)} processed, {len(partial.get('errors', []))} failed", flush=True)
                    if partial['updated_llas']:
                        print(f"         📝 Updated: {len(partial['updated_llas'])}", flush=True)
                    if partial.get('registered_llas'):
                        print(f"         ✨ Registered: {len(partial['registered_llas'])}", flush=True)
            
            if results["failed"]:
                print(f"\n   Failed Payloads:", flush=True)
                for failure in results["failed"]:
                    print(f"      ❌ Payload #{failure['payload_index']}: {failure.get('error', 'Unknown error')}", flush=True)
                    if failure.get("errors"):
                        for error in failure["errors"][:2]:
                            print(f"         - {error}", flush=True)
            
            print("\n" + "="*60, flush=True)
            print("Test completed!", flush=True)
            print("="*60, flush=True)
    
    except websockets.exceptions.InvalidURI:
        print(f"❌ Error: Invalid WebSocket URI: {WS_URI}", flush=True)
        print("   Check that the URI is correct (ws:// or wss://)", flush=True)
    except websockets.exceptions.InvalidHandshake:
        print(f"❌ Error: WebSocket handshake failed", flush=True)
        print("   Make sure the server is running and supports WebSocket connections", flush=True)
    except ConnectionRefusedError:
        print(f"❌ Error: Connection refused", flush=True)
        print("   Make sure the server is running: python -m uvicorn src.main:app --reload", flush=True)
    except Exception as e:
        print(f"❌ Unexpected Error: {str(e)}", flush=True)
        print(f"   Error type: {type(e).__name__}", flush=True)


if __name__ == "__main__":
    asyncio.run(test_last_package())

