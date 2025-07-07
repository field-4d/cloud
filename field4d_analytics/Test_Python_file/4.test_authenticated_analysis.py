#!/usr/bin/env python3
"""
Test script for authenticated analysis endpoints.
Tests the /analyze/tukey endpoint with authentication.
"""

import requests
import json
import os
from pathlib import Path
from datetime import datetime

# Configuration
BASE_URL = "http://localhost:8000"

# Path to test data
SCRIPT_DIR = Path(__file__).parent
TEST_DATA_PATH = SCRIPT_DIR / "valid_Json" / "example_input_many_groups.json"

# Create output directory with timestamp
TIMESTAMP = datetime.now().strftime("%Y%m%d_%H%M%S")
OUTPUT_DIR = SCRIPT_DIR / "API_test_output" / f"authenticated_test"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

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
                
        except requests.exceptions.ConnectionError:
            print("❌ Could not connect to server. Make sure the server is running on localhost:8000")
            return None
        except Exception as e:
            print(f"❌ Login error: {str(e)}")
            return None
    
    else:
        print("❌ Invalid choice")
        return None

def test_authenticated_analysis(token):
    """Test the authenticated analysis endpoint."""
    
    # Load test data
    try:
        with open(TEST_DATA_PATH, 'r') as f:
            test_data = json.load(f)
    except FileNotFoundError:
        print(f"❌ Test data file not found: {TEST_DATA_PATH}")
        return
    except json.JSONDecodeError:
        print(f"❌ Invalid JSON in test data file: {TEST_DATA_PATH}")
        return
    
    # Headers with authentication
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {token}"
    }
    
    try:
        # Test /analyze/tukey endpoint
        print("\n🔬 Testing /analyze/tukey endpoint...")
        response = requests.post(
            f"{BASE_URL}/analyze/tukey",
            json=test_data,
            headers=headers
        )
        
        print(f"Status Code: {response.status_code}")
        
        if response.status_code == 200:
            result = response.json()
            print("✅ Analysis successful!")
            print(f"User: {result.get('user')}")
            print(f"Parameter: {result.get('parameter')}")
            print(f"Test Type: {result.get('test_type')}")
            print(f"Batch Size: {result.get('batch_size')}")
            print(f"Results: {json.dumps(result.get('results'), indent=2)}")
            
            # Save results to file
            output_file = OUTPUT_DIR / "authenticated_analysis_results.json"
            with open(output_file, 'w') as f:
                json.dump(result, f, indent=2)
            print(f"📁 Results saved to: {output_file}")
            
        elif response.status_code == 401:
            print("❌ Authentication failed - invalid or missing token")
        elif response.status_code == 400:
            error_data = response.json()
            print(f"❌ Analysis failed: {error_data.get('detail', 'Unknown error')}")
        else:
            print(f"❌ Request failed with status {response.status_code}")
            print(f"Response: {response.text}")
            
    except requests.exceptions.ConnectionError:
        print("❌ Could not connect to server")
    except Exception as e:
        print(f"❌ Analysis error: {str(e)}")

def test_legacy_endpoint(token):
    """Test the legacy /analyze endpoint."""
    
    # Load test data
    try:
        with open(TEST_DATA_PATH, 'r') as f:
            test_data = json.load(f)
    except FileNotFoundError:
        print(f"❌ Test data file not found: {TEST_DATA_PATH}")
        return
    
    # Headers with authentication
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {token}"
    }
    
    try:
        # Test legacy /analyze endpoint
        print("\n🔬 Testing legacy /analyze endpoint...")
        response = requests.post(
            f"{BASE_URL}/analyze",
            json=test_data,
            headers=headers
        )
        
        print(f"Status Code: {response.status_code}")
        
        if response.status_code == 200:
            result = response.json()
            print("✅ Legacy analysis successful!")
            print(f"User: {result.get('user')}")
            print(f"Parameter: {result.get('parameter')}")
            print(f"Test Type: {result.get('test_type')}")
            print(f"Batch Size: {result.get('batch_size')}")
            
            # Save results to file
            output_file = OUTPUT_DIR / "legacy_analysis_results.json"
            with open(output_file, 'w') as f:
                json.dump(result, f, indent=2)
            print(f"📁 Results saved to: {output_file}")
            
        elif response.status_code == 401:
            print("❌ Authentication failed - invalid or missing token")
        elif response.status_code == 400:
            error_data = response.json()
            print(f"❌ Analysis failed: {error_data.get('detail', 'Unknown error')}")
        else:
            print(f"❌ Request failed with status {response.status_code}")
            print(f"Response: {response.text}")
            
    except requests.exceptions.ConnectionError:
        print("❌ Could not connect to server")
    except Exception as e:
        print(f"❌ Analysis error: {str(e)}")

def test_without_authentication():
    """Test what happens without authentication."""
    print("\n🔒 Testing without authentication...")
    
    try:
        with open(TEST_DATA_PATH, 'r') as f:
            test_data = json.load(f)
    except FileNotFoundError:
        print(f"❌ Test data file not found: {TEST_DATA_PATH}")
        return
    
    headers = {"Content-Type": "application/json"}
    
    try:
        response = requests.post(
            f"{BASE_URL}/analyze/tukey",
            json=test_data,
            headers=headers
        )
        
        print(f"Status Code: {response.status_code}")
        
        if response.status_code == 401:
            print("✅ Correctly rejected - authentication required")
            print(f"Response: {response.json()}")
        else:
            print(f"❌ Unexpected response: {response.status_code}")
            print(f"Response: {response.text}")
            
    except requests.exceptions.ConnectionError:
        print("❌ Could not connect to server")
    except Exception as e:
        print(f"❌ Error: {str(e)}")

def main():
    """Main test function."""
    print("🔬 Field4D StatDeck - Authenticated Analysis Test")
    print("=" * 60)
    print(f"📁 Output directory: {OUTPUT_DIR}")
    print("=" * 60)
    
    # Check if test data exists
    if not TEST_DATA_PATH.exists():
        print(f"❌ Test data file not found: {TEST_DATA_PATH}")
        print("Please make sure the example_input_many_groups.json file exists in the valid_Json folder.")
        return
    
    # Step 1: Get authentication token
    print("🔑 Step 1: Get authentication token...")
    token = get_auth_token()
    
    if not token:
        print("❌ Cannot proceed without valid token")
        return
    
    print(f"✅ Token obtained: {token[:50]}...")
    
    # Step 2: Test authenticated analysis
    print("\n🔬 Step 2: Test authenticated analysis endpoints...")
    test_authenticated_analysis(token)
    
    # Step 3: Test legacy endpoint
    test_legacy_endpoint(token)
    
    # Step 4: Test without authentication
    test_without_authentication()
    
    print("\n✅ Test completed!")

if __name__ == "__main__":
    main() 