import base64
import hashlib

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from config.settings import get_settings


router = APIRouter()


class AuthRequest(BaseModel):
    email: str
    password: str


class UserData(BaseModel):
    email: str


class AuthResponse(BaseModel):
    success: bool
    message: str
    userData: UserData | None = None
    jwtToken: str | None = None


def hash_password(password: str) -> str:
    digest = hashlib.sha256(password.encode("utf-8")).digest()
    return base64.b64encode(digest).decode("utf-8")


@router.post("/auth", response_model=AuthResponse)
def post_auth(payload: AuthRequest) -> AuthResponse:
    email = payload.email.strip()
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

    return AuthResponse(
        success=True,
        message="Authentication successful",
        userData=UserData(email=email),
        jwtToken=token,
    )
