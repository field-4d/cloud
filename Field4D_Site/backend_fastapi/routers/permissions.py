from datetime import datetime

from fastapi import APIRouter, HTTPException, Query
from google.cloud import bigquery
from pydantic import BaseModel

from config.settings import get_settings
from services.bigquery_client import run_query


router = APIRouter()


class PermissionRow(BaseModel):
    email: str
    owner: str
    mac_address: str
    experiment: str
    role: str
    valid_from: datetime | None = None
    valid_until: datetime | None = None
    created_at: datetime | None = None
    device_name: str | None = None
    description: str | None = None


class PermissionsResponse(BaseModel):
    success: bool
    permissions: list[PermissionRow]


@router.get("/permissions", response_model=PermissionsResponse)
def get_permissions(email: str = Query(..., min_length=1)) -> PermissionsResponse:
    if not email.strip():
        raise HTTPException(status_code=400, detail="email is required")

    settings = get_settings()
    query = f"""
SELECT
  p.email,
  p.owner,
  p.mac_address,
  p.experiment,
  p.role,
  p.valid_from,
  p.valid_until,
  p.created_at,
  m.device_name,
  m.description
FROM `{settings.permissions_table}` AS p
LEFT JOIN `{settings.mac_to_device_table}` AS m
  ON p.mac_address = m.mac_address
WHERE p.email = @email
ORDER BY p.owner, p.mac_address, p.experiment;
"""

    query_parameters = [bigquery.ScalarQueryParameter("email", "STRING", email)]
    rows = run_query(query=query, query_parameters=query_parameters)

    permissions: list[PermissionRow] = []
    for row in rows:
        permissions.append(
            PermissionRow(
                email=row["email"],
                owner=row["owner"],
                mac_address=row["mac_address"],
                experiment=row["experiment"],
                role=row["role"],
                valid_from=row["valid_from"],
                valid_until=row["valid_until"],
                created_at=row["created_at"],
                device_name=row["device_name"],
                description=row["description"],
            )
        )

    return PermissionsResponse(success=True, permissions=permissions)
