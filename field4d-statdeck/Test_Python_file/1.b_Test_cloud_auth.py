#!/usr/bin/env python3
"""
Test script for Cloud Function authentication integration.
"""

import requests
import json
import hashlib
import base64
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv('app/auth/.env')

BASE_URL = "http://localhost:8000"
CLOUD_FUNCTION_URL = os.getenv('CLOUD_FUNCTION_URL')
CLOUD_FUNCTION_URL="https://us-central1-iucc-f4d.cloudfunctions.net/login_and_issue_jwt"

def hash_password(password: str) -> str:
    """Hash password using SHA256 + BASE64."""
    # Remove spaces from password
    password = password.replace(' ', '')
    
    # Hash using SHA256
    sha256_hash = hashlib.sha256(password.encode('utf-8')).digest()
    
    # Convert to BASE64
    base64_hash = base64.b64encode(sha256_hash).decode('utf-8')
    
    return base64_hash

def test_cloud_function_direct():
    """Test direct Cloud Function call."""
    print("\n🔐 Testing Cloud Function Direct Call")
    print("=" * 50)
    
    if not CLOUD_FUNCTION_URL:
        print("❌ CLOUD_FUNCTION_URL not set in environment")
        return None
    
    # Test credentials (replace with actual test credentials)
    email = input("Enter email: ").strip()
    password = input("Enter password: ").strip()
    
    if not email or not password:
        print("❌ Email and password required")
        return None
    
    try:
        # Hash password
        hashed_password = hash_password(password)
        print(f"📝 Hashed password: {hashed_password[:20]}...")
        
        # Prepare payload
        payload = {
            "email": email,
            "hashed_password": hashed_password
        }
        
        print(f"🌐 Calling Cloud Function: {CLOUD_FUNCTION_URL}")
        
        # Call Cloud Function
        response = requests.post(
            CLOUD_FUNCTION_URL,
            json=payload,
            headers={"Content-Type": "application/json"},
            timeout=30
        )
        
        print(f"📊 Response Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print("✅ Cloud Function call successful!")
            print(f"📋 Response: {json.dumps(data, indent=2)}")
            
            if data.get("success"):
                token = data.get("token")
                print(f"🎫 JWT Token: {token[:50]}...")
                return token
            else:
                print(f"❌ Authentication failed: {data.get('error')}")
                return None
        else:
            print(f"❌ Cloud Function request failed: {response.text}")
            return None
            
    except Exception as e:
        print(f"❌ Error calling Cloud Function: {str(e)}")
        return None

def test_fastapi_login():
    """Test FastAPI login endpoint with Cloud Function integration."""
    print("\n🚀 Testing FastAPI Login with Cloud Function")
    print("=" * 50)
    
    # Test credentials
    email = input("Enter email: ").strip()
    password = input("Enter password: ").strip()
    
    if not email or not password:
        print("❌ Email and password required")
        return None
    
    try:
        # Prepare login payload (plain text password - FastAPI will hash it)
        payload = {
            "email": email,
            "password": password
        }
        
        print(f"🌐 Calling FastAPI login: {BASE_URL}/auth/login")
        
        # Call FastAPI login endpoint
        response = requests.post(
            f"{BASE_URL}/auth/login",
            json=payload,
            headers={"Content-Type": "application/json"},
            timeout=30
        )
        
        print(f"📊 Response Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print("✅ FastAPI login successful!")
            print(f"📋 Response: {json.dumps(data, indent=2)}")
            
            if data.get("success"):
                token = data.get("token")
                print(f"🎫 JWT Token: {token[:50]}...")
                return token
            else:
                print(f"❌ Login failed: {data.get('error')}")
                return None
        else:
            print(f"❌ FastAPI request failed: {response.text}")
            return None
            
    except Exception as e:
        print(f"❌ Error calling FastAPI: {str(e)}")
        return None

def test_authenticated_endpoint(token):
    """Test authenticated endpoint with JWT token."""
    print("\n🔒 Testing Authenticated Endpoint")
    print("=" * 50)
    
    if not token:
        print("❌ No token provided")
        return
    
    # Test data
    test_data = {
        "parameter": "temperature",
        "data": [
            {"timestamp": "2025-06-01", "label": "Control", "value": 18.0},
            {"timestamp": "2025-06-01", "label": "TreatmentA", "value": 21.3},
            {"timestamp": "2025-06-02", "label": "Control", "value": 19.1},
            {"timestamp": "2025-06-02", "label": "TreatmentA", "value": 24.4}
        ]
    }
    
    try:
        # Call authenticated endpoint
        response = requests.post(
            f"{BASE_URL}/analyze/tukey",
            json=test_data,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {token}"
            },
            timeout=30
        )
        
        print(f"📊 Response Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print("✅ Authenticated endpoint successful!")
            print(f"📋 Parameter: {data.get('parameter')}")
            print(f"📋 Test Type: {data.get('test_type')}")
            print(f"📋 Batch Size: {data.get('batch_size')}")
            print(f"📋 User: {data.get('user')}")
            print(f"📋 Results Count: {len(data.get('results', []))}")
        elif response.status_code == 401:
            print("❌ Authentication failed - invalid token")
        elif response.status_code == 403:
            print("❌ Access forbidden - authentication required")
        else:
            print(f"❌ Request failed: {response.text}")
            
    except Exception as e:
        print(f"❌ Error calling authenticated endpoint: {str(e)}")

def main():
    """Main test function."""
    print("🧪 Cloud Function Authentication Test")
    print("=" * 50)
    
    # Test 1: Direct Cloud Function call
    token1 = test_cloud_function_direct()
    
    # Test 2: FastAPI login with Cloud Function integration
    token2 = test_fastapi_login()
    
    # Test 3: Use token to call authenticated endpoint
    if token1:
        test_authenticated_endpoint(token1)
    elif token2:
        test_authenticated_endpoint(token2)
    else:
        print("\n❌ No valid token obtained for endpoint testing")

if __name__ == "__main__":
    main() 