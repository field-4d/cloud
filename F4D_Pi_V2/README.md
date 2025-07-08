
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
- **Cloud Function Authentication:** Secure user authentication via Google Cloud Functions with JWT token support.
- **Multi-layered Security:** Admin bypass, fallback users, cloud function validation, and device-specific permissions.

## System Architecture

- **Sensors:** Measure environmental parameters and transmit data wirelessly.
- **Raspberry Pi Receiver:** Collects sensor data and processes it locally.
- **MongoDB and GCP:** Backends for storing and querying data.
- **Streamlit Dashboard:** A Streamlit app visualizes real-time and historical sensor data.
- **Authentication System:** Multi-layered authentication with cloud function integration and device-specific permissions.

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
- Node.js and npm for server-side authentication
- Google Cloud Platform account (for cloud function authentication)

### Clone the Repository

```bash
git clone https://github.com/<your-username>/6to4-sensors.git
cd 6to4-sensors
```

### Install Dependencies

```bash
pip install -r requirements.txt
```

### Install Node.js Dependencies

```bash
cd 6to4server
npm install axios --legacy-peer-deps
```

## Authentication System

The project includes a comprehensive authentication system with multiple layers of security:

### Authentication Flow
1. **Admin Bypass:** Hardcoded admin credentials for emergency access
2. **Fallback Users:** Development/testing users for local development
3. **Cloud Function Validation:** Primary authentication via Google Cloud Functions
4. **Device Permission Check:** BigQuery-based device-specific access control

### Environment Configuration
Add the following to your `.env` file:
```bash
CLOUD_FUNCTION_URL=https://us-central1-iucc-f4d.cloudfunctions.net/login_and_issue_jwt
CLOUD_FUNCTION_TIMEOUT=10000
```

### API Response Format
```json
{
  "success": true,
  "email": "user@example.com",
  "source": "cloud_function",
  "deviceMac": "XX:XX:XX:XX:XX:XX",
  "role": "user_role",
  "experiment": "experiment_name",
  "token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9..."
}
```

For detailed documentation, see [CLOUD_FUNCTION_INTEGRATION.md](CLOUD_FUNCTION_INTEGRATION.md).

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
