# Frontend API Integration Guide

**For Frontend Developers**  
**Base URL:** `http://localhost:8000` (or your production URL)

This guide provides Python examples showing different payload types and their corresponding responses for all API endpoints.

---

## Table of Contents

1. [Health Check](#1-health-check)
2. [WebSocket Endpoints](#2-websocket-endpoints)
3. [GET Endpoints - Metadata Queries](#3-get-endpoints---metadata-queries)
4. [POST Endpoints - Sensor Management](#4-post-endpoints---sensor-management)

---

## 1. Health Check

### Endpoint
```
GET /health
```

### Request
```python
import requests

response = requests.get('http://localhost:8000/health')
print(response.json())
```

### Response
```json
{
  "status": "ok"
}
```

---

## 2. WebSocket Endpoints

### Endpoint
```
WebSocket ws://localhost:8000/ws/ping
```

### 2.1 Ping Message - Basic

#### Request Payload
```python
import asyncio
import websockets
import json

async def send_ping():
    uri = "ws://localhost:8000/ws/ping"
    async with websockets.connect(uri) as websocket:
        payload = {
            "owner": "f4d_test",
            "mac_address": "aaaaaaaaaaaa",
            "type": "Ping",
            "LLA": "fd002124b00ccf7399b"
        }
        await websocket.send(json.dumps(payload))
        response = await websocket.recv()
        print(json.loads(response))
```

#### Response (Valid Sensor - Already Exists)
```json
{
  "received": true,
  "timestamp": "2024-01-15T10:30:45",
  "payload": {
    "owner": "f4d_test",
    "hostname": "f4d_test",
    "mac_address": "aaaaaaaaaaaa",
    "type": "Ping",
    "LLA": "fd002124b00ccf7399b",
    "validation": {
      "is_valid": true,
      "message": "LLA found in metadata",
      "error": null
    }
  }
}
```

#### Response (New Sensor - Auto-Registered)
```json
{
  "received": true,
  "timestamp": "2024-01-15T10:30:45",
  "payload": {
    "owner": "f4d_test",
    "hostname": "f4d_test",
    "mac_address": "aaaaaaaaaaaa",
    "type": "Ping",
    "LLA": "fd002124b00ccf7399b",
    "validation": {
      "is_valid": true,
      "message": "Sensor added",
      "error": null
    }
  }
}
```

#### Response (Invalid - Owner Mismatch)
```json
{
  "received": true,
  "timestamp": "2024-01-15T10:30:45",
  "payload": {
    "owner": "wrong_owner",
    "hostname": "wrong_owner",
    "mac_address": "aaaaaaaaaaaa",
    "type": "Ping",
    "LLA": "fd002124b00ccf7399b",
    "validation": {
      "is_valid": false,
      "message": "Owner mismatch",
      "error": "Expected owner 'f4d_test', got 'wrong_owner'"
    }
  }
}
```

#### Response (Invalid - MAC Mismatch)
```json
{
  "received": true,
  "timestamp": "2024-01-15T10:30:45",
  "payload": {
    "owner": "f4d_test",
    "hostname": "f4d_test",
    "mac_address": "wrong_mac",
    "type": "Ping",
    "LLA": "fd002124b00ccf7399b",
    "validation": {
      "is_valid": false,
      "message": "MAC address mismatch",
      "error": "Expected MAC 'aaaaaaaaaaaa', got 'wrong_mac'"
    }
  }
}
```

#### Response (Invalid - Missing Fields)
```json
{
  "received": true,
  "timestamp": "2024-01-15T10:30:45",
  "payload": {
    "owner": null,
    "hostname": null,
    "mac_address": null,
    "type": "Ping",
    "LLA": null,
    "validation": {
      "is_valid": false,
      "message": "Validation skipped - missing required fields (owner, mac_address, or LLA)",
      "error": null
    }
  }
}
```

### 2.2 Ping Message - Using hostname (Backward Compatibility)

#### Request Payload
```python
payload = {
    "hostname": "f4d_test",  # Using hostname instead of owner
    "mac_address": "aaaaaaaaaaaa",
    "type": "Ping",
    "LLA": "fd002124b00ccf7399b"
}
```

#### Response
```json
{
  "received": true,
  "timestamp": "2024-01-15T10:30:45",
  "payload": {
    "owner": "f4d_test",
    "hostname": "f4d_test",
    "mac_address": "aaaaaaaaaaaa",
    "type": "Ping",
    "LLA": "fd002124b00ccf7399b",
    "validation": {
      "is_valid": true,
      "message": "LLA found in metadata",
      "error": null
    }
  }
}
```

### 2.3 Last_Package Message - Single Sensor

#### Request Payload
```python
payload = {
    "owner": "f4d_test",
    "mac_address": "aaaaaaaaaaaa",
    "type": "Last_Package",
    "sensors": {
        "fd002124b00ccf7399b": {
            "temperature": 20.5,
            "humidity": 60.0,
            "solar_intensity": 800.0,
            "battery": 3500
        }
    }
}
```

#### Response (Success)
```json
{
  "received": true,
  "timestamp": "2024-01-15T10:30:45",
  "type": "Last_Package",
  "owner": "f4d_test",
  "hostname": "f4d_test",
  "mac_address": "aaaaaaaaaaaa",
  "updated_llas": ["fd002124b00ccf7399b"],
  "registered_llas": null,
  "sensors": {
    "fd002124b00ccf7399b": {
      "temperature": 20.5,
      "humidity": 60.0,
      "solar_intensity": 800.0,
      "battery": 3500
    }
  },
  "errors": null
}
```

#### Response (New Sensor Registered)
```json
{
  "received": true,
  "timestamp": "2024-01-15T10:30:45",
  "type": "Last_Package",
  "owner": "f4d_test",
  "hostname": "f4d_test",
  "mac_address": "aaaaaaaaaaaa",
  "updated_llas": [],
  "registered_llas": ["fd002124b00ccf7399b"],
  "sensors": {
    "fd002124b00ccf7399b": {
      "temperature": 20.5,
      "humidity": 60.0,
      "solar_intensity": 800.0,
      "battery": 3500
    }
  },
  "errors": null
}
```

### 2.4 Last_Package Message - Multiple Sensors

#### Request Payload
```python
payload = {
    "owner": "f4d_test",
    "mac_address": "aaaaaaaaaaaa",
    "type": "Last_Package",
    "sensors": {
        "fd002124b00ccf7399b": {
            "temperature": 20.5,
            "humidity": 60.0,
            "solar_intensity": 800.0,
            "battery": 3500
        },
        "fd002124b00ccf7399a": {
            "temperature": 21.0,
            "humidity": 61.0,
            "solar_intensity": 810.0,
            "battery": 3550
        },
        "fd002124b00ccf7399c": {
            "temperature": 22.0,
            "humidity": 62.0,
            "solar_intensity": 820.0,
            "battery": 3600
        }
    }
}
```

#### Response (All Success)
```json
{
  "received": true,
  "timestamp": "2024-01-15T10:30:45",
  "type": "Last_Package",
  "owner": "f4d_test",
  "hostname": "f4d_test",
  "mac_address": "aaaaaaaaaaaa",
  "updated_llas": [
    "fd002124b00ccf7399b",
    "fd002124b00ccf7399a",
    "fd002124b00ccf7399c"
  ],
  "registered_llas": null,
  "sensors": {
    "fd002124b00ccf7399b": {
      "temperature": 20.5,
      "humidity": 60.0,
      "solar_intensity": 800.0,
      "battery": 3500
    },
    "fd002124b00ccf7399a": {
      "temperature": 21.0,
      "humidity": 61.0,
      "solar_intensity": 810.0,
      "battery": 3550
    },
    "fd002124b00ccf7399c": {
      "temperature": 22.0,
      "humidity": 62.0,
      "solar_intensity": 820.0,
      "battery": 3600
    }
  },
  "errors": null
}
```

#### Response (Partial Success - Some Failed)
```json
{
  "received": true,
  "timestamp": "2024-01-15T10:30:45",
  "type": "Last_Package",
  "owner": "f4d_test",
  "hostname": "f4d_test",
  "mac_address": "aaaaaaaaaaaa",
  "updated_llas": [
    "fd002124b00ccf7399b",
    "fd002124b00ccf7399a"
  ],
  "registered_llas": null,
  "sensors": {
    "fd002124b00ccf7399b": {
      "temperature": 20.5,
      "humidity": 60.0,
      "solar_intensity": 800.0,
      "battery": 3500
    },
    "fd002124b00ccf7399a": {
      "temperature": 21.0,
      "humidity": 61.0,
      "solar_intensity": 810.0,
      "battery": 3550
    }
  },
  "errors": [
    "Failed to update fd002124b00ccf7399c: Sensor not found"
  ]
}
```

### 2.5 Last_Package Message - Mixed (Updated + Registered)

#### Request Payload
```python
payload = {
    "owner": "f4d_test",
    "mac_address": "aaaaaaaaaaaa",
    "type": "Last_Package",
    "sensors": {
        "fd002124b00ccf7399b": {  # Existing sensor
            "temperature": 20.5,
            "humidity": 60.0,
            "solar_intensity": 800.0,
            "battery": 3500
        },
        "fd002124b00ccf7399x": {  # New sensor
            "temperature": 19.5,
            "humidity": 59.0,
            "solar_intensity": 790.0,
            "battery": 3400
        }
    }
}
```

#### Response
```json
{
  "received": true,
  "timestamp": "2024-01-15T10:30:45",
  "type": "Last_Package",
  "owner": "f4d_test",
  "hostname": "f4d_test",
  "mac_address": "aaaaaaaaaaaa",
  "updated_llas": ["fd002124b00ccf7399b"],
  "registered_llas": ["fd002124b00ccf7399x"],
  "sensors": {
    "fd002124b00ccf7399b": {
      "temperature": 20.5,
      "humidity": 60.0,
      "solar_intensity": 800.0,
      "battery": 3500
    },
    "fd002124b00ccf7399x": {
      "temperature": 19.5,
      "humidity": 59.0,
      "solar_intensity": 790.0,
      "battery": 3400
    }
  },
  "errors": null
}
```

### 2.6 Invalid JSON Payload

#### Request Payload (Invalid JSON)
```python
# Sending invalid JSON string
await websocket.send("This is not valid JSON")
```

#### Response
```json
{
  "received": false,
  "timestamp": "2024-01-15T10:30:45",
  "error": "Invalid JSON format"
}
```

---

## 3. GET Endpoints - Metadata Queries

### 3.1 Get Sensor Metadata by LLA

#### Endpoint
```
GET /GCP-FS/metadata/active?owner={owner}&mac_address={mac}&lla={lla}
```

#### Request - Using owner Parameter
```python
import requests

url = "http://localhost:8000/GCP-FS/metadata/active"
params = {
    "owner": "f4d_test",
    "mac_address": "aaaaaaaaaaaa",
    "lla": "fd002124b00ccf7399b"
}
response = requests.get(url, params=params)
print(response.json())
```

#### Response (Success)
```json
{
  "success": true,
  "project": "iucc-f4d",
  "dataset": "f4d_test",
  "table": "aaaaaaaaaaaa_metadata",
  "full_table": "iucc-f4d.f4d_test.aaaaaaaaaaaa_metadata",
  "count": 1,
  "data": [
    {
      "Owner": "f4d_test",
      "Mac_Address": "aaaaaaaaaaaa",
      "Exp_ID": 1,
      "Exp_Name": "Image_V2",
      "Active_Exp": true,
      "LLA": "fd002124b00ccf7399b",
      "Label": "Sensor A1",
      "Location": "Field 1",
      "Coordinates_X": 1.5,
      "Coordinates_Y": 2.3,
      "Coordinates_Z": 0.5,
      "Frequency": 433.92,
      "RFID": "RF123456",
      "Last_Seen": "2024-01-15T10:30:45",
      "created_at": "2024-01-10T08:00:00",
      "updated_at": "2024-01-15T10:30:45"
    }
  ]
}
```

#### Request - Using hostname Parameter (Backward Compatibility)
```python
params = {
    "hostname": "f4d_test",  # Using hostname instead of owner
    "mac_address": "aaaaaaaaaaaa",
    "lla": "fd002124b00ccf7399b"
}
response = requests.get(url, params=params)
```

#### Response (Same as above)

#### Request - Missing owner/hostname
```python
params = {
    "mac_address": "aaaaaaaaaaaa",
    "lla": "fd002124b00ccf7399b"
    # Missing owner/hostname
}
response = requests.get(url, params=params)
```

#### Response (Error - 422)
```json
{
  "detail": "Either 'owner' or 'hostname' parameter is required"
}
```

#### Request - Sensor Not Found
```python
params = {
    "owner": "f4d_test",
    "mac_address": "aaaaaaaaaaaa",
    "lla": "nonexistent_lla"
}
response = requests.get(url, params=params)
```

#### Response (Error - 404)
```json
{
  "detail": "Metadata not found for LLA: nonexistent_lla"
}
```

#### Request - Owner Mismatch
```python
params = {
    "owner": "wrong_owner",
    "mac_address": "aaaaaaaaaaaa",
    "lla": "fd002124b00ccf7399b"
}
response = requests.get(url, params=params)
```

#### Response (Error - 400)
```json
{
  "detail": "Owner mismatch: Expected 'f4d_test', got 'wrong_owner'"
}
```

#### Request - MAC Address Mismatch
```python
params = {
    "owner": "f4d_test",
    "mac_address": "wrong_mac",
    "lla": "fd002124b00ccf7399b"
}
response = requests.get(url, params=params)
```

#### Response (Error - 400)
```json
{
  "detail": "MAC address mismatch: Expected 'aaaaaaaaaaaa', got 'wrong_mac'"
}
```

### 3.2 Get All Sensors Metadata

#### Endpoint
```
GET /GCP-FS/metadata/sensors?owner={owner}&mac_address={mac}&exp_name={exp_name}
```

#### Request - All Sensors
```python
url = "http://localhost:8000/GCP-FS/metadata/sensors"
params = {
    "owner": "Icore_Pi",
    "mac_address": "2ccf6730ab5f"
}
response = requests.get(url, params=params)
print(response.json())
```

#### Response (Success)
```json
{
  "success": true,
  "project": "iucc-f4d",
  "dataset": "Icore_Pi",
  "table": "2ccf6730ab5f_metadata",
  "full_table": "iucc-f4d.Icore_Pi.2ccf6730ab5f_metadata",
  "count": 5,
  "data": [
    {
      "Owner": "Icore_Pi",
      "Mac_Address": "2ccf6730ab5f",
      "LLA": "fd002124b00ccf7399b",
      "Exp_Name": "Image_V2",
      "Active_Exp": true,
      "Label": "Sensor 1",
      "Location": "Field A",
      "Exp_ID": 1
    },
    {
      "Owner": "Icore_Pi",
      "Mac_Address": "2ccf6730ab5f",
      "LLA": "fd002124b00ccf7399a",
      "Exp_Name": "Image_V2",
      "Active_Exp": true,
      "Label": "Sensor 2",
      "Location": "Field B",
      "Exp_ID": 1
    },
    {
      "Owner": "Icore_Pi",
      "Mac_Address": "2ccf6730ab5f",
      "LLA": "fd002124b00ccf7399c",
      "Exp_Name": "Test_Experiment",
      "Active_Exp": false,
      "Label": "Sensor 3",
      "Location": "Field C",
      "Exp_ID": 2
    }
  ]
}
```

#### Request - Filter by Experiment Name
```python
params = {
    "owner": "Icore_Pi",
    "mac_address": "2ccf6730ab5f",
    "exp_name": "Image_V2"  # Optional filter
}
response = requests.get(url, params=params)
```

#### Response (Filtered)
```json
{
  "success": true,
  "project": "iucc-f4d",
  "dataset": "Icore_Pi",
  "table": "2ccf6730ab5f_metadata",
  "full_table": "iucc-f4d.Icore_Pi.2ccf6730ab5f_metadata",
  "count": 2,
  "data": [
    {
      "Owner": "Icore_Pi",
      "Mac_Address": "2ccf6730ab5f",
      "LLA": "fd002124b00ccf7399b",
      "Exp_Name": "Image_V2",
      "Active_Exp": true,
      "Label": "Sensor 1",
      "Location": "Field A",
      "Exp_ID": 1
    },
    {
      "Owner": "Icore_Pi",
      "Mac_Address": "2ccf6730ab5f",
      "LLA": "fd002124b00ccf7399a",
      "Exp_Name": "Image_V2",
      "Active_Exp": true,
      "Label": "Sensor 2",
      "Location": "Field B",
      "Exp_ID": 1
    }
  ]
}
```

#### Request - No Sensors Found
```python
params = {
    "owner": "Icore_Pi",
    "mac_address": "nonexistent_mac"
}
response = requests.get(url, params=params)
```

#### Response (Empty Result)
```json
{
  "success": true,
  "project": "iucc-f4d",
  "dataset": "Icore_Pi",
  "table": "nonexistent_mac_metadata",
  "full_table": "iucc-f4d.Icore_Pi.nonexistent_mac_metadata",
  "count": 0,
  "data": []
}
```

### 3.3 Get Experiment Names with Statistics

#### Endpoint
```
GET /GCP-FS/metadata/experiments?owner={owner}&mac_address={mac}
```

#### Request
```python
url = "http://localhost:8000/GCP-FS/metadata/experiments"
params = {
    "owner": "Icore_Pi",
    "mac_address": "2ccf6730ab5f"
}
response = requests.get(url, params=params)
print(response.json())
```

#### Response (Success)
```json
{
  "success": true,
  "project": "iucc-f4d",
  "dataset": "Icore_Pi",
  "table": "2ccf6730ab5f_metadata",
  "full_table": "iucc-f4d.Icore_Pi.2ccf6730ab5f_metadata",
  "count": 3,
  "experiments": [
    {
      "exp_name": "Image_V2",
      "total_sensors": 5,
      "active_count": 3,
      "inactive_count": 2
    },
    {
      "exp_name": "Test_Experiment",
      "total_sensors": 2,
      "active_count": 1,
      "inactive_count": 1
    },
    {
      "exp_name": "",
      "total_sensors": 1,
      "active_count": 0,
      "inactive_count": 1
    }
  ]
}
```

#### Request - No Experiments Found
```python
params = {
    "owner": "Icore_Pi",
    "mac_address": "nonexistent_mac"
}
response = requests.get(url, params=params)
```

#### Response (Empty Result)
```json
{
  "success": true,
  "project": "iucc-f4d",
  "dataset": "Icore_Pi",
  "table": "nonexistent_mac_metadata",
  "full_table": "iucc-f4d.Icore_Pi.nonexistent_mac_metadata",
  "count": 0,
  "experiments": []
}
```

### 3.4 Resolve Permissions

#### Endpoint
```
GET /GCP-FS/permissions/resolve?email={email}
```

#### Request
```python
url = "http://localhost:8000/GCP-FS/permissions/resolve"
params = {
    "email": "user@mail.com"
}
response = requests.get(url, params=params)
print(response.json())
```

#### Response (Success - Multiple Owners)
```json
{
  "success": true,
  "email": "user@mail.com",
  "owners": [
    {
      "owner": "Icore_Pi",
      "mac_addresses": ["2ccf6730ab5f"]
    },
    {
      "owner": "developerroom",
      "mac_addresses": ["2ccf6730ab8c", "d83adde26159"]
    },
    {
      "owner": "menachem_moshelion",
      "mac_addresses": ["2ccf6730ab7a", "d83adde2608f", "d83adde261b0"]
    }
  ]
}
```

#### Response (Success - Single Owner, Single MAC)
```json
{
  "success": true,
  "email": "user@mail.com",
  "owners": [
    {
      "owner": "f4d_test",
      "mac_addresses": ["aaaaaaaaaaaa"]
    }
  ]
}
```

#### Request - No Permissions Found
```python
params = {
    "email": "noaccess@mail.com"
}
response = requests.get(url, params=params)
```

#### Response (Error - 404)
```json
{
  "detail": "No permissions found for this email"
}
```

#### Request - Invalid Email Format
```python
params = {
    "email": "invalid-email"
}
response = requests.get(url, params=params)
```

#### Response (Error - 400 or 500)
```json
{
  "detail": "Invalid email format or permissions service error"
}
```

---

## 4. POST Endpoints - Sensor Management

### 4.1 Register Sensor

#### Endpoint
```
POST /FS/sensor/register
```

#### Request - Basic Registration
```python
import requests

url = "http://localhost:8000/FS/sensor/register"
payload = {
    "hostname": "f4d_test",
    "mac_address": "aaaaaaaaaaaa",
    "lla": "fd002124b00ccf7399b"
}
response = requests.post(url, json=payload)
print(response.json())
```

#### Response (Success)
```json
{
  "success": true,
  "status": "created",
  "message": "Created new sensor document for fd002124b00ccf7399b"
}
```

#### Request - Sensor Already Exists
```python
# Trying to register the same sensor again
payload = {
    "hostname": "f4d_test",
    "mac_address": "aaaaaaaaaaaa",
    "lla": "fd002124b00ccf7399b"  # Already registered
}
response = requests.post(url, json=payload)
```

#### Response (Error - 400)
```json
{
  "success": false,
  "status": "error",
  "message": "Sensor with LLA 'fd002124b00ccf7399b' already exists. Use update endpoint instead."
}
```

#### Request - Missing Fields
```python
payload = {
    "hostname": "f4d_test"
    # Missing mac_address and lla
}
response = requests.post(url, json=payload)
```

#### Response (Error - 422 Validation Error)
```json
{
  "detail": [
    {
      "loc": ["body", "mac_address"],
      "msg": "field required",
      "type": "value_error.missing"
    },
    {
      "loc": ["body", "lla"],
      "msg": "field required",
      "type": "value_error.missing"
    }
  ]
}
```

### 4.2 Update Sensor Last Seen

#### Endpoint
```
POST /FS/sensor/update
```

#### Request
```python
url = "http://localhost:8000/FS/sensor/update"
payload = {
    "hostname": "f4d_test",
    "mac_address": "aaaaaaaaaaaa",
    "lla": "fd002124b00ccf7399b"
}
response = requests.post(url, json=payload)
print(response.json())
```

#### Response (Success)
```json
{
  "success": true,
  "status": "updated",
  "message": "Updated last_seen timestamp for sensor fd002124b00ccf7399b"
}
```

#### Request - Sensor Not Found
```python
payload = {
    "hostname": "f4d_test",
    "mac_address": "aaaaaaaaaaaa",
    "lla": "nonexistent_lla"
}
response = requests.post(url, json=payload)
```

#### Response (Error - 404)
```json
{
  "success": false,
  "status": "error",
  "message": "Sensor with LLA 'nonexistent_lla' not found. Use register endpoint first."
}
```

### 4.3 Update Sensor Metadata - Single Sensor

#### Endpoint
```
POST /FS/sensor/update-metadata
```

#### Request - Update Experiment Name and Label
```python
url = "http://localhost:8000/FS/sensor/update-metadata"
payload = {
    "owner": "f4d_test",
    "mac_address": "aaaaaaaaaaaa",
    "lla": "fd002124b00ccf7399b",
    "updates": {
        "exp_name": "New Experiment Name",
        "label": "Sensor A1"
    }
}
response = requests.post(url, json=payload)
print(response.json())
```

#### Response (Success)
```json
{
  "success": true,
  "status": "updated",
  "message": "Successfully updated sensor metadata for fd002124b00ccf7399b",
  "updated_fields": ["exp_name", "label", "updated_at"]
}
```

#### Request - Update Multiple Fields
```python
payload = {
    "owner": "f4d_test",
    "mac_address": "aaaaaaaaaaaa",
    "lla": "fd002124b00ccf7399b",
    "updates": {
        "exp_name": "Image_V2",
        "exp_location": "Greenhouse A",
        "label": "Sensor A1",
        "location": "Field 1, Row 2",
        "coordinates": {
            "x": 1.5,
            "y": 2.3,
            "z": 0.5
        }
    }
}
response = requests.post(url, json=payload)
```

#### Response (Success)
```json
{
  "success": true,
  "status": "updated",
  "message": "Successfully updated sensor metadata for fd002124b00ccf7399b",
  "updated_fields": [
    "exp_name",
    "exp_location",
    "label",
    "location",
    "coordinates",
    "updated_at"
  ]
}
```

#### Request - Update Coordinates (Set to null)
```python
payload = {
    "owner": "f4d_test",
    "mac_address": "aaaaaaaaaaaa",
    "lla": "fd002124b00ccf7399b",
    "updates": {
        "coordinates": {
            "x": null,
            "y": null,
            "z": null
        }
    }
}
response = requests.post(url, json=payload)
```

#### Response (Success)
```json
{
  "success": true,
  "status": "updated",
  "message": "Successfully updated sensor metadata for fd002124b00ccf7399b",
  "updated_fields": ["coordinates", "updated_at"]
}
```

#### Request - Update Boolean Fields
```python
payload = {
    "owner": "f4d_test",
    "mac_address": "aaaaaaaaaaaa",
    "lla": "fd002124b00ccf7399b",
    "updates": {
        "is_active": true,
        "active_exp": false,
        "is_valid": true
    }
}
response = requests.post(url, json=payload)
```

#### Response (Success)
```json
{
  "success": true,
  "status": "updated",
  "message": "Successfully updated sensor metadata for fd002124b00ccf7399b",
  "updated_fields": ["is_active", "active_exp", "is_valid", "updated_at"]
}
```

#### Request - Using hostname (Backward Compatibility)
```python
payload = {
    "hostname": "f4d_test",  # Using hostname instead of owner
    "mac_address": "aaaaaaaaaaaa",
    "lla": "fd002124b00ccf7399b",
    "updates": {
        "label": "Updated Label"
    }
}
response = requests.post(url, json=payload)
```

#### Response (Same as above)

#### Request - Sensor Not Found
```python
payload = {
    "owner": "f4d_test",
    "mac_address": "aaaaaaaaaaaa",
    "lla": "nonexistent_lla",
    "updates": {
        "label": "New Label"
    }
}
response = requests.post(url, json=payload)
```

#### Response (Error - 400)
```json
{
  "success": false,
  "status": "error",
  "message": "Sensor with LLA 'nonexistent_lla' not found"
}
```

#### Request - Missing Updates Field
```python
payload = {
    "owner": "f4d_test",
    "mac_address": "aaaaaaaaaaaa",
    "lla": "fd002124b00ccf7399b"
    # Missing updates field
}
response = requests.post(url, json=payload)
```

#### Response (Error - 400)
```json
{
  "detail": "For single sensor update, 'lla' and 'updates' are required. For batch update, use 'sensors' array."
}
```

### 4.4 Update Sensor Metadata - Batch Update

#### Request - Batch Update (Multiple Sensors)
```python
url = "http://localhost:8000/FS/sensor/update-metadata"
payload = {
    "sensors": [
        {
            "lla": "fd002124b00ccf7399b",
            "hostname": "f4d_test",
            "mac_address": "aaaaaaaaaaaa",
            "updates": {
                "label": "Sensor 1",
                "exp_name": "Experiment A"
            }
        },
        {
            "lla": "fd002124b00ccf7399a",
            "hostname": "f4d_test",
            "mac_address": "aaaaaaaaaaaa",
            "updates": {
                "label": "Sensor 2",
                "location": "Field 2"
            }
        },
        {
            "lla": "fd002124b00ccf7399c",
            "hostname": "f4d_test",
            "mac_address": "aaaaaaaaaaaa",
            "updates": {
                "label": "Sensor 3",
                "exp_name": "Experiment B",
                "coordinates": {
                    "x": 3.0,
                    "y": 4.0,
                    "z": 1.0
                }
            }
        }
    ]
}
response = requests.post(url, json=payload)
print(response.json())
```

#### Response (All Success)
```json
{
  "success": true,
  "status": "updated",
  "message": "Successfully updated 3 sensor(s)",
  "updated_llas": [
    "fd002124b00ccf7399b",
    "fd002124b00ccf7399a",
    "fd002124b00ccf7399c"
  ],
  "failed_llas": null,
  "total_operations": 3
}
```

#### Response (Partial Success - Some Failed)
```json
{
  "success": true,
  "status": "updated",
  "message": "Successfully updated 2 sensor(s)",
  "updated_llas": [
    "fd002124b00ccf7399b",
    "fd002124b00ccf7399a"
  ],
  "failed_llas": {
    "fd002124b00ccf7399c": "Sensor with LLA 'fd002124b00ccf7399c' not found"
  },
  "total_operations": 3
}
```

#### Request - Large Batch (500+ Sensors)
```python
# API automatically splits into multiple batches if > 500 operations
sensors = []
for i in range(600):  # 600 sensors
    sensors.append({
        "lla": f"fd002124b00ccf{i:04d}",
        "hostname": "f4d_test",
        "mac_address": "aaaaaaaaaaaa",
        "updates": {
            "label": f"Sensor {i}"
        }
    })

payload = {
    "sensors": sensors
}
response = requests.post(url, json=payload)
```

#### Response (Success - Auto-split into batches)
```json
{
  "success": true,
  "status": "updated",
  "message": "Successfully updated 600 sensor(s)",
  "updated_llas": [
    "fd002124b00000",
    "fd002124b00001",
    ...
  ],
  "failed_llas": null,
  "total_operations": 600
}
```

#### Request - Empty Sensors Array
```python
payload = {
    "sensors": []
}
response = requests.post(url, json=payload)
```

#### Response (Error - 400)
```json
{
  "detail": "Sensors array cannot be empty"
}
```

#### Request - Invalid Sensor in Batch
```python
payload = {
    "sensors": [
        {
            "lla": "fd002124b00ccf7399b",
            "hostname": "f4d_test",
            "mac_address": "aaaaaaaaaaaa",
            "updates": {
                "label": "Sensor 1"
            }
        },
        {
            "lla": "fd002124b00ccf7399a",
            # Missing hostname and mac_address
            "updates": {
                "label": "Sensor 2"
            }
        }
    ]
}
response = requests.post(url, json=payload)
```

#### Response (Partial Success - Invalid Sensor Failed)
```json
{
  "success": true,
  "status": "updated",
  "message": "Successfully updated 1 sensor(s)",
  "updated_llas": ["fd002124b00ccf7399b"],
  "failed_llas": {
    "fd002124b00ccf7399a": "Missing required fields: hostname/owner, mac_address"
  },
  "total_operations": 2
}
```

---

## Quick Reference

### Endpoint Summary

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/health` | Health check |
| WebSocket | `/ws/ping` | Real-time sensor communication |
| GET | `/GCP-FS/metadata/active` | Get sensor metadata by LLA |
| GET | `/GCP-FS/metadata/sensors` | Get all sensors metadata |
| GET | `/GCP-FS/metadata/experiments` | Get experiment names with stats |
| GET | `/GCP-FS/permissions/resolve` | Resolve user permissions |
| POST | `/FS/sensor/register` | Register new sensor |
| POST | `/FS/sensor/update` | Update sensor last_seen |
| POST | `/FS/sensor/update-metadata` | Update sensor metadata (single/batch) |

### Required Python Packages
```bash
pip install requests websockets
```

### Common HTTP Status Codes

| Status | Meaning |
|--------|---------|
| 200 | Success |
| 400 | Bad Request (validation error, sensor not found, etc.) |
| 404 | Not Found (sensor/document doesn't exist) |
| 422 | Validation Error (missing required parameters) |
| 500 | Server Error |
| 502/503 | Service Unavailable (upstream service down) |

---

## Support

For questions or issues, refer to the main [README.md](README.md) or contact the backend team.
