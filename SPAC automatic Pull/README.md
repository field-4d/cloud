# SPAC Automatic Pull

Python utilities for pulling experiment data from the SPAC API and exporting it to CSV files.

## What this folder contains

- `data_fetcher.py`: API client and data processing helpers (control systems, plant table, parameters, data pulls, CSV export).
- `main_by_config.py`: non-interactive run mode using values from `config.json`.
- `main_interactive.py`: interactive run mode where you choose control system / experiment and optional date range.
- `config.json`: local runtime configuration (authorization token and optional defaults).

## Requirements

- Python 3.9+
- Python packages:
  - `requests`
  - `pandas`

Install dependencies:

```bash
pip install requests pandas
```

## Configuration

Edit `config.json` before running.

Minimum required field:

- `AUTHORIZATION`: a valid SPAC bearer token (format: `Bearer <token>`).

Optional fields for non-interactive mode (`main_by_config.py`):

- `EXPERIMENT_ID`
- `CONTROL_SYSTEM_ID`
- `START_DATE` (`YYYY-MM-DD`)
- `YESTERDAY` (`YYYY-MM-DD`)
- `PARAMETERS` (list of parameter keys)
- `PLANTS_ID` (list of plant IDs)
- `FILES` (list of output filenames, aligned with `PARAMETERS`)

Example:

```json
{
  "AUTHORIZATION": "Bearer <your_token>",
  "EXPERIMENT_ID": 123,
  "CONTROL_SYSTEM_ID": 42,
  "START_DATE": "2025-01-01",
  "YESTERDAY": "2025-01-31",
  "PARAMETERS": ["air_temp", "humidity"],
  "PLANTS_ID": [1, 2, 3],
  "FILES": ["air_temp.csv", "humidity.csv"]
}
```

## Usage

Run from this directory: `SPAC automatic Pull`.

### 1) Interactive mode (recommended)

```bash
python main_interactive.py
```

You will be prompted to:

- choose specific experiment vs all experiments in a control system,
- select control system and experiment IDs,
- optionally override start/end dates.

### 2) Config-driven mode

```bash
python main_by_config.py
```

This mode uses IDs, dates, parameters, and filenames directly from `config.json`.

## Output folders

The scripts create CSV outputs under:

- `control_system/`
- `get_plant_table/`
- `experiment_parameters/`
- `pulled_data/<control_system_name>_<experiment_name>/<category>/`

Each fetched parameter is saved as a CSV in the relevant experiment/category path.

## Notes

- Keep your token private; do not commit real bearer tokens to git.
- Parameter and category names containing `/` are normalized to `_` for safe file paths.
- If API calls fail, check token validity, selected IDs, and date format first.
