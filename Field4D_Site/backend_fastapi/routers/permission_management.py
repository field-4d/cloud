import random
import re
import string
from typing import Literal

import httpx
from fastapi import APIRouter, HTTPException, Query
from google.cloud import bigquery
from pydantic import BaseModel

from config.settings import get_settings
from services.bigquery_client import run_query


router = APIRouter()

VALID_ROLES = {"read", "admin", "system_admin"}


class AddPermissionRequest(BaseModel):
    actor_email: str
    user_mail: str
    first_name: str
    owner: str
    mac_address: str
    exp_name: str
    role_val: Literal["read", "admin", "system_admin"]
    send_email: bool = True


class AddPermissionResponse(BaseModel):
    success: bool
    message: str
    actor_role: str | None = None
    forwarded_response: dict | None = None


class PermissionScopeRow(BaseModel):
    owner: str
    mac_address: str
    experiment: str
    role: str


class ManagedDevice(BaseModel):
    owner: str
    mac_address: str
    device_name: str


class ManagedExperiment(BaseModel):
    owner: str
    mac_address: str
    exp_name: str


class ManagedDevicesResponse(BaseModel):
    success: bool
    role: str
    devices: list[ManagedDevice]


class ManagedExperimentsResponse(BaseModel):
    success: bool
    role: str
    experiments: list[ManagedExperiment]


class NewUserPermissionRequest(BaseModel):
    actor_email: str
    first_name: str
    user_mail: str
    owner: str
    mac_address: str
    exp_name: str
    role_val: Literal["read", "admin", "system_admin"]
    send_email: bool = True
    password: str | None = None
    auto_generate_password: bool = True


class ExistingUserPermissionRequest(BaseModel):
    actor_email: str
    user_mail: str
    owner: str
    mac_address: str
    exp_name: str
    role_val: Literal["read", "admin", "system_admin"]
    send_email: bool = True


class UserSearchResult(BaseModel):
    email: str


class BatchOperationItem(BaseModel):
    user_mail: str
    exp_name: str
    status: Literal["added", "already_existed", "failed"]
    message: str


class BatchOperationSummary(BaseModel):
    success: bool = True
    message: str = "Permission processing completed"
    total: int
    added: int
    already_existed: int
    failed: int
    items: list[BatchOperationItem]


class ExistingUsersBatchRequest(BaseModel):
    actor_email: str
    user_mails: list[str]
    owner: str
    mac_address: str
    exp_names: list[str]
    role_val: Literal["read", "admin", "system_admin"]
    send_email: bool = True


class ExistingPermissionRow(BaseModel):
    email: str
    mac_address: str
    experiment: str


class CheckExistingPermissionsRequest(BaseModel):
    actor_email: str
    users: list[str]
    mac_address: str
    experiments: list[str]


class CheckExistingPermissionsResponse(BaseModel):
    existing: list[ExistingPermissionRow]


def clean_email(value: str) -> str:
    return "".join(value.split()).lower()


def clean_role(value: str) -> str:
    return re.sub(r"\s+", "", value).lower()


def role_priority(role: str) -> int:
    normalized = clean_role(role)
    if normalized == "system_admin":
        return 3
    if normalized == "admin":
        return 2
    return 1


def strongest_role(rows: list[PermissionScopeRow]) -> str | None:
    if not rows:
        return None
    return max((row.role for row in rows), key=role_priority, default=None)


def can_add_permission(
    actor_role: str | None,
    actor_rows: list[PermissionScopeRow],
    owner: str,
    mac_address: str,
    exp_name: str,
) -> bool:
    if actor_role == "read":
        return False
    if actor_role == "system_admin":
        return True
    if actor_role == "admin":
        return any(
            row.owner == owner and row.mac_address == mac_address and row.role == "admin"
            for row in actor_rows
        )
    return False


def load_actor_permissions(actor_email: str) -> list[PermissionScopeRow]:
    settings = get_settings()
    query = f"""
SELECT
  owner,
  mac_address,
  experiment,
  role
FROM `{settings.permissions_table}`
WHERE LOWER(REGEXP_REPLACE(email, r'\\s+', '')) = @email
ORDER BY owner, mac_address, experiment;
"""
    query_parameters = [bigquery.ScalarQueryParameter("email", "STRING", actor_email)]
    rows = run_query(query=query, query_parameters=query_parameters)
    permission_rows: list[PermissionScopeRow] = []
    for row in rows:
        normalized_role = clean_role((row["role"] or "read"))
        if normalized_role not in VALID_ROLES:
            normalized_role = "read"
        permission_rows.append(
            PermissionScopeRow(
                owner=row["owner"],
                mac_address=row["mac_address"],
                experiment=row["experiment"],
                role=normalized_role,
            )
        )
    return permission_rows


def actor_role_from_rows(actor_rows: list[PermissionScopeRow]) -> str:
    role = strongest_role(actor_rows)
    if not role:
        raise HTTPException(status_code=403, detail="Actor has no permission records")
    return role


def friendly_error_from_access_manager(
    status_code: int, detail: str, default_message: str
) -> HTTPException:
    lowered = detail.lower()
    if status_code == 404 and "does not exist" in lowered:
        return HTTPException(status_code=404, detail="User does not exist. Use 'New User' tab.")
    if status_code == 409 and "already exists" in lowered and "permission" in lowered:
        return HTTPException(status_code=409, detail="Permission already exists.")
    if status_code == 409 and "already exists" in lowered:
        return HTTPException(
            status_code=409,
            detail="User already exists. Use 'Existing User' tab.",
        )
    return HTTPException(status_code=status_code, detail=detail or default_message)


def random_password(length: int = 10) -> str:
    letters = string.ascii_letters
    digits = string.digits
    alphabet = letters + digits
    while True:
        candidate = "".join(random.choice(alphabet) for _ in range(length))
        if any(c.isalpha() for c in candidate) and any(c.isdigit() for c in candidate):
            return candidate


def call_access_manager(payload: dict) -> dict:
    settings = get_settings()
    access_manager_url = settings.access_manager_url
    if not access_manager_url:
        raise HTTPException(status_code=500, detail="Access manager URL is not configured")
    try:
        with httpx.Client(timeout=20.0) as client:
            response = client.post(access_manager_url, json=payload)
    except httpx.RequestError:
        raise HTTPException(status_code=503, detail="Access manager service unavailable")

    body_text = response.text.strip()
    print("CF status:", response.status_code)
    print("CF body:", body_text)

    if not response.is_success:
        detail = body_text or "Access manager request failed"
        raise friendly_error_from_access_manager(
            status_code=response.status_code,
            detail=detail,
            default_message="Access manager request failed",
        )
    return {
        "success": True,
        "message": body_text or "Request completed",
        "status_code": response.status_code,
    }


def call_access_manager_soft(payload: dict) -> tuple[bool, int, str]:
    settings = get_settings()
    access_manager_url = settings.access_manager_url
    if not access_manager_url:
        return False, 500, "Access manager URL is not configured"
    try:
        with httpx.Client(timeout=20.0) as client:
            response = client.post(access_manager_url, json=payload)
    except httpx.RequestError:
        return False, 503, "Access manager service unavailable"
    body_text = response.text.strip()
    print("CF status:", response.status_code)
    print("CF body:", body_text)
    if response.is_success:
        message = body_text or "Success"
        return True, response.status_code, message
    detail = body_text or "Request failed"
    return False, response.status_code, detail or "Request failed"


@router.get("/permissions/manage/devices", response_model=ManagedDevicesResponse)
def get_managed_devices(actor_email: str = Query(..., min_length=1)) -> ManagedDevicesResponse:
    actor = clean_email(actor_email)
    actor_rows = load_actor_permissions(actor)
    actor_role = actor_role_from_rows(actor_rows)
    if actor_role == "read":
        raise HTTPException(status_code=403, detail="Not authorized for permission management")

    settings = get_settings()
    if actor_role == "system_admin":
        query = f"""
SELECT DISTINCT
  p.owner,
  p.mac_address,
  COALESCE(m.device_name, m.description, p.mac_address) AS device_name
FROM `{settings.permissions_table}` p
LEFT JOIN `{settings.mac_to_device_table}` m
  ON p.mac_address = m.mac_address
ORDER BY owner, mac_address;
"""
        rows = run_query(query=query, query_parameters=[])
    else:
        query = f"""
SELECT DISTINCT
  p.owner,
  p.mac_address,
  COALESCE(m.device_name, m.description, p.mac_address) AS device_name
FROM `{settings.permissions_table}` p
LEFT JOIN `{settings.mac_to_device_table}` m
  ON p.mac_address = m.mac_address
WHERE LOWER(REGEXP_REPLACE(p.email, r'\\s+', '')) = @email
  AND LOWER(REGEXP_REPLACE(p.role, r'\\s+', '')) = 'admin'
ORDER BY owner, mac_address;
"""
        rows = run_query(
            query=query,
            query_parameters=[bigquery.ScalarQueryParameter("email", "STRING", actor)],
        )

    devices = [
        ManagedDevice(
            owner=row["owner"],
            mac_address=row["mac_address"],
            device_name=row["device_name"] or row["mac_address"],
        )
        for row in rows
    ]
    return ManagedDevicesResponse(success=True, role=actor_role, devices=devices)


@router.get("/permissions/manage/experiments", response_model=ManagedExperimentsResponse)
def get_managed_experiments(
    actor_email: str = Query(..., min_length=1),
    owner: str = Query(..., min_length=1),
    mac_address: str = Query(..., min_length=1),
) -> ManagedExperimentsResponse:
    actor = clean_email(actor_email)
    owner_clean = owner.strip()
    mac_clean = mac_address.replace(" ", "")
    actor_rows = load_actor_permissions(actor)
    actor_role = actor_role_from_rows(actor_rows)
    if actor_role == "read":
        raise HTTPException(status_code=403, detail="Not authorized for permission management")
    if actor_role == "admin":
        has_admin_scope = any(
            r.owner == owner_clean and r.mac_address == mac_clean and r.role == "admin" for r in actor_rows
        )
        if not has_admin_scope:
            raise HTTPException(status_code=403, detail="Not authorized for this device")

    settings = get_settings()
    query = f"""
SELECT DISTINCT
  Owner AS owner,
  Mac_Address AS mac_address,
  Exp_Name AS exp_name
FROM `{settings.sensors_data_table}`
WHERE Owner = @owner
  AND Mac_Address = @mac_address
  AND Exp_Name IS NOT NULL
  AND TRIM(Exp_Name) != ''
ORDER BY exp_name;
"""
    rows = run_query(
        query=query,
        query_parameters=[
            bigquery.ScalarQueryParameter("owner", "STRING", owner_clean),
            bigquery.ScalarQueryParameter("mac_address", "STRING", mac_clean),
        ],
    )
    experiments = [
        ManagedExperiment(owner=row["owner"], mac_address=row["mac_address"], exp_name=row["exp_name"])
        for row in rows
    ]
    return ManagedExperimentsResponse(success=True, role=actor_role, experiments=experiments)


@router.get("/users/search", response_model=list[UserSearchResult])
def search_existing_users(
    q: str = Query(..., min_length=1),
    actor_email: str = Query(..., min_length=1),
) -> list[UserSearchResult]:
    actor = clean_email(actor_email)
    actor_rows = load_actor_permissions(actor)
    actor_role = actor_role_from_rows(actor_rows)
    if actor_role not in {"admin", "system_admin"}:
        raise HTTPException(status_code=403, detail="Forbidden")

    q_clean = clean_email(q)
    if len(q_clean) < 2:
        return []

    settings = get_settings()
    query = f"""
SELECT DISTINCT
  LOWER(REGEXP_REPLACE(email, r'\\s+', '')) AS email
FROM `{settings.user_table}`
WHERE LOWER(REGEXP_REPLACE(email, r'\\s+', '')) LIKE CONCAT('%', @q, '%')
ORDER BY email
LIMIT 20;
"""
    rows = run_query(
        query=query,
        query_parameters=[bigquery.ScalarQueryParameter("q", "STRING", q_clean)],
    )
    return [UserSearchResult(email=row["email"]) for row in rows if row["email"]]


@router.post("/permissions/add", response_model=AddPermissionResponse)
def add_permission_with_role_validation(payload: AddPermissionRequest) -> AddPermissionResponse:
    actor_email = clean_email(payload.actor_email)
    target_email = clean_email(payload.user_mail)

    if not actor_email or not target_email:
        raise HTTPException(status_code=400, detail="actor_email and user_mail are required")

    actor_rows = load_actor_permissions(actor_email)
    actor_role = actor_role_from_rows(actor_rows)

    if not can_add_permission(
        actor_role=actor_role,
        actor_rows=actor_rows,
        owner=payload.owner,
        mac_address=payload.mac_address,
        exp_name=payload.exp_name,
    ):
        raise HTTPException(status_code=403, detail="Permission denied for requested scope")

    downstream_payload = {
        "action": "add_permission",
        "user_mail": target_email,
        "first_name": payload.first_name.strip(),
        "owner": payload.owner.strip(),
        "mac_address": payload.mac_address.replace(" ", ""),
        "exp_name": payload.exp_name.strip(),
        "role_val": clean_role(payload.role_val),
        "send_email": payload.send_email,
    }
    data = call_access_manager(downstream_payload)
    success = bool(data.get("success", True))
    message = data.get("message", "Permission added")
    return AddPermissionResponse(
        success=success,
        message=message,
        actor_role=actor_role,
        forwarded_response=data,
    )


@router.post("/permissions/manage/new-user", response_model=AddPermissionResponse)
def create_user_and_add_permission(payload: NewUserPermissionRequest) -> AddPermissionResponse:
    actor_email = clean_email(payload.actor_email)
    target_email = clean_email(payload.user_mail)
    actor_rows = load_actor_permissions(actor_email)
    actor_role = actor_role_from_rows(actor_rows)
    if actor_role != "system_admin":
        raise HTTPException(status_code=403, detail="Only system_admin can create new users")
    if not can_add_permission(
        actor_role=actor_role,
        actor_rows=actor_rows,
        owner=payload.owner.strip(),
        mac_address=payload.mac_address.replace(" ", ""),
        exp_name=payload.exp_name.strip(),
    ):
        raise HTTPException(status_code=403, detail="Not authorized for requested scope")

    password = payload.password.strip() if payload.password else ""
    if payload.auto_generate_password or not password:
        password = random_password()

    create_data = call_access_manager(
        {
            "action": "create_user",
            "user_mail": target_email,
            "first_name": payload.first_name.strip(),
            "password": password,
            "send_email": payload.send_email,
        }
    )
    exp_names: list[str] = [payload.exp_name.strip()]
    add_data: dict = {}
    for exp_name in exp_names:
        add_data = call_access_manager(
            {
                "action": "add_permission",
                "user_mail": target_email,
                "first_name": payload.first_name.strip(),
                "owner": payload.owner.strip(),
                "mac_address": payload.mac_address.replace(" ", ""),
                "exp_name": exp_name,
                "role_val": clean_role(payload.role_val),
                "send_email": payload.send_email,
            }
        )
    return AddPermissionResponse(
        success=bool(add_data.get("success", True)),
        message=add_data.get("message", "User created and permission added"),
        actor_role=actor_role,
        forwarded_response={"create_user": create_data, "add_permission": add_data},
    )


@router.post("/permissions/manage/existing-user", response_model=AddPermissionResponse)
def add_permission_existing_user(payload: ExistingUserPermissionRequest) -> AddPermissionResponse:
    actor_email = clean_email(payload.actor_email)
    target_email = clean_email(payload.user_mail)
    actor_rows = load_actor_permissions(actor_email)
    actor_role = actor_role_from_rows(actor_rows)
    if not can_add_permission(
        actor_role=actor_role,
        actor_rows=actor_rows,
        owner=payload.owner.strip(),
        mac_address=payload.mac_address.replace(" ", ""),
        exp_name=payload.exp_name.strip(),
    ):
        raise HTTPException(status_code=403, detail="Not authorized for requested scope")
    data = call_access_manager(
        {
            "action": "add_permission",
            "user_mail": target_email,
            "first_name": "",
            "owner": payload.owner.strip(),
            "mac_address": payload.mac_address.replace(" ", ""),
            "exp_name": payload.exp_name.strip(),
            "role_val": clean_role(payload.role_val),
            "send_email": payload.send_email,
        }
    )
    return AddPermissionResponse(
        success=bool(data.get("success", True)),
        message=data.get("message", "Permission added"),
        actor_role=actor_role,
        forwarded_response=data,
    )


@router.post("/permissions/manage/existing-users/batch", response_model=BatchOperationSummary)
def add_permissions_existing_users_batch(payload: ExistingUsersBatchRequest) -> BatchOperationSummary:
    actor_email = clean_email(payload.actor_email)
    actor_rows = load_actor_permissions(actor_email)
    actor_role = actor_role_from_rows(actor_rows)
    owner = payload.owner.strip()
    mac_address = payload.mac_address.replace(" ", "")
    if actor_role not in {"admin", "system_admin"}:
        raise HTTPException(status_code=403, detail="Not authorized for requested scope")
    if not any(
        can_add_permission(actor_role=actor_role, actor_rows=actor_rows, owner=owner, mac_address=mac_address, exp_name=exp_name.strip())
        for exp_name in payload.exp_names
    ):
        raise HTTPException(status_code=403, detail="Not authorized for requested scope")

    cleaned_users = sorted({clean_email(email) for email in payload.user_mails if clean_email(email)})
    cleaned_experiments = sorted({exp.strip() for exp in payload.exp_names if exp.strip()})
    if not cleaned_users or not cleaned_experiments:
        raise HTTPException(status_code=400, detail="user_mails and exp_names must not be empty")

    items: list[BatchOperationItem] = []
    added = 0
    already_existed = 0
    failed = 0

    for user_email in cleaned_users:
        for exp_name in cleaned_experiments:
            if not can_add_permission(
                actor_role=actor_role,
                actor_rows=actor_rows,
                owner=owner,
                mac_address=mac_address,
                exp_name=exp_name,
            ):
                items.append(
                    BatchOperationItem(
                        user_mail=user_email,
                        exp_name=exp_name,
                        status="failed",
                        message="Not authorized for requested scope",
                    )
                )
                failed += 1
                continue

            success, status_code, message = call_access_manager_soft(
                {
                    "action": "add_permission",
                    "user_mail": user_email,
                    "first_name": "",
                    "owner": owner,
                    "mac_address": mac_address,
                    "exp_name": exp_name,
                    "role_val": clean_role(payload.role_val),
                    "send_email": payload.send_email,
                }
            )
            if success:
                status = "added"
                added += 1
            elif status_code == 409 and "already exists" in message.lower():
                status = "already_existed"
                already_existed += 1
            else:
                status = "failed"
                failed += 1

            items.append(
                BatchOperationItem(
                    user_mail=user_email,
                    exp_name=exp_name,
                    status=status,
                    message=message,
                )
            )

    return BatchOperationSummary(
        success=True,
        message="Permission processing completed",
        total=len(items),
        added=added,
        already_existed=already_existed,
        failed=failed,
        items=items,
    )


@router.post("/permissions/check-existing", response_model=CheckExistingPermissionsResponse)
def check_existing_permissions(payload: CheckExistingPermissionsRequest) -> CheckExistingPermissionsResponse:
    actor_email = clean_email(payload.actor_email)
    actor_rows = load_actor_permissions(actor_email)
    actor_role = actor_role_from_rows(actor_rows)
    if actor_role not in {"admin", "system_admin"}:
        raise HTTPException(status_code=403, detail="Not authorized")

    users = sorted({clean_email(user) for user in payload.users if clean_email(user)})
    experiments = sorted({exp.strip() for exp in payload.experiments if exp.strip()})
    mac_address = payload.mac_address.replace(" ", "")
    if not users or not experiments or not mac_address:
        return CheckExistingPermissionsResponse(existing=[])

    settings = get_settings()
    query = f"""
SELECT
  LOWER(REGEXP_REPLACE(email, r'\\s+', '')) AS email,
  mac_address,
  experiment
FROM `{settings.permissions_table}`
WHERE LOWER(REGEXP_REPLACE(email, r'\\s+', '')) IN UNNEST(@users)
  AND mac_address = @mac_address
  AND experiment IN UNNEST(@experiments)
ORDER BY email, experiment;
"""
    rows = run_query(
        query=query,
        query_parameters=[
            bigquery.ArrayQueryParameter("users", "STRING", users),
            bigquery.ScalarQueryParameter("mac_address", "STRING", mac_address),
            bigquery.ArrayQueryParameter("experiments", "STRING", experiments),
        ],
    )
    existing = [
        ExistingPermissionRow(
            email=row["email"],
            mac_address=row["mac_address"],
            experiment=row["experiment"],
        )
        for row in rows
    ]
    return CheckExistingPermissionsResponse(existing=existing)
