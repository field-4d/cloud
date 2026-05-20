from __future__ import annotations

from functools import lru_cache

import firebase_admin
from fastapi import HTTPException, Security
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from firebase_admin import auth, credentials

from config.settings import get_settings


def _normalize_email(value: str) -> str:
    return "".join(str(value).split()).lower()


firebase_bearer_scheme = HTTPBearer(auto_error=False)


@lru_cache(maxsize=1)
def _ensure_firebase_initialized() -> None:
    # Use Application Default Credentials. On GCP this is automatic.
    # For local development, GOOGLE_APPLICATION_CREDENTIALS can point to a service account file.
    if firebase_admin._apps:
        return
    firebase_admin.initialize_app(credentials.ApplicationDefault())


def verify_firebase_user(
    credentials_value: HTTPAuthorizationCredentials | None = Security(firebase_bearer_scheme),
) -> dict[str, str]:
    if not credentials_value or not credentials_value.credentials.strip():
        raise HTTPException(status_code=401, detail="Missing Authorization header")

    if credentials_value.scheme.lower() != "bearer":
        raise HTTPException(status_code=401, detail="Invalid Authorization header format")
    token = credentials_value.credentials.strip()

    _ensure_firebase_initialized()

    try:
        settings = get_settings()
        decoded_token = auth.verify_id_token(
            token,
            check_revoked=False,
            clock_skew_seconds=30,
        )
        if settings.firebase_project_id and decoded_token.get("aud") != settings.firebase_project_id:
            raise HTTPException(status_code=401, detail="Token audience mismatch")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=401, detail="Invalid Firebase token") from exc

    email = decoded_token.get("email")
    if not email:
        raise HTTPException(status_code=401, detail="Firebase token is missing email claim")

    uid = decoded_token.get("uid")
    if not uid:
        raise HTTPException(status_code=401, detail="Firebase token is missing uid claim")

    return {
        "uid": str(uid),
        "email": _normalize_email(email),
    }
