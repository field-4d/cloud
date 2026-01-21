"""
Firestore client configuration and credential loading.
Supports loading credentials from .env file or JSON credentials.
Handles credential loading from .env file or JSON credentials.
"""
import os
import json
from pathlib import Path
from google.cloud import firestore
from google.cloud.firestore import AsyncClient
from google.oauth2 import service_account
from dotenv import load_dotenv
import logging

logger = logging.getLogger(__name__)

# Load environment variables from auth/.env
# Note: We handle private keys specially since they contain newlines
env_path = Path(__file__).parent / ".env"

def load_env_with_multiline_support(env_file_path: Path):
    """
    Load .env file with support for multiline private keys.
    Supports both formats:
    1. Single-line with \\n: GCP_PRIVATE_KEY="-----BEGIN...\\n...\\n-----END..."
    2. Multi-line (actual newlines): GCP_PRIVATE_KEY="-----BEGIN...
    ...-----END..."
    """
    if not env_file_path.exists():
        return False
    
    try:
        # Read the entire file
        with open(env_file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # Parse manually to handle multiline values
        lines = content.split('\n')
        current_key = None
        current_value = []
        in_multiline = False
        
        for line in lines:
            stripped = line.strip()
            
            # Skip comments and empty lines (unless we're in a multiline value)
            if not in_multiline and (stripped.startswith('#') or not stripped):
                continue
            
            # Check if this is a new key=value pair
            if '=' in line and not in_multiline:
                # Save previous key if we were building a multiline value
                if current_key and current_value:
                    value = '\n'.join(current_value).strip()
                    # Remove surrounding quotes if present
                    if value.startswith('"') and value.endswith('"'):
                        value = value[1:-1]
                    os.environ[current_key] = value
                    current_value = []
                
                # Parse new key=value
                parts = line.split('=', 1)
                if len(parts) == 2:
                    current_key = parts[0].strip()
                    value_part = parts[1].strip()
                    
                    # Check if value starts with quote (might be multiline)
                    if value_part.startswith('"'):
                        if value_part.endswith('"') and len(value_part) > 1:
                            # Single-line quoted value
                            os.environ[current_key] = value_part[1:-1]
                            current_key = None
                        else:
                            # Multiline value starting
                            current_value = [value_part[1:]]  # Remove opening quote
                            in_multiline = True
                    else:
                        # Single-line unquoted value
                        os.environ[current_key] = value_part
                        current_key = None
            elif in_multiline:
                # Check if this line ends the multiline value
                if line.rstrip().endswith('"'):
                    # End of multiline value
                    current_value.append(line.rstrip()[:-1])  # Remove closing quote
                    if current_key:
                        value = '\n'.join(current_value).strip()
                        os.environ[current_key] = value
                        current_key = None
                        current_value = []
                    in_multiline = False
                else:
                    # Continuation of multiline value
                    current_value.append(line)
        
        # Handle last key if it was multiline
        if current_key and current_value:
            value = '\n'.join(current_value).strip()
            if value.endswith('"'):
                value = value[:-1]
            os.environ[current_key] = value
        
        return True
    except Exception as e:
        logger.error(f"[FIRESTORE_CONFIG] Error loading .env file: {e}", exc_info=True)
        # Fallback to standard load_dotenv
        try:
            load_dotenv(dotenv_path=str(env_file_path), override=False)
            return True
        except:
            return False

if env_path.exists():
    result = load_env_with_multiline_support(env_path)
    if result:
        logger.info(f"[FIRESTORE_CONFIG] Loaded .env file from {env_path}")
    else:
        logger.warning(f"[FIRESTORE_CONFIG] .env file exists but failed to load from {env_path}")
else:
    logger.warning(f"[FIRESTORE_CONFIG] auth/.env file not found at {env_path}")

# Global client instance (singleton pattern)
_client = None


async def get_client():
    """
    Get or create a Firestore AsyncClient instance.
    Uses singleton pattern to reuse the same client.
    
    Returns:
        google.cloud.firestore.AsyncClient: Firestore async client instance
    
    Raises:
        ValueError: If credentials cannot be loaded
    """
    global _client
    
    if _client is not None:
        return _client
    
    # Priority 1: Load .env file (primary method)
    env_path = Path(__file__).parent / ".env"
    logger.info(f"[FIRESTORE_CONFIG] Attempting to load .env from {env_path}")
    logger.info(f"[FIRESTORE_CONFIG] File exists: {env_path.exists()}")
    
    if env_path.exists():
        # Use our custom loader that handles multiline private keys
        load_env_with_multiline_support(env_path)
    else:
        logger.error(f"[FIRESTORE_CONFIG] .env file not found at {env_path}")
    
    # Priority 2: Individual .env variables
    project_id = os.getenv("GCP_PROJECT_ID")
    client_email = os.getenv("GCP_CLIENT_EMAIL")
    private_key = os.getenv("GCP_PRIVATE_KEY")
    
    # Log credential loading status to help diagnose issues
    logger.info(
        f"[FIRESTORE_CONFIG] Checking credentials | "
        f"Project ID: {'SET' if project_id else 'NOT SET'} | "
        f"Client Email: {'SET' if client_email else 'NOT SET'} | "
        f"Private Key: {'SET' if private_key else 'NOT SET'}"
    )
    
    # If still not set, try loading from absolute path
    if not (project_id and client_email and private_key):
        abs_env_path = env_path.resolve()
        logger.warning(f"[FIRESTORE_CONFIG] Credentials not found, trying absolute path: {abs_env_path}")
        if abs_env_path.exists():
            load_dotenv(dotenv_path=str(abs_env_path), override=True)
            project_id = os.getenv("GCP_PROJECT_ID")
            client_email = os.getenv("GCP_CLIENT_EMAIL")
            private_key = os.getenv("GCP_PRIVATE_KEY")
            logger.info(
                f"[FIRESTORE_CONFIG] After reload | "
                f"Project ID: {'SET' if project_id else 'NOT SET'} | "
                f"Client Email: {'SET' if client_email else 'NOT SET'} | "
                f"Private Key: {'SET' if private_key else 'NOT SET'}"
            )
    
    if project_id and client_email and private_key:
        # Convert \\n to actual newlines in private key
        private_key = private_key.replace("\\n", "\n")
        
        credentials_dict = {
            "type": "service_account",
            "project_id": project_id,
            "private_key_id": os.getenv("GCP_PRIVATE_KEY_ID", ""),
            "private_key": private_key,
            "client_email": client_email,
            "client_id": os.getenv("GCP_CLIENT_ID", ""),
            "auth_uri": os.getenv("GCP_AUTH_URI", "https://accounts.google.com/o/oauth2/auth"),
            "token_uri": os.getenv("GCP_TOKEN_URI", "https://oauth2.googleapis.com/token"),
            "client_x509_cert_url": os.getenv("GCP_CLIENT_X509_CERT_URL", ""),
        }
        
        credentials = service_account.Credentials.from_service_account_info(credentials_dict)
        _client = AsyncClient(credentials=credentials, project=project_id)
        logger.info(f"[FIRESTORE_CONFIG] AsyncClient created using .env variables | Project: {project_id}")
        return _client
    
    # Priority 2: CREDENTIALS_JSON environment variable
    credentials_json = os.getenv("CREDENTIALS_JSON")
    if credentials_json:
        try:
            credentials_dict = json.loads(credentials_json)
            credentials = service_account.Credentials.from_service_account_info(credentials_dict)
            project_id = credentials_dict.get("project_id") or os.getenv("GCP_PROJECT_ID")
            _client = AsyncClient(credentials=credentials, project=project_id)
            logger.info(f"[FIRESTORE_CONFIG] AsyncClient created using CREDENTIALS_JSON | Project: {project_id}")
            return _client
        except (json.JSONDecodeError, KeyError) as e:
            logger.error(f"[FIRESTORE_CONFIG] Failed to parse CREDENTIALS_JSON: {e}")
            raise ValueError(f"Invalid CREDENTIALS_JSON format: {e}")
    
    # Priority 3: CREDENTIALS_PATH environment variable
    credentials_path = os.getenv("CREDENTIALS_PATH")
    
    if credentials_path and os.path.exists(credentials_path):
        with open(credentials_path, 'r') as f:
            credentials_dict = json.load(f)
        credentials = service_account.Credentials.from_service_account_info(credentials_dict)
        project_id = credentials_dict.get("project_id") or os.getenv("GCP_PROJECT_ID")
        _client = AsyncClient(credentials=credentials, project=project_id)
        logger.info(f"[FIRESTORE_CONFIG] AsyncClient created using credentials file | Path: {credentials_path}")
        return _client
    
    # Fallback: Use default credentials (if running on GCP)
    try:
        _client = AsyncClient()
        logger.info("[FIRESTORE_CONFIG] AsyncClient created using default credentials")
        return _client
    except Exception as e:
        logger.error(f"[FIRESTORE_CONFIG] Failed to create client: {e}")
        raise ValueError(
            "Could not load Firestore credentials. "
            "Please set GCP_PROJECT_ID, GCP_CLIENT_EMAIL, and GCP_PRIVATE_KEY in auth/.env, "
            "or set CREDENTIALS_JSON or CREDENTIALS_PATH environment variable."
        )


def get_permissions_base_url() -> str:
    """
    Get the Field4D permissions backend base URL from environment variables.
    
    Returns:
        str: Base URL for the Field4D permissions backend
        
    Raises:
        ValueError: If GCP_field4d_Backend is not set in environment variables
    """
    base_url = os.getenv("GCP_field4d_Backend")
    if not base_url:
        raise ValueError(
            "GCP_field4d_Backend is not set in environment variables. "
            "Please set GCP_field4d_Backend in auth/.env file."
        )
    return base_url

