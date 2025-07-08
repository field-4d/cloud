#!/bin/bash

# not working yet

# Function to get the MAC address in lowercase without colons
get_mac_address() {
    # Get the MAC address, remove colons, and convert to lowercase
    mac=$(cat /sys/class/net/eth0/address | tr -d ':' | tr '[:upper:]' '[:lower:]')
    echo $mac
}

# Function to update the .env file with the new MAC address
update_env_file() {
    local env_file_path=$1
    local var_name=$2
    local mac_address=$3

    # Check if the variable exists in the file
    if grep -q "^${var_name}=" "$env_file_path"; then
        # Variable exists, check if it needs updating
        if ! grep -q "^${var_name}=${mac_address}$" "$env_file_path"; then
            # Update the variable with the new MAC address
            sed -i "s/^${var_name}=.*/${var_name}=${mac_address}/" "$env_file_path"
            echo "Updated ${var_name} in ${env_file_path}."
        else
            echo "${var_name} is already up to date in ${env_file_path}."
        fi
    else
        # Variable does not exist, append it
        echo "${var_name}=${mac_address}" >> "$env_file_path"
        echo "Appended ${var_name} to ${env_file_path}."
    fi
}

# Main logic
mac_address=$(get_mac_address)

# Define paths and variables to be updated
env_paths=("/home/pi/6to4/MongoUpload/env" "/home/pi/6to4/gapUpdater/env" "/home/pi/6to4/.env")
env_var_names=("BB_INFLUX_BUCKET" "CLOUD_INFLUX_BUCKET" "BUCKET_NAME")

# Loop through the paths and variable names
for i in "${!env_paths[@]}"; do
    update_env_file "${env_paths[$i]}" "${env_var_names[$i]}" "$mac_address"
done
