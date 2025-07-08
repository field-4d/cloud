import re
import subprocess
import socket
import os

# Function to get the MAC address in lowercase without colons
def get_mac_adress():
    """
    Get the MAC address of the device.
    1. Get the MAC address of the device.
    2. Remove colons from the MAC address.
    3. Convert the MAC address to lowercase.
    4. Return the MAC address of the device in lowercase without colons.

    :return: The MAC address of the device in lowercase without colons.
    """
    # Get the MAC address of the device
    mac = subprocess.check_output('cat /sys/class/net/eth0/address', shell=True).decode('utf-8').strip()
    # Remove colons from the MAC address
    mac = re.sub(':', '', mac)
    # Convert the MAC address to lowercase
    mac = mac.lower()
    return mac


def update_env_file(env_file_path, var_name, mac_address):
    """
    update the environment file with the given variable name and MAC address.
    1. Read the content of the environment file.
    2. Compile a regex pattern to match the desired environment variable.
    3. Check if the variable exists in the file.
    4. If the variable exists, update the MAC address if it is different.
    5. If the variable does not exist, append it to the file.
    6. Write the updated content back to the environment file.

    :param env_file_path: The path to the environment file.
    :param var_name: The name of the environment variable to update.
    :param mac_address: The MAC address to set for the environment variable.


    """
    # Initialize flag to determine if the file needs to be updated
    file_needs_update = False
    try:
        with open(env_file_path, 'r') as file:
            content = file.readlines()
        # Compile a regex pattern to match the desired environment variable
        mac_pattern = re.compile(rf'^{var_name}=(.*)')

        for i, line in enumerate(content):
            match = mac_pattern.match(line)
            if match:
                existing_mac = match.group(1).strip()
                if existing_mac != mac_address:
                    content[i] = f"{var_name}={mac_address}\n"
                    file_needs_update = True
                    print(f"Updated {var_name} in {env_file_path}.")
                else:
                    print(f"{var_name} is already up to date in {env_file_path}.")
                break
        else:
            # This block executes if the for loop completes without breaking, meaning the var was not found
            content.append(f"{var_name}={mac_address}\n")
            file_needs_update = True
            print(f"Appended {var_name} to {env_file_path}.")

        if file_needs_update:
            with open(env_file_path, 'w') as file:
                file.writelines(content)
                print(f"Successfully updated {env_file_path}.")

    except IOError as e:
        print(f"Error accessing {env_file_path}: {e}")

def get_hostname():
    """
    Get the hostname of the device.

    :return: The hostname of the device.
    """
    return socket.gethostname()

def sanitize_dataset_id(dataset_id):
    """
    Sanitizes a dataset ID to ensure compatibility with BigQuery naming rules.

    BigQuery Dataset ID Rules:
    1. Allowed: Letters (a-z, A-Z), Numbers (0-9), and Underscores (_).
    2. Must start with a letter or number (cannot start with an underscore).
    3. Spaces and special characters (-, @, #, !, $, %, etc.) are not allowed.
    4. Maximum length: 1024 characters.

    This function replaces any invalid character with an underscore (_).

    :param dataset_id: The original dataset ID string.
    :return: A sanitized dataset ID compliant with BigQuery rules.
    """
    return re.sub(r"[^a-zA-Z0-9_]", "_", dataset_id).lower()  # Replace invalid characters with "_"

def update_device_owner(env_file_path):
    hostname = get_hostname()
    hostname_sanitized = sanitize_dataset_id(hostname)#.lower()
    update_env_file(env_file_path, "Device_Owner", hostname_sanitized)


env_path  = ["/home/pi/6to4/.env","/home/pi/6to4/.env","/home/pi/6to4/.env"]
env_var_name = ["BUCKET_NAME", "LOCAL_BUCKET", "CLOUD_BUCKET"]

# Main Logic
for path,var_name in zip(env_path,env_var_name):
    MAC_ADRESS = get_mac_adress()
    update_env_file(path,var_name,MAC_ADRESS)

# Update Device_Owner
for path in env_path:
    update_device_owner(path)
