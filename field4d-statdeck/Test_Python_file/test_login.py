#!/usr/bin/env python3
"""
Simple test script for the login endpoint.
"""

import requests
import json

# Test configuration
BASE_URL = "http://localhost:8000"
TEST_EMAIL = "averbuch.nir@gmail.com"
TEST_PASSWORD = "Aa123456"  # Replace with actual password

def test_login():
    """Test the login endpoint."""
    
    # Test data
    login_data = {
        "email": TEST_EMAIL,
        "password": TEST_PASSWORD
    }
    
    try:
        # Make login request
        response = requests.post(
            f"{BASE_URL}/auth/login",
            json=login_data,
            headers={"Content-Type": "application/json"}
        )
        
        print(f"Status Code: {response.status_code}")
        print(f"Response: {json.dumps(response.json(), indent=2)}")
        
        if response.status_code == 200:
            data = response.json()
            if data.get("success"):
                print("✅ Login successful!")
                print(f"Token: {data.get('token')[:50]}...")
                print(f"User: {data.get('user')}")
            else:
                print("❌ Login failed!")
                print(f"Error: {data.get('error')}")
        else:
            print(f"❌ Request failed with status {response.status_code}")
            
    except requests.exceptions.ConnectionError:
        print("❌ Could not connect to server. Make sure the server is running on localhost:8000")
    except Exception as e:
        print(f"❌ Error: {str(e)}")

def test_health():
    """Test the health endpoint."""
    try:
        response = requests.get(f"{BASE_URL}/health")
        print(f"Health check status: {response.status_code}")
        if response.status_code == 200:
            print("✅ Server is running!")
        else:
            print("❌ Server health check failed!")
    except requests.exceptions.ConnectionError:
        print("❌ Could not connect to server")

if __name__ == "__main__":
    print("Testing Field4D StatDeck Login Endpoint")
    print("=" * 50)
    
    # Test health first
    test_health()
    print()
    
    # Test login
    test_login() 