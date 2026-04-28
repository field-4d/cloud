import base64
import hashlib

import httpx
from fastapi import APIRouter, HTTPException
from google.cloud import bigquery
from pydantic import BaseModel

from config.settings import get_settings
from services.bigquery_client import run_query


router = APIRouter()


class AuthRequest(BaseModel):
    email: str
    password: str


class UserData(BaseModel):
    email: str


class LoginPermissionRow(BaseModel):
    owner: str
    mac_address: str
    experiment: str
    role: str


class AuthResponse(BaseModel):
    success: bool
    message: str
    userData: UserData | None = None
    jwtToken: str | None = None
    access_token: str | None = None
    token_type: str | None = None
    email: str | None = None
    role: str | None = None
    permissions: list[LoginPermissionRow] = []


def hash_password(password: str) -> str:
    digest = hashlib.sha256(password.encode("utf-8")).digest()
    return base64.b64encode(digest).decode("utf-8")


def clean_email(email: str) -> str:
    return "".join(email.split()).lower()


def role_priority(role: str) -> int:
    normalized = role.strip().lower()
    if normalized == "system_admin":
        return 3
    if normalized == "admin":
        return 2
    return 1


def strongest_role(roles: list[str]) -> str | None:
    if not roles:
        return None
    return max((r.strip().lower() for r in roles if r), key=role_priority, default=None)


@router.post("/auth", response_model=AuthResponse)
def post_auth(payload: AuthRequest) -> AuthResponse:
    email = clean_email(payload.email)
    password = payload.password
    if not email or not password:
        raise HTTPException(status_code=400, detail="email and password are required")

    settings = get_settings()
    auth_url = settings.auth_url or settings.gcp_auth_url
    if not auth_url:
        raise HTTPException(status_code=500, detail="Authentication service URL is not configured")

    request_body = {
        "email": email,
        "hashed_password": hash_password(password),
    }

    try:
        with httpx.Client(timeout=15.0) as client:
            response = client.post(auth_url, json=request_body)
    except httpx.RequestError:
        raise HTTPException(status_code=503, detail="Authentication service unavailable")

    try:
        auth_result = response.json()
    except ValueError:
        raise HTTPException(status_code=502, detail="Invalid authentication service response")

    if not response.is_success or not auth_result.get("success"):
        raise HTTPException(
            status_code=401,
            detail=auth_result.get("message", "Invalid credentials"),
        )

    token = auth_result.get("token")
    if not token:
        raise HTTPException(status_code=502, detail="Authentication token missing in response")

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
    query_parameters = [bigquery.ScalarQueryParameter("email", "STRING", email)]
    rows = run_query(query=query, query_parameters=query_parameters)

    permission_rows: list[LoginPermissionRow] = []
    for row in rows:
        permission_rows.append(
            LoginPermissionRow(
                owner=row["owner"],
                mac_address=row["mac_address"],
                experiment=row["experiment"],
                role=(row["role"] or "read").strip().lower(),
            )
        )

    top_role = strongest_role([permission.role for permission in permission_rows])

    return AuthResponse(
        success=True,
        message="Authentication successful",
        userData=UserData(email=email),
        jwtToken=token,
        access_token=token,
        token_type="bearer",
        email=email,
        role=top_role,
        permissions=permission_rows,
    )
