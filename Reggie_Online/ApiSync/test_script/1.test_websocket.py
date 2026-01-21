"""
Test script for WebSocket ping endpoint using websockets library.
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

# List of all sensors to test (multiple owners with multiple MAC addresses)
# Based on real permissions API structure
payloads = [
    # Icore_Pi owner
    {
        "owner": "Icore_Pi",
        "mac_address": "2ccf6730ab5f",
        "type": "Ping",
        "LLA": "fd002124b00ccf7399b"
    },
    {
        "owner": "Icore_Pi",
        "mac_address": "2ccf6730ab5f",
        "type": "Ping",
        "LLA": "fd002124b00ccf7399a"
    },
    # developerroom owner - first MAC
    {
        "owner": "developerroom",
        "mac_address": "2ccf6730ab8c",
        "type": "Ping",
        "LLA": "fd002124b0021f9fecc"
    },
    # developerroom owner - second MAC
    {
        "owner": "developerroom",
        "mac_address": "d83adde26159",
        "type": "Ping",
        "LLA": "fd002124b00d6b2703"
    },
    # menachem_moshelion owner - first MAC
    {
        "owner": "menachem_moshelion",
        "mac_address": "2ccf6730ab7a",
        "type": "Ping",
        "LLA": "fd002124b001665e500"
    },
    # menachem_moshelion owner - second MAC
    {
        "owner": "menachem_moshelion",
        "mac_address": "d83adde2608f",
        "type": "Ping",
        "LLA": "fd002124b00aa9e4512"
    },
    # menachem_moshelion owner - third MAC
    {
        "owner": "menachem_moshelion",
        "mac_address": "d83adde261b0",
        "type": "Ping",
        "LLA": "fd002124b00aa9e4513"
    },
    # yakir owner
    {
        "owner": "yakir",
        "mac_address": "d83adde260d1",
        "type": "Ping",
        "LLA": "1234567890"
    },
    # f4d_test owner
    {
        "owner": "f4d_test",
        "mac_address": "2ccf6730ab71",
        "type": "Ping",
        "LLA": "1234567892"
    },
]


async def send_ping_payload(websocket, payload, index, total):
    """
    Send a ping payload via WebSocket and receive response.
    
    Args:
        websocket: WebSocket connection
        payload: Payload dictionary to send
        index: Current payload index (1-based)
        total: Total number of payloads
    
    Returns:
        dict: Result with success status and response data
    """
    try:
        print(f"\n{'='*60}")
        print(f"[{index}/{total}] Sending payload")
        print(f"Owner: {payload.get('owner')} | MAC: {payload.get('mac_address')}")
        print(f"Type: {payload.get('type')} | LLA: {payload.get('LLA')}")
        print(f"{'='*60}")
        
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
            validation = response.get("payload", {}).get("validation", {})
            is_valid = validation.get("is_valid", False)
            message = validation.get("message", "No message")
            
            print(f"Received in {receive_duration:.3f}s", flush=True)
            print(f"Validation: {'✅ VALID' if is_valid else '❌ INVALID'}", flush=True)
            print(f"Message: {message}", flush=True)
            
            if is_valid:
                print(f"✅ Success: Payload processed successfully", flush=True)
            else:
                print(f"⚠️  Warning: Validation failed - {message}", flush=True)
            
            return {
                "success": True,
                "is_valid": is_valid,
                "message": message,
                "response": response,
                "send_duration": send_duration,
                "receive_duration": receive_duration
            }
        except json.JSONDecodeError:
            print(f"⚠️  Warning: Received non-JSON response", flush=True)
            print(f"Response: {response_text[:100]}", flush=True)
            return {
                "success": True,
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


async def test_websocket():
    """Test WebSocket ping endpoint with multiple payloads."""
    print("\n" + "="*60, flush=True)
    print("WEBSOCKET PING TEST", flush=True)
    print("="*60, flush=True)
    print(f"Testing endpoint: {WS_URI}", flush=True)
    print(f"Total payloads to send: {len(payloads)}", flush=True)
    
    results = {
        "successful": [],
        "valid": [],
        "invalid": [],
        "failed": []
    }
    
    try:
        print(f"\nConnecting to {WS_URI}...", flush=True)
        async with websockets.connect(WS_URI) as websocket:
            print("✅ Connected successfully\n", flush=True)
            
            for i, payload in enumerate(payloads, 1):
                result = await send_ping_payload(websocket, payload, i, len(payloads))
                
                if result.get("success", False):
                    results["successful"].append({
                        "lla": payload.get("LLA"),
                        "is_valid": result.get("is_valid", False),
                        "message": result.get("message", "")
                    })
                    
                    if result.get("is_valid", False):
                        results["valid"].append(payload.get("LLA"))
                    else:
                        results["invalid"].append({
                            "lla": payload.get("LLA"),
                            "message": result.get("message", "")
                        })
                else:
                    results["failed"].append({
                        "lla": payload.get("LLA"),
                        "error": result.get("error", "Unknown error")
                    })
                
                # Small delay between payloads
                if i < len(payloads):
                    delay = random.uniform(0.5, 1.0) ## 0.5 to 1.0 seconds
                    await asyncio.sleep(delay)
            
            print("\n" + "="*60, flush=True)
            print("SUMMARY", flush=True)
            print("="*60, flush=True)
            print(f"✅ Successful payloads: {len(results['successful'])}/{len(payloads)}", flush=True)
            print(f"   - Valid sensors: {len(results['valid'])}", flush=True)
            print(f"   - Invalid sensors: {len(results['invalid'])}", flush=True)
            
            if results["valid"]:
                print(f"\n   Valid LLAs:", flush=True)
                for lla in results["valid"]:
                    print(f"      ✅ {lla}", flush=True)
            
            if results["invalid"]:
                print(f"\n   Invalid LLAs:", flush=True)
                for invalid in results["invalid"]:
                    print(f"      ⚠️  {invalid['lla']}: {invalid['message']}", flush=True)
            
            if results["failed"]:
                print(f"\n❌ Failed payloads: {len(results['failed'])}", flush=True)
                for failure in results["failed"]:
                    print(f"   - {failure['lla']}: {failure['error']}", flush=True)
            
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
    asyncio.run(test_websocket())
