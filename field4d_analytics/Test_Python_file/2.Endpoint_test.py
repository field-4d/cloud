#!/usr/bin/env python3
"""
Simple endpoint test - just check if endpoints are responding.
"""

import requests
import json

# BASE_URL = "http://localhost:8000" 
BASE_URL = "http://localhost:8080"

def get_auth_token():
    """Get authentication token either manually or via login."""
    print("\n🔑 Authentication Options:")
    print("1. Enter token manually")
    print("2. Login with email/password")
    
    choice = input("Choose option (1 or 2): ").strip()
    
    if choice == "1":
        # Manual token input
        token = input("Enter your JWT token: ").strip()
        if token:
            return token
        else:
            print("❌ No token provided")
            return None
    
    elif choice == "2":
        # Login with credentials
        email = input("Enter email: ").strip()
        password = input("Enter password: ").strip()
        
        if not email or not password:
            print("❌ Email and password required")
            return None
        
        try:
            login_data = {
                "email": email,
                "password": password
            }
            
            response = requests.post(
                f"{BASE_URL}/auth/login",
                json=login_data,
                headers={"Content-Type": "application/json"}
            )
            
            if response.status_code == 200:
                data = response.json()
                if data.get("success"):
                    print("✅ Login successful!")
                    return data.get("token")
                else:
                    print(f"❌ Login failed: {data.get('error')}")
                    return None
            else:
                print(f"❌ Login request failed with status {response.status_code}")
                return None
                
        except Exception as e:
            print(f"❌ Login error: {str(e)}")
            return None
    
    else:
        print("❌ Invalid choice")
        return None

def test_endpoint(endpoint, payload, expected_status=200, auth_token=None):
    """Test a single endpoint."""
    try:
        headers = {"Content-Type": "application/json"}
        
        # Add authentication header if token provided
        if auth_token:
            headers["Authorization"] = f"Bearer {auth_token}"
        
        response = requests.post(f"{BASE_URL}{endpoint}", json=payload, headers=headers, timeout=10)
        print(f"{endpoint}: {response.status_code}")
        
        if response.status_code != expected_status:
            print(f"  Expected {expected_status}, got {response.status_code}")
            if response.status_code != 200:
                print(f"  Error: {response.text[:100]}...")
        
        # Show authentication status
        if auth_token:
            if response.status_code == 200:
                print(f"  ✅ Authenticated request successful")
            elif response.status_code == 401:
                print(f"  ❌ Authentication failed")
            elif response.status_code == 403:
                print(f"  ❌ Access forbidden - authentication required")
        else:
            if response.status_code == 401 or response.status_code == 403:
                print(f"  ✅ Correctly rejected - authentication required")
        
        return response.status_code == expected_status
    except Exception as e:
        print(f"{endpoint}: ERROR - {str(e)}")
        return False

def main():
    """Test all endpoints with small datasets."""
    print("=== Simple Endpoint Test ===\n")
    
    # Get authentication token
    auth_token = get_auth_token()
    
    if not auth_token:
        print("⚠️  Proceeding without authentication (endpoints will be rejected)")
        print("   Protected endpoints will return 401/403 status codes\n")
    
    # Small test dataset with correct format
    test_data = [
        {"timestamp": "2024-01-01T10:00:00", "label": "Control", "value": 10.5},
        {"timestamp": "2024-01-01T10:00:00", "label": "Treatment", "value": 12.0},
        {"timestamp": "2024-01-01T10:15:00", "label": "Control", "value": 10.8},
        {"timestamp": "2024-01-01T10:15:00", "label": "Treatment", "value": 11.9}
    ]
    
    # Test health endpoints (no auth required)
    print("Testing health endpoints...")
    try:
        response = requests.get(f"{BASE_URL}/health", timeout=5)
        print(f"/health: {response.status_code}")

    except Exception as e:
        print(f"Health check failed: {str(e)}")
    
    print("\nTesting analysis endpoints...")
    
    # Test Tukey endpoint (auth required)
    tukey_payload = {
        "parameter": "temperature",
        "data": test_data
    }
    test_endpoint("/analyze/tukey", tukey_payload, 200, auth_token)
    
    # Test legacy endpoint (auth required)
    legacy_payload = {
        "test_type": "tukey",
        "parameter": "temperature",
        "data": test_data
    }
    test_endpoint("/analyze", legacy_payload, 200, auth_token)
    
    print("\n=== Test completed ===")

if __name__ == "__main__":
    main() 