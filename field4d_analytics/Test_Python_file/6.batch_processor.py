#!/usr/bin/env python3
"""
Batch processing script for large JSON datasets
Divides data into configurable batches and processes them sequentially.
"""

import requests
import json
import os
import time
import pandas as pd
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Any, Optional, Generator
import math

# Configuration
BASE_URL = "http://localhost:8000"

# Global batch configuration
BATCH_SIZE = 8_000  # Maximum records per batch (used for both simple and smart batching)
MAX_CONCURRENT_BATCHES = 1  # Maximum number of batches to process simultaneously
ENABLE_PARALLEL_PROCESSING = False  # Set to True to enable parallel processing
ENABLE_SMART_BATCHING = True  # Use smart batching strategy (group by timestamp)

# Path to test data
SCRIPT_DIR = Path(__file__).parent
TEST_DATA_PATH = SCRIPT_DIR / "valid_Json" / "four_group_input.json"

# Create output directory with timestamp
TIMESTAMP = datetime.now().strftime("%Y%m%d_%H%M%S")
OUTPUT_DIR = SCRIPT_DIR /"API_test_output" /"batch_processing_output" / f"{TEST_DATA_PATH.stem}_batch_{BATCH_SIZE}"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

class BatchProcessor:
    """Process large datasets by dividing them into manageable batches."""
    
    def __init__(self, batch_size: int = BATCH_SIZE):
        self.batch_size = batch_size
        self.test_data = None
        self.auth_token = None
        self.results = {}
        self.batch_results = []
        self.total_processing_time = 0
        
    def load_test_data(self, data_path: Optional[Path] = None) -> bool:
        """Load and validate test data from JSON file."""
        if data_path is None:
            data_path = TEST_DATA_PATH
            
        try:
            with open(data_path, 'r') as f:
                self.test_data = json.load(f)
            
            print(f"✅ Test data loaded successfully")
            print(f"   Parameter: {self.test_data.get('parameter')}")
            print(f"   Test Type: {self.test_data.get('test_type')}")
            print(f"   Total Data Points: {len(self.test_data.get('data', []))}")
            print(f"   Batch Size: {self.batch_size}")
            
            # Validate data structure
            if not self.test_data.get('data'):
                print("❌ No data found in test file")
                return False
                
            # Analyze data structure
            self._analyze_data_structure()
            return True
            
        except FileNotFoundError:
            print(f"❌ Test data file not found: {data_path}")
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
        
        # Calculate batch information
        if ENABLE_SMART_BATCHING:
            # For smart batching, we need to analyze timestamp distribution
            timestamp_groups = {}
            for item in data:
                ts = item.get('timestamp')
                if ts not in timestamp_groups:
                    timestamp_groups[ts] = []
                timestamp_groups[ts].append(item)
            
            # Estimate batches based on smart batching strategy
            current_batch_size = 0
            estimated_batches = 1
            for ts, records in sorted(timestamp_groups.items()):
                if current_batch_size + len(records) > BATCH_SIZE and current_batch_size > 0:
                    estimated_batches += 1
                    current_batch_size = len(records)
                else:
                    current_batch_size += len(records)
            
            print(f"   Estimated Smart Batches: {estimated_batches}")
            print(f"   Max Batch Size: {BATCH_SIZE}")
        else:
            total_batches = math.ceil(len(data) / self.batch_size)
            print(f"   Total Simple Batches: {total_batches}")
        
        # Save data analysis
        analysis = {
            "total_points": len(data),
            "unique_timestamps": len(timestamps),
            "groups": sorted(list(groups)),
            "timestamps": sorted(list(timestamps)),
            "points_per_timestamp": points_per_timestamp.to_dict(),
            "batch_config": {
                "batch_size": self.batch_size,
                "max_batch_size": BATCH_SIZE if ENABLE_SMART_BATCHING else None,
                "smart_batching": ENABLE_SMART_BATCHING,
                "max_concurrent_batches": MAX_CONCURRENT_BATCHES,
                "parallel_processing": ENABLE_PARALLEL_PROCESSING
            }
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
    
    def create_batches(self) -> Generator[List[Dict], None, None]:
        """Create batches from the test data."""
        if ENABLE_SMART_BATCHING:
            return self._create_smart_batches()
        else:
            return self._create_simple_batches()
    
    def _create_simple_batches(self) -> Generator[List[Dict], None, None]:
        """Create simple sequential batches."""
        data = self.test_data.get('data', [])
        total_points = len(data)
        
        print(f"\n📦 Creating simple batches...")
        print(f"   Total data points: {total_points}")
        print(f"   Batch size: {self.batch_size}")
        
        for i in range(0, total_points, self.batch_size):
            batch = data[i:i + self.batch_size]
            batch_num = (i // self.batch_size) + 1
            print(f"   Batch {batch_num}: {len(batch)} data points")
            yield batch
    
    def _create_smart_batches(self) -> Generator[List[Dict], None, None]:
        """
        Create smart batches by grouping records by timestamp.
        
        Smart Batching Strategy:
        1. Group all records by timestamp
        2. Count how many records each timestamp group contains
        3. Iterate over timestamp groups and accumulate them into batches
        4. Total number of records in a batch ≤ BATCH_SIZE
        5. Never split between timestamps — only between timestamp groups
        """
        data = self.test_data.get('data', [])
        total_points = len(data)
        
        print(f"\n🧠 Creating smart batches...")
        print(f"   Total data points: {total_points}")
        print(f"   Max batch size: {BATCH_SIZE}")
        
        # Step 1: Group all records by timestamp
        timestamp_groups = {}
        for record in data:
            timestamp = record.get('timestamp')
            if timestamp not in timestamp_groups:
                timestamp_groups[timestamp] = []
            timestamp_groups[timestamp].append(record)
        
        # Step 2: Count records per timestamp and sort timestamps
        timestamp_counts = {ts: len(records) for ts, records in timestamp_groups.items()}
        sorted_timestamps = sorted(timestamp_groups.keys())
        
        print(f"   Unique timestamps: {len(sorted_timestamps)}")
        print(f"   Records per timestamp: {timestamp_counts}")
        
        # Step 3: Create batches by accumulating timestamp groups
        current_batch = []
        current_batch_size = 0
        batch_num = 1
        
        for timestamp in sorted_timestamps:
            records = timestamp_groups[timestamp]
            records_count = len(records)
            
            # Check if adding this timestamp group would exceed batch size
            if current_batch_size + records_count > BATCH_SIZE and current_batch:
                # Current batch is full, yield it and start a new one
                print(f"   Batch {batch_num}: {len(current_batch)} data points ({current_batch_size} records)")
                yield current_batch
                
                # Start new batch with current timestamp group
                current_batch = records
                current_batch_size = records_count
                batch_num += 1
            else:
                # Add timestamp group to current batch
                current_batch.extend(records)
                current_batch_size += records_count
        
        # Yield the last batch if it contains data
        if current_batch:
            print(f"   Batch {batch_num}: {len(current_batch)} data points ({current_batch_size} records)")
            yield current_batch
        
        print(f"   Total smart batches created: {batch_num}")
        
        # Save smart batching analysis
        smart_analysis = {
            "batching_strategy": "smart",
            "max_batch_size": BATCH_SIZE,
            "total_timestamps": len(sorted_timestamps),
            "timestamp_distribution": timestamp_counts,
            "total_batches": batch_num,
            "timestamp_boundaries_respected": True
        }
        
        analysis_file = OUTPUT_DIR / "smart_batching_analysis.json"
        with open(analysis_file, 'w') as f:
            json.dump(smart_analysis, f, indent=2)
        print(f"📁 Smart batching analysis saved to: {analysis_file}")
    
    def process_batch(self, batch: List[Dict], batch_num: int) -> Dict[str, Any]:
        """Process a single batch of data."""
        print(f"\n🔬 Processing Batch {batch_num}...")
        
        if not self.auth_token:
            print("⚠️  No authentication token - batch will likely fail")
        
        headers = {
            "Content-Type": "application/json"
        }
        
        if self.auth_token:
            headers["Authorization"] = f"Bearer {self.auth_token}"
        
        # Prepare payload for this batch
        batch_payload = {
            "parameter": self.test_data.get("parameter"),
            "data": batch,
            "alpha": 0.05
        }
        
        start_time = time.time()
        
        # Add extra delay for the first batch to ensure server is ready
        if batch_num == 1:
            print(f"   ⏳ Adding extra delay for first batch...")
            time.sleep(3)  # Extra 3 seconds for first batch
        
        try:
            response = requests.post(
                f"{BASE_URL}/analyze/tukey",
                json=batch_payload,
                headers=headers,
                timeout=120  # Increased timeout for first batch
            )
            
            end_time = time.time()
            duration = end_time - start_time
            
            print(f"   Status Code: {response.status_code}")
            print(f"   Response Time: {duration:.3f} seconds")
            
            if response.status_code == 200:
                result = response.json()
                print(f"   ✅ Batch {batch_num} successful!")
                print(f"      User: {result.get('user')}")
                print(f"      Parameter: {result.get('parameter')}")
                print(f"      Test Type: {result.get('test_type')}")
                print(f"      Batch Size: {result.get('batch_size')}")
                print(f"      Results Count: {len(result.get('results', []))}")
                
                # Save individual batch result
                batch_file = OUTPUT_DIR / f"batch_{batch_num}_results.json"
                with open(batch_file, 'w') as f:
                    json.dump(result, f, indent=2)
                print(f"   📁 Batch results saved to: {batch_file}")
                
                return {
                    'batch_num': batch_num,
                    'success': True,
                    'duration': duration,
                    'status_code': response.status_code,
                    'result_count': len(result.get('results', [])),
                    'data_points': len(batch),
                    'result': result
                }
                
            elif response.status_code == 401:
                print(f"   ❌ Authentication failed for batch {batch_num}")
                return {
                    'batch_num': batch_num,
                    'success': False,
                    'error': 'Authentication failed',
                    'duration': duration,
                    'status_code': response.status_code
                }
            elif response.status_code == 400:
                error_data = response.json()
                print(f"   ❌ Batch {batch_num} failed: {error_data.get('detail', 'Unknown error')}")
                return {
                    'batch_num': batch_num,
                    'success': False,
                    'error': error_data.get('detail'),
                    'duration': duration,
                    'status_code': response.status_code
                }
            else:
                print(f"   ❌ Batch {batch_num} failed with status {response.status_code}")
                return {
                    'batch_num': batch_num,
                    'success': False,
                    'error': f'HTTP {response.status_code}',
                    'duration': duration,
                    'status_code': response.status_code
                }
                
        except requests.exceptions.ConnectionError:
            print(f"   ❌ Could not connect to server for batch {batch_num}")
            
            # Retry logic for first batch or connection errors
            if batch_num == 1:
                print(f"   🔄 Retrying batch {batch_num} after 5 seconds...")
                time.sleep(5)
                try:
                    response = requests.post(
                        f"{BASE_URL}/analyze/tukey",
                        json=batch_payload,
                        headers=headers,
                        timeout=120
                    )
                    
                    if response.status_code == 200:
                        result = response.json()
                        print(f"   ✅ Batch {batch_num} retry successful!")
                        return {
                            'batch_num': batch_num,
                            'success': True,
                            'duration': time.time() - start_time,
                            'status_code': response.status_code,
                            'result_count': len(result.get('results', [])),
                            'data_points': len(batch),
                            'result': result,
                            'retried': True
                        }
                except Exception as retry_e:
                    print(f"   ❌ Batch {batch_num} retry also failed: {str(retry_e)}")
            
            return {
                'batch_num': batch_num,
                'success': False,
                'error': 'Connection error',
                'duration': 0
            }
        except Exception as e:
            print(f"   ❌ Batch {batch_num} error: {str(e)}")
            return {
                'batch_num': batch_num,
                'success': False,
                'error': str(e),
                'duration': 0
            }
    
    def process_all_batches(self) -> bool:
        """Process all batches sequentially or in parallel."""
        print(f"\n🚀 Starting batch processing...")
        print(f"   Batch size: {self.batch_size}")
        print(f"   Max concurrent batches: {MAX_CONCURRENT_BATCHES}")
        print(f"   Parallel processing: {ENABLE_PARALLEL_PROCESSING}")
        
        if ENABLE_PARALLEL_PROCESSING:
            return self._process_batches_parallel()
        else:
            return self._process_batches_sequential()
    
    def _process_batches_sequential(self) -> bool:
        """Process batches sequentially."""
        print("\n📋 Processing batches sequentially...")
        
        start_time = time.time()
        batch_num = 1
        successful_batches = 0
        total_batches = 0
        
        for batch in self.create_batches():
            result = self.process_batch(batch, batch_num)
            self.batch_results.append(result)
            
            if result['success']:
                successful_batches += 1
            
            total_batches += 1
            batch_num += 1
            
            # Add small delay between batches to avoid overwhelming the server
            time.sleep(0.5)
        
        self.total_processing_time = time.time() - start_time
        
        print(f"\n📊 Sequential Processing Complete!")
        print(f"   Total Batches: {total_batches}")
        print(f"   Successful: {successful_batches}")
        print(f"   Failed: {total_batches - successful_batches}")
        print(f"   Total Time: {self.total_processing_time:.3f} seconds")
        
        return successful_batches > 0
    
    def _process_batches_parallel(self) -> bool:
        """Process batches in parallel (placeholder for future implementation)."""
        print("\n📋 Parallel processing not yet implemented, falling back to sequential...")
        return self._process_batches_sequential()
    
    def merge_batch_results(self) -> Dict[str, Any]:
        """Merge all batch results into a single comprehensive result."""
        print("\n🔗 Merging batch results...")
        
        if not self.batch_results:
            print("❌ No batch results to merge")
            return {}
        
        # Collect all results from successful batches
        all_results = []
        total_data_points = 0
        successful_batches = 0
        
        for batch_result in self.batch_results:
            if batch_result.get('success') and batch_result.get('result'):
                batch_data = batch_result['result']
                all_results.extend(batch_data.get('results', []))
                total_data_points += batch_result.get('data_points', 0)
                successful_batches += 1
        
        # Create merged result
        merged_result = {
            "user": self.batch_results[0].get('result', {}).get('user', 'unknown'),
            "parameter": self.test_data.get('parameter'),
            "test_type": self.test_data.get('test_type'),
            "batch_processing": {
                "total_batches": len(self.batch_results),
                "successful_batches": successful_batches,
                "batch_size": self.batch_size,
                "max_batch_size": BATCH_SIZE if ENABLE_SMART_BATCHING else None,
                "smart_batching": ENABLE_SMART_BATCHING,
                "total_processing_time": self.total_processing_time
            },
            "results": all_results,
            "total_data_points": total_data_points
        }
        
        # Save merged results
        merged_file = OUTPUT_DIR / "merged_results.json"
        with open(merged_file, 'w') as f:
            json.dump(merged_result, f, indent=2)
        print(f"📁 Merged results saved to: {merged_file}")
        
        return merged_result
    
    def generate_batch_report(self):
        """Generate a comprehensive batch processing report."""
        print("\n📋 Generating Batch Processing Report...")
        
        total_batches = len(self.batch_results)
        successful_batches = sum(1 for r in self.batch_results if r.get('success', False))
        failed_batches = total_batches - successful_batches
        total_duration = sum(r.get('duration', 0) for r in self.batch_results)
        total_data_points = sum(r.get('data_points', 0) for r in self.batch_results)
        
        report = {
            "batch_processing_info": {
                "timestamp": TIMESTAMP,
                "test_file": TEST_DATA_PATH.name,
                "batch_size": self.batch_size,
                "max_batch_size": BATCH_SIZE if ENABLE_SMART_BATCHING else None,
                "smart_batching": ENABLE_SMART_BATCHING,
                "max_concurrent_batches": MAX_CONCURRENT_BATCHES,
                "parallel_processing": ENABLE_PARALLEL_PROCESSING,
                "total_data_points": total_data_points,
                "parameter": self.test_data.get('parameter') if self.test_data else None,
                "test_type": self.test_data.get('test_type') if self.test_data else None
            },
            "authentication": {
                "has_token": bool(self.auth_token),
                "token_preview": self.auth_token[:20] + "..." if self.auth_token else None
            },
            "processing_summary": {
                "total_batches": total_batches,
                "successful_batches": successful_batches,
                "failed_batches": failed_batches,
                "success_rate": (successful_batches / total_batches * 100) if total_batches > 0 else 0,
                "total_processing_time": self.total_processing_time,
                "average_batch_time": total_duration / total_batches if total_batches > 0 else 0
            },
            "batch_details": self.batch_results
        }
        
        # Save report
        report_file = OUTPUT_DIR / "batch_processing_report.json"
        with open(report_file, 'w') as f:
            json.dump(report, f, indent=2)
        
        print(f"📁 Batch processing report saved to: {report_file}")
        
        # Print summary
        print(f"\n🎯 Batch Processing Summary:")
        print(f"   Total Batches: {total_batches}")
        print(f"   Successful: {successful_batches}")
        print(f"   Failed: {failed_batches}")
        print(f"   Success Rate: {report['processing_summary']['success_rate']:.1f}%")
        print(f"   Total Data Points: {total_data_points}")
        print(f"   Total Processing Time: {self.total_processing_time:.3f} seconds")
        if total_batches > 0:
            print(f"   Average Batch Time: {report['processing_summary']['average_batch_time']:.3f} seconds")

def main():
    """Main batch processing execution."""
    print("=" * 60)
    print("📦 Batch Processing for Large Datasets")
    print("=" * 60)
    
    # Initialize batch processor
    processor = BatchProcessor(batch_size=BATCH_SIZE)
    
    # Load test data
    if not processor.load_test_data():
        print("❌ Failed to load test data. Exiting.")
        return
    
    # Get authentication
    if not processor.get_auth_token():
        print("⚠️  Proceeding without authentication")
    
    # Add delay between authentication and first batch
    print(f"\n⏳ Waiting 2 seconds before starting batch processing...")
    time.sleep(2)
    
    # Health check before starting batch processing
    print(f"\n🏥 Performing health check before batch processing...")
    try:
        health_response = requests.get(f"{BASE_URL}/health", timeout=10)
        if health_response.status_code == 200:
            print(f"✅ Server health check passed")
        else:
            print(f"⚠️  Server health check returned status {health_response.status_code}")
    except Exception as e:
        print(f"⚠️  Health check failed: {str(e)}")
    
    # Process all batches
    print(f"\n🚀 Starting batch processing...")
    print(f"📁 Output directory: {OUTPUT_DIR}")
    if ENABLE_SMART_BATCHING:
        print(f"🧠 Smart batching enabled (max {BATCH_SIZE} records per batch)")
    else:
        print(f"📦 Simple batching enabled ({BATCH_SIZE} records per batch)")
    
    success = processor.process_all_batches()
    
    if success:
        # Merge results
        processor.merge_batch_results()
    
    # Generate report
    processor.generate_batch_report()
    
    print("\n✅ Batch processing completed!")

if __name__ == "__main__":
    main() 