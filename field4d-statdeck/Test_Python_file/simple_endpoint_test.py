#!/usr/bin/env python3
"""
Simple endpoint test - just check if endpoints are responding.
"""

import requests
import json

BASE_URL = "http://localhost:8000"

def test_endpoint(endpoint, payload, expected_status=200):
    """Test a single endpoint."""
    try:
        response = requests.post(f"{BASE_URL}{endpoint}", json=payload, timeout=10)
        print(f"{endpoint}: {response.status_code}")
        if response.status_code != expected_status:
            print(f"  Expected {expected_status}, got {response.status_code}")
            if response.status_code != 200:
                print(f"  Error: {response.text[:100]}...")
        return response.status_code == expected_status
    except Exception as e:
        print(f"{endpoint}: ERROR - {str(e)}")
        return False

def main():
    """Test all endpoints with small datasets."""
    print("=== Simple Endpoint Test ===\n")
    
    # Small test dataset with correct format
    test_data = [
        {"timestamp": "2024-01-01T10:00:00", "label": "Control", "value": 10.5},
        {"timestamp": "2024-01-01T10:00:00", "label": "Treatment", "value": 12.0},
        {"timestamp": "2024-01-01T10:15:00", "label": "Control", "value": 10.8},
        {"timestamp": "2024-01-01T10:15:00", "label": "Treatment", "value": 11.9}
    ]
    
    # Test health endpoints
    print("Testing health endpoints...")
    try:
        response = requests.get(f"{BASE_URL}/health", timeout=5)
        print(f"/health: {response.status_code}")

    except Exception as e:
        print(f"Health check failed: {str(e)}")
    
    print("\nTesting analysis endpoints...")
    
    # Test Tukey endpoint
    tukey_payload = {
        "parameter": "SoilMoisture",
        "data": test_data
    }
    test_endpoint("/analyze/tukey", tukey_payload, 200)
    

    
    # Test legacy endpoint
    legacy_payload = {
        "test_type": "tukey",
        "parameter": "SoilMoisture",
        "data": test_data
    }
    test_endpoint("/analyze", legacy_payload, 200)
    
    print("\n=== Test completed ===")

if __name__ == "__main__":
    main() 