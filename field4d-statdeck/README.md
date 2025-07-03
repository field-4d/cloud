# Field4D StatDeck

A high-performance FastAPI service for performing statistical testing on time-series group comparisons with intelligent batching and validation.

## 🏗️ Application Architecture

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

## 📊 Statistical Tests Supported

| Test Type | Status | Implementation | Description |
|-----------|--------|----------------|-------------|
| **Tukey's HSD** | ✅ **Active** | `run_anova_tukey()` | ANOVA with post-hoc Tukey's Honestly Significant Difference test |
| **T-Test** | 🔄 **Pending** | `run_t_test()` | Independent samples t-test (placeholder) |
| **Dunnett's Test** | 🔄 **Pending** | `run_dunnett()` | Multiple comparisons vs control (placeholder) |

## 🚀 API Endpoints

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
  "alpha": 0.05,
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

#### 2. T-Test (Pending Implementation)
```
POST /analyze/t-test
```
Returns HTTP 202 (Accepted) with placeholder response.

#### 3. Dunnett's Test (Pending Implementation)
```
POST /analyze/dunnett
```
Returns HTTP 202 (Accepted) with placeholder response.

#### 4. Legacy Endpoint (Deprecated)
```
POST /analyze
```
Backward compatibility endpoint - use specific test endpoints instead.

## 📈 Data Flow Architecture

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
                       │ ≤ 50K: 10K max  │    │ • ANOVA         │
                       │ ≤ 100K: 10K max │    │ • Tukey's HSD   │
                       │ ≤ 500K: 5K max  │    │ • Group Stats   │
                       │ > 500K: 3K max  │    │ • Letters Report│
                       └─────────────────┘    └─────────────────┘
                                                       │
                                                       ▼
                                              ┌─────────────────┐
                                              │  Results Output │
                                              │   (JSON Response)│
                                              └─────────────────┘
```

## 🔧 Batch Validation Rules

The application implements intelligent batch size validation based on dataset size:

| Dataset Size | Maximum Batch Size | Rationale |
|--------------|-------------------|-----------|
| ≤ 50K points | 10,000 | Optimal performance for small datasets |
| ≤ 100K points | 10,000 | Balanced processing for medium datasets |
| ≤ 500K points | 5,000 | Memory management for large datasets |
| > 500K points | 3,000 | Resource optimization for very large datasets |

## 📁 Project Structure

```
field4d-statdeck/
├── app/                          # Main application code
│   ├── __init__.py              # Package initialization
│   ├── main.py                  # FastAPI application entry point
│   ├── stat_engine.py           # Statistical analysis engine
│   ├── test_models.py           # Pydantic data models
│   └── config.py                # Configuration and validation rules
├── test_data/                   # Test datasets and results
│   ├── API_test_output/         # API testing results
│   │   ├── Batching/           # Batch processing tests
│   │   ├── General/            # General API tests
│   │   └── Optimized_Batching/ # Optimized batch tests
│   ├── example_input.json      # Sample input data
│   └── example_input_many_groups.json
├── test_FastAPI/               # FastAPI testing utilities
├── requirements.txt            # Python dependencies
├── API_DOCUMENTATION.md        # Detailed API documentation
└── README.md                   # This file
```

## 🛠️ Installation & Setup

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

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `LOG_LEVEL` | `INFO` | Logging level (DEBUG, INFO, WARNING, ERROR) |
| `MAX_REQUEST_SIZE` | `1000000` | Maximum request size in bytes (1MB) |

## 🧪 Testing

### Manual Testing
```bash
# Test health endpoint
curl http://localhost:8000/health

# Test Tukey endpoint
curl -X POST http://localhost:8000/analyze/tukey \
  -H "Content-Type: application/json" \
  -d @test_data/example_input.json
```

### Automated Testing
The project includes comprehensive test suites in the `test_data/` directory with various scenarios and batch sizes.

## 📊 Performance Characteristics

- **Response Time**: < 2 seconds for batches up to 10K points
- **Memory Usage**: Optimized for large datasets with intelligent batching
- **Scalability**: Horizontal scaling ready with stateless design
- **Validation**: Automatic batch size validation with clear error messages

## 🔍 Key Features

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

## 🚀 Deployment

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

## 📝 Data Format

### Input Data Structure
```json
{
  "parameter": "string",     // Parameter name (e.g., "SoilMoisture")
  "alpha": 0.05,            // Significance level (optional, default: 0.05)
  "data": [
    {
      "timestamp": "string", // ISO format timestamp
      "label": "string",     // Group label
      "value": float         // Numeric measurement
    }
  ]
}
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

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

For issues and questions:
- Check the API documentation at `/docs`
- Review test examples in `test_data/`
- Open an issue on the repository

---

**Field4D StatDeck** - Statistical analysis for time-series group comparisons with intelligent batching and validation. 