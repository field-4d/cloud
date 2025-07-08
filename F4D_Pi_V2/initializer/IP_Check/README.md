# Systemd Services for 6to4 Project

This repository contains various systemd service and timer files for managing different components of the **6to4** project.

## 🚀 Setup for This Version

For this version, you need to manually create or copy scripts for the following services:

### **1. `initializer_mac_to_device.service`**
This service updates the MAC-to-device mapping.

#### **Option 1: Copy from Existing Location**
If the service file is already in `ssh://pi_92/home/pi/6to4/services`, copy it to the systemd directory:
```sh
sudo cp /home/pi/6to4/services/initializer_mac_to_device.service /etc/systemd/system/
```

#### **Option 2: Create the Service File Manually**
1. Open a new service file for editing:
   ```sh
   sudo nano /etc/systemd/system/initializer_mac_to_device.service
   ```
2. Paste the following content:
   ```ini
   [Unit]
   Description=Update MAC to Device Mapping on Boot
   After=influxdb.service mongod.service

   [Service]
   WorkingDirectory=/home/pi/6to4/initializer/MAC_Check
   ExecStart=/usr/bin/python3 /home/pi/6to4/initializer/MAC_Check/mac_to_device.py
   # Restart=on-failure  # Uncomment this line if you want the service to restart on failure

   [Install]
   WantedBy=multi-user.target
   ```
3. Save and exit (`CTRL + X`, then `Y`, then `Enter`).

4. Reload systemd and enable the service:
   ```sh
   sudo systemctl daemon-reload
   sudo systemctl enable initializer_mac_to_device.service
   ```

5. Start the service:
   ```sh
   sudo systemctl start initializer_mac_to_device.service
   ```

6. Check the status:
   ```sh
   sudo systemctl status initializer_mac_to_device.service
   ```

---

### **2. `initializer_mac_to_device.timer`**
This timer schedules the MAC-to-device service to run **30 minutes after boot** and **twice a day (00:00 and 12:00)**.

#### **Option 1: Copy from Existing Location**
If the timer file is already in `ssh://pi_92/home/pi/6to4/services`, copy it to the systemd directory:
```sh
sudo cp /home/pi/6to4/services/initializer_mac_to_device.timer /etc/systemd/system/
```

#### **Option 2: Create the Timer File Manually**
1. Open a new timer file for editing:
   ```sh
   sudo nano /etc/systemd/system/initializer_mac_to_device.timer
   ```
2. Paste the following content:
   ```ini
   [Unit]
   Description=Run mac_to_device service 30 minutes after boot and twice a day

   [Timer]
   OnBootSec=30min
   OnCalendar=*-*-* 00:00,12:00:00
   Persistent=true

   [Install]
   WantedBy=timers.target
   ```
3. Save and exit (`CTRL + X`, then `Y`, then `Enter`).

4. Reload systemd and enable the timer:
   ```sh
   sudo systemctl daemon-reload
   sudo systemctl enable initializer_mac_to_device.timer
   ```

5. Start the timer:
   ```sh
   sudo systemctl start initializer_mac_to_device.timer
   ```

6. Check the timer status:
   ```sh
   sudo systemctl status initializer_mac_to_device.timer
   ```

7. Verify all active timers:
   ```sh
   sudo systemctl list-timers --all
   ```

---

## 📜 License

This project is open-source and free to use.

---

Let me know if you need any modifications! 🚀
