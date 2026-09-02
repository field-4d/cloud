from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
import zlib
from typing import Any

from config.settings import get_settings


CURSOR_SCHEMA_VERSION = "f4d-fetch-page-cursor-v1"
MAX_CURSOR_TOKEN_BYTES = 64 * 1024
MAX_CURSOR_PAYLOAD_BYTES = 48 * 1024
_PROCESS_CURSOR_SECRET = secrets.token_bytes(32)


class CursorValidationError(ValueError):
    """Raised when an opaque fetch cursor is malformed or fails validation."""


def _urlsafe_encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("ascii").rstrip("=")


def _urlsafe_decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(value + padding)


def _cursor_secret() -> bytes:
    configured = get_settings().fetch_cursor_secret
    if configured:
        return configured.encode("utf-8")
    return _PROCESS_CURSOR_SECRET


def encode_cursor(payload: dict[str, Any]) -> str:
    document = {"cursor_schema": CURSOR_SCHEMA_VERSION, **payload}
    raw = json.dumps(
        document,
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")
    if len(raw) > MAX_CURSOR_PAYLOAD_BYTES:
        raise CursorValidationError("Cursor state exceeds the supported size")

    compressed = zlib.compress(raw, level=6)
    signature = hmac.new(_cursor_secret(), compressed, hashlib.sha256).digest()
    return f"{_urlsafe_encode(compressed)}.{_urlsafe_encode(signature)}"


def decode_cursor(token: str) -> dict[str, Any]:
    if not token or len(token.encode("utf-8")) > MAX_CURSOR_TOKEN_BYTES:
        raise CursorValidationError("Malformed cursor")

    try:
        encoded_payload, encoded_signature = token.split(".", 1)
        compressed = _urlsafe_decode(encoded_payload)
        signature = _urlsafe_decode(encoded_signature)
    except (ValueError, TypeError, base64.binascii.Error) as exc:
        raise CursorValidationError("Malformed cursor") from exc

    expected = hmac.new(_cursor_secret(), compressed, hashlib.sha256).digest()
    if not hmac.compare_digest(signature, expected):
        raise CursorValidationError("Invalid cursor signature")

    try:
        decompressor = zlib.decompressobj()
        raw = decompressor.decompress(compressed, MAX_CURSOR_PAYLOAD_BYTES + 1)
        if decompressor.unconsumed_tail or len(raw) > MAX_CURSOR_PAYLOAD_BYTES:
            raise CursorValidationError("Cursor payload is too large")
        raw += decompressor.flush()
        if len(raw) > MAX_CURSOR_PAYLOAD_BYTES:
            raise CursorValidationError("Cursor payload is too large")
        document = json.loads(raw.decode("utf-8"))
    except CursorValidationError:
        raise
    except (zlib.error, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise CursorValidationError("Malformed cursor payload") from exc

    if not isinstance(document, dict) or document.get("cursor_schema") != CURSOR_SCHEMA_VERSION:
        raise CursorValidationError("Unsupported cursor schema")
    return document
