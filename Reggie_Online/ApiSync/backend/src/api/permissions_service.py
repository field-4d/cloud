"""
Permissions resolve service backed by BigQuery.
Provides shared business logic for canonical and compatibility endpoints.
"""
import asyncio
import logging
import time
from typing import Any, Dict, List, Optional

from google.api_core.exceptions import GoogleAPICallError, RetryError
from google.cloud import bigquery

from auth.bigquery_config import get_client as get_bigquery_client

logger = logging.getLogger(__name__)

# Internal hardcoded table identifiers (never exposed in API contract)
PERMISSIONS_TABLE = "iucc-f4d.Field4D.F4D_permissions"
MAC_TO_DEVICE_TABLE = "iucc-f4d.Field4D.F4D_mac_to_device"


class PermissionsNotFoundError(Exception):
    """Raised when no permissions are found for an email."""


class PermissionsResponseFormatError(Exception):
    """Raised when query result format is invalid or unusable."""


class PermissionsServiceError(Exception):
    """Raised when BigQuery or internal service errors occur."""

    def __init__(self, message: str, status_code: int = 500):
        self.status_code = status_code
        super().__init__(message)


def _query_permissions_rows(email: str) -> List[bigquery.table.Row]:
    """
    Run the BigQuery query and return all rows for the given email.
    Enriches from F4D_mac_to_device on (owner, mac_address); one device row per key.
    """
    client = get_bigquery_client()
    query = f"""
        WITH device_dedup AS (
            SELECT
                Owner,
                Mac_Address,
                Device_Name,
                Description,
                IP_Addresses,
                Created_At,
                Updated_At,
                Source
            FROM `{MAC_TO_DEVICE_TABLE}`
            QUALIFY ROW_NUMBER() OVER (
                PARTITION BY Owner, Mac_Address
                ORDER BY Updated_At DESC NULLS LAST, Created_At DESC NULLS LAST
            ) = 1
        )
        SELECT
            p.owner AS owner,
            p.mac_address AS mac_address,
            d.Device_Name AS device_name,
            d.Description AS description,
            d.IP_Addresses AS ip_addresses,
            d.Created_At AS created_at,
            d.Updated_At AS updated_at,
            d.Source AS source
        FROM `{PERMISSIONS_TABLE}` AS p
        LEFT JOIN device_dedup AS d
            ON LOWER(TRIM(p.owner)) = LOWER(TRIM(d.Owner))
            AND LOWER(TRIM(p.mac_address)) = LOWER(TRIM(d.Mac_Address))
        WHERE LOWER(TRIM(p.email)) = LOWER(TRIM(@email))
    """
    job_config = bigquery.QueryJobConfig(
        query_parameters=[bigquery.ScalarQueryParameter("email", "STRING", email)]
    )
    return list(client.query(query, job_config=job_config).result())


def _normalize_optional_str(val: Any) -> Optional[str]:
    if val is None:
        return None
    if isinstance(val, str):
        s = val.strip()
        return s if s else None
    return str(val).strip() or None


def _serialize_timestamp(val: Any) -> Optional[str]:
    if val is None:
        return None
    if hasattr(val, "isoformat"):
        try:
            return val.isoformat()
        except Exception:
            return str(val)
    return str(val) if val else None


def _normalize_ip_addresses(val: Any) -> Optional[str]:
    if val is None:
        return None
    if isinstance(val, list):
        parts = [str(x).strip() for x in val if x is not None and str(x).strip()]
        return ", ".join(parts) if parts else None
    return _normalize_optional_str(val)


def _device_payload_for_row(row: bigquery.table.Row, mac_address: str) -> Dict[str, Any]:
    get = row.get if hasattr(row, "get") else lambda k: None
    return {
        "mac_address": mac_address,
        "device_name": _normalize_optional_str(get("device_name")),
        "description": _normalize_optional_str(get("description")),
        "ip_addresses": _normalize_ip_addresses(get("ip_addresses")),
        "created_at": _serialize_timestamp(get("created_at")),
        "updated_at": _serialize_timestamp(get("updated_at")),
        "source": _normalize_optional_str(get("source")),
    }


def _group_rows_by_owner(email: str, rows: List[bigquery.table.Row]) -> Dict:
    """
    Group query rows by owner with unique MAC addresses and matching device enrichment.
    """
    owners_dict: Dict[str, Dict[str, Any]] = {}

    for row in rows:
        owner = (row.get("owner") or "").strip() if hasattr(row, "get") else ""
        mac_address = (row.get("mac_address") or "").strip() if hasattr(row, "get") else ""

        # Skip malformed rows but fail if nothing valid remains
        if not owner or not mac_address:
            logger.warning(
                "[PERMISSIONS_SERVICE] Skipping malformed row | "
                f"Email: {email} | Owner: {owner} | MAC: {mac_address}"
            )
            continue

        if owner not in owners_dict:
            owners_dict[owner] = {
                "owner": owner,
                "mac_addresses": [],
                "devices": [],
            }

        if mac_address not in owners_dict[owner]["mac_addresses"]:
            owners_dict[owner]["mac_addresses"].append(mac_address)
            owners_dict[owner]["devices"].append(_device_payload_for_row(row, mac_address))

    owners = list(owners_dict.values())
    if not owners:
        raise PermissionsResponseFormatError(
            "Invalid permissions response format: no valid owner/mac_address rows"
        )

    return {
        "email": email,
        "owners": owners,
    }


async def resolve_permissions_by_email(email: str) -> Dict:
    """
    Resolve all owner/MAC combinations for an email from BigQuery.
    """
    operation_start = time.time()
    normalized_email = (email or "").strip()
    if not normalized_email:
        raise PermissionsResponseFormatError("Email is required")

    logger.info(
        f"[PERMISSIONS_SERVICE] Resolving permissions from BigQuery | Email: {normalized_email}"
    )

    try:
        rows = await asyncio.to_thread(_query_permissions_rows, normalized_email)
        if not rows:
            raise PermissionsNotFoundError(f"No permissions found for email: {normalized_email}")

        result = _group_rows_by_owner(normalized_email, rows)

        duration = time.time() - operation_start
        logger.info(
            "[PERMISSIONS_SERVICE] Resolve succeeded | "
            f"Email: {normalized_email} | "
            f"Owners: {len(result['owners'])} | "
            f"Total MACs: {sum(len(o['mac_addresses']) for o in result['owners'])} | "
            f"Duration: {duration:.3f}s"
        )
        return result

    except PermissionsNotFoundError:
        raise
    except PermissionsResponseFormatError:
        raise
    except (GoogleAPICallError, RetryError) as e:
        duration = time.time() - operation_start
        logger.error(
            "[PERMISSIONS_SERVICE] BigQuery API error | "
            f"Email: {normalized_email} | Error: {str(e)} | Duration: {duration:.3f}s",
            exc_info=True,
        )
        raise PermissionsServiceError("BigQuery service error", status_code=503)
    except Exception as e:
        duration = time.time() - operation_start
        logger.error(
            "[PERMISSIONS_SERVICE] Unexpected service error | "
            f"Email: {normalized_email} | Error: {str(e)} | Duration: {duration:.3f}s",
            exc_info=True,
        )
        raise PermissionsServiceError(
            f"Unexpected error resolving permissions: {str(e)}", status_code=500
        )
