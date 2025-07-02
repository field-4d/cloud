import requests
import json
import time
from datetime import datetime, timedelta
import random
import os
import pandas as pd
from concurrent.futures import ThreadPoolExecutor, as_completed
import threading

API_URL = "http://127.0.0.1:8000/analyze"
OUTPUT_DIR = "API_test_output"

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
def run_single_request(payload, request_name=""):
    """
    Run a single API request and return timing info.
    Args:
        payload (dict): API request payload.
        request_name (str): Name for logging.
    Returns:
        tuple: (elapsed_time, response_status_code, response_data)
    """
    start = time.time()
    try:
        response = requests.post(API_URL, json=payload, timeout=300)  # 5 min timeout
        elapsed = time.time() - start
        return elapsed, response.status_code, response.json() if response.status_code == 200 else None
    except requests.exceptions.Timeout:
        elapsed = time.time() - start
        return elapsed, 408, None  # Timeout
    except Exception as e:
        elapsed = time.time() - start
        return elapsed, 500, None  # Error

def run_batched_test(name, data, batch_strategy, batch_size, test_type="tukey", parameter="SoilMoisture"):
    """
    Run a test with batched data processing.
    Args:
        name (str): Test name.
        data (list): Full dataset.
        batch_strategy (str): 'days' or 'size'.
        batch_size (int): Days per batch or points per batch.
        test_type (str): Statistical test type.
        parameter (str): Parameter name.
    Returns:
        dict: Test results.
    """
    print(f"\n=== Running Batched Test: {name} ===")
    print(f"Strategy: {batch_strategy}, Batch size: {batch_size}")
    print(f"Total data points: {len(data)}")
    
    # Split data into batches
    if batch_strategy == "days":
        batches = split_data_by_days(data, batch_size)
    else:  # size
        batches = split_data_by_size(data, batch_size)
    
    print(f"Created {len(batches)} batches")
    
    # Process batches sequentially
    total_time = 0
    successful_batches = 0
    failed_batches = 0
    all_results = []
    
    for i, batch in enumerate(batches):
        print(f"Processing batch {i+1}/{len(batches)} ({len(batch)} data points)")
        
        payload = {
            "test_type": test_type,
            "parameter": parameter,
            "data": batch
        }
        
        elapsed, status, result = run_single_request(payload, f"Batch {i+1}")
        total_time += elapsed
        
        if status == 200:
            successful_batches += 1
            if result and 'results' in result:
                all_results.extend(result['results'])
            print(f"  ✓ Batch {i+1}: {elapsed:.3f}s")
        else:
            failed_batches += 1
            print(f"  ✗ Batch {i+1}: {elapsed:.3f}s (status {status})")
    
    # Calculate metrics
    avg_batch_time = total_time / len(batches) if batches else 0
    success_rate = (successful_batches / len(batches)) * 100 if batches else 0
    
    results = {
        "name": name,
        "strategy": batch_strategy,
        "batch_size": batch_size,
        "total_batches": len(batches),
        "successful_batches": successful_batches,
        "failed_batches": failed_batches,
        "success_rate": success_rate,
        "total_time": total_time,
        "avg_batch_time": avg_batch_time,
        "total_data_points": len(data),
        "results_count": len(all_results)
    }
    
    print(f"✓ Completed: {total_time:.3f}s total, {avg_batch_time:.3f}s avg/batch")
    print(f"  Success rate: {success_rate:.1f}% ({successful_batches}/{len(batches)})")
    
    return results

def run_concurrent_batched_test(name, data, batch_strategy, batch_size, max_workers=4, test_type="tukey", parameter="SoilMoisture"):
    """
    Run a test with concurrent batched processing.
    Args:
        name (str): Test name.
        data (list): Full dataset.
        batch_strategy (str): 'days' or 'size'.
        batch_size (int): Days per batch or points per batch.
        max_workers (int): Maximum concurrent workers.
        test_type (str): Statistical test type.
        parameter (str): Parameter name.
    Returns:
        dict: Test results.
    """
    print(f"\n=== Running Concurrent Batched Test: {name} ===")
    print(f"Strategy: {batch_strategy}, Batch size: {batch_size}, Workers: {max_workers}")
    print(f"Total data points: {len(data)}")
    
    # Split data into batches
    if batch_strategy == "days":
        batches = split_data_by_days(data, batch_size)
    else:  # size
        batches = split_data_by_size(data, batch_size)
    
    print(f"Created {len(batches)} batches")
    
    # Process batches concurrently
    start_time = time.time()
    successful_batches = 0
    failed_batches = 0
    all_results = []
    
    def process_batch(batch, batch_num):
        payload = {
            "test_type": test_type,
            "parameter": parameter,
            "data": batch
        }
        elapsed, status, result = run_single_request(payload, f"Batch {batch_num}")
        return batch_num, elapsed, status, result
    
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        # Submit all batches
        future_to_batch = {
            executor.submit(process_batch, batch, i+1): i+1 
            for i, batch in enumerate(batches)
        }
        
        # Collect results as they complete
        for future in as_completed(future_to_batch):
            batch_num, elapsed, status, result = future.result()
            
            if status == 200:
                successful_batches += 1
                if result and 'results' in result:
                    all_results.extend(result['results'])
                print(f"  ✓ Batch {batch_num}: {elapsed:.3f}s")
            else:
                failed_batches += 1
                print(f"  ✗ Batch {batch_num}: {elapsed:.3f}s (status {status})")
    
    total_time = time.time() - start_time
    
    # Calculate metrics
    avg_batch_time = sum([future.result()[1] for future in as_completed(future_to_batch)]) / len(batches) if batches else 0
    success_rate = (successful_batches / len(batches)) * 100 if batches else 0
    
    results = {
        "name": name,
        "strategy": batch_strategy,
        "batch_size": batch_size,
        "max_workers": max_workers,
        "total_batches": len(batches),
        "successful_batches": successful_batches,
        "failed_batches": failed_batches,
        "success_rate": success_rate,
        "total_time": total_time,
        "avg_batch_time": avg_batch_time,
        "total_data_points": len(data),
        "results_count": len(all_results),
        "concurrent": True
    }
    
    print(f"✓ Completed: {total_time:.3f}s total, {avg_batch_time:.3f}s avg/batch")
    print(f"  Success rate: {success_rate:.1f}% ({successful_batches}/{len(batches)})")
    
    return results

# -----------------------------
# Main Batching Test Logic
# -----------------------------
def main():
    """
    Run batching scenarios to test API performance with large datasets.
    """
    print("=== ANOVA API Batching Performance Test ===")
    
    # Generate large dataset for testing
    print("Generating test dataset...")
    large_dataset = generate_data("2025-06-01", 30, ["A", "B", "C", "D"], 15, freq_minutes=3)
    print(f"Generated {len(large_dataset)} data points")
    
    test_results = []
    
    # Test 1: Sequential batching by days (7 days per batch)
    result1 = run_batched_test(
        "Large Dataset - Sequential by Days (7 days/batch)",
        large_dataset, "days", 7
    )
    test_results.append(result1)
    
    # Test 2: Sequential batching by size (10K points per batch)
    result2 = run_batched_test(
        "Large Dataset - Sequential by Size (10K points/batch)",
        large_dataset, "size", 10000
    )
    test_results.append(result2)
    
    # Test 3: Sequential batching by size (5K points per batch)
    result3 = run_batched_test(
        "Large Dataset - Sequential by Size (5K points/batch)",
        large_dataset, "size", 5000
    )
    test_results.append(result3)
    
    # Test 4: Concurrent batching by days (7 days per batch, 4 workers)
    result4 = run_concurrent_batched_test(
        "Large Dataset - Concurrent by Days (7 days/batch, 4 workers)",
        large_dataset, "days", 7, max_workers=4
    )
    test_results.append(result4)
    
    # Test 5: Concurrent batching by size (10K points per batch, 4 workers)
    result5 = run_concurrent_batched_test(
        "Large Dataset - Concurrent by Size (10K points/batch, 4 workers)",
        large_dataset, "size", 10000, max_workers=4
    )
    test_results.append(result5)
    
    # Test 6: Concurrent batching by size (5K points per batch, 8 workers)
    result6 = run_concurrent_batched_test(
        "Large Dataset - Concurrent by Size (5K points/batch, 8 workers)",
        large_dataset, "size", 5000, max_workers=8
    )
    test_results.append(result6)
    
    # Export results
    print("\n=== Exporting Results ===")
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    
    # Create DataFrame
    df = pd.DataFrame(test_results)
    
    # Add derived columns
    df['Total_Time_Minutes'] = df['total_time'] / 60
    df['Avg_Batch_Time_Seconds'] = df['avg_batch_time']
    df['Data_Points_Per_Batch'] = df['total_data_points'] / df['total_batches']
    df['Throughput_Points_Per_Second'] = df['total_data_points'] / df['total_time']
    
    # Reorder columns
    columns_order = [
        'name', 'strategy', 'batch_size', 'max_workers', 'concurrent',
        'total_batches', 'successful_batches', 'failed_batches', 'success_rate',
        'total_data_points', 'Data_Points_Per_Batch', 'results_count',
        'total_time', 'Total_Time_Minutes', 'avg_batch_time', 'Throughput_Points_Per_Second'
    ]
    df = df[columns_order]
    
    # Save to CSV
    csv_path = os.path.join(OUTPUT_DIR, "batching_benchmark_results.csv")
    df.to_csv(csv_path, index=False)
    print(f"Results saved to: {csv_path}")
    
    # Print summary
    print("\n=== Batching Performance Summary ===")
    for _, row in df.iterrows():
        print(f"\n{row['name']}:")
        print(f"  Strategy: {row['strategy']}, Batch size: {row['batch_size']}")
        print(f"  Concurrent: {row['concurrent']}, Workers: {row['max_workers']}")
        print(f"  Total time: {row['Total_Time_Minutes']:.2f} minutes")
        print(f"  Success rate: {row['success_rate']:.1f}%")
        print(f"  Throughput: {row['Throughput_Points_Per_Second']:.0f} points/second")
    
    # Find best performing strategy
    best_sequential = df[df['concurrent'] == False].loc[df[df['concurrent'] == False]['total_time'].idxmin()]
    best_concurrent = df[df['concurrent'] == True].loc[df[df['concurrent'] == True]['total_time'].idxmin()]
    
    print(f"\n=== Recommendations ===")
    print(f"Best sequential strategy: {best_sequential['name']}")
    print(f"  Time: {best_sequential['Total_Time_Minutes']:.2f} minutes")
    print(f"Best concurrent strategy: {best_concurrent['name']}")
    print(f"  Time: {best_concurrent['Total_Time_Minutes']:.2f} minutes")
    print(f"Speedup: {best_sequential['total_time'] / best_concurrent['total_time']:.2f}x")

if __name__ == "__main__":
    main() 