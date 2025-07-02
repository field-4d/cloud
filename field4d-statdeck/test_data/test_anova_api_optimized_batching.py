#!/usr/bin/env python3
"""
Optimized ANOVA API Batching Test

This script demonstrates an optimized batching approach with:
1. Dynamic batch size calculation based on dataset size
2. Configurable n_workers parameter (default=1 for simplicity)
3. Automatic strategy selection (size-based batching)
4. Comprehensive logging and performance analysis

Test scenarios:
- Small dataset (<50K points): 10K batches
- Medium dataset (50K-100K points): 10K batches  
- Large dataset (100K-500K points): 5K batches
- Very large dataset (>500K points): 3K batches
"""

import os
import sys
import json
import time
import uuid
import logging
import requests
import pandas as pd
from datetime import datetime, timedelta
from concurrent.futures import ThreadPoolExecutor, as_completed
from threading import Lock
import random

# Add parent directory to path for imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Configuration
API_BASE_URL = "http://localhost:8000"
OUTPUT_DIR = "API_test_output/Optimized_Batching"

def generate_data(start_date, days, groups, replicates_per_group, freq_minutes=None):
    """
    Generate synthetic time series data for benchmarking the ANOVA API.
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

def calculate_optimal_batch_size(data_points):
    """
    Calculate optimal batch size based on dataset size.
    
    Args:
        data_points: Number of data points in dataset
        
    Returns:
        int: Optimal batch size in data points
    """
    if data_points <= 50000:
        return 10000  # Small datasets: 10K batches
    elif data_points <= 100000:
        return 10000  # Medium datasets: 10K batches  
    elif data_points <= 500000:
        return 5000   # Large datasets: 5K batches
    else:
        return 3000   # Very large datasets: 3K batches

def split_data_by_size(data, batch_size):
    """
    Split data into batches by size.
    """
    batches = []
    for i in range(0, len(data), batch_size):
        batch = data[i:i + batch_size]
        batches.append(batch)
    return batches

def setup_logging(test_id, output_dir):
    """
    Setup logging for a test run.
    """
    logs_dir = os.path.join(output_dir, "logs", test_id)
    os.makedirs(logs_dir, exist_ok=True)
    
    # Setup file handlers
    batch_logs_file = os.path.join(logs_dir, "batch_logs.jsonl")
    test_logs_file = os.path.join(logs_dir, "test_execution.log")
    
    # Setup logging
    logger = logging.getLogger(test_id)
    logger.setLevel(logging.INFO)
    
    # Clear existing handlers
    logger.handlers.clear()
    
    # File handler for test execution
    file_handler = logging.FileHandler(test_logs_file)
    file_handler.setLevel(logging.INFO)
    formatter = logging.Formatter('%(asctime)s - %(threadName)s - %(levelname)s - %(message)s')
    file_handler.setFormatter(formatter)
    logger.addHandler(file_handler)
    
    # Console handler
    console_handler = logging.StreamHandler()
    console_handler.setLevel(logging.INFO)
    console_handler.setFormatter(formatter)
    logger.addHandler(console_handler)
    
    return logger, logs_dir, batch_logs_file, test_logs_file

def run_single_batch(batch_data, batch_id, worker_id, test_id, logger, batch_logs, lock):
    """
    Run a single batch and log results.
    """
    start_time = time.time()
    start_datetime = datetime.now().isoformat()
    
    try:
        # Prepare request payload
        payload = {
            "parameter": "SoilMoisture",
            "test_type": "tukey",
            "data": batch_data
        }
        
        # Make API request
        response = requests.post(f"{API_BASE_URL}/analyze", json=payload, timeout=300)
        
        end_time = time.time()
        end_datetime = datetime.now().isoformat()
        duration = end_time - start_time
        
        # Determine success
        success = response.status_code == 200
        error_message = None if success else f"HTTP {response.status_code}: {response.text}"
        
        # Log batch result
        batch_log = {
            "test_id": test_id,
            "batch_id": batch_id,
            "worker_id": worker_id,
            "request_name": f"Batch {batch_id.split('_')[-1]}",
            "start_time": start_datetime,
            "end_time": end_datetime,
            "duration_seconds": duration,
            "status_code": response.status_code,
            "success": success,
            "data_points": len(batch_data),
            "response_size": len(response.content) if success else 0,
            "error_message": error_message
        }
        
        # Thread-safe logging
        with lock:
            batch_logs.append(batch_log)
            logger.info(f"Batch {batch_id.split('_')[-1]} completed: {duration:.2f}s, Status: {response.status_code}, Success: {success}")
        
        return {
            "success": success,
            "duration": duration,
            "status_code": response.status_code,
            "data_points": len(batch_data),
            "results_count": len(response.json().get("results", [])) if success else 0
        }
        
    except Exception as e:
        end_time = time.time()
        end_datetime = datetime.now().isoformat()
        duration = end_time - start_time
        
        # Log error
        batch_log = {
            "test_id": test_id,
            "batch_id": batch_id,
            "worker_id": worker_id,
            "request_name": f"Batch {batch_id.split('_')[-1]}",
            "start_time": start_datetime,
            "end_time": end_datetime,
            "duration_seconds": duration,
            "status_code": 500,
            "success": False,
            "data_points": len(batch_data),
            "response_size": 0,
            "error_message": str(e)
        }
        
        with lock:
            batch_logs.append(batch_log)
            logger.error(f"Batch {batch_id.split('_')[-1]} failed: {duration:.2f}s, Error: {str(e)}")
        
        return {
            "success": False,
            "duration": duration,
            "status_code": 500,
            "data_points": len(batch_data),
            "results_count": 0
        }

def run_optimized_batch_test(name, data, n_workers=1, test_id=""):
    """
    Run optimized batching test with dynamic batch sizing.
    
    Args:
        name: Test name
        data: Dataset to process
        n_workers: Number of workers (default=1 for simplicity)
        test_id: Test identifier
        
    Returns:
        dict: Test results with detailed metrics
    """
    # Calculate optimal batch size
    data_points = len(data)
    batch_size = calculate_optimal_batch_size(data_points)
    
    # Setup logging
    logger, logs_dir, batch_logs_file, test_logs_file = setup_logging(test_id, OUTPUT_DIR)
    
    logger.info(f"Starting optimized batch test: {name}")
    logger.info(f"Dataset size: {data_points:,} points")
    logger.info(f"Optimal batch size: {batch_size:,}")
    logger.info(f"Workers: {n_workers}")
    
    # Split data into batches
    batches = split_data_by_size(data, batch_size)
    logger.info(f"Created {len(batches)} batches")
    
    # Process batches
    test_start_time = time.time()
    test_start_datetime = datetime.now().isoformat()
    
    successful_batches = 0
    failed_batches = 0
    all_results = []
    batch_logs = []
    error_count = 0
    batch_times = []
    total_data_points = 0
    total_results_count = 0
    
    # Thread lock for logging
    lock = Lock()
    
    if n_workers == 1:
        # Sequential processing
        logger.info("Processing batches sequentially")
        for i, batch in enumerate(batches, 1):
            batch_id = f"{test_id}_batch_{i:03d}"
            result = run_single_batch(batch, batch_id, "main", test_id, logger, batch_logs, lock)
            
            if result["success"]:
                successful_batches += 1
                batch_times.append(result["duration"])
                total_results_count += result["results_count"]
            else:
                failed_batches += 1
                error_count += 1
            
            total_data_points += result["data_points"]
            all_results.append(result)
            
    else:
        # Concurrent processing
        logger.info(f"Processing batches with {n_workers} workers")
        with ThreadPoolExecutor(max_workers=n_workers) as executor:
            # Submit all batches
            future_to_batch = {}
            for i, batch in enumerate(batches, 1):
                batch_id = f"{test_id}_batch_{i:03d}"
                worker_id = f"worker_{i % n_workers + 1}"
                future = executor.submit(
                    run_single_batch, batch, batch_id, worker_id, test_id, logger, batch_logs, lock
                )
                future_to_batch[future] = batch_id
            
            # Collect results
            for future in as_completed(future_to_batch):
                result = future.result()
                
                if result["success"]:
                    successful_batches += 1
                    batch_times.append(result["duration"])
                    total_results_count += result["results_count"]
                else:
                    failed_batches += 1
                    error_count += 1
                
                total_data_points += result["data_points"]
                all_results.append(result)
    
    # Calculate final metrics
    test_end_time = time.time()
    test_end_datetime = datetime.now().isoformat()
    test_duration = test_end_time - test_start_time
    
    total_batches = len(batches)
    success_rate = (successful_batches / total_batches) * 100 if total_batches > 0 else 0
    avg_batch_time = sum(batch_times) / len(batch_times) if batch_times else 0
    throughput = total_data_points / test_duration if test_duration > 0 else 0
    
    # Save batch logs
    with open(batch_logs_file, 'w') as f:
        for log in batch_logs:
            f.write(json.dumps(log) + '\n')
    
    # Create test summary
    test_summary = {
        "test_id": test_id,
        "test_name": name,
        "strategy": "size",
        "batch_size": batch_size,
        "test_start_time": test_start_datetime,
        "test_end_time": test_end_datetime,
        "test_duration_seconds": test_duration,
        "total_batches": total_batches,
        "successful_batches": successful_batches,
        "failed_batches": failed_batches,
        "error_count": error_count,
        "success_rate": success_rate,
        "total_time": sum(batch_times),
        "avg_batch_time": avg_batch_time,
        "total_data_points": total_data_points,
        "results_count": total_results_count,
        "throughput_points_per_second": throughput,
        "concurrent": n_workers > 1,
        "max_workers": n_workers
    }
    
    # Save test summary
    with open(os.path.join(logs_dir, "test_summary.json"), 'w') as f:
        json.dump(test_summary, f, indent=2)
    
    logger.info(f"Test completed: {test_duration:.2f}s, Success rate: {success_rate:.1f}%")
    
    return {
        "test_id": test_id,
        "test_name": name,
        "strategy": "size",
        "batch_size": batch_size,
        "max_workers": n_workers,
        "concurrent": n_workers > 1,
        "total_batches": total_batches,
        "successful_batches": successful_batches,
        "failed_batches": failed_batches,
        "error_count": error_count,
        "success_rate": success_rate,
        "total_data_points": total_data_points,
        "results_count": total_results_count,
        "test_duration_seconds": test_duration,
        "avg_batch_time": avg_batch_time,
        "throughput_points_per_second": throughput
    }

def main():
    """
    Run optimized batching tests across multiple scenarios.
    """
    print("=== Optimized ANOVA API Batching Test ===")
    print("Testing dynamic batch sizing and configurable workers")
    
    # Generate unique test run ID
    test_run_id = f"optimized_test_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:8]}"
    print(f"Test Run ID: {test_run_id}")
    
    test_results = []
    
    # Test scenarios with different dataset sizes
    scenarios = [
        {
            "name": "Small Dataset (40K points)",
            "data": generate_data("2025-06-01", 14, ["A", "B", "C"], 10, freq_minutes=15),
            "original_time": 37.87
        },
        {
            "name": "Medium Dataset (67K points)", 
            "data": generate_data("2025-06-01", 7, ["A", "B", "C", "D"], 5, freq_minutes=3),
            "original_time": 95.65
        },
        {
            "name": "Large Dataset (230K points)",
            "data": generate_data("2025-06-01", 30, ["A", "B", "C", "D"], 4, freq_minutes=3),
            "original_time": 307.69
        }
    ]
    
    # Test each scenario with different worker configurations
    for scenario in scenarios:
        print(f"\n--- Testing: {scenario['name']} ---")
        data = scenario["data"]
        data_points = len(data)
        original_time = scenario["original_time"]
        
        print(f"Data points: {data_points:,}")
        print(f"Original time: {original_time:.2f}s")
        
        # Test with 1 worker (recommended)
        test1_id = f"{test_run_id}_{scenario['name'].replace(' ', '_').replace('(', '').replace(')', '').replace('K', 'k')}_1worker"
        result1 = run_optimized_batch_test(
            f"{scenario['name']} - 1 Worker",
            data, 
            n_workers=1, 
            test_id=test1_id
        )
        result1["Original_Time_Seconds"] = original_time
        result1["Speedup_Factor"] = original_time / result1["test_duration_seconds"]
        test_results.append(result1)
        
        # Test with 2 workers (for comparison)
        test2_id = f"{test_run_id}_{scenario['name'].replace(' ', '_').replace('(', '').replace(')', '').replace('K', 'k')}_2workers"
        result2 = run_optimized_batch_test(
            f"{scenario['name']} - 2 Workers", 
            data,
            n_workers=2,
            test_id=test2_id
        )
        result2["Original_Time_Seconds"] = original_time
        result2["Speedup_Factor"] = original_time / result2["test_duration_seconds"]
        test_results.append(result2)
    
    # Export results
    print("\n=== Exporting Results ===")
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    
    # Save generated datasets
    datasets_dir = os.path.join(OUTPUT_DIR, "generated_datasets")
    os.makedirs(datasets_dir, exist_ok=True)
    
    for i, scenario in enumerate(scenarios):
        dataset_name = f"scenario_{i+1}_data.json"
        with open(os.path.join(datasets_dir, dataset_name), "w") as f:
            json.dump(scenario["data"], f, indent=2)
        print(f"Saved {dataset_name}: {len(scenario['data']):,} points")
    
    # Create DataFrame
    df = pd.DataFrame(test_results)
    
    # Add derived columns
    df['Total_Time_Minutes'] = df['test_duration_seconds'] / 60
    df['Original_Time_Minutes'] = df['Original_Time_Seconds'] / 60
    df['Data_Points_Per_Batch'] = df['total_data_points'] / df['total_batches']
    
    # Reorder columns
    columns_order = [
        'test_id', 'test_name', 'strategy', 'batch_size', 'max_workers', 'concurrent',
        'total_batches', 'successful_batches', 'failed_batches', 'error_count', 'success_rate',
        'total_data_points', 'Data_Points_Per_Batch', 'results_count',
        'test_duration_seconds', 'Total_Time_Minutes', 'avg_batch_time', 'throughput_points_per_second',
        'Original_Time_Seconds', 'Original_Time_Minutes', 'Speedup_Factor'
    ]
    df = df[columns_order]
    
    # Save to CSV
    csv_path = os.path.join(OUTPUT_DIR, "optimized_batching_results.csv")
    df.to_csv(csv_path, index=False)
    print(f"Results saved to: {csv_path}")
    
    # Print summary
    print("\n=== Test Summary ===")
    for _, row in df.iterrows():
        print(f"{row['test_name']}: {row['test_duration_seconds']:.2f}s (Speedup: {row['Speedup_Factor']:.3f})")
    
    print(f"\nTotal tests completed: {len(df)}")
    print(f"Successful tests: {len(df[df['success_rate'] == 100.0])}")
    print(f"Tests with errors: {len(df[df['error_count'] > 0])}")

if __name__ == "__main__":
    main() 