import subprocess
import time
import serial


def free_serial_port(device: str):
    """
    Kill processes using the serial device.
    """
    try:
        result = subprocess.check_output(
            ["lsof", device],
            stderr=subprocess.DEVNULL
        ).decode()

        lines = result.strip().split("\n")[1:]  # skip header
        pids = set()

        for line in lines:
            parts = line.split()
            cmd = parts[0]
            pid = parts[1]

            if cmd != "screen":
                print(f"[SERIAL] {device} is used by {cmd} (PID {pid}), not killing automatically")
                continue

            print(f"[SERIAL] Killing screen (PID {pid}) using {device}")
            pids.add(pid)

        for pid in pids:
            subprocess.run(["kill", "-9", pid], check=False)

    except subprocess.CalledProcessError:
        print(f"[SERIAL] No process found using {device}")


def open_serial_with_auto_recovery(device: str, baudrate: int):
    """
    Try to open serial. If busy -> kill screen -> retry.
    """
    while True:
        try:
            print(f"[SERIAL] Opening {device}...")
            ser = serial.Serial(device, baudrate, timeout=1)
            print(f"[SERIAL] Connected to {device}")
            return ser

        except serial.SerialException as e:
            msg = str(e)

            if "Device or resource busy" in msg:
                print(f"[SERIAL] {device} is busy. Attempting to free it...")
                free_serial_port(device)
                time.sleep(2)
                continue

            print(f"[SERIAL] Unexpected error: {e}")
            time.sleep(2)