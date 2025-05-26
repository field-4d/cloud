
# 6to4 Sensors Project

This repository contains the code and documentation for the 6to4 Sensors project, which enables efficient data collection, processing, and communication from wireless IoT sensors deployed in a greenhouse environment. The project leverages a Raspberry Pi as the central receiver and integrates 6LoWPAN communication protocols for monitoring micro-climate data.

## Project Overview

The goal of this project is to facilitate real-time measurement of plant physiological and environmental parameters, including:

- **Temperature**
- **Humidity**
- **Light intensity**
- **Barometric Pressure**

Collected data is processed and optionally uploaded to a MongoDB database and Google Cloud Platform (GCP) for further analysis, including optimization of machine learning models.

## Key Features

- **Wireless Sensor Network:** Utilizes dozens of IoT sensors arranged in a 6LoWPAN mesh network.
- **Low Energy Consumption:** Sensors can operate for up to three months using two AA batteries.
- **Real-time Processing:** Data is formatted and saved to CSV files and optionally uploaded to MongoDB and GCP.
- **Scalable Architecture:** Supports continuous monitoring and integration with cloud-based storage and analysis platforms.

## System Architecture

- **Sensors:** Measure environmental parameters and transmit data wirelessly.
- **Raspberry Pi Receiver:** Collects sensor data and processes it locally.
- **MongoDB and GCP:** Backends for storing and querying data.
- **Streamlit Dashboard:** A Streamlit app visualizes real-time and historical sensor data.

## Directory Structure

```plaintext
6to4-sensors/
├── .vscode/                 # VSCode workspace configurations
├── 6to4client/              # Client-side code for visualization and interaction
├── 6to4server/              # Server-side code for handling sensor data
├── Dashboard/               # Streamlit app for visualizing data from sensors
├── MongoUpload/             # Scripts for uploading data to MongoDB and GCP
├── initializer/             # Initialization scripts and configurations
├── services/                # Helper services and utilities
├── .gitignore               # Git ignore file
├── README.md                # Project documentation
├── influxdata-archive_compat.key # Compatibility key for influx data
├── requirements.txt         # Python dependencies
├── yarn.lock                # Dependency lock file for Yarn
```

## Installation

### Prerequisites

- Raspberry Pi (running Raspberry Pi OS)
- Python 3.x installed
- MongoDB server (optional, for data storage)
- React environment setup for client-side application

### Clone the Repository

```bash
git clone https://github.com/<your-username>/6to4-sensors.git
cd 6to4-sensors
```

### Install Dependencies

```bash
pip install -r requirements.txt
```

## Contributing

We are an open-source project and welcome contributions to improve in any aspect. Contributions should be well-documented. Please follow these steps:

1. Fork the repository.
2. Create a new branch for your feature or bug fix.
3. Submit a pull request describing your changes.

## License

This project is licensed under the MIT License. See the `LICENSE` file for details.

## Contact

For questions or support, contact:

- **Nir Averbuch**: [nir.averbuch@mail.huji.ac.il](mailto:nir.averbuch@mail.huji.ac.il)
- **Menachem Moshelion**: [menachem.moshelion@mail.huji.ac.il](mailto:menachem.moshelion@mail.huji.ac.il)
- **Idan Ifrach**: [idan.ifrach@mail.huji.ac.il](mailto:idan.ifrach@mail.huji.ac.il)
