# ApiSync Architecture Documentation

**Author:** Nir Averbuch  
**Last updated:** 2026-01-05

This document provides a comprehensive overview of the ApiSync system architecture, including component interactions, data flows, and technology stack.

## Table of Contents

1. [Overview](#overview)
2. [System Architecture](#system-architecture)
3. [Component Details](#component-details)
4. [Data Flow Diagrams](#data-flow-diagrams)
5. [Technology Stack](#technology-stack)
6. [API Endpoints Overview](#api-endpoints-overview)

## Overview

ApiSync is a FastAPI-based application that provides real-time sensor monitoring through WebSocket connections, with full integration to Google Cloud Firestore for metadata storage and validation. The system supports:

- **Real-time WebSocket Communication**: Bidirectional communication with sensor devices
- **Firestore Integration**: Complete CRUD operations for sensor metadata
- **Automatic Sensor Registration**: Sensors are auto-registered on first ping
- **Batch Operations**: Efficient batch writes for multiple sensor updates
- **Frontend Dashboard**: Interactive web interface for monitoring and metadata management
- **Async Operations**: Fully asynchronous architecture for optimal performance

## System Architecture

### System Architecture Diagram

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
│  │  ├── GET /GCP-FS/metadata/active                         │  │
│  │  ├── GET /GCP-FS/metadata/sensors                         │  │
│  │  ├── GET /GCP-FS/metadata/experiments                     │  │
│  │  ├── GET /GCP-FS/permissions/resolve                       │  │
│  │  ├── POST /FS/sensor/register                              │  │
│  │  ├── POST /FS/sensor/update                                │  │
│  │  └── POST /FS/sensor/update-metadata                      │  │
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
│  │  ├── get_all_sensors_metadata()                         │  │
│  │  │   └── Query: sensors collection                      │  │
│  │  │       Filter by owner, mac, exp_name                 │  │
│  │  │                                                       │  │
│  │  ├── get_experiment_names()                             │  │
│  │  │   └── Query: sensors collection                      │  │
│  │  │       Group by exp_name, count active/inactive       │  │
│  │  │                                                       │  │
│  │  ├── register_sensor()                                  │  │
│  │  │   └── Create: sensors/{LLA} document                 │  │
│  │  │       Base schema with timestamps                    │  │
│  │  │                                                       │  │
│  │  ├── update_sensor_last_seen()                          │  │
│  │  │   └── Update: sensors/{LLA} document                 │  │
│  │  │       Update last_seen, updated_at                   │  │
│  │  │                                                       │  │
│  │  ├── update_sensor_metadata()                           │  │
│  │  │   └── Single sensor update (async)                  │  │
│  │  │                                                       │  │
│  │  ├── batch_update_sensor_metadata()                     │  │
│  │  │   └── Batch update (up to 500 operations)            │  │
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
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  permissions_client.py                                   │  │
│  │  ├── resolve_owner_and_mac()                             │  │
│  │  ├── resolve_all_owners_and_macs()                        │  │
│  │  └── External Field4D permissions service integration     │  │
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
│  ├── last_seen, exp_started_at, exp_ended_at                   │
│  ├── last_package: {temperature, humidity, ...} (nested)        │
│  └── created_at, updated_at                                     │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘
```

## Component Details

### 1. Client Layer

**WebSocket Clients**
- Sensor devices connecting via WebSocket
- Frontend dashboard WebSocket connection
- Real-time bidirectional communication

**HTTP Clients**
- Frontend dashboard HTTP requests
- External API consumers
- Health check monitors

### 2. FastAPI Server

**Core Components:**
- **CORS Middleware**: Enables cross-origin requests for frontend integration
- **Router System**: Modular endpoint organization
- **WebSocket Manager**: Connection lifecycle management

**Key Modules:**
- `get_endpoints.py`: Health checks and frontend serving
- `firestore_endpoints.py`: Firestore query and management endpoints
- `websocket_endpoints.py`: WebSocket connection handling and payload processing

### 3. Firestore Integration Layer

**Configuration (`auth/firestore_config.py`):**
- Loads GCP credentials from `auth/.env`
- Creates and manages Firestore AsyncClient
- Handles authentication with GCP Service Account

**Repository (`firestore_repository.py`):**
- All Firestore operations are asynchronous
- Provides CRUD operations for sensor metadata
- Handles validation and error handling

**Batch Writer (`firestore_batch.py`):**
- Groups operations into batches (max 500 per batch)
- Automatic batch splitting for large operations
- Atomic batch commits for data consistency

**Permissions Client (`permissions_client.py`):**
- Integrates with external Field4D permissions service
- Resolves user email to owner/MAC combinations
- Handles permissions service errors gracefully

### 4. Google Cloud Firestore

**Database Structure:**
- **Collection**: `sensors`
- **Document ID**: LLA (unique sensor identifier)
- **Schema**: Flat structure with nested objects for coordinates, alerts, and last_package

**Key Features:**
- Real-time database with automatic synchronization
- Document-based NoSQL structure
- Strong consistency for single-document operations
- Batch operations for atomic multi-document updates

## Data Flow Diagrams

### a) WebSocket Ping Flow

```
Sensor Device
    │
    │ Sends: {owner, mac_address, type: "Ping", LLA}
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

### b) Last_Package Flow (Batch Update)

```
Sensor Device
    │
    │ Sends: {type: "Last_Package", owner, mac_address, sensors: {...}}
    ▼
WebSocket /ws/ping
    │
    ├─► Parse sensors object (multiple LLAs)
    │
    ├─► Validate all LLAs (Firestore)
    │   └─► Query: sensors/{LLA} for each sensor
    │
    ├─► Batch Update last_package (Firestore)
    │   └─► FirestoreBatchWriter
    │       ├── Groups up to 500 operations
    │       ├── Auto-splits if needed
    │       └── Atomic batch commits
    │
    ├─► Create Response with validation results
    │
    └─► Broadcast to ALL connected clients
        │
        └─► Frontend receives & displays
```

**Steps:**
1. Sensor sends Last_Package payload with multiple sensors
2. Backend parses sensors object (dictionary of LLAs)
3. Backend validates each LLA against Firestore
4. Backend groups all updates into batch operations
5. FirestoreBatchWriter processes batch (up to 500 operations per batch)
6. If more than 500 operations, automatically splits into multiple batches
7. All batches are committed atomically
8. Backend creates response with validation results for all sensors
9. Backend broadcasts response to all connected clients
10. Frontend receives and displays updated sensor data

### c) Metadata Query Flow

```
Frontend (User clicks payload card)
    │
    │ GET /GCP-FS/metadata/active?owner=X&mac_address=Y&lla=Z
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

### d) Metadata Update Flow

```
Frontend (User edits metadata)
    │
    │ POST /FS/sensor/update-metadata
    │ Body: {hostname, mac_address, lla, updates: {...}}
    ▼
Backend Endpoint
    │
    ├─► Validate document exists (Firestore)
    │   └─► Query: sensors/{LLA} document
    │
    ├─► Validate owner/MAC match
    │
    ├─► Update metadata fields (Firestore)
    │   └─► Update: sensors/{LLA} document
    │       └─► Update provided fields + updated_at
    │
    └─► Return success response
        │
        ▼
Frontend Processing
    │
    └─► Reload metadata from Firestore
        └─► Update modal display
```

**Steps:**
1. User edits metadata fields in frontend modal
2. User clicks "Save Changes" button
3. Frontend sends POST request to `/FS/sensor/update-metadata`
4. Backend validates document exists in Firestore
5. Backend validates owner and MAC address match
6. Backend updates only the provided fields in Firestore
7. Backend automatically updates `updated_at` timestamp
8. Backend returns success response with updated fields list
9. Frontend automatically reloads metadata from Firestore
10. Frontend updates modal display with new data

### e) Batch Metadata Update Flow

```
Frontend/API Client
    │
    │ POST /FS/sensor/update-metadata
    │ Body: {sensors: [{lla, hostname, mac_address, updates: {...}}, ...]}
    ▼
Backend Endpoint
    │
    ├─► Parse sensors array
    │
    ├─► Validate all documents exist (Firestore)
    │   └─► Query: sensors/{LLA} for each sensor
    │
    ├─► Validate owner/MAC match for each
    │
    ├─► Batch Update metadata (Firestore)
    │   └─► FirestoreBatchWriter
    │       ├── Groups up to 500 operations
    │       ├── Auto-splits if needed
    │       └── Atomic batch commits
    │
    └─► Return success response with updated LLAs
```

**Steps:**
1. Client sends batch update request with multiple sensors
2. Backend parses sensors array
3. Backend validates all documents exist in Firestore
4. Backend validates owner/MAC match for each sensor
5. Backend groups all updates into batch operations
6. FirestoreBatchWriter processes batch (up to 500 operations per batch)
7. If more than 500 operations, automatically splits into multiple batches
8. All batches are committed atomically
9. Backend returns success response with list of updated LLAs
10. Failed operations (if any) are reported separately

### f) Frontend Display Logic

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

## Technology Stack

### Backend
- **FastAPI**: Modern, fast web framework for building APIs
- **Uvicorn**: ASGI server for running FastAPI
- **Google Cloud Firestore**: NoSQL document database
- **python-dotenv**: Environment variable management

### Frontend
- **HTML5/CSS3**: Modern web standards
- **JavaScript (ES6+)**: Client-side logic
- **WebSocket API**: Real-time bidirectional communication
- **Fetch API**: HTTP requests

### Infrastructure
- **Google Cloud Platform**: Cloud infrastructure
- **Firestore AsyncClient**: Asynchronous database operations
- **GCP Service Account**: Authentication and authorization

### Development Tools
- **Python 3.10+**: Programming language
- **Structured Logging**: Comprehensive operation tracking
- **CORS Middleware**: Cross-origin resource sharing

## API Endpoints Overview

### HTTP GET Endpoints

| Endpoint | Description | Parameters |
|----------|-------------|------------|
| `GET /health` | Health check | None |
| `GET /` | Frontend dashboard | None |
| `GET /GCP-FS/metadata/active` | Query sensor metadata by LLA | `owner`/`hostname`, `mac_address`, `lla` |
| `GET /GCP-FS/metadata/sensors` | Get all sensors metadata | `owner`, `mac_address`, `exp_name` (optional) |
| `GET /GCP-FS/metadata/experiments` | Get experiment names with stats | `owner`, `mac_address` |
| `GET /GCP-FS/permissions/resolve` | Resolve owner/MAC from email | `email` |

### HTTP POST Endpoints

| Endpoint | Description | Request Body |
|----------|-------------|--------------|
| `POST /FS/sensor/register` | Register new sensor | `hostname`, `mac_address`, `lla` |
| `POST /FS/sensor/update` | Update sensor last_seen | `hostname`, `mac_address`, `lla` |
| `POST /FS/sensor/update-metadata` | Update sensor metadata (single or batch) | Single: `hostname`, `mac_address`, `lla`, `updates`<br>Batch: `sensors` array |

### WebSocket Endpoints

| Endpoint | Description | Message Types |
|----------|-------------|---------------|
| `WebSocket /ws/ping` | Real-time sensor communication | `Ping`, `Last_Package` |

## Key Design Decisions

### 1. Asynchronous Architecture
- All Firestore operations use `AsyncClient` for non-blocking I/O
- Improves server responsiveness and scalability
- Allows concurrent request handling

### 2. Batch Operations
- Groups multiple operations into atomic batches (max 500 per batch)
- Automatic batch splitting for large operations
- Significant performance improvement for bulk updates

### 3. Automatic Sensor Registration
- Sensors are auto-registered on first ping
- Reduces manual setup overhead
- Creates base schema automatically

### 4. Frontend Filtering
- Backend returns all metadata (active + inactive)
- Frontend filters by `Active_Exp` status
- Reduces backend complexity and improves flexibility

### 5. Visual Status Indicators
- Color-coded cards (green for active, gray for inactive)
- Real-time status updates after metadata fetch
- Improves user experience and data visibility

### 6. Duplicate Prevention
- Frontend prevents duplicate sensors by LLA
- Updates existing sensors instead of creating duplicates
- Maintains clean dashboard display

## Performance Considerations

### Batch Writing
- Groups up to 500 operations per batch
- Automatic splitting for larger operations
- Atomic commits ensure data consistency

### Async Operations
- Non-blocking I/O for all Firestore operations
- Concurrent request handling
- Improved server responsiveness

### Connection Management
- WebSocket connection pooling
- Automatic cleanup of disconnected clients
- Efficient broadcasting to all clients

### Caching Strategy
- No caching implemented (real-time data requirements)
- Direct Firestore queries for latest data
- Frontend caches displayed payloads (max 10 sensors)

## Security Considerations

### Authentication
- GCP Service Account authentication
- Credentials stored in `auth/.env` (not in version control)
- Secure credential loading and management

### Validation
- LLA validation against Firestore
- Owner/MAC address matching
- Input validation on all endpoints

### CORS
- CORS middleware enabled for frontend integration
- Configurable for production environments

## Future Enhancements

### Planned Features
- CSV export functionality for inactive experiments
- Bulk metadata update via CSV import
- Advanced filtering and search capabilities
- Real-time notifications for sensor alerts
- User authentication and authorization
- API rate limiting
- WebSocket connection authentication

### Scalability Considerations
- Horizontal scaling with load balancer
- Firestore connection pooling
- WebSocket connection limits
- Batch operation optimization

---

**Note:** This architecture document is maintained alongside the main README.md. For API usage details, endpoint specifications, and setup instructions, refer to the main README.md file.

