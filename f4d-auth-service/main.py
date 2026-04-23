import functions_framework
from google.cloud import bigquery
from datetime import datetime, timedelta, timezone
import jwt
import os
import logging

# Configuration
PROJECT_ID = "iucc-f4d"
DATASET_ID = "Field4D"
TABLE_ID = "F4D_user_table"

# JWT settings (keep secret in env!)
JWT_SECRET = os.environ.get("JWT_SECRET", "REPLACE_THIS_WITH_A_STRONG_SECRET")
JWT_ALGORITHM = "HS256"
JWT_EXP_DELTA_SECONDS = 60 * 60 * 24 * 30 * 3  # 3 months

# BigQuery client
client = bigquery.Client(project=PROJECT_ID)

def create_jwt(email: str):
    """Generate JWT token for given email."""
    payload = {
        "email": email,
        "exp": datetime.utcnow() + timedelta(seconds=JWT_EXP_DELTA_SECONDS),
    }
    token = jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)
    return token

@functions_framework.http
def login_and_issue_jwt(request):
    """Cloud Function to validate login, update last_login, and return a JWT."""

    try:
        request_json = request.get_json()
        email = request_json.get("email")
        hashed_password = request_json.get("hashed_password")

        if not email or not hashed_password:
            logging.warning(f"[LOGIN FAILED] Missing email or password: {email}")
            return {"success": False, "message": "Missing email or password"}, 400

        table_ref = f"{PROJECT_ID}.{DATASET_ID}.{TABLE_ID}"

        # Check credentials and get user metadata
        query = f"""
        SELECT email, created_at, last_login
        FROM `{table_ref}`
        WHERE email = @email AND hashed_password = @hashed_password
        """
        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("email", "STRING", email),
                bigquery.ScalarQueryParameter("hashed_password", "STRING", hashed_password),
            ]
        )

        result = list(client.query(query, job_config=job_config).result())

        if len(result) == 0:
            logging.warning(f"[LOGIN FAILED] Invalid credentials: {email}")
            return {"success": False, "message": "Invalid credentials"}, 401

        row = result[0]
        created_at = row["created_at"].isoformat() if row["created_at"] else None
        previous_login = row["last_login"].isoformat() if row["last_login"] else None

        # Update last_login to current time
        now = datetime.now(timezone.utc).isoformat()
        update_query = f"""
        UPDATE `{table_ref}`
        SET last_login = TIMESTAMP(@now)
        WHERE email = @user_email
        """
        update_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("now", "STRING", now),
                bigquery.ScalarQueryParameter("user_email", "STRING", email),
            ]
        )
        client.query(update_query, job_config=update_config).result()

        # Generate JWT
        token = create_jwt(email)
        logging.info(f"[LOGIN SUCCESS] {email} logged in at {now}")

        return {
            "success": True,
            "token": token,
            "user": {
                "email": email,
                "created_at": created_at,
                "last_login": previous_login
            }
        }, 200

    except Exception as e:
        logging.error(f"[LOGIN ERROR] {email if 'email' in locals() else 'UNKNOWN'}: {e}")
        return {"success": False, "message": str(e)}, 500
