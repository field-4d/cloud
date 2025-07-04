import requests
import json
import time
from datetime import datetime, timedelta
import random
import os
import pandas as pd
from concurrent.futures import ThreadPoolExecutor, as_completed
import logging
import threading
from collections import defaultdict
import uuid

API_URL = "http://127.0.0.1:8000/analyze/tukey"
OUTPUT_DIR = "API_test_output/Batching"

# -----------------------------
# Logging Setup
# -----------------------------
def setup_logging(test_id, output_dir):
    """
    Setup thread-safe logging for a test run.
    Args:
        test_id (str): Unique identifier for this test run.
        output_dir (str): Base output directory.
    Returns:
        tuple: (logger, logs_dir, batch_logs_file, test_logs_file)
    """
    # Create logs directory with proper path handling
    logs_dir = os.path.join(output_dir, "logs", test_id)
    os.makedirs(logs_dir, exist_ok=True)
    
    # Setup file logging
    log_file = os.path.join(logs_dir, "test_execution.log")
    
    # Configure logging
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(threadName)s - %(levelname)s - %(message)s',
        handlers=[
            logging.FileHandler(log_file),
            logging.StreamHandler()  # Also log to console
        ]
    )
    
    logger = logging.getLogger(f"test_{test_id}")
    
    # Define log file paths
    batch_logs_file = os.path.join(logs_dir, "batch_logs.jsonl")
    test_logs_file = os.path.join(logs_dir, "test_summary.json")
    
    return logger, logs_dir, batch_logs_file, test_logs_file

def log_batch_result(batch_logs_file, batch_data):
    """
    Thread-safe logging of batch results.
    Args:
        batch_logs_file (str): Path to batch logs file.
        batch_data (dict): Batch execution data.
    """
    with threading.Lock():
        with open(batch_logs_file, 'a', encoding='utf-8') as f:
            f.write(json.dumps(batch_data) + '\n')

def log_test_summary(test_logs_file, test_data):
    """
    Log test summary data.
    Args:
        test_logs_file (str): Path to test summary file.
        test_data (dict): Test summary data.
    """
    with open(test_logs_file, 'w', encoding='utf-8') as f:
        json.dump(test_data, f, indent=2, default=str)

# -----------------------------
# Synthetic Data Generation
# -----------------------------
def generate_data(start_date, days, groups, replicates_per_group, freq_minutes=None):
    """
    Generate synthetic time series data for benchmarking the ANOVA API.
    Args:
        start_date (str): Start date in 'YYYY-MM-DD' format.
        days (int): Number of days to generate.
        groups (list): List of group names.
        replicates_per_group (int): Number of replicates per group per timestamp.
        freq_minutes (int, optional): Interval in minutes. If None, use daily resolution.
    Returns:
        list: List of data dicts for API input.
    """
    data = []
    if freq_minutes:
        # High-frequency: multiple intervals per day
        for day in range(days):
            date = datetime.strptime(start_date, "%Y-%m-%d") + timedelta(days=day)
            for interval in range(0, 24*60, freq_minutes):
                ts = (date + timedelta(minutes=interval)).strftime("%Y-%m-%d %H:%M")
                for group in groups:
                    for rep in range(replicates_per_group):
                        value = random.uniform(10, 30) + groups.index(group) * 2 + random.gauss(0, 1)
                        data.append({"timestamp": ts, "label": group, "value": value})
    else:
        # Daily resolution
        for day in range(days):
            ts = (datetime.strptime(start_date, "%Y-%m-%d") + timedelta(days=day)).strftime("%Y-%m-%d")
            for group in groups:
                for rep in range(replicates_per_group):
                    value = random.uniform(10, 30) + groups.index(group) * 2 + random.gauss(0, 1)
                    data.append({"timestamp": ts, "label": group, "value": value})
    return data

# -----------------------------
# Batching Functions
# -----------------------------
def split_data_by_days(data, days_per_batch=7):
    """
    Split data into batches by days.
    Args:
        data (list): List of data dictionaries.
        days_per_batch (int): Number of days per batch.
    Returns:
        list: List of data batches.
    """
    # Group data by date
    date_groups = {}
    for item in data:
        date = item['timestamp'].split()[0]  # Extract date part
        if date not in date_groups:
            date_groups[date] = []
        date_groups[date].append(item)
    
    # Sort dates
    sorted_dates = sorted(date_groups.keys())
    
    # Create batches
    batches = []
    current_batch = []
    current_dates = set()
    
    for date in sorted_dates:
        current_batch.extend(date_groups[date])
        current_dates.add(date)
        
        if len(current_dates) >= days_per_batch:
            batches.append(current_batch)
            current_batch = []
            current_dates = set()
    
    # Add remaining data
    if current_batch:
        batches.append(current_batch)
    
    return batches

def split_data_by_size(data, max_points_per_batch=10000):
    """
    Split data into batches by size.
    Args:
        data (list): List of data dictionaries.
        max_points_per_batch (int): Maximum data points per batch.
    Returns:
        list: List of data batches.
    """
    batches = []
    for i in range(0, len(data), max_points_per_batch):
        batches.append(data[i:i + max_points_per_batch])
    return batches

# -----------------------------
# Test Runner Functions
# -----------------------------
def run_single_request(payload, request_name="", test_id="", batch_id="", worker_id="", batch_logs_file=""):
    """
    Run a single API request and return timing info with detailed logging.
    Args:
        payload (dict): API request payload.
        request_name (str): Name for logging.
        test_id (str): Test identifier.
        batch_id (str): Batch identifier.
        worker_id (str): Worker thread identifier.
        batch_logs_file (str): Path to batch logs file.
    Returns:
        tuple: (elapsed_time, response_status_code, response_data, batch_log_data)
    """
    start_time = time.time()
    start_datetime = datetime.now().isoformat()
    
    try:
        response = requests.post(API_URL, json=payload, timeout=300)  # 5 min timeout
        elapsed = time.time() - start_time
        end_datetime = datetime.now().isoformat()
        
        status_code = response.status_code
        response_data = response.json() if response.status_code == 200 else None
        
        # Create batch log entry
        batch_log_data = {
            "test_id": test_id,
            "batch_id": batch_id,
            "worker_id": worker_id,
            "request_name": request_name,
            "start_time": start_datetime,
            "end_time": end_datetime,
            "duration_seconds": elapsed,
            "status_code": status_code,
            "success": status_code == 200,
            "data_points": len(payload.get("data", [])),
            "response_size": len(response.text) if response.text else 0,
            "error_message": None
        }
        
        # Log batch result if file is provided
        if batch_logs_file:
            log_batch_result(batch_logs_file, batch_log_data)
        
        return elapsed, status_code, response_data, batch_log_data
        
    except requests.exceptions.Timeout:
        elapsed = time.time() - start_time
        end_datetime = datetime.now().isoformat()
        
        batch_log_data = {
            "test_id": test_id,
            "batch_id": batch_id,
            "worker_id": worker_id,
            "request_name": request_name,
            "start_time": start_datetime,
            "end_time": end_datetime,
            "duration_seconds": elapsed,
            "status_code": 408,
            "success": False,
            "data_points": len(payload.get("data", [])),
            "response_size": 0,
            "error_message": "Request timeout"
        }
        
        if batch_logs_file:
            log_batch_result(batch_logs_file, batch_log_data)
        
        return elapsed, 408, None, batch_log_data
        
    except Exception as e:
        elapsed = time.time() - start_time
        end_datetime = datetime.now().isoformat()
        
        batch_log_data = {
            "test_id": test_id,
            "batch_id": batch_id,
            "worker_id": worker_id,
            "request_name": request_name,
            "start_time": start_datetime,
            "end_time": end_datetime,
            "duration_seconds": elapsed,
            "status_code": 500,
            "success": False,
            "data_points": len(payload.get("data", [])),
            "response_size": 0,
            "error_message": str(e)
        }
        
        if batch_logs_file:
            log_batch_result(batch_logs_file, batch_log_data)
        
        return elapsed, 500, None, batch_log_data

def run_batched_test(name, data, batch_strategy, batch_size, test_type="tukey", parameter="SoilMoisture", test_id="", test_run_id=""):
    """
    Run a test with batched data processing and detailed logging.
    Args:
        name (str): Test name.
        data (list): Full dataset.
        batch_strategy (str): 'days' or 'size'.
        batch_size (int): Days per batch or points per batch.
        test_type (str): Statistical test type.
        parameter (str): Parameter name.
        test_id (str): Test identifier.
    Returns:
        dict: Test results with detailed logging data.
    """
    # Setup logging for this test - use the test_id directly
    logger, logs_dir, batch_logs_file, test_logs_file = setup_logging(test_id, OUTPUT_DIR)
    
    logger.info(f"Starting batched test: {name}")
    logger.info(f"Strategy: {batch_strategy}, Batch size: {batch_size}")
    logger.info(f"Total data points: {len(data)}")
    
    # Split data into batches
    if batch_strategy == "days":
        batches = split_data_by_days(data, batch_size)
    else:  # size
        batches = split_data_by_size(data, batch_size)
    
    logger.info(f"Created {len(batches)} batches")
    
    # Process batches sequentially
    test_start_time = time.time()
    test_start_datetime = datetime.now().isoformat()
    
    total_time = 0
    successful_batches = 0
    failed_batches = 0
    all_results = []
    batch_logs = []
    batch_responses = []  # Store individual batch responses
    error_count = 0
    
    for i, batch in enumerate(batches):
        batch_id = f"{test_id}_batch_{i+1:03d}"
        logger.info(f"Processing batch {i+1}/{len(batches)} ({len(batch)} data points)")
        
        payload = {
            "test_type": test_type,
            "parameter": parameter,
            "data": batch
        }
        
        elapsed, status, result, batch_log = run_single_request(
            payload, f"Batch {i+1}", test_id, batch_id, "main", batch_logs_file
        )
        
        total_time += elapsed
        batch_logs.append(batch_log)
        
        # Store batch response
        batch_response = {
            "batch_number": i + 1,
            "batch_id": batch_id,
            "payload": payload,
            "response": result,
            "status_code": status,
            "elapsed_time": elapsed,
            "data_points": len(batch)
        }
        batch_responses.append(batch_response)
        
        if status == 200:
            successful_batches += 1
            if result and 'results' in result:
                all_results.extend(result['results'])
            logger.info(f"[SUCCESS] Batch {i+1}: {elapsed:.3f}s")
        else:
            failed_batches += 1
            error_count += 1
            logger.error(f"[FAILED] Batch {i+1}: {elapsed:.3f}s (status {status})")
    
    test_end_time = time.time()
    test_end_datetime = datetime.now().isoformat()
    test_duration = test_end_time - test_start_time
    
    # Calculate metrics
    avg_batch_time = total_time / len(batches) if batches else 0
    success_rate = (successful_batches / len(batches)) * 100 if batches else 0
    throughput = len(data) / total_time if total_time > 0 else 0
    
    # Create combined response for all batches
    combined_response = {
        "test_id": test_id,
        "test_name": name,
        "parameter": parameter,
        "test_type": test_type,
        "batch_strategy": batch_strategy,
        "batch_size": batch_size,
        "total_batches": len(batches),
        "successful_batches": successful_batches,
        "failed_batches": failed_batches,
        "success_rate": success_rate,
        "total_data_points": len(data),
        "combined_results": all_results,
        "batch_responses": batch_responses,
        "test_start_time": test_start_datetime,
        "test_end_time": test_end_datetime,
        "total_duration_seconds": test_duration,
        "avg_batch_time_seconds": avg_batch_time,
        "throughput_points_per_second": throughput
    }
    
    # Save combined response
    response_file = os.path.join(logs_dir, f"{test_id}_combined_response.json")
    with open(response_file, 'w') as f:
        json.dump(combined_response, f, indent=2, default=str)
    logger.info(f"Saved combined response to: {response_file}")
    
    # Save test data
    test_data_file = os.path.join(logs_dir, f"{test_id}_test_data.json")
    test_data = {
        "test_id": test_id,
        "test_name": name,
        "parameter": parameter,
        "test_type": test_type,
        "batch_strategy": batch_strategy,
        "batch_size": batch_size,
        "total_data_points": len(data),
        "data": data
    }
    with open(test_data_file, 'w') as f:
        json.dump(test_data, f, indent=2, default=str)
    logger.info(f"Saved test data to: {test_data_file}")
    
    # Create test summary
    test_summary = {
        "test_id": test_id,
        "test_name": name,
        "strategy": batch_strategy,
        "batch_size": batch_size,
        "test_start_time": test_start_datetime,
        "test_end_time": test_end_datetime,
        "test_duration_seconds": test_duration,
        "total_batches": len(batches),
        "successful_batches": successful_batches,
        "failed_batches": failed_batches,
        "error_count": error_count,
        "success_rate": success_rate,
        "total_time": total_time,
        "avg_batch_time": avg_batch_time,
        "total_data_points": len(data),
        "results_count": len(all_results),
        "throughput_points_per_second": throughput,
        "concurrent": False,
        "max_workers": 1,
        "response_file": response_file,
        "test_data_file": test_data_file,
        "full_test_run_id": test_run_id if test_run_id else "unknown"  # Add the full test run ID for reference
    }
    
    # Log test summary
    log_test_summary(test_logs_file, test_summary)
    
    logger.info(f"[COMPLETED] Test completed: {test_duration:.3f}s total, {avg_batch_time:.3f}s avg/batch")
    logger.info(f"  Success rate: {success_rate:.1f}% ({successful_batches}/{len(batches)})")
    logger.info(f"  Throughput: {throughput:.0f} points/second")
    logger.info(f"  Response saved to: {response_file}")
    logger.info(f"  Test data saved to: {test_data_file}")
    
    return test_summary

def run_concurrent_batched_test(name, data, batch_strategy, batch_size, max_workers=4, test_type="tukey", parameter="SoilMoisture", test_id=""):
    """
    Run a test with concurrent batched processing and detailed logging.
    Args:
        name (str): Test name.
        data (list): Full dataset.
        batch_strategy (str): 'days' or 'size'.
        batch_size (int): Days per batch or points per batch.
        max_workers (int): Maximum concurrent workers.
        test_type (str): Statistical test type.
        parameter (str): Parameter name.
        test_id (str): Test identifier.
    Returns:
        dict: Test results with detailed logging data.
    """
    # Setup logging for this test
    logger, logs_dir, batch_logs_file, test_logs_file = setup_logging(test_id, OUTPUT_DIR)
    
    logger.info(f"Starting concurrent batched test: {name}")
    logger.info(f"Strategy: {batch_strategy}, Batch size: {batch_size}, Workers: {max_workers}")
    logger.info(f"Total data points: {len(data)}")
    
    # Split data into batches
    if batch_strategy == "days":
        batches = split_data_by_days(data, batch_size)
    else:  # size
        batches = split_data_by_size(data, batch_size)
    
    logger.info(f"Created {len(batches)} batches")
    
    # Process batches concurrently
    test_start_time = time.time()
    test_start_datetime = datetime.now().isoformat()
    
    successful_batches = 0
    failed_batches = 0
    all_results = []
    batch_logs = []
    error_count = 0
    batch_times = []
    
    def process_batch(batch, batch_num, worker_id):
        batch_id = f"{test_id}_batch_{batch_num:03d}"
        logger.info(f"Worker {worker_id} processing batch {batch_num}/{len(batches)} ({len(batch)} data points)")
        
        payload = {
            "test_type": test_type,
            "parameter": parameter,
            "data": batch
        }
        
        elapsed, status, result, batch_log = run_single_request(
            payload, f"Batch {batch_num}", test_id, batch_id, worker_id, batch_logs_file
        )
        
        return batch_num, elapsed, status, result, batch_log
    
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        # Submit all batches
        future_to_batch = {
            executor.submit(process_batch, batch, i+1, f"worker_{i % max_workers + 1}"): i+1 
            for i, batch in enumerate(batches)
        }
        
        # Collect results as they complete
        for future in as_completed(future_to_batch):
            batch_num, elapsed, status, result, batch_log = future.result()
            batch_times.append(elapsed)
            batch_logs.append(batch_log)
            
            if status == 200:
                successful_batches += 1
                if result and 'results' in result:
                    all_results.extend(result['results'])
                logger.info(f"[SUCCESS] Batch {batch_num}: {elapsed:.3f}s")
            else:
                failed_batches += 1
                error_count += 1
                logger.error(f"[FAILED] Batch {batch_num}: {elapsed:.3f}s (status {status})")
    
    test_end_time = time.time()
    test_end_datetime = datetime.now().isoformat()
    test_duration = test_end_time - test_start_time
    
    # Calculate metrics
    total_time = sum(batch_times)
    avg_batch_time = sum(batch_times) / len(batch_times) if batch_times else 0
    success_rate = (successful_batches / len(batches)) * 100 if batches else 0
    throughput = len(data) / test_duration if test_duration > 0 else 0
    
    # Create combined response for all batches
    combined_response = {
        "test_id": test_id,
        "test_name": name,
        "parameter": parameter,
        "test_type": test_type,
        "batch_strategy": batch_strategy,
        "batch_size": batch_size,
        "total_batches": len(batches),
        "successful_batches": successful_batches,
        "failed_batches": failed_batches,
        "success_rate": success_rate,
        "total_data_points": len(data),
        "combined_results": all_results,
        "batch_responses": batch_logs,  # batch_logs contains the response data
        "test_start_time": test_start_datetime,
        "test_end_time": test_end_datetime,
        "total_duration_seconds": test_duration,
        "avg_batch_time_seconds": avg_batch_time,
        "throughput_points_per_second": throughput,
        "concurrent": True,
        "max_workers": max_workers
    }
    
    # Save combined response
    response_file = os.path.join(logs_dir, f"{test_id}_combined_response.json")
    with open(response_file, 'w') as f:
        json.dump(combined_response, f, indent=2, default=str)
    logger.info(f"Saved combined response to: {response_file}")
    
    # Save test data
    test_data_file = os.path.join(logs_dir, f"{test_id}_test_data.json")
    test_data = {
        "test_id": test_id,
        "test_name": name,
        "parameter": parameter,
        "test_type": test_type,
        "batch_strategy": batch_strategy,
        "batch_size": batch_size,
        "total_data_points": len(data),
        "data": data
    }
    with open(test_data_file, 'w') as f:
        json.dump(test_data, f, indent=2, default=str)
    logger.info(f"Saved test data to: {test_data_file}")
    
    # Create test summary
    test_summary = {
        "test_id": test_id,
        "test_name": name,
        "strategy": batch_strategy,
        "batch_size": batch_size,
        "test_start_time": test_start_datetime,
        "test_end_time": test_end_datetime,
        "test_duration_seconds": test_duration,
        "total_batches": len(batches),
        "successful_batches": successful_batches,
        "failed_batches": failed_batches,
        "error_count": error_count,
        "success_rate": success_rate,
        "total_time": total_time,
        "avg_batch_time": avg_batch_time,
        "total_data_points": len(data),
        "results_count": len(all_results),
        "throughput_points_per_second": throughput,
        "concurrent": True,
        "max_workers": max_workers,
        "response_file": response_file,
        "test_data_file": test_data_file
    }
    
    # Log test summary
    log_test_summary(test_logs_file, test_summary)
    
    logger.info(f"[COMPLETED] Test completed: {test_duration:.3f}s total, {avg_batch_time:.3f}s avg/batch")
    logger.info(f"  Success rate: {success_rate:.1f}% ({successful_batches}/{len(batches)})")
    logger.info(f"  Throughput: {throughput:.0f} points/second")
    logger.info(f"  Response saved to: {response_file}")
    logger.info(f"  Test data saved to: {test_data_file}")
    
    return test_summary

# -----------------------------
# Main Test Logic - Scenario 5 Only
# -----------------------------
def main():
    """
    Run batching scenarios for Scenario 5 only (67,200 data points).
    Test different batch sizes: 5K, 10K, 15K, and 20K (should fail).
    All tests use 1 worker for consistency.
    """
    print("=== ANOVA API Batching Performance Test - Scenario 5 Only ===")
    print("Scenario 5: 3-min, 4 groups, 5 reps, 7 days (67,200 points, 95.65s original)")
    print("Testing batch sizes: 5K, 10K, 15K, 20K (20K should fail due to 15K limit)")
    print("All tests use 1 worker for consistency")
    
    # Generate unique test run ID
    test_run_id = f"scenario5_test_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:8]}"
    print(f"Test Run ID: {test_run_id}")
    
    test_results = []
    
    # Generate Scenario 5 data
    print("\nGenerating Scenario 5 dataset...")
    scenario5_data = generate_data("2025-06-01", 7, ["A", "B", "C", "D"], 5, freq_minutes=3)
    print(f"Generated {len(scenario5_data)} data points")
    
    # Test 1: 5K batch size (should pass)
    test1_id = "test1_5k_batch"
    result1 = run_batched_test(
        "Scenario 5 - 5K batch size",
        scenario5_data, "size", 5000, test_id=test1_id, test_run_id=test_run_id
    )
    test_results.append(result1)
    
    # Test 2: 10K batch size (should pass)
    test2_id = "test2_10k_batch"
    result2 = run_batched_test(
        "Scenario 5 - 10K batch size",
        scenario5_data, "size", 10000, test_id=test2_id, test_run_id=test_run_id
    )
    test_results.append(result2)
    
    # Test 3: 15K batch size (should pass - at the limit)
    test3_id = "test3_15k_batch"
    result3 = run_batched_test(
        "Scenario 5 - 15K batch size (at limit)",
        scenario5_data, "size", 15000, test_id=test3_id, test_run_id=test_run_id
    )
    test_results.append(result3)
    
    # Test 4: 20K batch size (should fail - exceeds limit)
    test4_id = "test4_20k_batch"
    result4 = run_batched_test(
        "Scenario 5 - 20K batch size (should fail)",
        scenario5_data, "size", 20000, test_id=test4_id, test_run_id=test_run_id
    )
    test_results.append(result4)
    
    # Export results
    print("\n=== Exporting Results ===")
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    
    # Save generated dataset
    datasets_dir = os.path.join(OUTPUT_DIR, "generated_datasets")
    os.makedirs(datasets_dir, exist_ok=True)
    
    scenario5_data_file = os.path.join(datasets_dir, "scenario5_data.json")
    with open(scenario5_data_file, "w") as f:
        json.dump(scenario5_data, f, indent=2)
    print(f"Saved Scenario 5 data: {len(scenario5_data)} points")
    print(f"Dataset file: {scenario5_data_file}")
    
    # Create DataFrame
    df = pd.DataFrame(test_results)
    
    # Add derived columns
    df['Total_Time_Minutes'] = df['test_duration_seconds'] / 60
    df['Avg_Batch_Time_Seconds'] = df['avg_batch_time']
    df['Data_Points_Per_Batch'] = df['total_data_points'] / df['total_batches']
    
    # Add original scenario reference
    df['Original_Scenario'] = '5'
    df['Original_Time_Seconds'] = 95.65
    df['Original_Time_Minutes'] = 95.65 / 60
    df['Speedup_Factor'] = 95.65 / df['test_duration_seconds']
    
    # Add batch size validation info
    df['Batch_Size_Valid'] = df['batch_size'] <= 15000
    df['Expected_Result'] = df['batch_size'].apply(lambda x: 'PASS' if x <= 15000 else 'FAIL')
    
    # Reorder columns
    columns_order = [
        'test_id', 'test_name', 'Original_Scenario', 'batch_size', 'Batch_Size_Valid', 'Expected_Result',
        'total_batches', 'successful_batches', 'failed_batches', 'error_count', 'success_rate',
        'total_data_points', 'Data_Points_Per_Batch', 'results_count',
        'test_duration_seconds', 'Total_Time_Minutes', 'avg_batch_time', 'throughput_points_per_second',
        'Original_Time_Seconds', 'Original_Time_Minutes', 'Speedup_Factor'
    ]
    df = df[columns_order]
    
    # Save to CSV
    csv_path = os.path.join(OUTPUT_DIR, "scenario5_batching_results.csv")
    df.to_csv(csv_path, index=False)
    print(f"Results saved to: {csv_path}")
    
    # Create test run summary
    run_summary = {
        "test_run_id": test_run_id,
        "start_time": datetime.now().isoformat(),
        "scenario": "Scenario 5",
        "total_tests": len(test_results),
        "total_data_points": len(scenario5_data),
        "logs_directory": os.path.join(OUTPUT_DIR, "logs", test_run_id),
        "results_file": csv_path,
        "test_summaries": test_results
    }
    
    run_summary_path = os.path.join(OUTPUT_DIR, f"test_run_summary_{test_run_id}.json")
    with open(run_summary_path, 'w') as f:
        json.dump(run_summary, f, indent=2, default=str)
    print(f"Test run summary saved to: {run_summary_path}")
    
    # Print summary
    print("\n=== Scenario 5 Batching Performance Summary ===")
    for _, row in df.iterrows():
        print(f"\n{row['test_name']}:")
        print(f"  Test ID: {row['test_id']}")
        print(f"  Batch size: {row['batch_size']:,} points")
        print(f"  Original time: {row['Original_Time_Minutes']:.2f} minutes")
        print(f"  Batched time: {row['Total_Time_Minutes']:.2f} minutes")
        print(f"  Speedup: {row['Speedup_Factor']:.2f}x")
        print(f"  Success rate: {row['success_rate']:.1f}%")
        print(f"  Throughput: {row['throughput_points_per_second']:.0f} points/second")
        print(f"  Number of batches: {row['total_batches']}")
    
    # Find best performing strategy (among successful tests)
    successful_tests = df[df['success_rate'] > 0]
    if not successful_tests.empty:
        best_idx = successful_tests['test_duration_seconds'].idxmin()
        best_row = df.loc[best_idx]
        print(f"\n=== Best Strategy for Scenario 5 ===")
        print(f"Best: {best_row['test_name']}")
        print(f"Test ID: {best_row['test_id']}")
        print(f"Batch size: {best_row['batch_size']:,} points")
        print(f"Time: {best_row['Total_Time_Minutes']:.2f} minutes")
        print(f"Speedup: {best_row['Speedup_Factor']:.2f}x")
    else:
        print(f"\n=== No Successful Tests ===")
        print("All tests failed - check server status and batch validation")
    
    # Show validation results
    print(f"\n=== Batch Size Validation Results ===")
    for _, row in df.iterrows():
        status = "✅ PASS" if row['success_rate'] > 0 else "❌ FAIL"
        print(f"  {row['batch_size']:,} points: {status} ({row['success_rate']:.1f}% success)")
    
    print(f"\n=== Test Complete ===")
    print(f"Test Run ID: {test_run_id}")
    print(f"Total tests run: {len(test_results)}")
    print(f"Logs directory: {os.path.join(OUTPUT_DIR, 'logs', test_run_id)}")
    print(f"Estimated time: 2-8 minutes (actual: {df['Total_Time_Minutes'].sum():.2f} minutes)")
    
    # Summary of saved files
    print(f"\n=== Saved Files Summary ===")
    print(f"📊 Dataset: {scenario5_data_file}")
    print(f"📈 Results CSV: {csv_path}")
    print(f"📋 Test Summary: {run_summary_path}")
    
    for _, row in df.iterrows():
        test_id = row['test_id']
        print(f"🧪 {test_id}:")
        print(f"   📄 Test Data: {row.get('test_data_file', 'N/A')}")
        print(f"   📊 Response: {row.get('response_file', 'N/A')}")
    
    print(f"\n📁 All files saved to: {OUTPUT_DIR}")

if __name__ == "__main__":
    main() 