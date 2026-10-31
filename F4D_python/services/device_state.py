import threading
from datetime import datetime, timezone


_lock = threading.Lock()
_stream_open_until = None


def _parse_utc_timestamp(value):
    """
    Parse an ISO-8601 timestamp returned by ApiSync.

    Example:
    2026-10-18T12:40:49.889221Z
    """
    if not value:
        return None

    return datetime.fromisoformat(
        value.replace("Z", "+00:00")
    ).astimezone(timezone.utc)


def update_stream_state(stream):
    """
    Update local stream state from a successful heartbeat response.

    active=True  -> store open_until
    active=False -> clear local lease
    """
    global _stream_open_until

    active = bool(stream.get("active"))
    open_until_raw = stream.get("open_until")

    if active and open_until_raw:
        new_open_until = _parse_utc_timestamp(open_until_raw)
    else:
        new_open_until = None

    with _lock:
        old_mode = _get_mode_unlocked()
        _stream_open_until = new_open_until
        new_mode = _get_mode_unlocked()

    return {
        "old_mode": old_mode,
        "new_mode": new_mode,
        "open_until": new_open_until,
    }


def _get_mode_unlocked():
    if _stream_open_until is None:
        return "NORMAL"

    now_utc = datetime.now(timezone.utc)

    if now_utc < _stream_open_until:
        return "LIVE"

    return "NORMAL"


def get_mode():
    with _lock:
        return _get_mode_unlocked()


def is_live():
    return get_mode() == "LIVE"


def get_stream_open_until():
    with _lock:
        return _stream_open_until
