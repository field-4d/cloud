# Field4D StatDeck

A high-performance FastAPI service for performing statistical testing on time-series group comparisons with intelligent batching and validation.

## Application Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Field4D StatDeck                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────┐    ┌─────────────────┐    ┌──────────────┐ │
│  │   FastAPI App   │    │  Stat Engine    │    │   Config     │ │
│  │   (main.py)     │◄──►│ (stat_engine.py)│◄──►│ (config.py)  │ │
│  └─────────────────┘    └─────────────────┘    └──────────────┘ │
│           │                       │                             │
│           ▼                       ▼                             │
│  ┌─────────────────┐    ┌─────────────────┐                     │
│  │  Data Models    │    │  Batch Validation│                     │
│  │(test_models.py) │    │   & Rules       │                     │
│  └─────────────────┘    └─────────────────┘                     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Statistical Tests Supported

| Test Type | Status | Implementation | Description |
|-----------|--------|----------------|-------------|
| **Tukey's HSD** | **Active** | `run_anova_tukey()` | ANOVA with post-hoc Tukey's Honestly Significant Difference test |
| **T-Test** | **Planned** | `run_t_test()` (placeholder) | Independent samples t-test (to be implemented) |
| **Dunnett's Test** | **Planned** | `run_dunnett()` (placeholder) | Multiple comparisons vs control (to be implemented) |

### Current Implementation Status
- ✅ **Tukey's HSD**: Fully implemented with ANOVA, post-hoc testing, group statistics, and letters report
- ⏳ **T-Test**: Function placeholder exists, implementation pending
- ⏳ **Dunnett's Test**: Function placeholder exists, implementation pending

## API Endpoints

### Health Check
```
GET /health
```
Returns service status and batch validation rules.

### Statistical Analysis Endpoints

#### 1. Tukey's HSD Test
```
POST /analyze/tukey
```
**Request Body:**
```json
{
  "parameter": "SoilMoisture",
  "data": [
    {"timestamp": "2025-06-01", "label": "Control", "value": 18.0},
    {"timestamp": "2025-06-01", "label": "TreatmentA", "value": 21.3},
    {"timestamp": "2025-06-02", "label": "Control", "value": 19.1},
    {"timestamp": "2025-06-02", "label": "TreatmentA", "value": 24.4}
  ]
}
```

**Response:**
```json
{
  "parameter": "SoilMoisture",
  "test_type": "tukey",
  "batch_size": 4,
  "results": [
    {
      "timestamp": "2025-06-01",
      "groups_tested": ["Control", "TreatmentA"],
      "group_stats": {
        "Control": {"mean": 18.0, "standard_error": 0.0, "n": 1},
        "TreatmentA": {"mean": 21.3, "standard_error": 0.0, "n": 1}
      },
      "significant_differences": [
        {
          "comparison": "Control vs TreatmentA",
          "p_value": 0.045,
          "reject_null": true
        }
      ],
      "letters_report": {"Control": "A", "TreatmentA": "B"}
    }
  ]
}
```

#### 2. Legacy Endpoint (Deprecated)
```
POST /analyze
```
Backward compatibility endpoint - use specific test endpoints instead.

## Data Flow Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Client Data   │───►│  Batch Validation│───►│  Data Processing│
│   (JSON Input)  │    │   (config.py)   │    │  (stat_engine.py)│
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │                       │
                                ▼                       ▼
                       ┌─────────────────┐    ┌─────────────────┐
                       │ Validation Rules│    │ Statistical Tests│
                       │                 │    │                 │
                       │ Max 15K batch   │    │ • ANOVA         │
                       │ Simple rule     │    │ • Tukey's HSD   │
                       │ Clear errors    │    │ • Group Stats   │
                       │                 │    │ • Letters Report│
                       └─────────────────┘    └─────────────────┘
                                                       │
                                                       ▼
                                              ┌─────────────────┐
                                              │  Results Output │
                                              │   (JSON Response)│
                                              └─────────────────┘
```

## Batch Size Validation

The application implements a simple batch size validation rule:

**Maximum batch size: 15,000 data points**

Any batch larger than 15,000 points will be rejected with a clear error message that includes the recommended batch size for your dataset.

### Recommended Batch Sizes

For optimal performance, consider these recommended batch sizes based on your dataset characteristics:

| Dataset Type | Recommended Batch Size | Use Case |
|--------------|----------------------|----------|
| Small datasets (< 50K total) | 10,000 | Quick analysis, development/testing |
| Medium datasets (50K-200K total) | 8,000 | Balanced performance and memory usage |
| Large datasets (200K-1M total) | 5,000 | Memory-efficient processing |
| Very large datasets (> 1M total) | 3,000 | Resource-optimized processing |

### Batch Splitting Strategy

For datasets larger than 15,000 points:
1. Split your data into batches of ≤ 15,000 points
2. Send each batch as a separate API request
3. Collect results from all successful batches
4. Combine results on the client side

**Example**: A 50,000-point dataset should be split into 4 batches:
- Batch 1: 15,000 points
- Batch 2: 15,000 points  
- Batch 3: 15,000 points
- Batch 4: 5,000 points

### Error Message Example

When you send a batch that's too large, you'll get a helpful error message like this:

```
Batch size validation failed:
- Dataset size: 50,000 points
- Maximum allowed: 15,000 points

Recommended batch size for your dataset: 10,000 points

Please split your data into batches of maximum 10,000 points.
```

## Project Structure

```
field4d-statdeck/
├── app/                          # Main application code
│   ├── __init__.py              # Package initialization
│   ├── main.py                  # FastAPI application entry point
│   ├── stat_engine.py           # Statistical analysis engine
│   ├── test_models.py           # Pydantic data models
│   └── config.py                # Configuration and validation rules
├── Test_Python_file/            # Test files and examples
│   ├── simple_batch_validation_example.py  # Batch validation examples
│   ├── simple_endpoint_test.py  # Basic endpoint testing
│   ├── test_anova_api_batching_scenario5_only.py  # Comprehensive batching tests
│   ├── API_test_output/         # Test results and logs
│   │   └── Batching/           # Batching test results
│   │       ├── generated_datasets/  # Generated test datasets
│   │       ├── logs/           # Test execution logs
│   │       └── scenario5_batching_results.csv  # Test results summary
│   └── valid_Json/             # Example JSON files
│       ├── example_input.json  # Basic example
│       └── example_input_many_groups.json  # Multi-group example
├── requirements.txt            # Python dependencies
├── general instruction.txt     # Quick start and performance notes
└── README.md                   # This file
```

## Installation & Setup

### Prerequisites
- Python 3.8+
- pip package manager

### Installation Steps

1. **Clone the repository:**
```bash
git clone <repository-url>
cd field4d-statdeck
```

2. **Install dependencies:**
```bash
pip install -r requirements.txt
```

3. **Run the application:**
```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

**Quick Start**: See `general instruction.txt` for additional performance notes and quick commands.

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `LOG_LEVEL` | `INFO` | Logging level (DEBUG, INFO, WARNING, ERROR) |
| `MAX_REQUEST_SIZE` | `1000000` | Maximum request size in bytes (1MB) |

## Testing

### Manual Testing
```bash
# Test health endpoint
curl http://localhost:8000/health

# Test Tukey endpoint with example data
curl -X POST http://localhost:8000/analyze/tukey \
  -H "Content-Type: application/json" \
  -d @Test_Python_file/valid_Json/example_input.json

# Test with multi-group example
curl -X POST http://localhost:8000/analyze/tukey \
  -H "Content-Type: application/json" \
  -d @Test_Python_file/valid_Json/example_input_many_groups.json
```

### Testing Examples
The project includes comprehensive test files and examples in the `Test_Python_file/` directory:
- `simple_batch_validation_example.py`: Demonstrates batch validation scenarios
- `simple_endpoint_test.py`: Basic endpoint testing
- `test_anova_api_batching_scenario5_only.py`: Comprehensive batching tests with performance analysis
- `valid_Json/example_input.json`: Basic example with 2 groups
- `valid_Json/example_input_many_groups.json`: Multi-group example
- `API_test_output/Batching/`: Contains test results, logs, and performance data

### Test Results
The `API_test_output/Batching/` directory contains:
- Performance test results for different batch sizes (5K, 10K, 15K, 20K)
- Detailed execution logs and summaries
- Generated test datasets for reproducible testing
- CSV summary of batching performance results

## Performance Characteristics

- **Response Time**: < 2 seconds for batches up to 10K points
- **Memory Usage**: Optimized for large datasets with intelligent batching
- **Scalability**: Horizontal scaling ready with stateless design
- **Validation**: Automatic batch size validation with clear error messages

### Performance by Dataset Type
Based on testing with various dataset sizes:

| Dataset Type | Size | Response Time | Performance |
|--------------|------|---------------|-------------|
| Small daily datasets | 2 groups, 10 reps, 7 days | ~0.179s | Extremely fast |
| Large daily datasets | 4 groups, 12 reps, 30 days | ~2.449s | Very fast |
| High-frequency, short duration | 3-min, 3 groups, 8 reps, 1 day | ~12.693s | Reasonable |
| High-frequency, long duration | 3-min, 4 groups, 4 reps, 30 days | ~361.226s | Slower (14,400 timestamps) |

**Note**: High-frequency data with many timestamps will naturally take longer to process due to the increased computational complexity.

## Key Features

### 1. **Intelligent Batching**
- Automatic batch size validation based on dataset size
- Clear error messages with recommended batch sizes
- Performance optimization for different data scales

### 2. **Comprehensive Statistical Analysis**
- ANOVA with Tukey's HSD post-hoc testing
- Group statistics (mean, standard error, sample size)
- Letters report for significant differences
- Per-timestamp analysis for time-series data

### 3. **Robust Error Handling**
- Detailed error messages for statistical failures
- Input validation with Pydantic models
- Graceful handling of edge cases

### 4. **API Documentation**
- Interactive Swagger UI at `/docs`
- OpenAPI specification
- Example requests and responses

## Deployment

### Local Development
```bash
uvicorn app.main:app --reload
```

### Production Deployment
```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4
```

### Docker Deployment
```dockerfile
FROM python:3.9-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY app/ ./app/
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

## Data Format

### Input Data Structure
```json
{
  "parameter": "string",     // Parameter name (e.g., "SoilMoisture")
  "data": [
    {
      "timestamp": "string", // ISO format timestamp
      "label": "string",     // Group label (e.g., "Control", "Treatment")
      "value": float         // Numeric measurement
    }
  ]
}
```

**Example**: See `Test_Python_file/valid_Json/example_input.json` for a basic example and `Test_Python_file/valid_Json/example_input_many_groups.json` for a multi-group example.

### Running Test Examples

```bash
# Run batch validation examples
python Test_Python_file/simple_batch_validation_example.py

# Run basic endpoint tests
python Test_Python_file/simple_endpoint_test.py

# Run comprehensive batching tests
python Test_Python_file/test_anova_api_batching_scenario5_only.py
```

### Output Data Structure
```json
{
  "parameter": "string",
  "test_type": "string",
  "batch_size": integer,
  "results": [
    {
      "timestamp": "string",
      "groups_tested": ["string"],
      "group_stats": {
        "group_name": {
          "mean": float,
          "standard_error": float,
          "n": integer
        }
      },
      "significant_differences": [
        {
          "comparison": "string",
          "p_value": float,
          "reject_null": boolean
        }
      ],
      "letters_report": {
        "group_name": "string"
      }
    }
  ]
}
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Submit a pull request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For issues and questions:
- Check the API documentation at `/docs`
- Review test examples in `test_data/`
- Open an issue on the repository

---

**Field4D StatDeck** - Statistical analysis for time-series group comparisons with intelligent batching and validation. 