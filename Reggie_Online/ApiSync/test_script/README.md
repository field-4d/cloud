# Test Scripts for ApiSync

This folder contains test scripts to verify the ApiSync FastAPI endpoints are working correctly.

## Prerequisites

Before running the tests, make sure:
1. The FastAPI server is running (`python -m uvicorn src.main:app --reload` or `python src/main.py`)
2. The server is accessible at `http://localhost:8000` (default port)

---

## Test Files

### 1. `1.test_websocket.py`

**Type:** Python Script  
**Purpose:** Tests the WebSocket ping endpoint using the Python `websockets` library.

**What it tests:**
- **WebSocket /ws/ping**: Connects to the WebSocket endpoint, sends payloads, and receives responses
  - Sends 5 test payloads sequentially
  - Displays each response received

**Dependencies:**
- Requires `websockets` library: `pip install websockets`

**How to run:**
```bash
python test_script/1.test_websocket.py
```

**Test Payloads:**
The script sends 5 different payloads:
```json
{
  "hostname": "Device-1",
  "mac_address": "d83adde2608f",
  "type": "Ping",
  "LLA": "test-lla-value-1"
}
```

**Features:**
- Sends multiple test payloads automatically
- Uses async/await for clean asynchronous WebSocket handling
- Simple and lightweight implementation
- Easy to modify payload for different test scenarios

---

### 2. `2.test_bigquery.py`

**Type:** Python Script  
**Purpose:** Tests the BigQuery metadata endpoint using the `requests` library.

**What it tests:**
- **GET /GCP-BQ/metadata**: Queries BigQuery tables using dataset and table parameters
  - Sends HTTP GET request with query parameters
  - Displays query results and metadata
  - Supports pagination with limit and offset

**Dependencies:**
- Requires `requests` and `pandas` libraries: `pip install requests pandas`

**How to run:**
```bash
# Interactive mode (prompts for dataset and table)
python test_script/2.test_bigquery.py

# With command line arguments
python test_script/2.test_bigquery.py --dataset f4d_test --table aaaaaaaaaaaa_metadata --limit 50

# Short form
python test_script/2.test_bigquery.py -d f4d_test -t aaaaaaaaaaaa_metadata -l 50

# Test multiple tables
python test_script/2.test_bigquery.py --multiple
```

**Command Line Options:**
- `--dataset` / `-d`: BigQuery dataset name
- `--table` / `-t`: Table name
- `--limit` / `-l`: Maximum number of rows (default: 100)
- `--offset` / `-o`: Number of rows to skip (default: 0)
- `--multiple` / `-m`: Run multiple test cases

**Example Usage:**
```bash
python test_script/2.test_bigquery.py -d f4d_test -t aaaaaaaaaaaa_metadata
```

**Features:**
- Interactive mode if dataset/table not provided
- **DataFrame output**: Displays query results as a pandas DataFrame (tabular format)
- Automatic CSV export to `output/` folder
- Command line argument support
- Multiple test cases support
- Error handling for connection issues

---

## Expected Output

### 1.test_websocket.py Output:
```
Sending payload 1/5: {'hostname': 'Device-1', 'mac_address': 'd83adde2608f', 'type': 'Ping', 'LLA': 'test-lla-value-1'}
Received: {"received":true,"timestamp":"2024-01-15T10:30:45","payload":{...}}

Sending payload 2/5: {'hostname': 'Device-2', ...}
...
```

### 2.test_bigquery.py Output:
```
=== Testing BigQuery Metadata Endpoint ===
URL: http://localhost:8000/GCP-BQ/metadata
Parameters:
  - Dataset: f4d_test
  - Table: aaaaaaaaaaaa_metadata
  - Limit: 100
  - Offset: 0

Status Code: 200

✓ Success!

Response Summary:
  - Success: True
  - Project: iucc-f4d
  - Dataset: f4d_test
  - Table: aaaaaaaaaaaaa_metadata
  - Count: 50 rows

================================================================================
Data as DataFrame (50 rows, 4 columns):
================================================================================
   hostname  mac_address  type     LLA
0  Device-1  d83adde2608f  Ping  test-1
1  Device-2  a1b2c3d4e5f6  Ping  test-2
...
================================================================================

DataFrame Info:
  - Shape: 50 rows × 4 columns
  - Columns: ['hostname', 'mac_address', 'type', 'LLA']
```

---

## Alternative Testing Methods

### Quick Health Check (curl):
```bash
curl http://localhost:8000/health
```

### Quick Health Check (PowerShell):
```powershell
Invoke-WebRequest -Uri http://localhost:8000/health | Select-Object -Expand Content
```

### Quick BigQuery Test (curl):
```bash
curl "http://localhost:8000/GCP-BQ/metadata?dataset=f4d_test&table=aaaaaaaaaaaa_metadata&limit=10"
```

### Quick BigQuery Test (PowerShell):
```powershell
Invoke-WebRequest -Uri "http://localhost:8000/GCP-BQ/metadata?dataset=f4d_test&table=aaaaaaaaaaaa_metadata&limit=10" | Select-Object -Expand Content
```

### WebSocket Testing (Browser Console):
Open browser console and run:
```javascript
const ws = new WebSocket('ws://localhost:8000/ws/ping');
ws.onopen = () => {
    ws.send(JSON.stringify({
        hostname: "test-device",
        mac_address: "00:11:22:33:44:55",
        type: "Pi",
        LLA: "test-lla-value"
    }));
};
ws.onmessage = (event) => console.log('Received:', event.data);
```

---

## Notes

- Make sure the server is running before executing any test scripts
- The timestamp in the WebSocket response will be in ISO 8601 format without milliseconds (e.g., `2024-01-15T10:30:45`)
- If you modify the server port, update the URLs in the test scripts accordingly

