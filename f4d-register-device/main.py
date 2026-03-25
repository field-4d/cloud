import functions_framework
import logging
from datetime import datetime, timezone
from typing import Any

from google.cloud import bigquery
from google.cloud.exceptions import NotFound


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

DATASET_ID = "Field4D"
MAC_TABLE_ID = "F4D_mac_to_device"
PERMISSIONS_TABLE_ID = "F4D_permissions"

SYSTEM_ADMINS = [
    "menachem.moshelion@mail.huji.ac.il",
    "nir.averbuch@mail.huji.ac.il",
    "bnaya.hami@mail.huji.ac.il",
    "idan.ifrach@mail.huji.ac.il",
    "epsztein.ori@mail.huji.ac.il",
    "Field4D_ADMIN@field4d.com",
]


def utc_now():
    """Return current UTC timestamp."""
    return datetime.now(timezone.utc)


def get_client():
    """Create BigQuery client."""
    return bigquery.Client()


def table_ref(client: bigquery.Client, table_name: str) -> str:
    """Build fully-qualified BigQuery table reference."""
    return f"{client.project}.{DATASET_ID}.{table_name}"


def normalize_ip_addresses(value: Any) -> list[str]:
    """
    Normalize incoming IP input into a deduplicated list of strings.

    Accepted forms:
    - None -> []
    - "192.168.1.10" -> ["192.168.1.10"]
    - ["192.168.1.10", "10.0.0.5"] -> cleaned list
    """
    if value is None:
        return []

    if isinstance(value, str):
        value = value.strip()
        return [value] if value else []

    if isinstance(value, list):
        cleaned = []
        for item in value:
            s = str(item).strip()
            if s:
                cleaned.append(s)
        return list(dict.fromkeys(cleaned))

    return []


def ensure_dataset(client: bigquery.Client) -> None:
    """Ensure target dataset exists."""
    ds_ref = f"{client.project}.{DATASET_ID}"
    try:
        client.get_dataset(ds_ref)
    except NotFound:
        ds = bigquery.Dataset(ds_ref)
        ds.location = "US"
        client.create_dataset(ds)
        logger.info("Created dataset %s", ds_ref)


def ensure_mac_table(client: bigquery.Client) -> None:
    """Ensure MAC registry table exists."""
    t_ref = table_ref(client, MAC_TABLE_ID)
    try:
        client.get_table(t_ref)
    except NotFound:
        schema = [
            bigquery.SchemaField("Mac_Address", "STRING", mode="REQUIRED"),
            bigquery.SchemaField("Owner", "STRING"),
            bigquery.SchemaField("Device_Name", "STRING"),
            bigquery.SchemaField("Description", "STRING"),
            bigquery.SchemaField("IP_Addresses", "STRING", mode="REPEATED"),
            bigquery.SchemaField("Created_At", "TIMESTAMP"),
            bigquery.SchemaField("Updated_At", "TIMESTAMP"),
            bigquery.SchemaField("Source", "STRING"),
        ]
        client.create_table(bigquery.Table(t_ref, schema=schema))
        logger.info("Created table %s", t_ref)


def ensure_permissions_table(client: bigquery.Client) -> None:
    """Ensure permissions table exists."""
    t_ref = table_ref(client, PERMISSIONS_TABLE_ID)
    try:
        client.get_table(t_ref)
    except NotFound:
        schema = [
            bigquery.SchemaField("Email", "STRING", mode="REQUIRED"),
            bigquery.SchemaField("Owner", "STRING"),
            bigquery.SchemaField("Mac_Address", "STRING", mode="REQUIRED"),
            bigquery.SchemaField("Experiment", "STRING"),
            bigquery.SchemaField("Role", "STRING", mode="REQUIRED"),
            bigquery.SchemaField("Valid_From", "TIMESTAMP"),
            bigquery.SchemaField("Valid_Until", "TIMESTAMP"),
            bigquery.SchemaField("Created_At", "TIMESTAMP"),
        ]
        client.create_table(bigquery.Table(t_ref, schema=schema))
        logger.info("Created table %s", t_ref)


def ensure_infra(client: bigquery.Client) -> None:
    """Ensure dataset and all required tables exist."""
    ensure_dataset(client)
    ensure_mac_table(client)
    ensure_permissions_table(client)


def get_device(client: bigquery.Client, mac_address: str) -> dict | None:
    """Fetch one device row by Mac_Address."""
    query = f"""
    SELECT *
    FROM `{table_ref(client, MAC_TABLE_ID)}`
    WHERE Mac_Address = @mac
    LIMIT 1
    """
    job = client.query(
        query,
        job_config=bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("mac", "STRING", mac_address)
            ]
        ),
    )
    rows = list(job.result())
    return None if not rows else dict(rows[0])


def insert_device(
    client: bigquery.Client,
    mac_address: str,
    owner: str | None,
    device_name: str | None,
    description: str | None,
    ip_addresses: list[str],
    source: str,
) -> None:
    """Insert new device row using SQL INSERT."""
    query = f"""
    INSERT INTO `{table_ref(client, MAC_TABLE_ID)}`
    (
      Mac_Address,
      Owner,
      Device_Name,
      Description,
      IP_Addresses,
      Created_At,
      Updated_At,
      Source
    )
    VALUES
    (
      @mac,
      @owner,
      @device_name,
      @description,
      @ip_addresses,
      @now,
      @now,
      @source
    )
    """
    now = utc_now()
    client.query(
        query,
        job_config=bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("mac", "STRING", mac_address),
                bigquery.ScalarQueryParameter("owner", "STRING", owner),
                bigquery.ScalarQueryParameter("device_name", "STRING", device_name),
                bigquery.ScalarQueryParameter("description", "STRING", description),
                bigquery.ArrayQueryParameter("ip_addresses", "STRING", ip_addresses),
                bigquery.ScalarQueryParameter("now", "TIMESTAMP", now),
                bigquery.ScalarQueryParameter("source", "STRING", source),
            ]
        ),
    ).result()


def update_device(
    client: bigquery.Client,
    mac_address: str,
    owner: str | None,
    device_name: str | None,
    description: str | None,
    ip_addresses: list[str],
    source: str,
) -> None:
    """Update existing device row."""
    query = f"""
    UPDATE `{table_ref(client, MAC_TABLE_ID)}`
    SET
      Owner = COALESCE(@owner, Owner),
      Device_Name = COALESCE(@device_name, Device_Name),
      Description = COALESCE(@description, Description),
      IP_Addresses = @ip_addresses,
      Updated_At = @now,
      Source = @source
    WHERE Mac_Address = @mac
    """
    client.query(
        query,
        job_config=bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("mac", "STRING", mac_address),
                bigquery.ScalarQueryParameter("owner", "STRING", owner),
                bigquery.ScalarQueryParameter("device_name", "STRING", device_name),
                bigquery.ScalarQueryParameter("description", "STRING", description),
                bigquery.ArrayQueryParameter("ip_addresses", "STRING", ip_addresses),
                bigquery.ScalarQueryParameter("now", "TIMESTAMP", utc_now()),
                bigquery.ScalarQueryParameter("source", "STRING", source),
            ]
        ),
    ).result()


def permission_exists(client: bigquery.Client, email: str, mac_address: str) -> bool:
    """Check whether admin permission row already exists."""
    query = f"""
    SELECT COUNT(*) AS c
    FROM `{table_ref(client, PERMISSIONS_TABLE_ID)}`
    WHERE Email = @email
      AND Mac_Address = @mac
      AND Role = 'admin'
    """
    rows = list(
        client.query(
            query,
            job_config=bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("email", "STRING", email),
                    bigquery.ScalarQueryParameter("mac", "STRING", mac_address),
                ]
            ),
        ).result()
    )
    return rows[0]["c"] > 0


def insert_permission(
    client: bigquery.Client,
    email: str,
    owner: str | None,
    mac_address: str,
) -> None:
    """Insert a single admin permission row."""
    query = f"""
    INSERT INTO `{table_ref(client, PERMISSIONS_TABLE_ID)}`
    (
      Email,
      Owner,
      Mac_Address,
      Experiment,
      Role,
      Valid_From,
      Valid_Until,
      Created_At
    )
    VALUES
    (
      @email,
      @owner,
      @mac,
      '*',
      'admin',
      @now,
      NULL,
      @now
    )
    """
    now = utc_now()
    client.query(
        query,
        job_config=bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("email", "STRING", email),
                bigquery.ScalarQueryParameter("owner", "STRING", owner),
                bigquery.ScalarQueryParameter("mac", "STRING", mac_address),
                bigquery.ScalarQueryParameter("now", "TIMESTAMP", now),
            ]
        ),
    ).result()


def ensure_permissions(
    client: bigquery.Client,
    mac_address: str,
    owner: str | None,
) -> list[str]:
    """Ensure all default admins have permission rows for this MAC."""
    inserted = []
    for email in SYSTEM_ADMINS:
        if not permission_exists(client, email, mac_address):
            insert_permission(client, email, owner, mac_address)
            inserted.append(email)
    return inserted


@functions_framework.http
def register_device(request):
    """
    Public HTTP entry point for device registration.

    Rules:
    - POST only
    - mac_address required
    - one Mac_Address may only belong to one Owner
    - owner mismatch returns 409
    """
    if request.method != "POST":
        return {"error": "Use POST"}, 405

    payload = request.get_json(silent=True)
    if payload is None:
        return {"error": "Invalid JSON body"}, 400

    mac_address = str(payload.get("mac_address") or "").strip()
    if not mac_address:
        return {"error": "mac_address is required"}, 400

    owner = payload.get("owner")
    owner = str(owner).strip() if owner else None

    device_name = payload.get("device_name")
    device_name = str(device_name).strip() if device_name else None

    description = payload.get("description")
    description = str(description).strip() if description else None

    ip_addresses = normalize_ip_addresses(payload.get("ip_addresses"))
    source = str(payload.get("source") or "gcf_public_http").strip()

    client = get_client()
    ensure_infra(client)

    existing = get_device(client, mac_address)

    if existing:
        existing_owner = existing.get("Owner")
        if existing_owner and owner and owner != existing_owner:
            return {
                "error": "Owner mismatch for this Mac_Address",
                "existing_owner": existing_owner,
                "incoming_owner": owner,
            }, 409

    inserted = False
    updated = False
    new_ips_added = []

    if not existing:
        insert_device(
            client=client,
            mac_address=mac_address,
            owner=owner,
            device_name=device_name,
            description=description,
            ip_addresses=ip_addresses,
            source=source,
        )
        inserted = True
        final_owner = owner
    else:
        current_ips = existing.get("IP_Addresses") or []
        merged_ips = list(dict.fromkeys(current_ips + ip_addresses))
        new_ips_added = [ip for ip in ip_addresses if ip not in current_ips]

        fields_changed = any([
            owner is not None and owner != existing.get("Owner"),
            device_name is not None and device_name != existing.get("Device_Name"),
            description is not None and description != existing.get("Description"),
            merged_ips != current_ips,
        ])

        if fields_changed:
            update_device(
                client=client,
                mac_address=mac_address,
                owner=owner,
                device_name=device_name,
                description=description,
                ip_addresses=merged_ips,
                source=source,
            )
            updated = True

        final_owner = owner if owner else existing.get("Owner")

    admin_rows_added = ensure_permissions(client, mac_address, final_owner)

    return {
        "status": "inserted" if inserted else "updated" if updated else "no_change",
        "mac_address": mac_address,
        "inserted": inserted,
        "updated": updated,
        "new_ips_added": new_ips_added,
        "admin_rows_added": admin_rows_added,
    }, 200