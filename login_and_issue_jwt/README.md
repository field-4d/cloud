# Login and JWT Issuance Cloud Function

A Google Cloud Function that handles user authentication, validates credentials against BigQuery, and issues JWT tokens for authenticated users.

## Security Model

### Why This Endpoint is Unauthenticated

The login endpoint **must** remain unauthenticated because:

- **It's the entry point for authentication** - users need to access it before they can get authenticated
- **No sensitive data is exposed** - it only validates credentials and returns a JWT token
- **All security is handled internally** - credentials are validated against BigQuery before any response

### Security Features

- **Credential validation** against BigQuery user table
- **JWT token generation** with configurable expiration (3 months)
- **Last login tracking** - updates user's last login timestamp
- **No sensitive data exposure** - only returns success/failure + JWT token
- **Strong JWT secret** - uses environment variable for secret management

## Project Structure

```
login_and_issue_jwt/
├── main.py              # Cloud Function code
├── requirements.txt     # Python dependencies
└── README.md           # This file
```

## Deployment

### Prerequisites

1. **Google Cloud SDK** installed and configured
2. **BigQuery dataset and table** set up with user credentials
3. **Strong JWT secret** ready for environment variable

### Deploy Command

```bash
gcloud functions deploy login_and_issue_jwt \
  --runtime python311 \
  --trigger-http \
  --allow-unauthenticated \
  --set-env-vars JWT_SECRET=your-very-strong-secret
```

### Configuration

Update these values in `main.py`:

```python
PROJECT_ID = "your-project-id"
DATASET_ID = "your-dataset-id"
TABLE_ID = "your-user-table-id"
JWT_EXP_DELTA_SECONDS = 60 * 60 * 24 * 30 * 3  # 3 months
```

## BigQuery Schema

Your user table should have this structure:

```sql
CREATE TABLE `your-project.your-dataset.user_table` (
  email STRING,
  hashed_password STRING,
  last_login TIMESTAMP
);
```

## API Usage

### Request

```json
POST /login_and_issue_jwt
Content-Type: application/json

{
  "email": "user@example.com",
  "hashed_password": "hashed_password_value"
}
```

### Response (Success)

```json
{
  "success": true,
  "message": "Login successful",
  "token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9..."
}
```

### Response (Failure)

```json
{
  "success": false,
  "message": "Invalid credentials"
}
```

## Notes

- **JWT expiration**: Set to 3 months by default
- **Algorithm**: Uses HS256 for JWT signing
- **BigQuery**: Requires appropriate IAM permissions
- **CORS**: May need CORS headers for web applications

## Important

- Keep your JWT secret secure and rotate it periodically
- Monitor login attempts for suspicious activity
- Consider implementing account lockout after failed attempts
- Use HTTPS in production environments 