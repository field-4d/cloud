# Systemd Services for 6to4 Project

This repository contains various systemd service and timer files for managing different components of the **6to4** project.

## Setup for This Version 2025-02-20

For this version, you need to manually create or copy scripts for the following services:

### **1. `initializer_mac_to_device.service`**
This service updates the MAC-to-device mapping.

#### **Option 1: Copy from Existing Location**
If the service file is already in `home/pi/6to4/services`, copy it to the systemd directory:
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
   WorkingDirectory=/home/pi/6to4/initializer/IP_Check
   ExecStart=/usr/bin/python3 /home/pi/6to4/initializer/IP_Check/mac_to_device.py
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

## 📂 Other Services and Timer Files

| Service File                                      | Description |
|--------------------------------------------------|-------------|
| `6to4client.service`                             | Runs the 6to4 client service. |
| `6to4server.service`                             | Runs the 6to4 server service. |
| `Dashboard.service`                              | Runs the dashboard for monitoring. |
| `gaps.service`                                   | Manages the GAPs (General Application Processes) service. |
| `initializer.service`                            | Runs the initializer script. |
| `initializer_IpAdressUpdate.service`            | Updates the IP address on boot. |
| `initializer_IpAdressUpdate_Timer.service`      | Schedules the IP address update service. |
| `initializer_mac_to_device.service`             | Maps MAC addresses to devices. |
| `initializer_mac_to_device_timer.service`       | Runs the MAC to device service at scheduled intervals. |
| `initializer_MacUpDate.service`                 | Updates MAC addresses. |
| `mongod.service`                                | Manages the MongoDB service. |
| `MongoUploader.service`                         | Uploads data to MongoDB. |

---

## 🚀 General Setup Instructions

### **1. Move the Service and Timer Files**
Copy all systemd service and timer files to `/etc/systemd/system/`:
```sh
sudo cp /home/pi/6to4/services/*.service /etc/systemd/system/
sudo cp /home/pi/6to4/services/*.timer /etc/systemd/system/
```

### **2. Set Correct Permissions**
Ensure the files have the correct permissions:
```sh
sudo chmod 644 /etc/systemd/system/*.service
sudo chmod 644 /etc/systemd/system/*.timer
```

### **3. Reload systemd**
Apply changes by reloading systemd:
```sh
sudo systemctl daemon-reload
```

### **4. Enable All Services and Timers**
Enable all required services:
```sh
sudo systemctl enable 6to4client.service 6to4server.service Dashboard.service gaps.service initializer.service initializer_IpAdressUpdate.service initializer_mac_to_device.service initializer_MacUpDate.service mongod.service MongoUploader.service
```

Enable all timers for scheduled execution:
```sh
sudo systemctl enable initializer_IpAdressUpdate_Timer.service initializer_mac_to_device_timer.service
```

### **5. Start All Services and Timers**
```sh
sudo systemctl start 6to4client.service 6to4server.service Dashboard.service gaps.service initializer.service initializer_IpAdressUpdate.service initializer_mac_to_device.service initializer_MacUpDate.service mongod.service MongoUploader.service

sudo systemctl start initializer_IpAdressUpdate_Timer.service initializer_mac_to_device_timer.service
```

---

## ✅ Verification

### **Check Active Services**
To see the status of all running services:
```sh
sudo systemctl list-units --type=service --all | grep '6to4\|initializer\|mongod\|Dashboard\|gaps'
```

### **Check Active Timers**
To confirm that timers are running:
```sh
sudo systemctl list-timers --all
```

### **Check Specific Service/Timer Status**
```sh
sudo systemctl status <service_name>.service
sudo systemctl status <timer_name>.timer
```

Replace `<service_name>` or `<timer_name>` with the name of the service/timer you want to check.

---

## 🔄 Disable and Remove Services and Timers

To disable the services and timers:
```sh
sudo systemctl disable *.service
sudo systemctl disable *.timer
```

To completely remove them:
```sh
sudo rm /etc/systemd/system/*.service
sudo rm /etc/systemd/system/*.timer
sudo systemctl daemon-reload
```

---

## 🔧 Troubleshooting

### **Check Logs for a Specific Service**
```sh
journalctl -u <service_name>.service --no-pager --lines=50
```

### **Check Systemd Errors**
```sh
sudo systemctl status <service_name>.service
sudo systemctl status <timer_name>.timer
```

Replace `<service_name>` or `<timer_name>` with the actual name.

---

## 📜 License

This project is open-source and free to use.

---

Let me know if you need any modifications! 🚀
