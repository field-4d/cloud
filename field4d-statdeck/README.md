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

## Authentication

The API uses Cloud Function-based authentication with JWT tokens. Authentication is handled by the `login_and_issue_jwt` Cloud Function that validates credentials against BigQuery.

### Cloud Function Integration
- **Authentication Service**: External Cloud Function `login_and_issue_jwt`
- **Database**: Google BigQuery user table
- **Password Hashing**: SHA256 + BASE64 (client-side hashing required)
- **Token Expiration**: 1 hour JWT tokens

### Login Endpoint
```
POST /auth/login
```
**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "userpassword"
}
```

**Response (Success):**
```json
{
  "success": true,
  "token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...",
  "user": {
    "email": "user@example.com",
    "created_at": null,
    "last_login": null
  }
}
```

### Using Authentication
Include the JWT token in the Authorization header for all API requests:
```
Authorization: Bearer <your_jwt_token>
```

### Environment Variables Required
```env
CLOUD_FUNCTION_URL=https://your-cloud-function-url
JWT_SECRET_KEY=your-shared-jwt-secret
```

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
**Headers:**
```
Authorization: Bearer <your_jwt_token>
Content-Type: application/json
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
  "user": "user@example.com",
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
**Headers:**
```
Authorization: Bearer <your_jwt_token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "parameter": "SoilMoisture",
  "test_type": "tukey",
  "data": [
    {"timestamp": "2025-06-01", "label": "Control", "value": 18.0},
    {"timestamp": "2025-06-01", "label": "TreatmentA", "value": 21.3},
    {"timestamp": "2025-06-02", "label": "Control", "value": 19.1},
    {"timestamp": "2025-06-02", "label": "TreatmentA", "value": 24.4}
  ]
}
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
│   ├── config.py                # Configuration and validation rules
│   └── auth/                    # Authentication system
│       ├── __init__.py          # Auth package initialization
│       ├── cloud_auth_service.py # Cloud Function integration
│       ├── middleware.py        # JWT validation middleware
│       └── models.py            # Auth data models
├── Test_Python_file/            # Test files and examples
│   ├── test_cloud_auth.py       # Cloud Function auth testing
│   ├── test_login.py            # Login endpoint testing
│   ├── simple_endpoint_test.py  # Basic endpoint testing
│   ├── API_test_output/         # Test results and logs
│   └── valid_Json/              # Example JSON files
│       ├── example_input.json   # Basic example
│       └── example_input_many_groups.json # Multi-group example
├── requirements.txt              # Python dependencies
└── README.md                    # This file
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

3. **Set up environment variables:**
Create `app/auth/.env` file:
```env
CLOUD_FUNCTION_URL=https://your-region-your-project.cloudfunctions.net/login_and_issue_jwt
JWT_SECRET_KEY=your-shared-jwt-secret-key
LOG_LEVEL=INFO
```

4. **Run the application:**
```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `CLOUD_FUNCTION_URL` | Yes | URL of your Cloud Function for authentication |
| `JWT_SECRET_KEY` | Yes | Shared secret key for JWT token validation |
| `LOG_LEVEL` | No | Logging level (DEBUG, INFO, WARNING, ERROR) |

## Testing

### Manual Testing
```bash
# Test health endpoint
curl http://localhost:8000/health

# Login to get authentication token
curl -X POST http://localhost:8000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com", "password": "userpassword"}'

# Test Tukey endpoint with authentication
curl -X POST http://localhost:8000/analyze/tukey \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your_jwt_token_here" \
  -d '{
    "parameter": "SoilMoisture",
    "data": [
      {"timestamp": "2025-06-01", "label": "Control", "value": 18.0},
      {"timestamp": "2025-06-01", "label": "TreatmentA", "value": 21.3}
    ]
  }'

# Test with multi-group example
curl -X POST http://localhost:8000/analyze/tukey \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your_jwt_token_here" \
  -d '{
    "parameter": "SoilMoisture",
    "data": [
      {"timestamp": "2025-06-01", "label": "Control", "value": 18.0},
      {"timestamp": "2025-06-01", "label": "TreatmentA", "value": 21.3},
      {"timestamp": "2025-06-01", "label": "TreatmentB", "value": 22.1}
    ]
  }'
```

### Interactive Testing
For interactive testing with authentication options:

```bash
# Run the interactive test script
python Test_Python_file/4.test_authenticated_analysis.py
```

This script provides two authentication options:
1. **Manual token input** - Paste your JWT token directly
2. **Login with credentials** - Enter email/password to get a fresh token

The script will test both `/analyze/tukey` and legacy `/analyze` endpoints with authentication.

### Testing Examples
The project includes comprehensive test files and examples:
- `4.test_authenticated_analysis.py`: Interactive authenticated analysis testing with manual token or login options
- `test_login.py`: Tests login endpoint functionality
- `simple_endpoint_test.py`: Basic endpoint testing
- `valid_Json/example_input.json`: Basic example with 2 groups
- `valid_Json/example_input_many_groups.json`: Multi-group example

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

### 1. **Cloud Function Authentication**
- External authentication service via Cloud Function
- JWT token-based authentication with 1-hour expiration
- Stateless design with no database queries on API requests
- Secure password hashing (SHA256 + BASE64)

### 2. **Intelligent Batching**
- Automatic batch size validation based on dataset size
- Clear error messages with recommended batch sizes
- Performance optimization for different data scales

### 3. **Comprehensive Statistical Analysis**
- ANOVA with Tukey's HSD post-hoc testing
- Group statistics (mean, standard error, sample size)
- Letters report for significant differences
- Per-timestamp analysis for time-series data

### 4. **Robust Error Handling**
- Detailed error messages for statistical failures
- Input validation with Pydantic models
- Graceful handling of edge cases

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

### Output Data Structure
```json
{
  "parameter": "string",
  "test_type": "string",
  "batch_size": integer,
  "user": "string",
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
- Review test examples in `Test_Python_file/`
- Open an issue on the repository

---

**Field4D StatDeck** - Statistical analysis for time-series group comparisons with Cloud Function authentication and intelligent batching. 