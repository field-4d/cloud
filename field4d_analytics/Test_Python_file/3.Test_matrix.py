#!/usr/bin/env python3
"""
Simple Test Matrix for Field4D StatDeck API
All tests use 3-minute intervals for consistency.
Saves results in organized structure similar to batching tests.
"""

import requests
import json
import time
from datetime import datetime, timedelta
import random
import pandas as pd
import os
import uuid

API_URL = "http://127.0.0.1:8000/analyze/tukey"
OUTPUT_DIR = "API_test_output/Test_Matrix"

def get_auth_token():
    """Get authentication token either manually or via login."""
    print("\n🔑 Authentication Options:")
    print("1. Enter token manually")
    print("2. Login with email/password")
    print("3. Skip authentication (tests will fail)")
    
    choice = input("Choose option (1, 2, or 3): ").strip()
    
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
                "http://127.0.0.1:8000/auth/login",
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
    
    elif choice == "3":
        print("⚠️  Proceeding without authentication")
        return None
    
    else:
        print("❌ Invalid choice")
        return None

# Test Matrix Configuration
# Following recommended batch sizes based on dataset characteristics:
# - Small datasets (< 50K): 10,000 batch size
# - Medium datasets (50K-200K): 8,000 batch size  
# - Large datasets (200K-1M): 5,000 batch size
# - Very large datasets (> 1M): 3,000 batch size

# Data calculation: points = groups × replicates × days × 480 (3-minute intervals per day)
# Each test is designed to stay under 15,000 points for API compatibility

TEST_MATRIX = [
    # Test ID, Name, Groups, Replicates, Days, Expected Points, Recommended Batch Size, Description
    ("T1", "Small Test", ["Control", "Treatment"], 2, 1, 1920, 10000, "Quick validation test - small dataset"),
    ("T2", "Medium Test", ["A", "B", "C"], 2, 2, 5760, 10000, "Standard 3-group study - small dataset"),
    ("T3", "Large Test", ["Control", "T1", "T2", "T3"], 2, 2, 7680, 10000, "Large 4-group study - small dataset"),
    ("T4", "High Reps", ["Control", "Treatment"], 3, 2, 5760, 10000, "High replication study - small dataset"),
    ("T5", "Long Term", ["A", "B"], 2, 3, 5760, 10000, "Long-term study over 3 days - small dataset"),
    ("T6", "Many Groups", ["G1", "G2", "G3", "G4", "G5"], 1, 2, 4800, 10000, "Many treatment groups - small dataset"),
    ("T7", "Stress Test", ["Control", "T1", "T2"], 2, 3, 8640, 10000, "Moderate stress test - small dataset"),
    ("T8", "Validation", ["Control", "Treatment"], 2, 1, 1920, 10000, "Basic validation test - small dataset"),
]

def generate_test_data(groups, replicates, days, start_date="2025-06-01"):
    """
    Generate synthetic test data with 3-minute intervals.
    
    Args:
        groups (list): List of group names
        replicates (int): Number of replicates per group per timestamp
        days (int): Number of days to generate
        start_date (str): Start date in YYYY-MM-DD format
    
    Returns:
        list: List of data dictionaries for API input
    """
    data = []
    start_dt = datetime.strptime(start_date, "%Y-%m-%d")
    
    # Generate data for each day
    for day in range(days):
        current_date = start_dt + timedelta(days=day)
        
        # Generate data for each 3-minute interval (480 intervals per day)
        for interval in range(0, 24 * 60, 3):
            timestamp = (current_date + timedelta(minutes=interval)).strftime("%Y-%m-%d %H:%M")
            
            # Generate data for each group
            for group in groups:
                # Generate replicates for this group at this timestamp
                for rep in range(replicates):
                    # Create realistic data with group effects
                    base_value = 20.0  # Base value
                    group_effect = groups.index(group) * 2.5  # Group effect
                    noise = random.gauss(0, 1.5)  # Random noise
                    value = base_value + group_effect + noise
                    
                    data.append({
                        "timestamp": timestamp,
                        "label": group,
                        "value": round(value, 2)
                    })
    
    return data

def run_single_test(test_id, name, groups, replicates, days, expected_points, recommended_batch_size, description, test_run_id, auth_token=None):
    """
    Run a single test scenario with detailed logging.
    
    Args:
        test_id (str): Test identifier
        name (str): Test name
        groups (list): List of group names
        replicates (int): Number of replicates
        days (int): Number of days
        expected_points (int): Expected number of data points
        description (str): Test description
        test_run_id (str): Test run identifier
    
    Returns:
        dict: Test results with detailed information
    """
    test_start_time = time.time()
    print(f"\n{'='*60}")
    print(f"Running Test {test_id}: {name}")
    print(f"Groups: {groups}")
    print(f"Replicates: {replicates}, Days: {days}")
    print(f"Expected points: {expected_points:,}")
    print(f"Recommended batch size: {recommended_batch_size:,}")
    print(f"Description: {description}")
    print(f"{'='*60}")
    
    # Create test-specific directory
    test_dir = os.path.join(OUTPUT_DIR, "logs", test_run_id, test_id)
    os.makedirs(test_dir, exist_ok=True)
    
    # Generate test data
    print("Generating test data...")
    data = generate_test_data(groups, replicates, days)
    actual_points = len(data)
    print(f"Generated {actual_points:,} data points")
    
    # Save test data
    test_data_file = os.path.join(test_dir, f"{test_id}_test_data.json")
    test_data = {
        "test_id": test_id,
        "test_name": name,
        "groups": groups,
        "replicates": replicates,
        "days": days,
        "expected_points": expected_points,
        "actual_points": actual_points,
        "recommended_batch_size": recommended_batch_size,
        "description": description,
        "data": data
    }
    with open(test_data_file, 'w') as f:
        json.dump(test_data, f, indent=2)
    print(f"Test data saved to: {test_data_file}")
    
    # Prepare API request
    payload = {
        "parameter": "temperature",
        "data": data
    }
    
    # Run API request
    print("Sending API request...")
    start_time = time.time()
    start_datetime = datetime.now().isoformat()
    
    try:
        headers = {"Content-Type": "application/json"}
        
        # Add authentication header if token provided
        if auth_token:
            headers["Authorization"] = f"Bearer {auth_token}"
        
        response = requests.post(API_URL, json=payload, headers=headers, timeout=300)  # 5 min timeout
        elapsed_time = time.time() - start_time
        end_datetime = datetime.now().isoformat()
        
        # Process response
        if response.status_code == 200:
            result = response.json()
            success = True
            error_message = None
            results_count = len(result.get('results', []))
            auth_status = "✅ Authenticated" if auth_token else "✅ Public endpoint"
            print(f"✅ SUCCESS: {elapsed_time:.3f}s, {results_count} results ({auth_status})")
        elif response.status_code == 401:
            success = False
            error_message = "Authentication failed - invalid token"
            results_count = 0
            print(f"❌ AUTH FAILED: Invalid token")
        elif response.status_code == 403:
            success = False
            error_message = "Access forbidden - authentication required"
            results_count = 0
            print(f"❌ ACCESS DENIED: Authentication required")
        else:
            success = False
            error_message = response.text
            results_count = 0
            print(f"❌ FAILED: {response.status_code} - {error_message[:100]}...")
            
    except requests.exceptions.Timeout:
        success = False
        error_message = "Request timeout"
        results_count = 0
        elapsed_time = time.time() - start_time
        end_datetime = datetime.now().isoformat()
        print(f"⏰ TIMEOUT: {elapsed_time:.3f}s")
        
    except Exception as e:
        success = False
        error_message = str(e)
        results_count = 0
        elapsed_time = time.time() - start_time
        end_datetime = datetime.now().isoformat()
        print(f"💥 ERROR: {error_message}")
    
    # Calculate throughput
    throughput = actual_points / elapsed_time if elapsed_time > 0 else 0
    
    # Create detailed test result
    test_result = {
        "test_id": test_id,
        "test_name": name,
        "groups": groups,
        "replicates": replicates,
        "days": days,
        "expected_points": expected_points,
        "actual_points": actual_points,
        "recommended_batch_size": recommended_batch_size,
        "description": description,
        "success": success,
        "start_time": start_datetime,
        "end_time": end_datetime,
        "elapsed_time": elapsed_time,
        "throughput": throughput,
        "results_count": results_count,
        "error_message": error_message,
        "test_data_file": test_data_file,
        "timestamp": datetime.now().isoformat()
    }
    
    # Save API response if successful
    if success:
        response_file = os.path.join(test_dir, f"{test_id}_response.json")
        with open(response_file, 'w') as f:
            json.dump(result, f, indent=2)
        test_result["response_file"] = response_file
        print(f"Response saved to: {response_file}")
    
    # Save test result
    result_file = os.path.join(test_dir, f"{test_id}_result.json")
    with open(result_file, 'w') as f:
        json.dump(test_result, f, indent=2, default=str)
    print(f"Test result saved to: {result_file}")
    # Print test runtime
    test_total_time = time.time() - test_start_time
    print(f"⏱️  Test {test_id} total runtime: {test_total_time:.3f}s")
    
    return test_result

def run_test_matrix():
    """
    Run the complete test matrix with organized result saving.
    """
    print("🚀 Field4D StatDeck - Simple Test Matrix")
    print("All tests use 3-minute intervals")
    print(f"API URL: {API_URL}")
    print(f"Output directory: {OUTPUT_DIR}")
    
    # Get authentication token
    auth_token = get_auth_token()
    
    if auth_token:
        print(f"🔐 Using authentication token: {auth_token[:50]}...")
    else:
        print("⚠️  No authentication token provided - tests may fail")
    
    # Generate unique test run ID
    test_run_id = f"test_matrix_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:8]}"
    print(f"Test Run ID: {test_run_id}")
    
    # Create output directory structure
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    logs_dir = os.path.join(OUTPUT_DIR, "logs", test_run_id)
    os.makedirs(logs_dir, exist_ok=True)
    
    # Run all tests
    results = []
    start_time = time.time()
    test_start_datetime = datetime.now().isoformat()
    
    print(f"\n🚀 Starting test matrix execution...")
    print(f"⏰ Start time: {test_start_datetime}")
    print(f"📊 Total tests to run: {len(TEST_MATRIX)}")
    print(f"{'='*60}")
    
    for i, test_config in enumerate(TEST_MATRIX, 1):
        test_id, name, groups, replicates, days, expected_points, recommended_batch_size, description = test_config
        print(f"\n📋 Test {i}/{len(TEST_MATRIX)}")
        result = run_single_test(test_id, name, groups, replicates, days, expected_points, recommended_batch_size, description, test_run_id, auth_token)
        results.append(result)
    
    total_time = time.time() - start_time
    test_end_datetime = datetime.now().isoformat()
    
    # Create summary
    print(f"\n{'='*80}")
    print("📊 TEST MATRIX SUMMARY")
    print(f"{'='*80}")
    print(f"⏰ Total execution time: {total_time:.3f}s")
    print(f"📅 Start: {test_start_datetime}")
    print(f"📅 End: {test_end_datetime}")
    print(f"{'='*80}")
    
    # Summary statistics
    successful_tests = [r for r in results if r['success']]
    failed_tests = [r for r in results if not r['success']]
    
    print(f"Total tests: {len(results)}")
    print(f"Successful: {len(successful_tests)}")
    print(f"Failed: {len(failed_tests)}")
    print(f"Success rate: {(len(successful_tests) / len(results)) * 100:.1f}%")
    print(f"Total execution time: {total_time:.2f}s")
    
    # Performance summary
    if successful_tests:
        avg_time = sum(r['elapsed_time'] for r in successful_tests) / len(successful_tests)
        avg_throughput = sum(r['throughput'] for r in successful_tests) / len(successful_tests)
        print(f"Average response time: {avg_time:.3f}s")
        print(f"Average throughput: {avg_throughput:.0f} points/second")
    
    # Detailed results table
    print(f"\n{'='*120}")
    print("📋 DETAILED RESULTS")
    print(f"{'='*120}")
    print(f"{'Test':<8} {'Name':<15} {'Groups':<8} {'Reps':<4} {'Days':<4} {'Points':<8} {'Batch':<8} {'Time(s)':<8} {'Status':<8} {'Throughput':<12}")
    print("-" * 130)
    
    for result in results:
        status = "✅ PASS" if result['success'] else "❌ FAIL"
        throughput_str = f"{result['throughput']:.0f}/s" if result['success'] else "N/A"
        batch_size = result.get('recommended_batch_size', 'N/A')
        print(f"{result['test_id']:<8} {result['test_name']:<15} {len(result['groups']):<8} {result['replicates']:<4} {result['days']:<4} {result['actual_points']:<8} {batch_size:<8} {result['elapsed_time']:<8.3f} {status:<8} {throughput_str:<12}")
    
    # Failed tests details
    if failed_tests:
        print(f"\n❌ FAILED TESTS DETAILS:")
        for result in failed_tests:
            error_type = "Authentication" if "auth" in result['error_message'].lower() or "forbidden" in result['error_message'].lower() else "API"
            print(f"  {result['test_id']} ({result['test_name']}): [{error_type}] {result['error_message']}")
    
    # Best performing test
    if successful_tests:
        best_test = min(successful_tests, key=lambda x: x['elapsed_time'])
        print(f"\n🏆 BEST PERFORMANCE:")
        print(f"  Test: {best_test['test_id']} ({best_test['test_name']})")
        print(f"  Time: {best_test['elapsed_time']:.3f}s")
        print(f"  Throughput: {best_test['throughput']:.0f} points/second")
        print(f"  Configuration: {len(best_test['groups'])} groups, {best_test['replicates']} reps, {best_test['days']} days")
    
    # Create DataFrame for CSV export
    df = pd.DataFrame(results)
    
    # Add derived columns
    df['Total_Time_Minutes'] = df['elapsed_time'] / 60
    df['Data_Points_Per_Test'] = df['actual_points']
    df['Test_Category'] = df['actual_points'].apply(lambda x: 
        'Small' if x < 1000 else 'Medium' if x < 3000 else 'Large')
    
    # Add batch size recommendations based on dataset size
    def get_batch_recommendation(points):
        if points < 50000:
            return "10,000 (Small dataset)"
        elif points < 200000:
            return "8,000 (Medium dataset)"
        elif points < 1000000:
            return "5,000 (Large dataset)"
        else:
            return "3,000 (Very large dataset)"
    
    df['Batch_Size_Recommendation'] = df['actual_points'].apply(get_batch_recommendation)
    
    # Reorder columns for CSV
    columns_order = [
        'test_id', 'test_name', 'Test_Category', 'groups', 'replicates', 'days',
        'expected_points', 'actual_points', 'Data_Points_Per_Test', 'recommended_batch_size', 'Batch_Size_Recommendation',
        'success', 'elapsed_time', 'Total_Time_Minutes', 'throughput', 'results_count',
        'description', 'test_data_file', 'response_file', 'timestamp'
    ]
    df = df[columns_order]
    
    # Save results
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    
    # Save as CSV
    csv_file = os.path.join(OUTPUT_DIR, f"test_matrix_results_{timestamp}.csv")
    df.to_csv(csv_file, index=False)
    print(f"\n📊 CSV results saved to: {csv_file}")
    
    # Save as JSON
    json_file = os.path.join(OUTPUT_DIR, f"test_matrix_results_{timestamp}.json")
    with open(json_file, 'w') as f:
        json.dump({
            "test_run": {
                "test_run_id": test_run_id,
                "start_time": test_start_datetime,
                "end_time": test_end_datetime,
                "total_execution_time": total_time,
                "total_tests": len(results),
                "successful_tests": len(successful_tests),
                "failed_tests": len(failed_tests),
                "success_rate": (len(successful_tests) / len(results)) * 100 if results else 0
            },
            "results": results
        }, f, indent=2, default=str)
    print(f"📋 JSON results saved to: {json_file}")
    
    # Create test run summary
    run_summary = {
        "test_run_id": test_run_id,
        "start_time": test_start_datetime,
        "end_time": test_end_datetime,
        "total_execution_time": total_time,
        "total_tests": len(results),
        "successful_tests": len(successful_tests),
        "failed_tests": len(failed_tests),
        "success_rate": (len(successful_tests) / len(results)) * 100 if results else 0,
        "logs_directory": logs_dir,
        "csv_file": csv_file,
        "json_file": json_file,
        "test_summaries": results
    }
    
    run_summary_file = os.path.join(OUTPUT_DIR, f"test_run_summary_{test_run_id}.json")
    with open(run_summary_file, 'w') as f:
        json.dump(run_summary, f, indent=2, default=str)
    print(f"📋 Test run summary saved to: {run_summary_file}")
    
    # Print file structure summary
    print(f"\n📁 SAVED FILES STRUCTURE:")
    print(f"📂 Main directory: {OUTPUT_DIR}")
    print(f"📂 Logs directory: {logs_dir}")
    print(f"📊 CSV results: {csv_file}")
    print(f"📋 JSON results: {json_file}")
    print(f"📋 Run summary: {run_summary_file}")
    
    for result in results:
        test_id = result['test_id']
        test_dir = os.path.join(logs_dir, test_id)
        print(f"🧪 {test_id}:")
        print(f"   📄 Test data: {result['test_data_file']}")
        if 'response_file' in result:
            print(f"   📊 Response: {result['response_file']}")
        print(f"   📋 Result: {os.path.join(test_dir, f'{test_id}_result.json')}")
    
    return results

def main():
    """
    Main function to run the test matrix.
    """
    try:
        # Test API connectivity first
        print("🔍 Testing API connectivity...")
        health_response = requests.get("http://127.0.0.1:8000/health", timeout=5)
        if health_response.status_code == 200:
            print("✅ API is running and accessible")
            health_data = health_response.json()
            print(f"   Version: {health_data.get('version', 'Unknown')}")
            print(f"   Batch validation: {health_data.get('batch_validation', {}).get('max_batch_size', 'Unknown')} max points")
        else:
            print("❌ API health check failed")
            return
    except Exception as e:
        print(f"❌ Cannot connect to API: {e}")
        print("Please ensure the Field4D StatDeck server is running on http://127.0.0.1:8000")
        return
    
    # Run the test matrix
    results = run_test_matrix()
    
    print(f"\n🎉 Test matrix completed!")
    print(f"📁 All results saved to: {OUTPUT_DIR}")
    print(f"⏱️  Total execution time: {sum(r['elapsed_time'] for r in results):.2f}s")

if __name__ == "__main__":
    main() 