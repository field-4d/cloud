# Test Scripts for ApiSync

This folder contains test scripts to verify the ApiSync FastAPI endpoints are working correctly.

## Prerequisites

Before running the tests, make sure:
1. The FastAPI server is running (`python -m uvicorn src.main:app --reload --reload-exclude "test_script/**"` or `python src/main.py`)
2. The server is accessible at `http://localhost:8000` (default port)

## Quick Start: Run All Tests

To run all tests at once with a comprehensive report:

```bash
# Run all tests (uses existing Firestore data)
python test_script/run_all_tests.py

# Run all tests starting with empty Firestore database
python test_script/run_all_tests.py --clear-db
```

The test runner will:
- ✅ Check if the server is running
- ✅ Optionally clear Firestore sensors (with confirmation)
- ✅ Run all test scripts in sequence
- ✅ Provide a detailed summary with pass/fail status
- ✅ Show total duration and individual test results

**Note:** The `--clear-db` flag will delete ALL sensor documents from Firestore. Use with caution!

---

## Test Files

### 1. `1.test_websocket.py`

**Type:** Python Script  
**Purpose:** Tests the WebSocket ping endpoint using the Python `websockets` library.

**What it tests:**
- **WebSocket /ws/ping**: Connects to the WebSocket endpoint, sends payloads, and receives responses
  - Sends 9 test payloads sequentially
  - Displays validation results for each payload
  - Tests automatic sensor registration for new sensors
  - Tests timestamp updates for existing sensors

**Dependencies:**
- Requires `websockets` library: `pip install websockets`

**How to run:**
```bash
python test_script/1.test_websocket.py
```

**Test Payloads:**
The script sends 9 different payloads with multiple owners and MAC addresses (matching real permissions API structure):
```json
{
  "owner": "Icore_Pi",
  "mac_address": "2ccf6730ab5f",
  "type": "Ping",
  "LLA": "fd002124b00ccf7399b"
}
```

**Owner/MAC Combinations Tested:**
- `Icore_Pi` / `2ccf6730ab5f` (2 sensors)
- `developerroom` / `2ccf6730ab8c` (1 sensor)
- `developerroom` / `d83adde26159` (1 sensor)
- `menachem_moshelion` / `2ccf6730ab7a` (1 sensor)
- `menachem_moshelion` / `d83adde2608f` (1 sensor)
- `menachem_moshelion` / `d83adde261b0` (1 sensor)
- `yakir` / `d83adde260d1` (1 sensor)
- `f4d_test` / `2ccf6730ab71` (1 sensor)

**Features:**
- Sends multiple test payloads automatically with progress indicators
- Uses async/await for clean asynchronous WebSocket handling
- Detailed output with validation status for each payload
- Tracks successful, valid, invalid, and failed payloads
- Provides summary with validation statistics
- Random delays between payloads to simulate real usage
- Comprehensive error handling for connection issues
- Shows timing information (send/receive duration)

---

### 2. `2.test_update_metadata.py`

**Type:** Python Script  
**Purpose:** Tests the metadata update endpoint using the Python `requests` library.

**What it tests:**
- **POST /FS/sensor/update-metadata**: Updates sensor metadata in Firestore
  - Sends HTTP POST requests with metadata updates
  - Tests updating various fields (exp_name, exp_location, label, location, coordinates)
  - Displays update results and summary

**Dependencies:**
- Requires `requests` library: `pip install requests`

**How to run:**
```bash
python test_script/2.test_update_metadata.py
```

**Test Updates:**
The script updates metadata for 7 sensors with multiple owners and MAC addresses (matching 1.test_websocket.py):
```json
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
}
```

**Owner/MAC Combinations Tested:**
- `Icore_Pi` / `2ccf6730ab5f` (2 sensors)
- `developerroom` / `2ccf6730ab8c` (1 sensor)
- `developerroom` / `d83adde26159` (1 sensor)
- `menachem_moshelion` / `2ccf6730ab7a` (1 sensor)
- `menachem_moshelion` / `d83adde2608f` (1 sensor)
- `menachem_moshelion` / `d83adde261b0` (1 sensor)

**Features:**
- Updates multiple sensors sequentially
- Tests different field combinations
- Shows detailed results for each update
- Provides summary of successful and failed updates
- Error handling for connection issues and API errors
- Random delays between requests to simulate real usage

---

### 3. `3.test_last_package.py`

**Type:** Python Script  
**Purpose:** Tests the WebSocket Last_Package endpoint using the Python `websockets` library.

**What it tests:**
- **WebSocket /ws/ping (Last_Package type)**: Sends Last_Package payloads to update sensor readings
  - Tests both dictionary and array formats for sensors data
  - Sends sensor readings (temperature, humidity, solar_intensity, battery in mV, etc.)
  - Tests extendable fields (additional custom fields)
  - Verifies that last_package is updated in Firestore
  - Verifies that last_seen timestamp is updated

**Dependencies:**
- Requires `websockets` library: `pip install websockets`

**How to run:**
```bash
python test_script/3.test_last_package.py
```

**Test Payloads:**
The script sends 9 different Last_Package payloads with various sensor readings, matching owner/MAC/LLA combinations from 1.test_websocket.py:

**Dictionary Format:**
```json
{
  "type": "Last_Package",
  "owner": "Icore_Pi",
  "mac_address": "2ccf6730ab5f",
  "sensors": {
    "fd002124b00ccf7399b": {
      "temperature": 23.5,
      "humidity": 65.2,
      "solar_intensity": 850.0,
      "battery": 3750  // mV (valid: >2700)
    }
  }
}
```

**Array Format:**
```json
{
  "type": "Last_Package",
  "owner": "Icore_Pi",
  "mac_address": "2ccf6730ab5f",
  "sensors": [
    {
      "LLA": "fd002124b00ccf7399b",
      "temperature": 22.8,
      "humidity": 62.3,
      "solar_intensity": 780.0,
      "battery": 3400  // mV (valid: >2700)
    }
  ]
}
```

**Owner/MAC Combinations Tested:**
- `Icore_Pi` / `2ccf6730ab5f` (2 sensors, including array format test)
- `developerroom` / `2ccf6730ab8c` (1 sensor)
- `developerroom` / `d83adde26159` (1 sensor)
- `menachem_moshelion` / `2ccf6730ab7a` (1 sensor)
- `menachem_moshelion` / `d83adde2608f` (1 sensor)
- `menachem_moshelion` / `d83adde261b0` (1 sensor)
- `yakir` / `d83adde260d1` (1 sensor)
- `f4d_test` / `2ccf6730ab71` (1 sensor)

**Features:**
- Tests both dictionary and array formats for sensors data
- Sends multiple sensors in a single payload
- Tests extendable fields (pressure, wind_speed, soil_moisture, ph_level, etc.)
- Shows detailed output with updated LLAs and package data
- Tracks successful, partially successful, and failed payloads
- Provides summary with statistics (total sensors updated/failed)
- Random delays between payloads to simulate real usage
- Comprehensive error handling for connection issues
- Shows timing information (send/receive duration)
- Displays package data fields for each updated sensor

**Note:** The sensors must exist in Firestore before running this script. You can create them by running `1.test_websocket.py` first, which will auto-register sensors when they ping.

**Note:** Battery values are in millivolts (mV). Valid battery readings are above 2700 mV.

---

### 4. `4.test_batch_last_package.py`

**Type:** Python Script  
**Purpose:** Tests batch updating last_package for multiple sensors via WebSocket Last_Package endpoint.

**What it tests:**
- **WebSocket /ws/ping (Last_Package type)**: Batch updates last_package for multiple sensors
  - Tests batch processing with different batch sizes (5, 10, 15, 20 sensors per batch)
  - Groups sensors by owner/MAC combination before batching
  - Sends sensor readings (temperature, humidity, solar_intensity, battery in mV, etc.)
  - Verifies that last_package is updated in Firestore for all sensors in batch
  - Performance metrics: throughput, batch duration, total duration

**Dependencies:**
- Requires `websockets` library: `pip install websockets`

**How to run:**
```bash
# Test all batch sizes (5, 10, 15, 20) - default behavior
python test_script/4.test_batch_last_package.py

# Test specific batch size
python test_script/4.test_batch_last_package.py --batch-size 10
```

**Test Sensors:**
The script tests 29 sensors with multiple owners and MAC addresses (matching 1.test_websocket.py structure):
- Each sensor includes `owner`, `mac_address`, `lla`, and `package_data`
- Sensors are automatically grouped by owner/MAC before batching
- All sensors in a batch must belong to the same owner/MAC combination

**Owner/MAC Combinations Tested:**
- `Icore_Pi` / `2ccf6730ab5f` (2 sensors + 20 test_lla_* sensors)
- `developerroom` / `2ccf6730ab8c` (1 sensor)
- `developerroom` / `d83adde26159` (1 sensor)
- `menachem_moshelion` / `2ccf6730ab7a` (1 sensor)
- `menachem_moshelion` / `d83adde2608f` (1 sensor)
- `menachem_moshelion` / `d83adde261b0` (1 sensor)
- `yakir` / `d83adde260d1` (1 sensor)
- `f4d_test` / `2ccf6730ab71` (1 sensor)

**Features:**
- **Automatic Ping Step**: Pings all sensors first to ensure they exist in Firestore
- **Batch Grouping**: Automatically groups sensors by owner/MAC before creating batches
- **Multiple Batch Sizes**: Tests performance with different batch sizes (5, 10, 15, 20)
- **Performance Metrics**: Shows throughput (sensors/s), batch duration, total duration
- **Comprehensive Summary**: Displays successful, partially successful, and failed batches
- **Error Handling**: Tracks errors per sensor and per batch
- **Skip Ping Option**: Can skip ping step if sensors already registered

**Example Output:**
```
======================================================================
BATCH LAST_PACKAGE UPDATE TEST (Batch Size: 10)
======================================================================
Testing endpoint: ws://localhost:8000/ws/ping
Total sensors to update: 29
Batch size: 10
Total batches: 3

Grouped sensors by owner/MAC: 8 groups
  Icore_Pi/2ccf6730ab5f: 22 sensors
  developerroom/2ccf6730ab8c: 1 sensors
  developerroom/d83adde26159: 1 sensors
  ...

============================================================
[Batch 1/3] Sending batch update
Sensors in batch: 10
Owner: Icore_Pi, MAC: 2ccf6730ab5f
LLAs: fd002124b00ccf7399b, fd002124b00ccf7399a, ...
============================================================
✅ Success: All 10 sensors processed successfully

======================================================================
SUMMARY
======================================================================
✅ Fully successful batches: 3/3
Total sensors updated: 29
Total sensors processed: 29/29

Performance Metrics:
   Total Duration: 7.75s
   Avg Batch Duration: 1.897s
   Throughput: 3.74 sensors/s
```

**Note:** The script automatically pings all sensors before batch updates to ensure they exist in Firestore. This can be skipped with `skip_ping=True` if sensors are already registered.

**Note:** Battery values are in millivolts (mV). Valid battery readings are above 2700 mV.

---

### 5. `2.test_bigquery.py` (Deprecated)

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

## Test Runner

### `5.test_runner.py` / `test_runner.py` (Comprehensive Test Suite with Edge Cases)

**Type:** Python Script  
**Purpose:** Comprehensive test runner that tests all endpoints with normal cases and edge cases, returning pass/fail status for each test.

**What it tests:**
- **WebSocket Ping Tests:**
  - Normal ping functionality
  - Missing required fields
  - Invalid JSON format
  - Empty payload
  - Wrong data types
  
- **Metadata Update Tests:**
  - Normal metadata update
  - Missing required fields
  - Empty updates dictionary
  - Invalid/non-existent sensor
  - Invalid JSON format
  
- **Last Package Tests:**
  - Normal dictionary format
  - Normal array format
  - Low battery values (< 2700 mV)
  - Missing sensors field
  - Empty sensors dictionary
  - Invalid sensor ID
  - Malformed array (missing LLA)

**Dependencies:**
- Requires `websockets` library: `pip install websockets`
- Requires `requests` library: `pip install requests`

**How to run:**
```bash
python test_script/test_runner.py
```

**Features:**
- Automatic server health check
- Tests both normal functionality and edge cases
- Individual test results with pass/fail status
- Comprehensive summary report
- Exit codes: 0 for all passed, 1 for any failures
- Detailed error messages for failed tests
- Tests connection handling and error responses

**Example Output:**
```
======================================================================
APISYNC COMPREHENSIVE TEST SUITE
======================================================================
Base URL: http://localhost:8000
WebSocket URI: ws://localhost:8000/ws/ping
======================================================================

✅ Server Connection: Server is running (0.123s)
✅ WebSocket Connection: WebSocket connection successful (0.234s)

======================================================================
WEBSOCKET PING TESTS
======================================================================
✅ WebSocket Ping - Normal: Normal ping successful (0.456s)
✅ WebSocket Ping - Missing Fields: Correctly rejected missing fields (0.345s)
✅ WebSocket Ping - Invalid JSON: Correctly rejected invalid JSON (0.234s)
✅ WebSocket Ping - Empty Payload: Correctly rejected empty payload (0.123s)
✅ WebSocket Ping - Wrong Type: Handled wrong type gracefully (0.234s)

======================================================================
METADATA UPDATE TESTS
======================================================================
✅ Metadata Update - Normal: Normal update successful (0.567s)
✅ Metadata Update - Missing Fields: Correctly rejected missing fields (0.234s)
✅ Metadata Update - Empty Updates: Handled empty updates (0.345s)
✅ Metadata Update - Invalid Sensor: Correctly rejected invalid sensor (0.234s)
✅ Metadata Update - Invalid JSON: Correctly rejected invalid JSON (0.123s)

======================================================================
LAST PACKAGE TESTS
======================================================================
✅ Last Package - Normal Dict: Normal dictionary format successful (0.456s)
✅ Last Package - Normal Array: Normal array format successful (0.345s)
✅ Last Package - Low Battery: Handled low battery value (0.234s)
✅ Last Package - Missing Sensors: Handled missing sensors field (0.123s)
✅ Last Package - Empty Sensors: Handled empty sensors (0.234s)
✅ Last Package - Invalid Sensor ID: Correctly handled invalid sensor (0.345s)
✅ Last Package - Malformed Array: Handled malformed array (0.234s)

======================================================================
TEST SUMMARY
======================================================================
Total Tests: 17
✅ Passed: 17
❌ Failed: 0
⏭️  Skipped: 0
⏱️  Total Duration: 5.23s
======================================================================

🎉 ALL TESTS PASSED! 🎉
======================================================================
```

---

### `run_all_tests.py` (Integration Test Runner)

**Type:** Python Script  
**Purpose:** Integration test runner that executes all individual test scripts and provides a summary.

**What it does:**
- Runs all test scripts in sequence (WebSocket, Metadata Update, Last Package)
- Checks if the FastAPI server is running before starting
- Optionally clears Firestore sensors before running tests
- Captures output from each test
- Provides a detailed summary with pass/fail status
- Shows duration for each test

**Dependencies:**
- Requires `requests` library: `pip install requests`
- All test script dependencies (websockets, requests)

**How to run:**
```bash
# Run all tests with existing Firestore data
python test_script/run_all_tests.py

# Run all tests starting with empty Firestore
python test_script/run_all_tests.py --clear-db
```

**Features:**
- Automatic server health check
- Optional Firestore clearing with confirmation prompt
- Sequential test execution
- Comprehensive summary report
- Exit codes: 0 for all passed, 1 for any failures
- Timeout protection (5 minutes per test)

**Note:** This file is referenced in the README but may not exist yet. Use `test_runner.py` for comprehensive testing with edge cases.

---

## Expected Output

### 1.test_websocket.py Output:
```
============================================================
WEBSOCKET PING TEST
============================================================
Testing endpoint: ws://localhost:8000/ws/ping
Total payloads to send: 9

Connecting to ws://localhost:8000/ws/ping...
✅ Connected successfully

============================================================
[1/9] Sending payload
Owner: f4d_test | MAC: aaaaaaaaaaaa
Type: Ping | LLA: fd002124b00ccf7399b
============================================================
Sent in 0.001s | Delay: 0.823s
Received in 0.234s
Validation: ✅ VALID
Message: LLA found in metadata
✅ Success: Payload processed successfully

[2/9] Sending payload
...

============================================================
SUMMARY
============================================================
✅ Successful payloads: 9/9
   - Valid sensors: 7
   - Invalid sensors: 2

   Valid LLAs:
      ✅ fd002124b00ccf7399b
      ✅ fd002124b00ccf7399a
      ...

   Invalid LLAs:
      ⚠️  1234567890: Sensor added
      ⚠️  1234567892: Sensor added

============================================================
Test completed!
============================================================
```

### 2.test_update_metadata.py Output:
```
============================================================
SENSOR METADATA UPDATE TEST
============================================================
Testing endpoint: http://localhost:8000/FS/sensor/update-metadata
Total sensors to update: 4

[1/4] Processing sensor...
============================================================
Updating sensor: fd002124b00ccf7399b
Owner: f4d_test | MAC: aaaaaaaaaaaa
Updates: ['exp_name', 'exp_location', 'label', 'location', 'coordinates']
============================================================
Status Code: 200
✅ Success: Successfully updated sensor metadata for fd002124b00ccf7399b
   Updated fields: exp_name, exp_location, label, location, coordinates, updated_at

[2/4] Processing sensor...
...

============================================================
SUMMARY
============================================================
✅ Successful updates: 4
   - fd002124b00ccf7399b: exp_name, exp_location, label, location, coordinates, updated_at
   - fd002124b00ccf7399a: exp_name, exp_location, label, location, coordinates, updated_at
   ...

❌ Failed updates: 0

============================================================
Test completed!
============================================================
```

### 3.test_bigquery.py Output (Deprecated):
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
  - Project: project_name
  - Dataset: f4d_test
  - Table: aaaaaaaaaaaaa_metadata
  - Count: 50 rows

================================================================================
Data as DataFrame (50 rows, 4 columns):
================================================================================
   owner  mac_address  type     LLA
0  Device-1  d83adde2608f  Ping  test-1
1  Device-2  a1b2c3d4e5f6  Ping  test-2
...
================================================================================

DataFrame Info:
  - Shape: 50 rows × 4 columns
  - Columns: ['owner', 'mac_address', 'type', 'LLA']
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

### Quick Metadata Update Test (curl):
```bash
curl -X POST http://localhost:8000/FS/sensor/update-metadata \
  -H "Content-Type: application/json" \
  -d '{
    "owner": "Icore_Pi",
    "mac_address": "2ccf6730ab5f",
    "lla": "fd002124b00ccf7399b",
    "updates": {
      "exp_name": "Test_Experiment",
      "label": "Test_Label"
    }
  }'
```

### Quick Metadata Update Test (PowerShell):
```powershell
$body = @{
    owner = "Icore_Pi"
    mac_address = "2ccf6730ab5f"
    lla = "fd002124b00ccf7399b"
    updates = @{
        exp_name = "Test_Experiment"
        label = "Test_Label"
    }
} | ConvertTo-Json

Invoke-WebRequest -Uri "http://localhost:8000/FS/sensor/update-metadata" `
  -Method POST `
  -ContentType "application/json" `
  -Body $body | Select-Object -Expand Content
```

### WebSocket Testing (Browser Console):
Open browser console and run:
```javascript
const ws = new WebSocket('ws://localhost:8000/ws/ping');
ws.onopen = () => {
    ws.send(JSON.stringify({
        owner: "test-device",
        mac_address: "00:11:22:33:44:55",
        type: "Pi",
        LLA: "test-lla-value"
    }));
};
ws.onmessage = (event) => console.log('Received:', event.data);
```

### Permissions Resolution Endpoint:
Resolve all owner and MAC address combinations from user email (grouped by owner):
```bash
curl "http://localhost:8000/GCP-FS/permissions/resolve?email=user@mail.com"
```

Example response:
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
      "mac_addresses": ["2ccf6730ab7a", "d83adde2608f", "d83adde261b0", "d83adde26283"]
    }
  ]
}
```

---

## Notes

- Make sure the server is running before executing any test scripts
- The timestamp in the WebSocket response will be in ISO 8601 format without milliseconds (e.g., `2024-01-15T10:30:45`)
- If you modify the server port, update the URLs in the test scripts accordingly

