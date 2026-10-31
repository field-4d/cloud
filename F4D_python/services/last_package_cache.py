import threading
from copy import deepcopy


_lock = threading.Lock()
_cache = {}


def update_last_package_cache(packet):
    """
    Merge the latest packet into the cache for one sensor.

    Expected packet format:
    {
        "ipv6": "<LLA>",
        ... sensor values ...
    }

    Only the latest value for each field is kept.
    """

    lla = packet.get("ipv6")

    if not lla:
        raise ValueError("Last Package cache packet is missing 'ipv6'")

    with _lock:
        if lla not in _cache:
            _cache[lla] = {}

        _cache[lla].update(deepcopy(packet))


def get_last_package_cache_snapshot():
    """
    Return a copy of the current cache without modifying it.
    Useful for tests/debugging.
    """

    with _lock:
        return deepcopy(_cache)


def pop_last_package_cache_snapshot():
    """
    Atomically return the current cache and clear it.

    Packets arriving after the clear belong to the next window.
    """

    with _lock:
        snapshot = deepcopy(_cache)
        _cache.clear()

    return snapshot


def get_last_package_cache_size():
    with _lock:
        return len(_cache)
