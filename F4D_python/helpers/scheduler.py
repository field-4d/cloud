from datetime import datetime, timedelta
import time


def get_next_minute_boundary(interval_minutes: int, now=None):
    if now is None:
        now = datetime.now()

    minute_block = (now.minute // interval_minutes) * interval_minutes
    current_boundary = now.replace(minute=minute_block, second=0, microsecond=0)

    if now >= current_boundary:
        return current_boundary + timedelta(minutes=interval_minutes)

    return current_boundary


def get_next_3min_boundary(now=None):
    return get_next_minute_boundary(3, now)


def get_next_5min_boundary(now=None):
    return get_next_minute_boundary(5, now)


def format_dt(dt_obj):
    return dt_obj.strftime("%Y-%m-%d %H:%M:%S")


def sleep_until(target_dt):
    while True:
        remaining = (target_dt - datetime.now()).total_seconds()
        if remaining <= 0:
            break
        time.sleep(min(remaining, 0.5))