# Field4D StatDeck

A FastAPI service for performing statistical testing on per-timestamp group comparisons.

## Features

- **Tukey's HSD Test**: Implemented and working
- **T-Test**: Placeholder for future implementation
- **Dunnett's Test**: Placeholder for future implementation

## Project Structure

```
field4d-statdeck/
├── app/
│   ├── __init__.py
│   ├── main.py              # FastAPI entrypoint
│   ├── stat_engine.py       # Statistical logic
│   └── test_models.py       # Pydantic models
├── test_data/
│   └── example_input.json   # Sample input JSON
├── requirements.txt
└── README.md
```

## Installation

1. Install dependencies:
```bash
pip install -r requirements.txt
```

2. Run the application:
```bash
uvicorn app.main:app --reload
```

## Usage

The service will be available at:
- **API**: http://127.0.0.1:8000/analyze
- **Swagger UI**: http://127.0.0.1:8000/docs

### Example Request

POST to `/analyze` with JSON payload:

```json
{
  "test_type": "tukey",
  "parameter": "SoilMoisture",
  "data": [
    {"timestamp": "2025-06-01", "label": "Control", "value": 18.0},
    {"timestamp": "2025-06-01", "label": "TreatmentA", "value": 21.3},
    {"timestamp": "2025-06-01", "label": "Control", "value": 17.2},
    {"timestamp": "2025-06-01", "label": "TreatmentA", "value": 22.1},
    {"timestamp": "2025-06-02", "label": "Control", "value": 19.1},
    {"timestamp": "2025-06-02", "label": "TreatmentA", "value": 24.4}
  ]
}
```

## API Endpoints

- `POST /analyze`: Perform statistical analysis on grouped data
  - Supports: `tukey`, `t_test`, `dunnett` test types
  - Returns results per timestamp with significant differences

## Development

The project uses:
- **FastAPI**: Web framework
- **Pandas**: Data manipulation
- **Statsmodels**: Statistical testing
- **Pydantic**: Data validation 