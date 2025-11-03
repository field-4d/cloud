"""
Simple Python script to test WebSocket endpoint using websockets library.
Install: pip install websockets
"""
import asyncio
import json
import websockets

async def test_websocket():
    uri = "ws://localhost:8000/ws/ping"
    
    # List of all sensors from f4d_test_aaaaaaaaaaaa_metadata table (7 sensors)
    payloads = [
        {
            "hostname": "f4d_test",
            "mac_address": "aaaaaaaaaaaa",
            "type": "Ping",
            "LLA": "fd002124b00ccf7399b"
        },
        {
            "hostname": "f4d_test",
            "mac_address": "aaaaaaaaaaaa",
            "type": "Ping",
            "LLA": "fd002124b00ccf7399a"
        },
        {
            "hostname": "f4d_test",
            "mac_address": "aaaaaaaaaaaa",
            "type": "Ping",
            "LLA": "fd002124b0021f9fecc"
        },
        {
            "hostname": "f4d_test",
            "mac_address": "aaaaaaaaaaaa",
            "type": "Ping",
            "LLA": "fd002124b00d6b2703"
        },
        {
            "hostname": "f4d_test",
            "mac_address": "aaaaaaaaaaaa",
            "type": "Ping",
            "LLA": "fd002124b001665e500"
        },
        {
            "hostname": "f4d_test",
            "mac_address": "aaaaaaaaaaaa",
            "type": "Ping",
            "LLA": "fd002124b00aa9e4512"
        },
        {
            "hostname": "f4d_test",
            "mac_address": "aaaaaaaaaaaa",
            "type": "Ping",
            "LLA": "fd002124b00aa9e4513"
        }
    ]
    
    try:
        async with websockets.connect(uri) as websocket:
            for i, payload in enumerate(payloads, 1):
                print(f"\nSending payload {i}/{len(payloads)}: {payload}")
                await websocket.send(json.dumps(payload))
                
                response = await websocket.recv()
                print(f"Received: {response}")
                
                # Small delay between payloads
                await asyncio.sleep(0.5)
            
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(test_websocket())

