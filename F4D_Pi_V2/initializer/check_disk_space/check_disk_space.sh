#!/bin/bash

# Check if the main partition is fully expanded
FULL_SIZE=$(lsblk -o SIZE -dn /dev/mmcblk0)
PART_SIZE=$(lsblk -o SIZE -dn /dev/mmcblk0p2)

if [ "$FULL_SIZE" != "$PART_SIZE" ]; then
    # If not fully expanded, expand the filesystem
    raspi-config --expand-rootfs
    # Optionally, you can add a command to reboot the system
    echo "Filesystem expanded, a reboot is required!"
    # sudo reboot
else
    echo "Filesystem is fully expanded."
fi
