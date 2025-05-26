# Google Cloud Data Processing Project (F4D)

## F4D Folder (Located in `6to4` on the Raspberry Pi)

The **F4D** folder is a core component of the `6to4` project deployed on the Raspberry Pi. It contains specialized scripts and utilities designed for the **Field4D (F4D)** initiative—an advanced system for collecting, transforming, and analyzing agricultural and environmental data.

This folder is dedicated to high-level data processing tasks and includes:

- **Data Transformation**: Python scripts to clean, normalize, and restructure raw sensor data into analysis-ready formats.
- **Analytics Tools**: Functions and scripts for performing advanced statistical analysis and machine learning model integration.
- **Reporting**: Modules for generating visualizations and structured reports, aiding in decision-making and research insights.

This folder is essential for researchers and developers working on the F4D project, offering streamlined tools for end-to-end data management.

Each subfolder also contains its own `README.md` file with specific documentation for that module.

---

## Other Folders in the Repository

- **fetch_google**: Scripts to retrieve data from Google Cloud services, such as BigQuery or Cloud Storage.
- **process_files**: Contains file preprocessing logic including reformatting, validation, and batch handling.
- **query_last_timestamp**: Tools to identify the latest data record timestamps for incremental data pulling.
- **update-labels**: Scripts for dynamically updating metadata labels in Google Cloud resources.
- **upload_To_bucket**: Logic for uploading local files and results to GCP Storage Buckets.
- **users-devices-permission**: Utilities for managing permission mappings between users, devices, and experiments.

Each directory supports a different stage of the data lifecycle—ranging from ingestion to permission management—and collectively powers the F4D data pipeline.

Each of these folders includes its own `README.md` for further documentation.

---

## Project Structure Overview

- `F4D/`: Core processing, analytics, and reporting logic for the Field4D initiative.
- `fetch_google/`: Interfaces for cloud data extraction.
- `process_files/`: Local data processing and reformatting.
- `query_last_timestamp/`: Utilities to track data update state.
- `update-labels/`: Cloud resource label automation.
- `upload_To_bucket/`: Cloud export logic.
- `users-devices-permission/`: User-device access control.

---

## Key Scripts

- **`data_fetcher.py`**: Main entry point for downloading data from cloud resources.
- **`main_by_config.py`**: Automated execution of data tasks using a defined config file.
- **`main_interactive.py`**: A manual, interactive script for on-demand execution.
- **`config.json`**: The configuration file used to customize fetch and processing parameters.

---

## Getting Started

1. Ensure the Raspberry Pi has access to the required **Google Cloud credentials** (e.g., service account JSON key).
2. Install all necessary Python dependencies (listed in `requirements.txt` or pip-free setup).
3. Run a script as needed. Example:
   ```bash
   python main_by_config.py
   ```

---

## License

This repository is licensed under the terms provided in the `LICENSE` file. Please review it before using or distributing the code.