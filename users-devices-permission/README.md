# Google Cloud Function: Users-Devices-Permission

This Google Cloud Function manages MAC addresses and associated metadata for user devices in BigQuery. It handles insertions and updates based on ownership, IP addresses, and metadata.

---

## Overview

This Cloud Function is triggered via HTTP and is designed to:
1. Create a new record for a MAC address if it doesn’t exist.
2. Update metadata (`owner`, `table_name`, `description`) when ownership changes.
3. Add a new IP to the existing IP array if it isn’t already present.

---

## Key Features

- **Intelligent Upserts**: Automatically decides whether to insert a new row or update an existing one.
- **IP Deduplication**: Prevents duplicate IPs using BigQuery's `UNNEST` and `DISTINCT`.
- **Metadata Versioning**: Updates metadata only if a new device is detected.
- **Safe Table Updates**: Uses temporary table replacement strategy to handle array field updates cleanly.
- **Detailed Logging**: Every step is logged for easy debugging.

---

## How It Works

1. **Input Payload**  
   JSON with the following structure:
   ```json
   {
     "mac_address": "d83adde2608f",
     "owner": "john_doe",
     "table_name": "device_table_1",
     "description": "Living room device",
     "ip_addresses": ["192.168.0.10"]
   }
   ```

2. **MAC Exists?**
   - If **no**: A new row is created.
   - If **yes**:
     - Adds new IPs to the list.
     - Updates owner/table/description if ownership changes.
     - Skips updates if data already exists.

3. **IP Handling**:  
   - Only new IPs are added.
   - Uses a temporary table to safely modify `ip_addresses`.

4. **Response**:  
   JSON response with appropriate status and message.

---

## Setup Instructions

1. **Google Cloud Services Required**:
   - BigQuery
   - Cloud Functions

2. **Install Dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

3. **Deploy with gcloud**:
   ```bash
   gcloud functions deploy create_or_update_mac_entry \
       --runtime python39 \
       --trigger-http \
       --allow-unauthenticated \
       --entry-point create_or_update_mac_entry
   ```

4. **Test Locally**:
   ```bash
   curl -X POST https://YOUR_FUNCTION_URL \
       -H "Content-Type: application/json" \
       -d '{
         "mac_address": "d83adde2608f",
         "owner": "john_doe",
         "table_name": "device_table_1",
         "description": "Living room device",
         "ip_addresses": ["192.168.0.10"]
       }'
   ```

---

## Example Response

```json
{
  "message": "New MAC entry created successfully."
}
```

or

```json
{
  "message": "IP added to existing MAC record."
}
```

or

```json
{
  "message": "MAC and IP already exist. No update performed."
}
```
