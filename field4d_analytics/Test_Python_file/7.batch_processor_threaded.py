#!/usr/bin/env python3
"""
Threaded batch processing script for large JSON datasets
Divides data into configurable batches and processes them in parallel using 4 workers.
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
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from queue import Queue
import logging

# Configuration
BASE_URL = "http://localhost:8000"

# Global batch configuration
BATCH_SIZE = 8_000  # Maximum records per batch (used for both simple and smart batching)
MAX_CONCURRENT_BATCHES = 4  # Maximum number of batches to process simultaneously
ENABLE_PARALLEL_PROCESSING = True  # Set to True to enable parallel processing
ENABLE_SMART_BATCHING = True  # Use smart batching strategy (group by timestamp)
NUM_WORKERS = 4  # Number of worker threads

# Path to test data
SCRIPT_DIR = Path(__file__).parent
TEST_DATA_PATH = SCRIPT_DIR / "valid_Json" / "four_group_input.json"

# Create output directory with timestamp
TIMESTAMP = datetime.now().strftime("%Y%m%d_%H%M%S")
OUTPUT_DIR = SCRIPT_DIR /"API_test_output" /"batch_processing_threaded_output" / f"{TEST_DATA_PATH.stem}_batch_{BATCH_SIZE}_threaded"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# Set up logging without Unicode characters
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(threadName)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(OUTPUT_DIR / "threaded_processing.log", encoding='utf-8'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

class ThreadedBatchProcessor:
    """Process large datasets by dividing them into manageable batches using multiple threads."""
    
    def __init__(self, batch_size: int = BATCH_SIZE, num_workers: int = NUM_WORKERS):
        self.batch_size = batch_size
        self.num_workers = num_workers
        self.test_data = None
        self.auth_token = None
        self.results = {}
        self.batch_results = []
        self.total_processing_time = 0
        self.lock = threading.Lock()  # Thread lock for shared resources
        self.active_workers = 0
        self.max_active_workers = 0
        
    def load_test_data(self, data_path: Optional[Path] = None) -> bool:
        """Load and validate test data from JSON file."""
        if data_path is None:
            data_path = TEST_DATA_PATH
            
        try:
            with open(data_path, 'r') as f:
                self.test_data = json.load(f)
            
            logger.info("Test data loaded successfully")
            logger.info(f"   Parameter: {self.test_data.get('parameter')}")
            logger.info(f"   Test Type: {self.test_data.get('test_type')}")
            logger.info(f"   Total Data Points: {len(self.test_data.get('data', []))}")
            logger.info(f"   Batch Size: {self.batch_size}")
            logger.info(f"   Number of Workers: {self.num_workers}")
            
            # Validate data structure
            if not self.test_data.get('data'):
                logger.error("No data found in test file")
                return False
                
            # Analyze data structure
            self._analyze_data_structure()
            return True
            
        except FileNotFoundError:
            logger.error(f"Test data file not found: {data_path}")
            return False
        except json.JSONDecodeError as e:
            logger.error(f"Invalid JSON in test data file: {e}")
            return False
        except Exception as e:
            logger.error(f"Error loading test data: {str(e)}")
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
        
        logger.info(f"   Unique Timestamps: {len(timestamps)}")
        logger.info(f"   Groups: {sorted(list(groups))}")
        
        # Calculate data points per timestamp
        df = pd.DataFrame(data)
        points_per_timestamp = df.groupby('timestamp').size()
        logger.info(f"   Data points per timestamp: {points_per_timestamp.to_dict()}")
        
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
            
            logger.info(f"   Estimated Smart Batches: {estimated_batches}")
            logger.info(f"   Max Batch Size: {BATCH_SIZE}")
        else:
            total_batches = math.ceil(len(data) / self.batch_size)
            logger.info(f"   Total Simple Batches: {total_batches}")
        
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
                "parallel_processing": ENABLE_PARALLEL_PROCESSING,
                "num_workers": self.num_workers
            }
        }
        
        analysis_file = OUTPUT_DIR / "data_analysis.json"
        with open(analysis_file, 'w') as f:
            json.dump(analysis, f, indent=2)
        logger.info(f"Data analysis saved to: {analysis_file}")
    
    def get_auth_token(self) -> bool:
        """Get authentication token either manually or via login."""
        print("\nAuthentication Options:")
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
                print("No token provided")
                return False
        
        elif choice == "2":
            # Login with credentials
            email = input("Enter email: ").strip()
            password = input("Enter password: ").strip()
            
            if not email or not password:
                print("Email and password required")
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
                        print("Login successful!")
                        return True
                    else:
                        print(f"Login failed: {data.get('error')}")
                        return False
                else:
                    print(f"Login request failed with status {response.status_code}")
                    return False
                    
            except requests.exceptions.ConnectionError:
                print("Could not connect to server. Make sure the server is running on localhost:8000")
                return False
            except Exception as e:
                print(f"Login error: {str(e)}")
                return False
        
        elif choice == "3":
            print("Proceeding without authentication")
            return True
        
        else:
            print("Invalid choice")
            return False
    
    def create_batches(self) -> List[List[Dict]]:
        """Create batches from the test data and return as a list."""
        if ENABLE_SMART_BATCHING:
            return list(self._create_smart_batches())
        else:
            return list(self._create_simple_batches())
    
    def _create_simple_batches(self) -> Generator[List[Dict], None, None]:
        """Create simple sequential batches."""
        data = self.test_data.get('data', [])
        total_points = len(data)
        
        logger.info("Creating simple batches...")
        logger.info(f"   Total data points: {total_points}")
        logger.info(f"   Batch size: {self.batch_size}")
        
        for i in range(0, total_points, self.batch_size):
            batch = data[i:i + self.batch_size]
            batch_num = (i // self.batch_size) + 1
            logger.info(f"   Batch {batch_num}: {len(batch)} data points")
            yield batch
    
    def _create_smart_batches(self) -> Generator[List[Dict], None, None]:
        """
        Create smart batches by grouping records by timestamp.
        
        Smart Batching Strategy:
        1. Group all records by timestamp
        2. Count how many records each timestamp group contains
        3. Iterate over timestamp groups and accumulate them into batches
        4. Total number of records in a batch <= BATCH_SIZE
        5. Never split between timestamps — only between timestamp groups
        """
        data = self.test_data.get('data', [])
        total_points = len(data)
        
        logger.info("Creating smart batches...")
        logger.info(f"   Total data points: {total_points}")
        logger.info(f"   Max batch size: {BATCH_SIZE}")
        
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
        
        logger.info(f"   Unique timestamps: {len(sorted_timestamps)}")
        logger.info(f"   Records per timestamp: {timestamp_counts}")
        
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
                logger.info(f"   Batch {batch_num}: {len(current_batch)} data points ({current_batch_size} records)")
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
            logger.info(f"   Batch {batch_num}: {len(current_batch)} data points ({current_batch_size} records)")
            yield current_batch
        
        logger.info(f"   Total smart batches created: {batch_num}")
        
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
        logger.info(f"Smart batching analysis saved to: {analysis_file}")
    
    def process_batch(self, batch: List[Dict], batch_num: int) -> Dict[str, Any]:
        """Process a single batch of data."""
        thread_name = threading.current_thread().name
        logger.info(f"[{thread_name}] Processing Batch {batch_num}...")
        
        # Track active workers
        with self.lock:
            self.active_workers += 1
            self.max_active_workers = max(self.max_active_workers, self.active_workers)
        
        try:
            if not self.auth_token:
                logger.warning(f"[{thread_name}] No authentication token - batch will likely fail")
            
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
                logger.info(f"   [{thread_name}] Adding extra delay for first batch...")
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
                
                logger.info(f"   [{thread_name}] Status Code: {response.status_code}")
                logger.info(f"   [{thread_name}] Response Time: {duration:.3f} seconds")
                
                if response.status_code == 200:
                    result = response.json()
                    logger.info(f"   [{thread_name}] Batch {batch_num} successful!")
                    logger.info(f"      [{thread_name}] User: {result.get('user')}")
                    logger.info(f"      [{thread_name}] Parameter: {result.get('parameter')}")
                    logger.info(f"      [{thread_name}] Test Type: {result.get('test_type')}")
                    logger.info(f"      [{thread_name}] Batch Size: {result.get('batch_size')}")
                    logger.info(f"      [{thread_name}] Results Count: {len(result.get('results', []))}")
                    
                    # Save individual batch result
                    batch_file = OUTPUT_DIR / f"batch_{batch_num}_results.json"
                    with open(batch_file, 'w') as f:
                        json.dump(result, f, indent=2)
                    logger.info(f"   [{thread_name}] Batch results saved to: {batch_file}")
                    
                    return {
                        'batch_num': batch_num,
                        'success': True,
                        'duration': duration,
                        'status_code': response.status_code,
                        'result_count': len(result.get('results', [])),
                        'data_points': len(batch),
                        'result': result,
                        'thread_name': thread_name
                    }
                    
                elif response.status_code == 401:
                    logger.error(f"   [{thread_name}] Authentication failed for batch {batch_num}")
                    return {
                        'batch_num': batch_num,
                        'success': False,
                        'error': 'Authentication failed',
                        'duration': duration,
                        'status_code': response.status_code,
                        'thread_name': thread_name
                    }
                elif response.status_code == 400:
                    error_data = response.json()
                    logger.error(f"   [{thread_name}] Batch {batch_num} failed: {error_data.get('detail', 'Unknown error')}")
                    return {
                        'batch_num': batch_num,
                        'success': False,
                        'error': error_data.get('detail'),
                        'duration': duration,
                        'status_code': response.status_code,
                        'thread_name': thread_name
                    }
                else:
                    logger.error(f"   [{thread_name}] Batch {batch_num} failed with status {response.status_code}")
                    return {
                        'batch_num': batch_num,
                        'success': False,
                        'error': f'HTTP {response.status_code}',
                        'duration': duration,
                        'status_code': response.status_code,
                        'thread_name': thread_name
                    }
                    
            except requests.exceptions.ConnectionError:
                logger.error(f"   [{thread_name}] Could not connect to server for batch {batch_num}")
                
                # Retry logic for first batch or connection errors
                if batch_num == 1:
                    logger.info(f"   [{thread_name}] Retrying batch {batch_num} after 5 seconds...")
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
                            logger.info(f"   [{thread_name}] Batch {batch_num} retry successful!")
                            return {
                                'batch_num': batch_num,
                                'success': True,
                                'duration': time.time() - start_time,
                                'status_code': response.status_code,
                                'result_count': len(result.get('results', [])),
                                'data_points': len(batch),
                                'result': result,
                                'retried': True,
                                'thread_name': thread_name
                            }
                    except Exception as retry_e:
                        logger.error(f"   [{thread_name}] Batch {batch_num} retry also failed: {str(retry_e)}")
                
                return {
                    'batch_num': batch_num,
                    'success': False,
                    'error': 'Connection error',
                    'duration': 0,
                    'thread_name': thread_name
                }
            except Exception as e:
                logger.error(f"   [{thread_name}] Batch {batch_num} error: {str(e)}")
                return {
                    'batch_num': batch_num,
                    'success': False,
                    'error': str(e),
                    'duration': 0,
                    'thread_name': thread_name
                }
        finally:
            # Track active workers
            with self.lock:
                self.active_workers -= 1
    
    def process_all_batches(self) -> bool:
        """Process all batches using ThreadPoolExecutor with 4 workers."""
        logger.info("Starting threaded batch processing...")
        logger.info(f"   Batch size: {self.batch_size}")
        logger.info(f"   Number of workers: {self.num_workers}")
        logger.info(f"   Parallel processing: {ENABLE_PARALLEL_PROCESSING}")
        
        if ENABLE_PARALLEL_PROCESSING:
            return self._process_batches_parallel()
        else:
            return self._process_batches_sequential()
    
    def _process_batches_parallel(self) -> bool:
        """Process batches in parallel using ThreadPoolExecutor."""
        logger.info("Processing batches in parallel with ThreadPoolExecutor...")
        
        # Create all batches first
        batches = self.create_batches()
        total_batches = len(batches)
        
        logger.info(f"   Total batches to process: {total_batches}")
        logger.info(f"   Number of worker threads: {self.num_workers}")
        
        start_time = time.time()
        successful_batches = 0
        failed_batches = 0
        
        # Use ThreadPoolExecutor to process batches in parallel
        with ThreadPoolExecutor(max_workers=self.num_workers) as executor:
            # Submit all batch processing tasks
            future_to_batch = {
                executor.submit(self.process_batch, batch, i + 1): i + 1 
                for i, batch in enumerate(batches)
            }
            
            # Collect results as they complete
            for future in as_completed(future_to_batch):
                batch_num = future_to_batch[future]
                try:
                    result = future.result()
                    self.batch_results.append(result)
                    
                    if result['success']:
                        successful_batches += 1
                        logger.info(f"Batch {batch_num} completed successfully")
                    else:
                        failed_batches += 1
                        logger.error(f"Batch {batch_num} failed: {result.get('error', 'Unknown error')}")
                        
                except Exception as e:
                    failed_batches += 1
                    logger.error(f"Batch {batch_num} generated an exception: {str(e)}")
                    self.batch_results.append({
                        'batch_num': batch_num,
                        'success': False,
                        'error': str(e),
                        'thread_name': 'Unknown'
                    })
        
        self.total_processing_time = time.time() - start_time
        
        logger.info("Parallel Processing Complete!")
        logger.info(f"   Total Batches: {total_batches}")
        logger.info(f"   Successful: {successful_batches}")
        logger.info(f"   Failed: {failed_batches}")
        logger.info(f"   Total Time: {self.total_processing_time:.3f} seconds")
        logger.info(f"   Max Concurrent Workers: {self.max_active_workers}")
        
        return successful_batches > 0
    
    def _process_batches_sequential(self) -> bool:
        """Process batches sequentially (fallback)."""
        logger.info("Processing batches sequentially...")
        
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
        
        logger.info("Sequential Processing Complete!")
        logger.info(f"   Total Batches: {total_batches}")
        logger.info(f"   Successful: {successful_batches}")
        logger.info(f"   Failed: {total_batches - successful_batches}")
        logger.info(f"   Total Time: {self.total_processing_time:.3f} seconds")
        
        return successful_batches > 0
    
    def merge_batch_results(self) -> Dict[str, Any]:
        """Merge all batch results into a single comprehensive result."""
        logger.info("Merging batch results...")
        
        if not self.batch_results:
            logger.error("No batch results to merge")
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
                "total_processing_time": self.total_processing_time,
                "num_workers": self.num_workers,
                "max_concurrent_workers": self.max_active_workers
            },
            "results": all_results,
            "total_data_points": total_data_points
        }
        
        # Save merged results
        merged_file = OUTPUT_DIR / "merged_results.json"
        with open(merged_file, 'w') as f:
            json.dump(merged_result, f, indent=2)
        logger.info(f"Merged results saved to: {merged_file}")
        
        return merged_result
    
    def generate_batch_report(self):
        """Generate a comprehensive batch processing report."""
        logger.info("Generating Threaded Batch Processing Report...")
        
        total_batches = len(self.batch_results)
        successful_batches = sum(1 for r in self.batch_results if r.get('success', False))
        failed_batches = total_batches - successful_batches
        total_duration = sum(r.get('duration', 0) for r in self.batch_results)
        total_data_points = sum(r.get('data_points', 0) for r in self.batch_results)
        
        # Analyze thread usage
        thread_usage = {}
        for result in self.batch_results:
            thread_name = result.get('thread_name', 'Unknown')
            if thread_name not in thread_usage:
                thread_usage[thread_name] = {'success': 0, 'failed': 0, 'total_time': 0}
            if result.get('success'):
                thread_usage[thread_name]['success'] += 1
            else:
                thread_usage[thread_name]['failed'] += 1
            thread_usage[thread_name]['total_time'] += result.get('duration', 0)
        
        report = {
            "threaded_batch_processing_info": {
                "timestamp": TIMESTAMP,
                "test_file": TEST_DATA_PATH.name,
                "batch_size": self.batch_size,
                "max_batch_size": BATCH_SIZE if ENABLE_SMART_BATCHING else None,
                "smart_batching": ENABLE_SMART_BATCHING,
                "max_concurrent_batches": MAX_CONCURRENT_BATCHES,
                "parallel_processing": ENABLE_PARALLEL_PROCESSING,
                "num_workers": self.num_workers,
                "max_concurrent_workers": self.max_active_workers,
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
                "average_batch_time": total_duration / total_batches if total_batches > 0 else 0,
                "throughput_points_per_second": total_data_points / self.total_processing_time if self.total_processing_time > 0 else 0
            },
            "thread_usage": thread_usage,
            "batch_details": self.batch_results
        }
        
        # Save report
        report_file = OUTPUT_DIR / "threaded_batch_processing_report.json"
        with open(report_file, 'w') as f:
            json.dump(report, f, indent=2)
        
        logger.info(f"Threaded batch processing report saved to: {report_file}")
        
        # Print summary
        logger.info("Threaded Batch Processing Summary:")
        logger.info(f"   Total Batches: {total_batches}")
        logger.info(f"   Successful: {successful_batches}")
        logger.info(f"   Failed: {failed_batches}")
        logger.info(f"   Success Rate: {report['processing_summary']['success_rate']:.1f}%")
        logger.info(f"   Total Data Points: {total_data_points}")
        logger.info(f"   Total Processing Time: {self.total_processing_time:.3f} seconds")
        logger.info(f"   Max Concurrent Workers: {self.max_active_workers}")
        if total_batches > 0:
            logger.info(f"   Average Batch Time: {report['processing_summary']['average_batch_time']:.3f} seconds")
        if self.total_processing_time > 0:
            logger.info(f"   Throughput: {report['processing_summary']['throughput_points_per_second']:.1f} points/second")
        
        # Print thread usage summary
        logger.info("Thread Usage Summary:")
        for thread_name, usage in thread_usage.items():
            total_batches_for_thread = usage['success'] + usage['failed']
            success_rate = (usage['success'] / total_batches_for_thread * 100) if total_batches_for_thread > 0 else 0
            avg_time = usage['total_time'] / total_batches_for_thread if total_batches_for_thread > 0 else 0
            logger.info(f"   {thread_name}: {usage['success']}/{total_batches_for_thread} successful ({success_rate:.1f}%), avg time: {avg_time:.3f}s")

def main():
    """Main threaded batch processing execution."""
    print("=" * 60)
    print("Threaded Batch Processing for Large Datasets")
    print("=" * 60)
    
    # Initialize threaded batch processor
    processor = ThreadedBatchProcessor(batch_size=BATCH_SIZE, num_workers=NUM_WORKERS)
    
    # Load test data
    if not processor.load_test_data():
        logger.error("Failed to load test data. Exiting.")
        return
    
    # Get authentication
    if not processor.get_auth_token():
        logger.warning("Proceeding without authentication")
    
    # Add delay between authentication and first batch
    logger.info("Waiting 2 seconds before starting threaded batch processing...")
    time.sleep(2)
    
    # Health check before starting batch processing
    logger.info("Performing health check before threaded batch processing...")
    try:
        health_response = requests.get(f"{BASE_URL}/health", timeout=10)
        if health_response.status_code == 200:
            logger.info("Server health check passed")
        else:
            logger.warning(f"Server health check returned status {health_response.status_code}")
    except Exception as e:
        logger.warning(f"Health check failed: {str(e)}")
    
    # Process all batches
    logger.info("Starting threaded batch processing...")
    logger.info(f"Output directory: {OUTPUT_DIR}")
    if ENABLE_SMART_BATCHING:
        logger.info(f"Smart batching enabled (max {BATCH_SIZE} records per batch)")
    else:
        logger.info(f"Simple batching enabled ({BATCH_SIZE} records per batch)")
    logger.info(f"Threaded processing with {NUM_WORKERS} workers")
    
    success = processor.process_all_batches()
    
    if success:
        # Merge results
        processor.merge_batch_results()
    
    # Generate report
    processor.generate_batch_report()
    
    logger.info("Threaded batch processing completed!")

if __name__ == "__main__":
    main() 