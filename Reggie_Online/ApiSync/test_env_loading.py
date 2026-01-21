"""
Quick test script to verify .env file loading
"""
import os
import sys
from pathlib import Path
from dotenv import load_dotenv

# Add auth directory to path
auth_dir = Path(__file__).parent / "auth"
sys.path.insert(0, str(auth_dir.parent))

env_path = auth_dir / ".env"
print(f"Looking for .env at: {env_path}")
print(f"File exists: {env_path.exists()}")

if env_path.exists():
    print(f"Loading .env from: {env_path}")
    result = load_dotenv(dotenv_path=str(env_path), override=False)
    print(f"load_dotenv returned: {result}")
    
    # Check variables
    project_id = os.getenv("GCP_PROJECT_ID")
    client_email = os.getenv("GCP_CLIENT_EMAIL")
    private_key = os.getenv("GCP_PRIVATE_KEY")
    
    print(f"\nGCP_PROJECT_ID: {'SET' if project_id else 'NOT SET'}")
    if project_id:
        print(f"  Value: {project_id[:20]}..." if len(project_id) > 20 else f"  Value: {project_id}")
    
    print(f"GCP_CLIENT_EMAIL: {'SET' if client_email else 'NOT SET'}")
    if client_email:
        print(f"  Value: {client_email[:30]}..." if len(client_email) > 30 else f"  Value: {client_email}")
    
    print(f"GCP_PRIVATE_KEY: {'SET' if private_key else 'NOT SET'}")
    if private_key:
        print(f"  Value length: {len(private_key)} characters")
        print(f"  Starts with: {private_key[:30]}...")
else:
    print(f"ERROR: .env file not found at {env_path}")

