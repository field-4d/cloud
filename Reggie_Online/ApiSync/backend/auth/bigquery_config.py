"""
BigQuery client configuration and credential loading.
Uses the same credential conventions as firestore_config.py.
"""
import json
import logging
import os
from pathlib import Path

from dotenv import load_dotenv
from google.cloud import bigquery
from google.oauth2 import service_account

from .firestore_config import load_env_with_multiline_support

logger = logging.getLogger(__name__)

_client = None


def _mask_email(email: str) -> str:
    """Return a redacted email for logs."""
    if not email or "@" not in email:
        return "not-set"
    local, domain = email.split("@", 1)
    if len(local) <= 2:
        masked_local = "*" * len(local)
    else:
        masked_local = f"{local[0]}***{local[-1]}"
    return f"{masked_local}@{domain}"


def get_client() -> bigquery.Client:
    """
    Get or create a BigQuery Client instance.

    Returns:
        bigquery.Client: BigQuery client instance

    Raises:
        ValueError: If credentials cannot be loaded
    """
    global _client

    if _client is not None:
        return _client

    # Keep the same ENV file behavior as Firestore config
    env_file_override = os.getenv("ENV_FILE_PATH")
    env_path = Path(env_file_override) if env_file_override else Path(__file__).parent / ".env"

    if env_path.exists():
        load_env_with_multiline_support(env_path)

    project_id = os.getenv("GCP_PROJECT_ID")
    client_email = os.getenv("BQ_CLIENT_EMAIL")
    private_key = os.getenv("BQ_PRIVATE_KEY")

    logger.info(
        f"[BIGQUERY_CONFIG] Checking credentials | "
        f"Project ID: {'SET' if project_id else 'NOT SET'} | "
        f"BQ_CLIENT_EMAIL: {'SET' if client_email else 'NOT SET'} ({_mask_email(client_email)}) | "
        f"BQ_PRIVATE_KEY: {'SET' if private_key else 'NOT SET'}"
    )

    # Priority 1: Individual env variables
    if project_id and client_email and private_key:
        private_key = private_key.replace("\\n", "\n")
        credentials_dict = {
            "type": "service_account",
            "project_id": project_id,
            "private_key_id": os.getenv("BQ_PRIVATE_KEY_ID", ""),
            "private_key": private_key,
            "client_email": client_email,
            "client_id": os.getenv("BQ_CLIENT_ID", ""),
            "auth_uri": os.getenv("BQ_AUTH_URI", "https://accounts.google.com/o/oauth2/auth"),
            "token_uri": os.getenv("BQ_TOKEN_URI", "https://oauth2.googleapis.com/token"),
            "client_x509_cert_url": os.getenv("BQ_CLIENT_X509_CERT_URL", ""),
        }
        credentials = service_account.Credentials.from_service_account_info(credentials_dict)
        _client = bigquery.Client(project=project_id, credentials=credentials)
        logger.info(
            f"[BIGQUERY_CONFIG] Client created using .env variables | "
            f"Project: {project_id} | BQ_CLIENT_EMAIL: {_mask_email(client_email)}"
        )
        return _client

    # Priority 2: CREDENTIALS_JSON
    credentials_json = os.getenv("CREDENTIALS_JSON")
    if credentials_json:
        try:
            credentials_dict = json.loads(credentials_json)
            credentials = service_account.Credentials.from_service_account_info(credentials_dict)
            project_id = credentials_dict.get("project_id") or os.getenv("GCP_PROJECT_ID")
            _client = bigquery.Client(project=project_id, credentials=credentials)
            logger.info(f"[BIGQUERY_CONFIG] Client created using CREDENTIALS_JSON | Project: {project_id}")
            return _client
        except (json.JSONDecodeError, KeyError) as e:
            logger.error(f"[BIGQUERY_CONFIG] Failed to parse CREDENTIALS_JSON: {e}")
            raise ValueError(f"Invalid CREDENTIALS_JSON format: {e}")

    # Priority 3: CREDENTIALS_PATH
    credentials_path = os.getenv("CREDENTIALS_PATH")
    if credentials_path and os.path.exists(credentials_path):
        with open(credentials_path, "r", encoding="utf-8") as f:
            credentials_dict = json.load(f)
        credentials = service_account.Credentials.from_service_account_info(credentials_dict)
        project_id = credentials_dict.get("project_id") or os.getenv("GCP_PROJECT_ID")
        _client = bigquery.Client(project=project_id, credentials=credentials)
        logger.info(f"[BIGQUERY_CONFIG] Client created using credentials file | Path: {credentials_path}")
        return _client

    # Fallback: default credentials
    try:
        _client = bigquery.Client()
        logger.info("[BIGQUERY_CONFIG] Client created using default credentials")
        return _client
    except Exception as e:
        logger.error(f"[BIGQUERY_CONFIG] Failed to create client: {e}")
        raise ValueError(
            "Could not load BigQuery credentials. "
            "Please set GCP_PROJECT_ID, BQ_CLIENT_EMAIL, and BQ_PRIVATE_KEY in auth/.env, "
            "or set CREDENTIALS_JSON/CREDENTIALS_PATH environment variables."
        )
