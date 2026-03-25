# f4d-register-device

HTTP Cloud Function for registering Field4D devices by MAC address in BigQuery.

The function:
- creates dataset/tables if missing
- inserts or updates a device record in `Field4D.F4D_mac_to_device`
- enforces owner consistency per MAC address
- ensures default system admins have `admin` permission rows in `Field4D.F4D_permissions`

## What this service does

`register_device` is a public `POST` endpoint that accepts device metadata and updates the registry.

Rules implemented by the function:
- `POST` only (`405` otherwise)
- valid JSON body required (`400` otherwise)
- `mac_address` is required (`400` otherwise)
- one MAC can belong to one owner; conflicting owner update returns `409`
- repeated IPs are deduplicated
- missing infra (dataset/tables) is auto-created

## Data model

### Dataset
- `Field4D` (location: `US`)

### Table: `F4D_mac_to_device`
- `Mac_Address` (`STRING`, required)
- `Owner` (`STRING`)
- `Device_Name` (`STRING`)
- `Description` (`STRING`)
- `IP_Addresses` (`STRING`, repeated)
- `Created_At` (`TIMESTAMP`)
- `Updated_At` (`TIMESTAMP`)
- `Source` (`STRING`)

### Table: `F4D_permissions`
- `Email` (`STRING`, required)
- `Owner` (`STRING`)
- `Mac_Address` (`STRING`, required)
- `Experiment` (`STRING`) - currently set to `*`
- `Role` (`STRING`, required) - currently `admin`
- `Valid_From` (`TIMESTAMP`)
- `Valid_Until` (`TIMESTAMP`)
- `Created_At` (`TIMESTAMP`)

## Request format

### Endpoint
- `POST /` (Cloud Function HTTP trigger)

### JSON body

```json
{
  "mac_address": "AA:BB:CC:DD:EE:FF",
  "owner": "field4d-lab",
  "device_name": "pi-cam-01",
  "description": "north gate camera",
  "ip_addresses": ["192.168.1.20", "10.0.0.45"],
  "source": "manual_registration"
}
```

Notes:
- `ip_addresses` can be:
  - omitted / `null`
  - single string
  - list of strings
- `source` defaults to `gcf_public_http` if omitted

## Response format

Successful response (`200`):

```json
{
  "status": "inserted",
  "mac_address": "AA:BB:CC:DD:EE:FF",
  "inserted": true,
  "updated": false,
  "new_ips_added": [],
  "admin_rows_added": [
    "nir.averbuch@mail.huji.ac.il"
  ]
}
```

Possible `status` values:
- `inserted`: new MAC inserted
- `updated`: existing MAC updated
- `no_change`: request did not change existing row

Error examples:
- `400` - invalid JSON / missing `mac_address`
- `405` - non-POST method
- `409` - owner mismatch for existing MAC

## Default system admins

For every registered MAC, the function ensures an `admin` row exists for each address below:
- `menachem.moshelion@mail.huji.ac.il`
- `nir.averbuch@mail.huji.ac.il`
- `bnaya.hami@mail.huji.ac.il`
- `idan.ifrach@mail.huji.ac.il`
- `epsztein.ori@mail.huji.ac.il`
- `Field4D_ADMIN@field4d.com`

## Local development

### Requirements
- Python 3.10+
- Google Cloud credentials with BigQuery access

Install dependencies:

```bash
pip install -r requirements.txt
```

Run locally with Functions Framework:

```bash
python -m functions_framework --target register_device --debug --port 8080
```

Test request:

```bash
curl -X POST "http://localhost:8080" \
  -H "Content-Type: application/json" \
  -d "{\"mac_address\":\"AA:BB:CC:DD:EE:FF\",\"owner\":\"field4d-lab\",\"ip_addresses\":[\"192.168.1.20\"]}"
```

## Deploy to Google Cloud Functions (Gen2)

Example deployment:

```bash
gcloud functions deploy f4d-register-device \
  --gen2 \
  --runtime=python312 \
  --region=us-central1 \
  --source=. \
  --entry-point=register_device \
  --trigger-http \
  --allow-unauthenticated
```

Grant the function service account permission to query and write BigQuery in the target project.

## Security/Hardening

If this endpoint is exposed beyond a private network, use the controls below.

- **Auth (recommended)**: deploy **without** `--allow-unauthenticated` and require IAM-authenticated callers (service-to-service). If browser/client access is needed, put API Gateway in front and require JWT validation there.
- **Caller identity**: log `request.headers` identity context (for example, authenticated principal/email from gateway or Cloud Run auth context) and include a request ID for traceability.
- **Rate limiting**: enforce per-IP or per-principal rate limits at API Gateway/Cloud Armor. Suggested starting point: 60 requests/minute per identity with short burst allowance.
- **Input validation**: validate `mac_address` against a strict MAC regex (for example `^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$`) and reject invalid values with `400`.
- **Owner validation**: restrict `owner` to an allowlist (or known pattern/length), and reject unknown owners to prevent accidental tenant drift.
- **Field bounds**: cap lengths (`device_name`, `description`, `source`) and number of `ip_addresses` (for example max 10), and validate each IP format (IPv4/IPv6).
- **Abuse protection**: add basic replay/idempotency control (for example optional idempotency key) if clients may retry aggressively.

## File structure

- `main.py` - function implementation and BigQuery logic
- `requirements.txt` - Python dependencies
