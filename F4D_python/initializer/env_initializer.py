import re
import subprocess
import socket
import os

ENV_PATH = "/home/pi/F4D/.env"


def ensure_env_file_exists():
    """
    Ensure the .env file exists.
    """
    if not os.path.exists(ENV_PATH):
        print(f".env not found, creating {ENV_PATH}")
        with open(ENV_PATH, "w") as f:
            f.write("")


def get_mac_address():
    """
    Return MAC address without colons, lowercase.
    """
    mac = subprocess.check_output(
        "cat /sys/class/net/eth0/address", shell=True
    ).decode().strip()

    mac = re.sub(":", "", mac).lower()
    return mac


def get_hostname():
    return socket.gethostname()


def sanitize(value):
    """
    Make hostname safe for dataset IDs etc.
    """
    return re.sub(r"[^a-zA-Z0-9_]", "_", value).lower()


def update_env_var(var_name, value):
    """
    Update or append variable in .env
    """

    with open(ENV_PATH, "r") as f:
        lines = f.readlines()

    pattern = re.compile(rf"^{var_name}=")
    found = False

    for i, line in enumerate(lines):
        if pattern.match(line):
            lines[i] = f"{var_name}={value}\n"
            found = True
            break

    if not found:
        lines.append(f"{var_name}={value}\n")

    with open(ENV_PATH, "w") as f:
        f.writelines(lines)


def run_initializer():
    ensure_env_file_exists()

    mac = get_mac_address()
    hostname = sanitize(get_hostname())

    update_env_var("MAC_ADDRESS", mac)
    update_env_var("HOSTNAME", hostname)
    
    update_env_var(
        "API_SYNC_URL",
        "https://apisync-1000435921680.us-central1.run.app"
    )
    
    update_env_var(
        "F4D_BQ_SYNC_URL",
        "https://f4d-bq-sync-1000435921680.me-west1.run.app"
    )


    print("Initializer completed")
    print(f"MAC_ADDRESS={mac}")
    print(f"HOSTNAME={hostname}")


if __name__ == "__main__":
    run_initializer()