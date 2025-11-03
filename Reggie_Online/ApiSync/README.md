# ApiSync

A FastAPI application with WebSocket support for real-time payload monitoring. Includes a web-based frontend dashboard to visualize received payloads.

## Features

- **REST API Endpoints**: HTTP endpoints for health checks and frontend serving
- **WebSocket Support**: Real-time bidirectional communication with payload broadcasting
- **BigQuery Integration**: Query Google Cloud BigQuery tables with authentication from `.env` file
- **Frontend Dashboard**: Interactive web interface to monitor WebSocket payloads
- **Connection Management**: Manages multiple WebSocket connections with broadcasting

## Project Structure

```
ApiSync/
├── src/
│   ├── main.py                    # Main FastAPI application
│   └── api/
│       ├── __init__.py
│       ├── get_endpoints.py      # GET endpoints (health, frontend)
│       ├── websocket_endpoints.py # WebSocket endpoints (ping)
│       └── bigquery_endpoints.py # BigQuery query endpoints
├── auth/
│   ├── .env                       # BigQuery credentials (not in git)
│   ├── bigquery_config.py        # BigQuery configuration and client setup
│   └── README.md                  # Auth setup documentation
├── frontend/
│   └── index.html                 # Web dashboard interface
├── test_script/
│   ├── README.md                  # Testing documentation
│   ├── 1.test_websocket.py        # Python WebSocket test script
│   ├── 2.test_bigquery.py         # Python BigQuery test script
│   └── output/                     # Test output files (CSV)
├── auth/
│   ├── .env                        # BigQuery credentials (not in git)
│   ├── bigquery_config.py          # BigQuery configuration and client setup
│   └── README.md                   # Auth setup documentation
├── requirements.txt               # Python dependencies
└── README.md                      # This file
```

## Installation

1. **Clone or navigate to the project directory**

2. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

3. **For testing (optional):**
   ```bash
   pip install websockets requests pandas
   ```

4. **Configure BigQuery credentials:**
   - Create `auth/.env` file with your GCP credentials (see [BigQuery Configuration](#bigquery-configuration) section)

## Running the Application

### Start the FastAPI Server

```bash
python -m uvicorn src.main:app --reload
```

Or run directly:
```bash
python src/main.py
```

The server will start on `http://localhost:8000`

### Access Points

- **Frontend Dashboard**: `http://localhost:8000/`
- **Swagger UI**: `http://localhost:8000/docs`
- **Health Check**: `http://localhost:8000/health`
- **WebSocket Endpoint**: `ws://localhost:8000/ws/ping`
- **BigQuery Metadata**: `http://localhost:8000/GCP-BQ/metadata?dataset=<dataset>&table=<table>`

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

### BigQuery Endpoints

#### `GET /GCP-BQ/metadata`

Query a BigQuery metadata table.

**Query Parameters:**
- `dataset` (required): BigQuery dataset name (e.g., "f4d_test")
- `table` (required): Table name (e.g., "aaaaaaaaaaaa_metadata")
- `limit` (optional, default: 100): Maximum number of rows to return
- `offset` (optional, default: 0): Number of rows to skip

**Example:**
```
GET /GCP-BQ/metadata?dataset=f4d_test&table=aaaaaaaaaaaa_metadata&limit=50
```

**Response:**
```json
{
  "success": true,
  "project": "iucc-f4d",
  "dataset": "f4d_test",
  "table": "aaaaaaaaaaaa_metadata",
  "full_table": "iucc-f4d.f4d_test.aaaaaaaaaaaa_metadata",
  "limit": 50,
  "offset": 0,
  "count": 50,
  "data": [
    {
      // Row 1 data
    },
    {
      // Row 2 data
    }
  ]
}
```

**Notes:**
- Project ID is constant: `iucc-f4d`
- Dataset and table are specified as query parameters
- Returns JSON with paginated results

### WebSocket Endpoints

#### `WebSocket /ws/ping`

Accepts WebSocket connections and handles ping payloads.

**Request Payload:**
```json
{
  "hostname": "<string>",
  "mac_address": "<string>",
  "type": "<string>",
  "LLA": "<string>"
}
```

**Response:**
```json
{
  "received": true,
  "timestamp": "2024-01-15T10:30:45",
  "payload": {
    "hostname": "<string>",
    "mac_address": "<string>",
    "type": "<string>",
    "LLA": "<string>"
  }
}
```

**Features:**
- Broadcasts received payloads to all connected clients
- Manages multiple concurrent WebSocket connections
- Automatic cleanup of disconnected clients

## Frontend Dashboard

The frontend dashboard (`http://localhost:8000/`) provides:

1. **Connection Status**: Visual indicator and Connect/Disconnect buttons
2. **Health Check Component**: Test the `/health` endpoint with visual feedback
3. **Payload Monitor**: Real-time display of the last 5 received payloads
   - Grid layout: 5 payloads in a single row (oldest to newest, left to right)
   - Clear Payloads button to reset the display
   - Automatic updates when payloads are received

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

**BigQuery Test (Python):**
```bash
python test_script/2.test_bigquery.py -d f4d_test -t aaaaaaaaaaaa_metadata
```

### Manual Testing

1. Open `http://localhost:8000/` in your browser
2. Click "Connect" to establish WebSocket connection
3. Click "Check Health" to test the health endpoint
4. Send payloads using test scripts or other WebSocket clients
5. Watch payloads appear in real-time on the dashboard

## BigQuery Configuration

### Setup

1. **Create `auth/.env` file** with your Google Cloud credentials:

```env
# Required
GCP_PROJECT_ID=iucc-f4d
GCP_CLIENT_EMAIL=query-from-bq@iucc-f4d.iam.gserviceaccount.com
GCP_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\\nMIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQDV/0qYhdMbBGIO\\n... (rest with \\n)\\n-----END PRIVATE KEY-----

# Optional but recommended
GCP_AUTH_URI=https://accounts.google.com/o/oauth2/auth
GCP_TOKEN_URI=https://oauth2.googleapis.com/token
GCP_auth_provider_x509_cert_url=https://www.googleapis.com/oauth2/v1/certs
GCP_CLIENT_ID=114940523003685681884
GCP_PRIVATE_KEY_ID=70720cec56d8c90319dcd4cbffbe7f8861300fe1
GCP_CLIENT_X509_CERT_URL=https://www.googleapis.com/robot/v1/metadata/x509/query-from-bq%40iucc-f4d.iam.gserviceaccount.com
```

2. **Private Key Format**: In your `.env` file, replace actual newlines in the private key with `\\n`. The code will automatically convert them back.

### Configuration Options

The code supports three ways to provide credentials (in priority order):

1. **Individual `.env` variables** (recommended): Set `GCP_*` variables as shown above
2. **`CREDENTIALS_JSON`**: Full JSON credentials as a string in `.env`
3. **`CREDENTIALS_PATH`**: Path to a JSON credentials file

### Security

**Never commit your `.env` file or credentials to version control!**

The `.gitignore` file already excludes:
- `auth/.env`
- `auth/*.json`
- Credential files

## Development

### Project Structure Details

- **`src/main.py`**: FastAPI app initialization, middleware setup, and router registration
- **`src/api/get_endpoints.py`**: HTTP GET endpoints using FastAPI router
- **`src/api/websocket_endpoints.py`**: WebSocket endpoints and connection manager
- **`src/api/bigquery_endpoints.py`**: BigQuery query endpoints
- **`auth/bigquery_config.py`**: BigQuery client configuration and credential loading
- **`frontend/index.html`**: Single-page web application with WebSocket client

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

**Adding BigQuery Endpoints:**
Add routes to `src/api/bigquery_endpoints.py`:
```python
@router.get("/GCP-BQ/your-endpoint")
async def your_bigquery_function(dataset: str, table: str):
    client = get_client()
    # Your BigQuery query logic
```

## Dependencies

- **FastAPI**: Web framework for building APIs
- **Uvicorn**: ASGI server for running FastAPI
- **google-cloud-bigquery**: Google Cloud BigQuery client library
- **python-dotenv**: Environment variable management from .env files
- **Python 3.10+**: Required Python version

See `requirements.txt` for exact versions.

## Notes

- WebSocket payloads are broadcast to all connected clients simultaneously
- The frontend displays only the last 5 received payloads
- Timestamps are in ISO 8601 format without milliseconds
- All endpoints support CORS for cross-origin requests
- BigQuery queries use project ID `iucc-f4d` by default (configured in `.env`)
- BigQuery credentials are loaded from `auth/.env` file at startup

## License

[Add your license information here]

