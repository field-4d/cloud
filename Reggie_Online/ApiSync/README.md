# ApiSync

**Author:** Nir Averbuch  
**Last updated:** 2026-03-29

A FastAPI application with WebSocket support for real-time payload monitoring. Includes a web-based frontend dashboard to visualize received payloads with metadata management capabilities. Fully integrated with Google Cloud Firestore for sensor metadata storage and validation.

## Features

- **REST API Endpoints**: HTTP endpoints for health checks, frontend serving, and sensor management
- **WebSocket Support**: Real-time bidirectional communication with payload broadcasting and automatic sensor registration
- **Firestore Integration**: Complete integration with Google Cloud Firestore for sensor metadata storage and queries
- **Async Operations**: Fully asynchronous Firestore operations for improved server responsiveness and performance
- **Batch Writing**: Efficient batch write operations grouping up to 500 operations per atomic batch for optimal performance
- **Automatic Sensor Registration**: Sensors are automatically registered in Firestore when they send Ping messages
- **Sensor Validation**: Automatic LLA validation against Firestore metadata for each ping
- **Metadata Management**: View and edit sensor metadata with active/inactive experiment separation
- **Owner/MAC Reassignment (when inactive)**: When `active_exp` is false, owner and mac can be updated via PING, Last_Package, POST /FS/sensor/update, and update-metadata
- **Flexible Metadata Updates**: Update any sensor field through the API or frontend interface (supports single and batch updates)
- **Experiment Management UI**: Owner/device/experiment selection context with permission resolution and live device discovery
- **Bulk Metadata Updates**: Update `label`, `location`, `exp_name`, and other metadata for multiple sensors keyed by `LLA`
- **CSV Template Import/Export**: Download the current sensor list as CSV and upload edited CSV rows for batch metadata updates
- **Frontend Dashboard**: Interactive web interface to monitor WebSocket payloads with validation status
- **Connection Management**: Manages multiple WebSocket connections with broadcasting
- **Structured Logging**: Comprehensive logging with timestamps, operation tracking, and performance metrics for all endpoints
- **Duplicate Prevention**: Frontend prevents duplicate sensors by LLA with visual feedback
- **Visual Status Indicators**: Color-coded cards to distinguish active vs inactive experiments
- **Metadata Modal**: Clickable payload cards to view and edit detailed sensor metadata with experiment history

## Project Structure

```
ApiSync/
├── backend/
│   ├── src/
│   │   ├── main.py                       # Main FastAPI application
│   │   └── api/
│   │       ├── __init__.py
│   │       ├── get_endpoints.py          # GET endpoints (health, frontend)
│   │       ├── websocket_endpoints.py    # WebSocket endpoints and payload handling
│   │       ├── firestore_endpoints.py    # Firestore query/update endpoints
│   │       ├── firestore_repository.py   # Firestore operations
│   │       ├── firestore_batch.py        # Batch write utilities
│   │       └── permissions_client.py     # Permissions resolve client
│   ├── auth/
│   │   ├── __init__.py
│   │   └── firestore_config.py           # Firestore configuration and client setup
│   └── requirements.txt                  # Python dependencies
├── frontend/
│   └── index.html                        # Web dashboard interface
├── test_script/
│   ├── README.md                         # Testing documentation
│   ├── 1.test_websocket.py               # Python WebSocket test script
│   ├── 2.test_update_metadata.py         # Metadata update test script
│   ├── 3.test_last_package.py            # Last_Package test script
│   ├── 4.test_batch_last_package.py      # Batch Last_Package test script
│   ├── 5.test_runner.py                  # Test runner script
│   ├── 6.test_new_endpoints.py           # GET metadata/sensors & experiments (deployed API)
│   └── test_runner.py                    # Test runner utility
├── ARCHITECTURE.md                       # System architecture guide
├── FRONTEND_API_GUIDE.md                 # Frontend/API integration notes
├── DEPLOY_GCP.md                         # GCP deployment guide
├── Dockerfile                            # GCP Cloud Run build
└── README.md                             # This file
```

## Installation

1. **Clone or navigate to the project directory**

2. **Install dependencies:**
   ```bash
   pip install -r backend/requirements.txt
   ```

3. **For testing (optional):**
   ```bash
   pip install websockets requests pandas
   ```

4. **Configure Firestore credentials:**
   - Create `auth/.env` file with your GCP credentials (see [Firestore Configuration](#firestore-configuration) section)

## Running the Application

### Start the FastAPI Server

```bash
python -m uvicorn backend.src.main:app --reload --reload-exclude "test_script/**"
```

Or run directly:
```bash
python backend/src/main.py
```

**Note:** The `--reload-exclude "test_script/**"` option prevents uvicorn from watching test script files, avoiding unnecessary server restarts when editing test files.

The server will start on `http://localhost:8000`

### Deployed Backend

- **REST API**: `https://apisync-1000435921680.us-central1.run.app`
- **WebSocket**: `wss://apisync-1000435921680.us-central1.run.app/ws/ping`

### Access Points (Local)

- **Frontend Dashboard**: `http://localhost:8000/`
- **Swagger UI**: `http://localhost:8000/docs`
- **Health Check**: `http://localhost:8000/health`
- **WebSocket Endpoint**: `ws://localhost:8000/ws/ping`
- **Permissions Resolve (Compatibility Alias)**: `GET http://localhost:8000/GCP-FS/permissions/resolve?email=<email>`
- **Permissions Resolve (Canonical)**: `GET http://localhost:8000/api/permissions/resolve?email=<email>`
- **Firestore Metadata (Active Sensor)**: `GET http://localhost:8000/GCP-FS/metadata/active?owner=<owner>&mac_address=<mac>&lla=<lla>`
- **Verified Example Tuple (works together)**: `owner=f4dv2`, `mac_address=d83adde260d1`, `lla=fd002124b001204bd42`
- **All Sensors Metadata**: `GET http://localhost:8000/GCP-FS/metadata/sensors?owner=<owner>&mac_address=<mac>&exp_name=<exp_name>`
- **Last Package (metadata + Firestore last_package)**: `GET http://localhost:8000/GCP-FS/last-package?owner=<owner>&mac_address=<mac>&exp_name=<exp_name>`
- **Experiment Names**: `GET http://localhost:8000/GCP-FS/metadata/experiments?owner=<owner>&mac_address=<mac>`
- **Sensor Registration**: `POST http://localhost:8000/FS/sensor/register`
- **Sensor Update**: `POST http://localhost:8000/FS/sensor/update`
- **Metadata Update**: `POST http://localhost:8000/FS/sensor/update-metadata`

### OpenAPI / Swagger Organization

Swagger UI groups endpoints by FastAPI tags and displays tag sections in the `openapi_tags` order from `backend/src/main.py`.

Current tag groups are intentionally organized for user flow:

1. **system**
   - `GET /health`
   - `GET /`
2. **permissions**
   - `GET /GCP-FS/permissions/resolve`
   - `GET /api/permissions/resolve` (when enabled)
3. **metadata**
   - `GET /GCP-FS/metadata/active`
   - `GET /GCP-FS/metadata/sensors`
   - `GET /GCP-FS/last-package`
   - `GET /GCP-FS/metadata/experiments`
4. **sensors**
   - `POST /FS/sensor/register`
   - `POST /FS/sensor/update`
   - `POST /FS/sensor/update-metadata`

Notes:
- This organization affects documentation presentation only.
- Endpoint paths and runtime behavior remain unchanged.
- Route declaration order can still affect endpoint order within a tag.

## API Endpoints

### GET Endpoints

#### `GET /health`
Health check endpoint.

**Response:**
```json
{
  "status": "ok"
}
```

#### `GET /`
Serves the frontend HTML dashboard.

### Firestore Endpoints

#### `POST /FS/sensor/register`

Register a new sensor in Firestore.

**Request Body:**
```json
{
  "hostname": "f4d_test",
  "mac_address": "aaaaaaaaaaaa",
  "lla": "fd002124b00ccf7399b"
}
```

**Response:**
```json
{
  "success": true,
  "status": "created",
  "message": "Created new sensor document for fd002124b00ccf7399b"
}
```

**Error Response (if sensor already exists):**
```json
{
  "success": false,
  "status": "error",
  "message": "Sensor with LLA 'fd002124b00ccf7399b' already exists. Use update endpoint instead."
}
```

**Behavior:**
- If document EXISTS: Returns error (sensor already registered)
- If document MISSING: Creates new document with base schema

#### `POST /FS/sensor/update`

Update existing sensor's `last_seen` timestamp.

**Request Body:**
```json
{
  "hostname": "f4d_test",
  "mac_address": "aaaaaaaaaaaa",
  "lla": "fd002124b00ccf7399b"
}
```

**Response:**
```json
{
  "success": true,
  "status": "updated",
  "message": "Updated last_seen timestamp for sensor fd002124b00ccf7399b"
}
```

**Error Response (if sensor not found):**
```json
{
  "success": false,
  "status": "error",
  "message": "Sensor with LLA 'fd002124b00ccf7399b' not found. Use register endpoint first."
}
```

**Behavior:**
- If document MISSING: Returns error (sensor not found)
- If document EXISTS:
  - When `active_exp` is True: Validates owner and mac match; returns error on mismatch. Updates `last_seen` and `updated_at`.
  - When `active_exp` is False: Updates `last_seen`, `updated_at`, and optionally `owner` and `mac` (from hostname/mac_address in the request).

#### `POST /FS/sensor/update-metadata`

Update sensor metadata in Firestore with flexible field updates. Supports both single and batch operations.

**Single Sensor Update:**

**Request Body:**
```json
{
  "hostname": "f4d_test",
  "mac_address": "aaaaaaaaaaaa",
  "lla": "fd002124b00ccf7399b",
  "updates": {
    "exp_name": "New Experiment Name",
    "exp_location": "New Location",
    "label": "New Label",
    "location": "New Sensor Location",
    "coordinates": {"x": 1.0, "y": 2.0, "z": 3.0}  // All keys (x, y, z) must be present, can be null
  }
}
```

**Response (Single):**
```json
{
  "success": true,
  "status": "updated",
  "message": "Successfully updated sensor metadata for fd002124b00ccf7399b",
  "updated_fields": ["exp_name", "exp_location", "label", "location", "coordinates", "updated_at"]
}
```

**Batch Update (Multiple Sensors):**

**Request Body:**
```json
{
  "sensors": [
    {
      "lla": "fd002124b00ccf7399b",
      "hostname": "f4d_test",
      "mac_address": "aaaaaaaaaaaa",
      "updates": {
        "label": "Label1",
        "exp_name": "Experiment 1"
      }
    },
    {
      "lla": "fd002124b00ccf7399a",
      "hostname": "f4d_test",
      "mac_address": "aaaaaaaaaaaa",
      "updates": {
        "label": "Label2",
        "location": "Location 2"
      }
    }
  ]
}
```

**Response (Batch):**
```json
{
  "success": true,
  "status": "updated",
  "message": "Successfully updated 2 sensor(s)",
  "updated_llas": ["fd002124b00ccf7399b", "fd002124b00ccf7399a"],
  "failed_llas": null,
  "total_operations": 2
}
```

**Supported Update Fields:**
- `exp_name` - Experiment name
- `exp_location` - Experiment location
- `label` - Sensor label
- `location` - Sensor location
- `coordinates` - Object with `{x, y, z}` keys (all keys must be present, values can be `null`)
- `label_options` - Array of label options
- `rfid` - RFID value
- `frequency` - Frequency value
- `is_active`, `is_valid`, `active_exp` - Boolean flags
- `exp_id` - Experiment ID
- Any other Firestore field (flexible)

**Behavior:**
- **Single Mode**: Provide `hostname`, `mac_address`, `lla`, and `updates` for a single sensor update
- **Batch Mode**: Provide `sensors` array with multiple update objects (up to 500 operations per batch)
- Only the fields provided in the `updates` dict will be modified
- Automatically updates `updated_at` timestamp
- **Owner/MAC validation and update** (conditional on `active_exp`):
  - When `active_exp` is False: owner and mac are updated from hostname/mac_address in the request; no validation
  - When `active_exp` is True (or `"true"`): owner and mac_address must match document; on mismatch, returns 400 with warning
- Batch operations are processed atomically using Firestore batch writes for optimal performance
- Returns list of all fields that were updated (single mode) or list of updated LLAs (batch mode)

#### `GET /GCP-FS/metadata/active`

Query Firestore for sensor metadata by LLA.

**Query Parameters:**
- `owner` (optional, preferred): Owner identifier (e.g., "Icore_Pi", "developerroom", "f4d_test")
- `hostname` (optional, deprecated): Backward compatibility alias for `owner`
- `mac_address` (required): MAC address (e.g., "2ccf6730ab5f", "aaaaaaaaaaaa")
- `lla` (required): LLA value (Firestore document ID)

**Note:** Either `owner` or `hostname` must be provided. If both are provided, `owner` takes precedence.

**Example:**
```
GET /GCP-FS/metadata/active?owner=f4dv2&mac_address=d83adde260d1&lla=fd002124b001204bd42
GET /GCP-FS/metadata/active?hostname=f4d_test&mac_address=aaaaaaaaaaaa&lla=fd002124b00ccf7399b
```

**Success Response:**
```json
{
  "success": true,
  "project": "iucc-f4d",
  "dataset": "f4d_test",
  "table": "aaaaaaaaaaaa_metadata",
  "full_table": "iucc-f4d.f4d_test.aaaaaaaaaaaa_metadata",
  "count": 7,
  "data": [
    {
      "Owner": "f4d_test",
      "Mac_Address": "aaaaaaaaaaaa",
      "Exp_ID": 1,
      "Exp_Name": "Image_V2",
      "Active_Exp": true,
      "LLA": "fd002124b00ccf7399b",
      // ... other metadata fields
    }
  ]
}
```

**Error Responses:**
- **HTTP 422**: Neither `owner` nor `hostname` parameter provided
- **HTTP 400**: Owner or MAC address mismatch
- **HTTP 404**: Sensor document not found for the given LLA
- **HTTP 500**: Firestore error or unexpected server error (includes error type and details)

**Notes:**
- Returns metadata for the specified LLA (document ID in Firestore)
- Validates that owner and MAC address match the document
- Returns all metadata (both active and inactive) - filtering by `Active_Exp` is done in frontend
- Response format is compatible with the frontend
- Supports both `owner` and `hostname` parameters for backward compatibility

#### `GET /GCP-FS/metadata/sensors`

Get all sensors metadata filtered by owner and MAC address, with optional experiment name filter.

**Query Parameters:**
- `owner` (required): Owner identifier (e.g., "Icore_Pi", "developerroom")
- `mac_address` (required): MAC address (e.g., "2ccf6730ab5f")
- `exp_name` (optional): Filter by exact experiment name match

**Example:**
```
GET /GCP-FS/metadata/sensors?owner=Icore_Pi&mac_address=2ccf6730ab5f
GET /GCP-FS/metadata/sensors?owner=Icore_Pi&mac_address=2ccf6730ab5f&exp_name=Image_V2
```

**Success Response:**
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
      // ... other metadata fields
    }
  ]
}
```

Each row in `data` includes **`Last_Package`** (object from Firestore `last_package`, or `{}` if unset).

#### `GET /GCP-FS/last-package`

Same query and response envelope as **`GET /GCP-FS/metadata/sensors`**: returns all matching sensor documents for the owner and MAC, with optional exact **`exp_name`** filter. Each item in `data` includes full mapped metadata plus **`Last_Package`** (the stored last telemetry/package payload from Firestore).

**Query Parameters:**
- `owner` (required): Owner identifier (e.g., "Icore_Pi", "developerroom")
- `mac_address` (required): MAC address (e.g., "2ccf6730ab5f")
- `exp_name` (optional): Filter by exact experiment name match

**Example:**
```
GET /GCP-FS/last-package?owner=Icore_Pi&mac_address=2ccf6730ab5f
GET /GCP-FS/last-package?owner=Icore_Pi&mac_address=2ccf6730ab5f&exp_name=Image_V2
```

**Success Response:** Same structure as `/GCP-FS/metadata/sensors` (`success`, `project`, `dataset`, `table`, `full_table`, `count`, `data`). Each element of `data` includes **`Last_Package`** (object or `{}`).

#### `GET /GCP-FS/metadata/experiments`

Get all experiment names with statistics (total sensors, active count, inactive count) for a given owner and MAC address.

**Query Parameters:**
- `owner` (required): Owner identifier (e.g., "Icore_Pi", "developerroom")
- `mac_address` (required): MAC address (e.g., "2ccf6730ab5f")

**Example:**
```
GET /GCP-FS/metadata/experiments?owner=Icore_Pi&mac_address=2ccf6730ab5f
```

**Success Response:**
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

**Notes:**
- Returns all unique experiment names for the given owner/MAC combination
- Includes statistics: total sensors, active count (active_exp == True), inactive count (active_exp == False)
- Empty string `""` represents "Unnamed" experiments
- Useful for filtering experiments by active status in the frontend

#### `GET /api/permissions/resolve` (Canonical)

Resolve all owner and MAC address combinations from user email using internal BigQuery tables.

**Query Parameters:**
- `email` (required): User's email address

**Example:**
```
GET /api/permissions/resolve?email=user@mail.com
```

**Success Response:**
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

**Error Responses:**
- **HTTP 404**: No permissions found for this email
- **HTTP 500**: Invalid response format
- **HTTP 502/503**: BigQuery/service unavailable

**Notes:**
- Groups permissions by owner and collects unique MAC addresses for each owner
- Returns all owner/MAC combinations the user has access to
- Used by frontend to populate owner and MAC address dropdowns for experiment filtering
- Table names are hardcoded internally and are not part of the request contract

#### `GET /GCP-FS/permissions/resolve` (Compatibility Alias)

Backward-compatible alias for legacy clients. This route delegates to the same internal implementation as `/api/permissions/resolve`.

### WebSocket Endpoints

#### `WebSocket /ws/ping`

Accepts WebSocket connections and handles `Ping` payloads with automatic sensor validation. `Last_Package` payloads are still processed and stored in Firestore, while frontend forwarding can be disabled with `LAST_PACKAGE_WS_ENABLED = False` (current default).

**Request Payload (Ping):**
```json
{
  "owner": "<string>",
  "mac_address": "<string>",
  "type": "Ping",
  "LLA": "<string>"
}
```

**Note:** The `hostname` field is also accepted for backward compatibility, but `owner` is preferred.

**Request Payload (Last_Package - Single Sensor):**
```json
{
  "type": "Last_Package",
  "owner": "<string>",
  "mac_address": "<string>",
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

**Request Payload (Last_Package - Multiple Sensors):**
```json
{
  "type": "Last_Package",
  "owner": "<string>",
  "mac_address": "<string>",
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
  }
}
```

**Note:** `owner` and `mac_address` are required for Last_Package payloads. All sensors in the batch must belong to the same owner/MAC combination.

**Current behavior (default):** With `LAST_PACKAGE_WS_ENABLED = False`, `Last_Package` is stored in Firestore and acknowledged only to the sender (`websocket.send_json`), and is **not** broadcast to frontend WebSocket clients.

**Response (Ping):**
```json
{
  "received": true,
  "timestamp": "2026-03-29T12:34:56Z",
  "payload": {
    "owner": "<string>",
    "hostname": "<string>",
    "mac_address": "<string>",
    "type": "<string>",
    "LLA": "<string>",
    "validation": {
      "is_valid": true,
      "message": "LLA found in metadata",
      "error": null
    }
  }
}
```

**Response (Last_Package, current default with forwarding disabled):**
```json
{
  "received": true,
  "disabled": true,
  "stored": true,
  "type": "Last_Package",
  "message": "Stored in Firestore but not forwarded over WebSocket"
}
```

**Example (New Ping payload + response):**
Request:
```json
{
  "owner": "f4d_test",
  "mac_address": "aaaaaaaaaaaa",
  "type": "Ping",
  "LLA": "fd002124b00ccf7399b"
}
```

Broadcast response:
```json
{
  "received": true,
  "timestamp": "2026-03-29T12:40:00Z",
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

**Example (New Last_Package payload + response):**
Request:
```json
{
  "type": "Last_Package",
  "owner": "f4d_test",
  "mac_address": "aaaaaaaaaaaa",
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
  }
}
```

Sender-only response (current default with forwarding disabled):
```json
{
  "received": true,
  "disabled": true,
  "stored": true,
  "type": "Last_Package",
  "message": "Stored in Firestore but not forwarded over WebSocket"
}
```

**Metadata Update (Planned):**

The WebSocket endpoint also supports metadata update messages (planned feature):

**Request Payload:**
```json
{
  "type": "metadata_update",
  "payload": {
    "hostname": "<string>",
    "mac_address": "<string>",
    "LLA": "<string>",
    "original_data": {...},
    "modified_fields": {
      "Label": "...",
      "Location": "...",
      "Coordinates_X": ...,
      ...
    }
  }
}
```

**Response:**
```json
{
  "status": "received",
  "message": "Metadata update received",
  "timestamp": "2024-01-15T10:30:45Z"
}
```

**Validation Logic:**
- Automatically validates each LLA against Firestore
- Queries Firestore document: `sensors/{LLA}`
- Validates that document exists, owner matches hostname, and MAC matches mac_address
- Returns `is_valid: true` if all validations pass, `false` otherwise

**Automatic Sensor Registration:**
- If validation fails with "LLA not found in metadata" AND `type == "Ping"`:
  - Automatically registers the sensor in Firestore with base schema
  - Sets `is_valid: true` and message: "Sensor added"
  - Triggers blink animation in frontend
- If validation succeeds AND `type == "Ping"`:
  - Automatically updates `last_seen` timestamp in Firestore
  - Maintains existing sensor data

**Owner/MAC Update When Inactive:**
- If validation fails with owner or MAC mismatch AND `type == "Ping"`:
  - When the sensor's `active_exp` is False: Updates `owner` and `mac` in Firestore, then `last_seen`. Sets `is_valid: true` and message: "Owner/MAC updated (experiment inactive)".
  - When `active_exp` is True: Returns validation error; no update.

**Last_Package active_exp behavior:**
- When `active_exp` is True: Validates owner/mac if provided; adds to failed_llas on mismatch.
- When `active_exp` is False: Includes `owner` and `mac` in the update when hostname/mac_address are provided.

**Features:**
- Broadcasts `Ping` payloads to connected clients
- Stores `Last_Package` in Firestore and returns sender-only acknowledge when forwarding is disabled (`LAST_PACKAGE_WS_ENABLED = False`)
- Manages multiple concurrent WebSocket connections
- Automatic cleanup of disconnected clients
- Real-time sensor validation against Firestore
- **Batch Processing**: Last_Package messages with multiple sensors are processed in a single batch operation (up to 500 operations)
- **Async Operations**: All Firestore operations are asynchronous for improved server responsiveness
- Comprehensive logging with operation timestamps and durations

## Frontend Dashboard

The frontend dashboard (`http://localhost:8000/`) provides:

1. **Connection Status**: Visual indicator and Connect/Disconnect buttons
2. **Health Check Component**: Test the `/health` endpoint with visual feedback
3. **Payload Monitor**: Real-time display of recent payloads
   - Configurable maximum payload count from the dashboard
   - Grid layout with clickable cards and duplicate prevention by `LLA`
   - **Filtering Logic**: Shows sensors only if:
     - Validation is `true` (valid sensors found in metadata)
     - OR validation message contains "LLA not found in metadata"
   - **Duplicate Prevention**: Automatically prevents duplicate sensors by LLA
   - **Validation Status**: Visual indicators showing validation results (✓ Valid / ✗ Invalid)
   - **Blink Animation**: Valid sensors blink once when they ping with configurable duration and color
   - **Color Customization**: Color picker to customize blink color for valid sensors
   - **Duration Control**: Number input to control blink duration (0.5s to 5s, default: 1.5s)
   - Clear Payloads button to reset the display
   - Automatic updates when payloads are received

4. **Experiment Management**: Stable owner/device selection and experiment browsing
   - **Selection Context**: One compact section for email, owner, device, and experiment selection
   - **Resolve Permissions**: Calls `/api/permissions/resolve` to get owner/MAC combinations by email
   - **Owner Selection**: Dropdown shows owners with per-owner device counts
   - **Device Selection**: Dropdown shows MAC addresses for the chosen owner
   - **Live Discovery**: WebSocket payloads can add owner/MAC combinations to the dropdowns without forcing the current selection to refresh on every payload
   - **Experiment Filtering**: Filter experiments by All/Active/Inactive status
   - **Experiment Selection**: Select a named experiment or `All sensors`
   - **Statistics**: Displays total, active, and inactive experiment counts
   - **Stable Context**: Once a user selects owner/device, the experiment-management view stays static unless the user changes it or explicitly refreshes

5. **Bulk Metadata Management**: Multi-sensor editing keyed by `LLA`
   - Available from the `All sensors` view after owner/device selection
   - Checkbox selection for multiple sensors
   - Bulk update fields for `Label`, `Location`, and `Exp Name`
   - Sends one batch request to `/FS/sensor/update-metadata`
   - Keeps experiment lifecycle actions separate from metadata editing

6. **CSV Template Workflow**
   - **Download CSV Template**: Exports the currently loaded sensor list
   - **Upload CSV**: Imports edited rows back into the frontend
   - Uses `LLA` as the required row key
   - Supports batch metadata updates using the existing `/FS/sensor/update-metadata` endpoint

7. **Metadata Modal**: Clickable payload cards to view detailed sensor metadata
   - Click any payload card to open a modal with sensor metadata
   - **Active Experiments**: Shows current state with green theme
     - Displays all active experiments directly
     - Green color scheme throughout (header, sections, borders)
     - "CURRENT STATE" banner with checkmark icon
   - **Inactive Experiments**: Shows editable form with gray theme
     - Editable fields: Experiment Name, Experiment Location, Sensor Location, Label, Coordinates (X, Y, Z)
     - Read-only fields: Experiment ID, LLA, Frequency, RFID, Last Seen
     - Gray color scheme throughout (header, sections, borders)
     - "EDIT METADATA" banner with edit icon
     - "Save Changes" button to update Firestore
     - Automatically reloads metadata after successful save
   - **Metadata Display**: Structured view of experiment and sensor details
     - Experiment information (ID, Name, Location, dates)
     - Sensor details (Label, Location, Coordinates, Frequency, etc.)
     - Status indicators (Active/Inactive, Valid/Invalid)
     - Last Seen timestamps, Label Options, Alerts
   - **Empty States**: Handles "No metadata yet" and "No active experiments"
   - Modal can be closed by clicking outside, pressing ESC, or clicking X button

8. **Visual Status Indicators**: Color-coded payload cards
   - **Active Experiments**: Green gradient background, green left border, green shadow
     - Automatically updates when metadata is fetched
   - **Inactive Experiments**: Gray gradient background, gray left border, gray shadow
     - Status determined when clicking to view metadata
   - **Invalid Sensors**: Red validation section (failed validation)

9. **Error/Debug Dashboard**: Separate section for validation errors
   - Displays validation errors for sensors that don't meet display criteria
   - Shows error message and details from `validation.message` and `validation.error`
   - Displays LLA, MAC Address, and Hostname for each error
   - Keeps last 20 errors (newest on top)
   - Clear Errors button to reset the error list
   - Shows "No errors yet" when empty

### Frontend Features Details

- **Sensor Tracking**: Each sensor is tracked by its LLA value
- **Duplicate Handling**: 
  - If a sensor with the same LLA already exists, a new component is not created
  - If the existing sensor receives a valid ping (`is_valid: true`), it triggers a blink animation
  - Timestamp is updated on the existing sensor component
- **Display Filtering**: 
  - Only displays sensors in "Received Payloads" if validation is valid OR LLA not found in metadata
  - Other errors (document not found, Firestore errors, etc.) appear in "Error/Debug" dashboard
- **Validation Display**: 
  - Green checkmark (✓) and message for valid sensors
  - Red X (✗) and message for invalid sensors
  - Error messages displayed if validation fails
- **Blink Animation**: 
  - Blinks once per valid ping (instead of multiple times)
  - Configurable duration: 0.5s to 5s (default: 1.5s)
  - Configurable color via color picker (default: green `#10b981`)
  - Uses CSS variables for real-time updates
- **Error/Debug Dashboard**:
  - Shows validation errors that don't meet display criteria
  - Displays full error details including message and error field
  - Tracks sensor information (LLA, MAC, Hostname) for debugging
- **Metadata Modal**:
  - Click any payload card to view detailed metadata
  - Automatically filters for `Active_Exp = True` when displaying active experiments
  - Shows experiment history with dropdown for inactive experiments
  - Groups metadata by experiment (`Exp_ID_Exp_Name`)
  - Displays formatted dates and structured information
  - Visual separation between active (green) and inactive (gray) experiments
- **Visual Status Indicators**:
  - Payload cards automatically update with visual styling after metadata fetch
  - Green theme for sensors with active experiments
  - Gray theme for sensors with only inactive/historical experiments
  - Visual distinction through background colors, borders, and shadows
  - Hover effects match the card's status theme
- **Editable Metadata (Implemented)**:
  - Inactive experiment metadata is fully editable through the frontend
  - Editable fields: Experiment Name, Experiment Location, Sensor Location, Label, Coordinates (X, Y, Z)
  - Read-only fields: Experiment ID, LLA, Frequency, RFID, Last Seen
  - "Save Changes" button sends updates to `/FS/sensor/update-metadata` endpoint
  - Updates are saved directly to Firestore
  - Frontend automatically reloads metadata after successful save
- **Bulk Metadata Editing (Implemented)**:
  - `All sensors` view supports multi-select by checkbox
  - Bulk metadata form updates selected sensors by `LLA`
  - CSV import/export works against the current owner/device sensor list
  - Batch updates are submitted through `/FS/sensor/update-metadata`

## Testing

### Using the Test Scripts

See `test_script/README.md` for detailed testing instructions.

#### Quick Test Commands

**Health Check (curl):**
```bash
curl http://localhost:8000/health
```

**WebSocket Test (Python):**
```bash
python test_script/1.test_websocket.py
```

**Firestore Metadata Test:**
```bash
# Test via browser or curl
curl "http://localhost:8000/GCP-FS/metadata/active?owner=f4dv2&mac_address=d83adde260d1&lla=fd002124b001204bd42"
```

**Get All Sensors Metadata:**
```bash
curl "http://localhost:8000/GCP-FS/metadata/sensors?owner=Icore_Pi&mac_address=2ccf6730ab5f"
curl "http://localhost:8000/GCP-FS/metadata/sensors?owner=Icore_Pi&mac_address=2ccf6730ab5f&exp_name=Image_V2"
```

**Get Last Package (metadata + Last_Package per sensor):**
```bash
curl "http://localhost:8000/GCP-FS/last-package?owner=Icore_Pi&mac_address=2ccf6730ab5f"
curl "http://localhost:8000/GCP-FS/last-package?owner=Icore_Pi&mac_address=2ccf6730ab5f&exp_name=Image_V2"
```

**Get Experiment Names:**
```bash
curl "http://localhost:8000/GCP-FS/metadata/experiments?owner=Icore_Pi&mac_address=2ccf6730ab5f"
```

**Resolve Permissions:**
```bash
curl "http://localhost:8000/api/permissions/resolve?email=user@mail.com"
```

### Manual Testing

1. Open `http://localhost:8000/` in your browser
2. Click "Connect" to establish WebSocket connection
3. Click "Check Health" to test the health endpoint
4. Send payloads using test scripts or other WebSocket clients
5. Watch payloads appear in real-time on the dashboard

## Firestore Configuration

### Setup

1. **Create `auth/.env` file** with your Google Cloud credentials:

```env
# Required
GCP_PROJECT_ID=
GCP_CLIENT_EMAIL=
GCP_PRIVATE_KEY=
# Optional but recommended
GCP_AUTH_URI=
GCP_CLIENT_ID=
GCP_PRIVATE_KEY_ID=
GCP_CLIENT_X509_CERT_URL=
```

2. **Private Key Format**: In your `.env` file, replace actual newlines in the private key with `\\n`. The code will automatically convert them back.

### Configuration Options

The code loads credentials from `auth/.env` file only. The `.env` file should contain all required GCP service account credentials.

### Security

**Never commit your `.env` file or credentials to version control!**

The `.gitignore` file already excludes:
- `auth/.env`
- `auth/*.json`
- Credential files

## Development

### Project Structure Details

- **`src/main.py`**: FastAPI app initialization, middleware setup, router registration, and logging configuration
- **`src/api/get_endpoints.py`**: HTTP GET endpoints using FastAPI router
- **`src/api/websocket_endpoints.py`**: WebSocket endpoints, connection manager, and payload processing with validation integration
- **`src/api/firestore_endpoints.py`**: Firestore query and management endpoints (GET, POST)
- **`src/api/firestore_repository.py`**: Firestore metadata operations, validation, registration, and updates (async)
- **`src/api/firestore_batch.py`**: Firestore batch write utilities for efficient bulk operations (up to 500 operations per batch)
- **`auth/firestore_config.py`**: Firestore AsyncClient configuration and credential loading
- **`frontend/index.html`**: Single-page web application with WebSocket client, validation display, and duplicate prevention

### Adding New Endpoints

**Adding GET Endpoints:**
Add routes to `src/api/get_endpoints.py`:
```python
@router.get("/your-endpoint")
async def your_function():
    return {"message": "Hello"}
```

**Adding WebSocket Endpoints:**
Add functions to `src/api/websocket_endpoints.py` and register in `src/main.py`:
```python
app.websocket("/ws/your-endpoint")(your_websocket_function)
```

**Adding Firestore Endpoints:**
Add routes to `src/api/firestore_endpoints.py`:
```python
@router.get("/GCP-FS/your-endpoint")
async def your_firestore_function(hostname: str, mac_address: str, lla: str):
    from .firestore_repository import get_sensor_metadata
    logger.info(f"[ENDPOINT] GET /GCP-FS/your-endpoint | Hostname: {hostname} | MAC: {mac_address} | LLA: {lla}")
    result = await get_sensor_metadata(hostname, mac_address, lla)
    # Your Firestore query logic
    return result
```

**Adding WebSocket Message Types:**
Modify `src/api/websocket_endpoints.py` to handle different message types:
```python
# In websocket_ping function, check payload type
if data.get("type") == "metadata_update":
    # Handle metadata update
    # Return acknowledgment
elif data.get("type") == "ping":
    # Handle ping payload
```

## Dependencies

- **FastAPI**: Web framework for building APIs
- **Uvicorn**: ASGI server for running FastAPI
- **google-cloud-firestore**: Google Cloud Firestore client library
- **python-dotenv**: Environment variable management from .env files
- **Python 3.10+**: Required Python version

See `requirements.txt` for exact versions.

## Logging

The application uses structured logging with timestamps and operation tracking:

- **Log Format**: `YYYY-MM-DD HH:MM:SS | LEVEL | MODULE | [OPERATION] Message | Details`
- **Operation Tracking**: Each operation logs start/end with duration metrics
- **Log Levels**: INFO (operations), DEBUG (detailed), ERROR (failures), WARNING (issues)
- **Log Prefixes**:
  - `[WEBSOCKET_CONNECT]` - Client connections
  - `[WEBSOCKET_DISCONNECT]` - Client disconnections
  - `[WEBSOCKET_PING]` - Payload processing and validation
  - `[BROADCAST]` - Message broadcasting
  - `[VALIDATE_SENSOR_LLA]` - Firestore validation operations
  - `[QUERY_ACTIVE_METADATA]` - Metadata query operations
  - `[REGISTER_SENSOR]` - Sensor registration operations
  - `[UPDATE_SENSOR_LAST_SEEN]` - Sensor timestamp updates
  - `[UPDATE_SENSOR_METADATA]` - Metadata update operations
  - `[BATCH_UPDATE_SENSOR_METADATA]` - Batch metadata update operations
  - `[FIRESTORE_BATCH]` - Batch write operations and commits
  - `[ENDPOINT]` - All endpoint calls (GET, POST, WebSocket)

Example log output:
```
2025-12-28 13:22:40 | INFO     | src.api.get_endpoints | [ENDPOINT] GET /health
2025-12-28 13:22:45 | INFO     | src.api.websocket_endpoints | [ENDPOINT] WebSocket /ws/ping | Connection established
2025-12-28 13:22:46 | INFO     | src.api.websocket_endpoints | [WEBSOCKET_PING] Payload received | Type: Ping | Hostname: f4d_test | MAC: aaaaaaaaaaaa | LLA: fd002124b0021f9fecc | Receive time: 0.001s
2025-12-28 13:22:46 | INFO     | src.api.firestore_repository | [VALIDATE_SENSOR_LLA] Starting validation | Hostname: f4d_test | MAC: aaaaaaaaaaaa | LLA: fd002124b0021f9fecc
2025-12-28 13:22:46 | INFO     | src.api.firestore_repository | [REGISTER_SENSOR] Document created | LLA: fd002124b0021f9fecc | Duration: 0.234s
2025-12-28 13:22:46 | INFO     | src.api.websocket_endpoints | [WEBSOCKET_PING] New sensor registered | LLA: fd002124b0021f9fecc | Duration: 0.235s
2025-12-28 13:22:50 | INFO     | src.api.firestore_endpoints | [ENDPOINT] POST /FS/sensor/update-metadata | Hostname: f4d_test | MAC: aaaaaaaaaaaa | LLA: fd002124b0021f9fecc | Updates: ['exp_name', 'label', 'location']
```

## System Architecture

> **📖 For detailed architecture documentation, see [ARCHITECTURE.md](ARCHITECTURE.md)**

### System Architecture Scheme

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────┐         ┌──────────────┐                      │
│  │  WebSocket   │         │   HTTP GET   │                      │
│  │   Client     │         │   Requests   │                      │
│  └──────┬───────┘         └──────┬───────┘                      │
│         │                        │                               │
└─────────┼────────────────────────┼───────────────────────────────┘
          │                        │
          │                        │
┌─────────▼────────────────────────▼───────────────────────────────┐
│                    FASTAPI SERVER (Port 8000)                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  CORS Middleware (Allows cross-origin requests)          │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Router: get_endpoints.py                                │  │
│  │  ├── GET /health                                          │  │
│  │  └── GET /  (Frontend HTML)                               │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Router: firestore_endpoints.py                          │  │
│  │  └── GET /GCP-FS/metadata/active                        │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  WebSocket: websocket_endpoints.py                       │  │
│  │  └── WebSocket /ws/ping                                  │  │
│  │      ├── ConnectionManager                               │  │
│  │      ├── Receive payloads                                │  │
│  │      ├── Validate LLA (via firestore_repository)         │  │
│  │      └── Broadcast to all clients                        │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                   │
└─────────┬─────────────────────────────────────────────────────────┘
          │
          │
┌─────────▼─────────────────────────────────────────────────────────┐
│                    FIRESTORE INTEGRATION                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
  │  │  auth/firestore_config.py                                │  │
  │  │  ├── Load credentials from auth/.env                      │  │
  │  │  ├── Create Firestore AsyncClient                         │  │
  │  │  └── Authenticate with GCP Service Account                │  │
  │  └──────────────────────────────────────────────────────────┘  │
  │                                                                   │
  │  ┌──────────────────────────────────────────────────────────┐  │
  │  │  Firestore Functions (Async):                            │  │
  │  │  ├── validate_sensor_lla()                              │  │
  │  │  │   └── Query: sensors/{LLA} document                  │  │
  │  │  │       Validate: owner, mac match                      │  │
  │  │  │                                                       │  │
  │  │  ├── get_sensor_metadata()                              │  │
  │  │  │   └── Query: sensors/{LLA} document                  │  │
  │  │  │       Returns ALL metadata (frontend filters)          │  │
  │  │  │                                                       │  │
  │  │  ├── update_sensor_metadata()                           │  │
  │  │  │   └── Single sensor update (async)                    │  │
  │  │  │                                                       │  │
  │  │  ├── batch_update_sensor_metadata()                     │  │
  │  │  │   └── Batch update (up to 500 operations)             │  │
  │  │  │                                                       │  │
  │  │  └── update_sensor_last_package()                        │  │
  │  │      └── Batch update last_package (async)               │  │
  │  └──────────────────────────────────────────────────────────┘  │
  │                                                                   │
  │  ┌──────────────────────────────────────────────────────────┐  │
  │  │  FirestoreBatchWriter:                                   │  │
  │  │  ├── Groups operations up to 500 per batch                │  │
  │  │  ├── Auto-splits into multiple batches if needed          │  │
  │  │  └── Atomic batch commits                                │  │
  │  └──────────────────────────────────────────────────────────┘  │
│                                                                   │
└─────────┬─────────────────────────────────────────────────────────┘
          │
          │
┌─────────▼─────────────────────────────────────────────────────────┐
│              GOOGLE CLOUD FIRESTORE                               │
│                                                                   │
│  Database: (default)                                              │
│  Collection: sensors                                              │
│  Document ID: {LLA} (e.g., "fd002124b00ccf7399b")                │
│                                                                   │
│  Document Structure:                                              │
│  ├── owner, mac, lla                                             │
│  ├── exp_id, exp_name, exp_location (flat fields)               │
│  ├── label, location, rfid, frequency                            │
│  ├── coordinates: {x: null, y: null, z: null} (nested)        │
│  ├── is_active, is_valid, active_exp (flat fields)              │
│  ├── alerts: {alerted, battery_percentage, email_sent} (nested)  │
│  ├── last_package (nested object; last telemetry snapshot)     │
│  ├── last_seen, exp_started_at, exp_ended_at                   │
│  └── created_at, updated_at                                     │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘
```

## Data Flow Diagrams

### a) WebSocket Ping Flow

```
Sensor Device
    │
    │ Sends: {hostname, mac_address, type: "Ping", LLA}
    ▼
WebSocket /ws/ping
    │
    ├─► Validate LLA (Firestore)
    │   │
    │   └─► Query: sensors/{LLA} document
    │       │
    │       ├─► Document EXISTS → is_valid: true
    │       │   └─► Update last_seen timestamp
    │       │
    │       └─► Document MISSING → is_valid: false
    │           └─► Auto-register sensor (if type == "Ping")
    │               └─► Create base document → is_valid: true
    │
    ├─► Create Response with validation
    │
    └─► Broadcast to ALL connected clients
        │
        └─► Frontend receives & displays
```

**Steps:**
1. Sensor sends ping payload via WebSocket
2. Backend receives payload and extracts LLA
3. Backend queries Firestore to validate LLA exists and matches owner/MAC
4. **If document exists**: Updates `last_seen` timestamp, sets `is_valid: true`
5. **If document missing AND type == "Ping"**: Auto-registers sensor with base schema, sets `is_valid: true`, message: "Sensor added"
6. **If document missing AND type != "Ping"**: Sets `is_valid: false`, no action taken
7. Backend creates response with validation result
8. Backend broadcasts response to all connected clients
9. Frontend receives broadcast and displays payload card (with blink animation if valid)

### b) Metadata Query Flow

```
Frontend (User clicks payload card)
    │
    │ GET /GCP-FS/metadata/active?hostname=X&mac=Y&lla=Z
    ▼
Backend Endpoint
    │
    ├─► Query Firestore: sensors/{LLA} document
    │   │
    │   └─► Returns ALL metadata (active + inactive)
    │
    └─► Return JSON response
        │
        ▼
Frontend Processing
    │
    ├─► Filter: Active_Exp = True  → Show active experiments
    │   └─► Green theme, direct display
    │
    └─► Filter: Active_Exp = False → Show inactive experiments
        └─► Gray theme, dropdown selector
```

**Steps:**
1. User clicks on a payload card in the frontend
2. Frontend sends HTTP GET request to `/GCP-FS/metadata/active`
3. Backend queries Firestore for metadata matching the LLA
4. Backend returns all metadata (both active and inactive)
5. Frontend filters results:
   - If `Active_Exp = True` entries exist → Display active experiments (green theme)
   - If only `Active_Exp = False` entries exist → Display inactive experiments (gray theme, dropdown)
6. Frontend updates payload card visual status (green/gray styling)
7. Frontend displays metadata in modal

### c) Frontend Display Logic

```
WebSocket Payload Received
    │
    ├─► Check validation.is_valid
    │   │
    │   ├─► TRUE  → Display in "Received Payloads"
    │   │   │       └─► Green validation section
    │   │   │           └─► Clickable → Fetch metadata
    │   │   │
    │   └─► FALSE → Check message
    │       │
    │       ├─► "LLA not found" → Display in "Received Payloads"
    │       │                    └─► Red validation section
    │       │
    │       └─► Other error → Display in "Error/Debug"
    │
    └─► Check for duplicates (by LLA)
        │
        ├─► New LLA → Create new card
        │
        └─► Existing LLA → Update timestamp, trigger blink
```

**Steps:**
1. Frontend receives WebSocket payload with validation result
2. Check if `validation.is_valid === true`:
   - **TRUE**: Display in "Received Payloads" section with green validation
   - **FALSE**: Check validation message:
     - If message contains "LLA not found" → Display in "Received Payloads" with red validation
     - Otherwise → Display in "Error/Debug" section
3. Check if LLA already exists in displayed payloads:
   - **New LLA**: Create new payload card
   - **Existing LLA**: Update timestamp and trigger blink animation (if valid)
4. If payload count exceeds 10, remove oldest payloads
5. When user clicks card, fetch and display metadata

**Visual Status Update:**
- After metadata is fetched, payload card updates:
  - If active experiments found → Green card (green gradient background, green border, green shadow)
  - If only inactive experiments found → Gray card (gray gradient background, gray border, gray shadow)

## Notes

- WebSocket payloads are broadcast to all connected clients simultaneously
- The frontend displays up to 10 unique sensors (prevented by LLA)
- Duplicate sensors trigger blink animation if validation passes
- WebSocket timestamps are in ISO 8601 UTC format (e.g. `2026-03-10T14:23:38Z`); the frontend converts to the user's local timezone for display
- All endpoints support CORS for cross-origin requests
- Firestore uses project ID configured in `auth/.env` (GCP_PROJECT_ID)
- Firestore credentials are loaded from `auth/.env` file at startup
- Sensor validation queries the document: `sensors/{LLA}`
- All operations are logged with timestamps and duration metrics for performance monitoring
- All endpoint calls are logged with `[ENDPOINT]` prefix for easy tracking
- Metadata queries return all data (active and inactive) - filtering done in frontend
- Active/Inactive experiment separation is visual only - all metadata is available for both
- Payload cards automatically update visual status after metadata is fetched
- Modal can display multiple experiments if sensor participated in several
- Experiment sorting uses `Exp_ID_Exp_Name` format for consistent ordering
- Sensors are automatically registered when they send Ping messages if they don't exist
- Firestore document structure uses flat fields for exp and sensor data (not nested)
- Only `coordinates` and `alerts` remain nested in Firestore documents
- Coordinates format: `{x: null, y: null, z: null}` (all keys always present)
- **Async Operations**: All Firestore operations use `AsyncClient` for non-blocking I/O
- **Batch Writing**: Multiple sensor updates are grouped into atomic batches (up to 500 operations per batch)
- **Performance**: Batch operations significantly improve throughput for multiple sensor updates

## Recent Updates

### GET /GCP-FS/last-package (2026-03-29)
- New read-only endpoint: same filters as **`GET /GCP-FS/metadata/sensors`** (`owner`, `mac_address`, optional `exp_name`).
- Returns the same metadata envelope; each row includes **`Last_Package`** mapped from Firestore `last_package` (also present on **`/GCP-FS/metadata/sensors`** responses).

### Experiment Management and Bulk Metadata UX (Implemented - 2026-03-18)
- Added a unified `Selection Context` for email, owner, device, and experiment selection
- Owner/device dropdowns now support both resolved permissions and live-discovered devices
- Experiment Management no longer re-drives the current selection on every payload
- Added bulk metadata editing for selected sensors in `All sensors` view
- Added CSV template download and CSV upload for multi-sensor metadata updates
- Kept experiment start/end actions visually separate from metadata editing

### WebSocket Timestamp Fix (Implemented - 2026-03-10)
- WebSocket responses (Ping, Last_Package, error) now send timestamps in UTC with `Z` suffix (e.g. `2026-03-10T14:23:38Z`)
- Fixes a 2-hour display offset for users in GMT+2 and other non-UTC timezones
- Frontend `formatDate()` correctly parses UTC and displays in user's local timezone

### WebSocket Last_Package Forwarding Control (Implemented - 2026-03-30)
- `Last_Package` received on `/ws/ping` is still processed and stored in Firestore
- With `LAST_PACKAGE_WS_ENABLED = False` (default), backend returns sender-only ack:
  - `{"received": true, "disabled": true, "stored": true, "type": "Last_Package", "message": "Stored in Firestore but not forwarded over WebSocket"}`
- `Last_Package` is not broadcast to frontend WebSocket clients in disabled mode; Ping broadcast behavior is unchanged

### active_exp Logic: Owner/MAC Update When Inactive (Implemented - 2026-03-10)
- **Unified behavior** across PING, Last_Package, POST /FS/sensor/update, and update-metadata
- When `active_exp` is False: owner and mac can be updated in Firestore (enables reassignment of inactive sensors)
- When `active_exp` is True: owner and mac must match; mismatch returns error or adds to failed_llas
- **Affected flows:**
  - **POST /FS/sensor/update** and **update_sensor_last_seen**: Validate on active; update owner/mac when inactive
  - **WebSocket PING**: On owner/mac mismatch, calls update_sensor_metadata; if inactive, updates owner/mac then last_seen
  - **WebSocket Last_Package** and **update_sensor_last_package**: Same validation and owner/mac update logic
  - **update_sensor_metadata** and **batch_update_sensor_metadata**: Unchanged; already supported conditional validation

### Async Migration and Batch Writing (Implemented - 2025-12-30)
- ✅ Fully migrated all Firestore operations to async using `AsyncClient`
- ✅ Implemented `FirestoreBatchWriter` for efficient batch operations (up to 500 operations per batch)
- ✅ Unified `update_sensor_metadata` endpoint to support both single and batch updates
- ✅ Unified `update_sensor_last_package` to handle both single and multiple sensors in batch
- ✅ Automatic batch splitting when operations exceed 500 per batch
- ✅ Improved server responsiveness with non-blocking async operations
- ✅ Significant performance improvements for bulk operations

### Metadata Editing (Implemented)
- ✅ Editable fields for inactive experiments (Experiment Name, Experiment Location, Sensor Location, Label, Coordinates)
- ✅ "Save Changes" button sends updates to `/FS/sensor/update-metadata` endpoint
- ✅ Updates are saved directly to Firestore
- ✅ Frontend automatically reloads metadata after successful save

### Automatic Sensor Registration (Implemented)
- ✅ Sensors are automatically registered when they send Ping messages
- ✅ If sensor doesn't exist and `type == "Ping"`, creates new document with base schema
- ✅ If sensor exists and `type == "Ping"`, updates `last_seen` timestamp
- ✅ Validation status reflects auto-registration with "Sensor added" message

### Flexible Metadata Updates (Implemented)
- ✅ Update any combination of sensor fields through the API
- ✅ Supports all Firestore document fields
- ✅ Automatic `updated_at` timestamp management
- ✅ Frontend integration for easy metadata editing
- ✅ Batch update support for multiple sensors in a single request

## License

[Add your license information here]

