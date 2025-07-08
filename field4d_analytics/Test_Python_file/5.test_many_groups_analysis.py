#!/usr/bin/env python3
"""
Comprehensive test script for many groups analysis using example_input_many_groups.json
Tests multiple endpoints with performance monitoring and detailed result analysis.
"""

import requests
import json
import os
import time
import pandas as pd
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Any, Optional

# Configuration
BASE_URL = "http://localhost:8000"

# Path to test data
SCRIPT_DIR = Path(__file__).parent
TEST_DATA_PATH = SCRIPT_DIR / "valid_Json" / "example_input_2groups_total_10K.json"

# Create output directory with timestamp
TIMESTAMP = datetime.now().strftime("%Y%m%d_%H%M%S")
OUTPUT_DIR = SCRIPT_DIR / "API_test_output" / f"{TEST_DATA_PATH.stem}_test"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

class ManyGroupsTestSuite:
    """Test suite for many groucps analysis."""
    
    def __init__(self):
        self.test_data = None
        self.auth_token = None
        self.results = {}
        
    def load_test_data(self) -> bool:
        """Load and validate test data from JSON file."""
        try:
            with open(TEST_DATA_PATH, 'r') as f:
                self.test_data = json.load(f)
            
            print(f"✅ Test data loaded successfully")
            print(f"   Parameter: {self.test_data.get('parameter')}")
            print(f"   Test Type: {self.test_data.get('test_type')}")
            print(f"   Data Points: {len(self.test_data.get('data', []))}")
            
            # Validate data structure
            if not self.test_data.get('data'):
                print("❌ No data found in test file")
                return False
                
            # Analyze data structure
            self._analyze_data_structure()
            return True
            
        except FileNotFoundError:
            print(f"❌ Test data file not found: {TEST_DATA_PATH}")
            return False
        except json.JSONDecodeError as e:
            print(f"❌ Invalid JSON in test data file: {e}")
            return False
        except Exception as e:
            print(f"❌ Error loading test data: {str(e)}")
            return False
    
    def _analyze_data_structure(self):
        """Analyze the structure of the test data."""
        data = self.test_data.get('data', [])
        
        # Get unique timestamps and groups
        timestamps = set()
        groups = set()
        
        for item in data:
            timestamps.add(item.get('timestamp'))
            groups.add(item.get('label'))
        
        print(f"   Unique Timestamps: {len(timestamps)}")
        print(f"   Groups: {sorted(list(groups))}")
        
        # Calculate data points per timestamp
        df = pd.DataFrame(data)
        points_per_timestamp = df.groupby('timestamp').size()
        print(f"   Data points per timestamp: {points_per_timestamp.to_dict()}")
        
        # Save data analysis
        analysis = {
            "total_points": len(data),
            "unique_timestamps": len(timestamps),
            "groups": sorted(list(groups)),
            "timestamps": sorted(list(timestamps)),
            "points_per_timestamp": points_per_timestamp.to_dict()
        }
        
        analysis_file = OUTPUT_DIR / "data_analysis.json"
        with open(analysis_file, 'w') as f:
            json.dump(analysis, f, indent=2)
        print(f"📁 Data analysis saved to: {analysis_file}")
    
    def get_auth_token(self) -> bool:
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
                self.auth_token = token
                return True
            else:
                print("❌ No token provided")
                return False
        
        elif choice == "2":
            # Login with credentials
            email = input("Enter email: ").strip()
            password = input("Enter password: ").strip()
            
            if not email or not password:
                print("❌ Email and password required")
                return False
            
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
                        self.auth_token = data.get("token")
                        print("✅ Login successful!")
                        return True
                    else:
                        print(f"❌ Login failed: {data.get('error')}")
                        return False
                else:
                    print(f"❌ Login request failed with status {response.status_code}")
                    return False
                    
            except requests.exceptions.ConnectionError:
                print("❌ Could not connect to server. Make sure the server is running on localhost:8000")
                return False
            except Exception as e:
                print(f"❌ Login error: {str(e)}")
                return False
        
        elif choice == "3":
            print("⚠️  Proceeding without authentication")
            return True
        
        else:
            print("❌ Invalid choice")
            return False
    
    def test_health_endpoint(self) -> bool:
        """Test the health endpoint."""
        print("\n🏥 Testing health endpoint...")
        
        try:
            response = requests.get(f"{BASE_URL}/health", timeout=10)
            print(f"Status Code: {response.status_code}")
            
            if response.status_code == 200:
                health_data = response.json()
                print("✅ Health check successful!")
                print(f"   API Version: {health_data.get('version')}")
                print(f"   Batch Validation: {health_data.get('batch_validation', {}).get('max_batch_size')}")
                return True
            else:
                print(f"❌ Health check failed with status {response.status_code}")
                return False
                
        except requests.exceptions.ConnectionError:
            print("❌ Could not connect to server")
            return False
        except Exception as e:
            print(f"❌ Health check error: {str(e)}")
            return False
    
    def test_tukey_endpoint(self) -> bool:
        """Test the /analyze/tukey endpoint with performance monitoring."""
        print("\n🔬 Testing /analyze/tukey endpoint...")
        
        if not self.auth_token:
            print("⚠️  No authentication token - test will likely fail")
        
        headers = {
            "Content-Type": "application/json"
        }
        
        if self.auth_token:
            headers["Authorization"] = f"Bearer {self.auth_token}"
        
        # Prepare payload for tukey endpoint
        tukey_payload = {
            "parameter": self.test_data.get("parameter"),
            "data": self.test_data.get("data"),
            "alpha": 0.05
        }
        
        start_time = time.time()
        
        try:
            response = requests.post(
                f"{BASE_URL}/analyze/tukey",
                json=tukey_payload,
                headers=headers,
                timeout=60  # Longer timeout for complex analysis
            )
            
            end_time = time.time()
            duration = end_time - start_time
            
            print(f"Status Code: {response.status_code}")
            print(f"Response Time: {duration:.3f} seconds")
            
            if response.status_code == 200:
                result = response.json()
                print("✅ Tukey analysis successful!")
                print(f"   User: {result.get('user')}")
                print(f"   Parameter: {result.get('parameter')}")
                print(f"   Test Type: {result.get('test_type')}")
                print(f"   Batch Size: {result.get('batch_size')}")
                print(f"   Results Count: {len(result.get('results', []))}")
                
                # Analyze results
                self._analyze_tukey_results(result)
                
                # Save results
                output_file = OUTPUT_DIR / "tukey_analysis_results.json"
                with open(output_file, 'w') as f:
                    json.dump(result, f, indent=2)
                print(f"📁 Results saved to: {output_file}")
                
                self.results['tukey'] = {
                    'success': True,
                    'duration': duration,
                    'status_code': response.status_code,
                    'result_count': len(result.get('results', []))
                }
                return True
                
            elif response.status_code == 401:
                print("❌ Authentication failed - invalid or missing token")
                self.results['tukey'] = {'success': False, 'error': 'Authentication failed'}
                return False
            elif response.status_code == 400:
                error_data = response.json()
                print(f"❌ Analysis failed: {error_data.get('detail', 'Unknown error')}")
                self.results['tukey'] = {'success': False, 'error': error_data.get('detail')}
                return False
            else:
                print(f"❌ Request failed with status {response.status_code}")
                print(f"Response: {response.text[:200]}...")
                self.results['tukey'] = {'success': False, 'error': f'HTTP {response.status_code}'}
                return False
                
        except requests.exceptions.ConnectionError:
            print("❌ Could not connect to server")
            self.results['tukey'] = {'success': False, 'error': 'Connection error'}
            return False
        except Exception as e:
            print(f"❌ Analysis error: {str(e)}")
            self.results['tukey'] = {'success': False, 'error': str(e)}
            return False
    
    def test_legacy_endpoint(self) -> bool:
        """Test the legacy /analyze endpoint."""
        print("\n🔬 Testing legacy /analyze endpoint...")
        
        if not self.auth_token:
            print("⚠️  No authentication token - test will likely fail")
        
        headers = {
            "Content-Type": "application/json"
        }
        
        if self.auth_token:
            headers["Authorization"] = f"Bearer {self.auth_token}"
        
        start_time = time.time()
        
        try:
            response = requests.post(
                f"{BASE_URL}/analyze",
                json=self.test_data,
                headers=headers,
                timeout=60
            )
            
            end_time = time.time()
            duration = end_time - start_time
            
            print(f"Status Code: {response.status_code}")
            print(f"Response Time: {duration:.3f} seconds")
            
            if response.status_code == 200:
                result = response.json()
                print("✅ Legacy analysis successful!")
                print(f"   User: {result.get('user')}")
                print(f"   Parameter: {result.get('parameter')}")
                print(f"   Test Type: {result.get('test_type')}")
                print(f"   Batch Size: {result.get('batch_size')}")
                print(f"   Results Count: {len(result.get('results', []))}")
                
                # Save results
                output_file = OUTPUT_DIR / "legacy_analysis_results.json"
                with open(output_file, 'w') as f:
                    json.dump(result, f, indent=2)
                print(f"📁 Results saved to: {output_file}")
                
                self.results['legacy'] = {
                    'success': True,
                    'duration': duration,
                    'status_code': response.status_code,
                    'result_count': len(result.get('results', []))
                }
                return True
                
            elif response.status_code == 401:
                print("❌ Authentication failed - invalid or missing token")
                self.results['legacy'] = {'success': False, 'error': 'Authentication failed'}
                return False
            elif response.status_code == 400:
                error_data = response.json()
                print(f"❌ Analysis failed: {error_data.get('detail', 'Unknown error')}")
                self.results['legacy'] = {'success': False, 'error': error_data.get('detail')}
                return False
            else:
                print(f"❌ Request failed with status {response.status_code}")
                print(f"Response: {response.text[:200]}...")
                self.results['legacy'] = {'success': False, 'error': f'HTTP {response.status_code}'}
                return False
                
        except requests.exceptions.ConnectionError:
            print("❌ Could not connect to server")
            self.results['legacy'] = {'success': False, 'error': 'Connection error'}
            return False
        except Exception as e:
            print(f"❌ Analysis error: {str(e)}")
            self.results['legacy'] = {'success': False, 'error': str(e)}
            return False
    
    def _analyze_tukey_results(self, result: Dict[str, Any]):
        """Analyze Tukey test results for insights."""
        results = result.get('results', [])
        
        if not results:
            print("   No results to analyze")
            return
        
        print("\n📊 Results Analysis:")
        
        # Count significant differences
        total_comparisons = 0
        significant_comparisons = 0
        
        for res in results:
            if 'significant_differences' in res:
                comparisons = res['significant_differences']
                total_comparisons += len(comparisons)
                significant_comparisons += sum(1 for comp in comparisons if comp.get('reject_null', False))
        
        print(f"   Total Comparisons: {total_comparisons}")
        print(f"   Significant Differences: {significant_comparisons}")
        if total_comparisons > 0:
            significance_rate = (significant_comparisons / total_comparisons) * 100
            print(f"   Significance Rate: {significance_rate:.1f}%")
        
        # Show sample results
        if results:
            sample_result = results[0]
            print(f"   Sample Timestamp: {sample_result.get('timestamp')}")
            print(f"   Groups Tested: {sample_result.get('groups_tested')}")
            
            if 'letters_report' in sample_result and sample_result['letters_report']:
                print(f"   Letters Report: {sample_result['letters_report']}")
    
    def generate_test_report(self):
        """Generate a comprehensive test report."""
        print("\n📋 Generating Test Report...")
        
        report = {
            "test_info": {
                "timestamp": TIMESTAMP,
                "test_file": "example_input_many_groups.json",
                "total_data_points": len(self.test_data.get('data', [])) if self.test_data else 0,
                "parameter": self.test_data.get('parameter') if self.test_data else None,
                "test_type": self.test_data.get('test_type') if self.test_data else None
            },
            "authentication": {
                "has_token": bool(self.auth_token),
                "token_preview": self.auth_token[:20] + "..." if self.auth_token else None
            },
            "results": self.results,
            "summary": {
                "total_tests": len(self.results),
                "successful_tests": sum(1 for r in self.results.values() if r.get('success', False)),
                "failed_tests": sum(1 for r in self.results.values() if not r.get('success', False))
            }
        }
        
        # Save report
        report_file = OUTPUT_DIR / "test_report.json"
        with open(report_file, 'w') as f:
            json.dump(report, f, indent=2)
        
        print(f"📁 Test report saved to: {report_file}")
        
        # Print summary
        print(f"\n🎯 Test Summary:")
        print(f"   Total Tests: {report['summary']['total_tests']}")
        print(f"   Successful: {report['summary']['successful_tests']}")
        print(f"   Failed: {report['summary']['failed_tests']}")
        print(f"   Total Data Points: {report['test_info']['total_data_points']}")
        if self.results.get('tukey', {}).get('success'):
            duration = self.results['tukey'].get('duration', 0)
            print(f"   Tukey Test Duration: {duration:.3f} seconds")
        
        if self.results.get('legacy', {}).get('success'):
            duration = self.results['legacy'].get('duration', 0)
            print(f"   Legacy Test Duration: {duration:.3f} seconds")

def main():
    """Main test execution."""
    print("=" * 60)
    print("🔬 Many Groups Analysis Test Suite")
    print("=" * 60)
    
    # Initialize test suite
    test_suite = ManyGroupsTestSuite()
    
    # Load test data
    if not test_suite.load_test_data():
        print("❌ Failed to load test data. Exiting.")
        return
    
    # Get authentication
    if not test_suite.get_auth_token():
        print("⚠️  Proceeding without authentication")
    
    # Run tests
    print(f"\n🚀 Starting tests...")
    print(f"📁 Output directory: {OUTPUT_DIR}")
    
    # Test health endpoint
    test_suite.test_health_endpoint()
    
    # Test Tukey endpoint
    test_suite.test_tukey_endpoint()
    
    # Test legacy endpoint
    test_suite.test_legacy_endpoint()
    
    # Generate report
    test_suite.generate_test_report()
    
    print("\n✅ Test suite completed!")

if __name__ == "__main__":
    main() 