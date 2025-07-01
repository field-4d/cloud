import requests
import json
import time
from datetime import datetime, timedelta
import random
import os

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
# Test Runner
# -----------------------------
def run_test_case(name, payload):
    """
    Run a single test case against the ANOVA API, save the response, and log timing.
    Args:
        name (str): Test case name.
        payload (dict): API request payload.
    Returns:
        tuple: (elapsed_time, response_status_code)
    """
    print(f"\nRunning test: {name}")
    start = time.time()
    response = requests.post(API_URL, json=payload)
    elapsed = time.time() - start
    print(f"Status: {response.status_code}, Time: {elapsed:.3f}s")
    # Save output
    safe_name = name.replace(' ', '_').replace(',', '').replace('-', '').replace('.', '').replace(':', '').replace('/', '_')
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    output_path = os.path.join(OUTPUT_DIR, f"{safe_name}.json")
    with open(output_path, "w", encoding="utf-8") as f:
        try:
            f.write(json.dumps(response.json(), indent=2))
        except Exception as e:
            f.write(json.dumps({"error": str(e), "response_text": response.text}))
    if response.status_code == 200:
        result = response.json()
        print(f"Returned {len(result['results'])} timestamps. Saved to {output_path}")
    else:
        print(f"Error: {response.text}. Saved to {output_path}")
    return elapsed, response.status_code

# -----------------------------
# Main Benchmarking Logic
# -----------------------------
def main():
    """
    Run a suite of benchmarking and validation scenarios for the ANOVA API.
    Scenarios include variable group sizes, replicates, time resolutions, and a high-replicate case.
    Batching is recommended for very large/high-frequency datasets (see code comments).
    """
    test_cases = []
    # 1. Daily, 2 groups, 10 reps, 7 days
    test_cases.append((
        "Daily, 2 groups, 10 reps, 7 days",
        {
            "test_type": "tukey",
            "parameter": "SoilMoisture",
            "data": generate_data("2025-06-01", 7, ["A", "B"], 10)
        }
    ))
    # 2. Daily, 4 groups, 12 reps, 30 days
    test_cases.append((
        "Daily, 4 groups, 12 reps, 30 days",
        {
            "test_type": "tukey",
            "parameter": "SoilMoisture",
            "data": generate_data("2025-06-01", 30, ["A", "B", "C", "D"], 12)
        }
    ))
    # 3. 3-min interval, 3 groups, 8 reps, 1 day
    test_cases.append((
        "3-min, 3 groups, 8 reps, 1 day",
        {
            "test_type": "tukey",
            "parameter": "SoilMoisture",
            "data": generate_data("2025-06-01", 1, ["A", "B", "C"], 8, freq_minutes=3)
        }
    ))
    # 4. 3-min interval, 2 groups, 6 reps, 2 days
    test_cases.append((
        "3-min, 2 groups, 6 reps, 2 days",
        {
            "test_type": "tukey",
            "parameter": "SoilMoisture",
            "data": generate_data("2025-06-01", 2, ["A", "B"], 6, freq_minutes=3)
        }
    ))
    # 5. 3-min interval, 4 groups, 5 reps, 7 days
    test_cases.append((
        "3-min, 4 groups, 5 reps, 7 days",
        {
            "test_type": "tukey",
            "parameter": "SoilMoisture",
            "data": generate_data("2025-06-01", 7, ["A", "B", "C", "D"], 5, freq_minutes=3)
        }
    ))
    # 6. 15-min interval, 3 groups, 10 reps, 14 days
    test_cases.append((
        "15-min, 3 groups, 10 reps, 14 days",
        {
            "test_type": "tukey",
            "parameter": "SoilMoisture",
            "data": generate_data("2025-06-01", 14, ["A", "B", "C"], 10, freq_minutes=15)
        }
    ))
    # 7. 60-min interval, 4 groups, 8 reps, 30 days
    test_cases.append((
        "60-min, 4 groups, 8 reps, 30 days",
        {
            "test_type": "tukey",
            "parameter": "SoilMoisture",
            "data": generate_data("2025-06-01", 30, ["A", "B", "C", "D"], 8, freq_minutes=60)
        }
    ))
    # 8. 3-min interval, 4 groups, 4 reps, 30 days
    test_cases.append((
        "3-min, 4 groups, 4 reps, 30 days",
        {
            "test_type": "tukey",
            "parameter": "SoilMoisture",
            "data": generate_data("2025-06-01", 30, ["A", "B", "C", "D"], 4, freq_minutes=3)
        }
    ))
    # 9. HIGH-REPLICATE: 3-min interval, 4 groups, 20 reps, 30 days
    test_cases.append((
        "3-min, 4 groups, 20 reps, 30 days (HIGH-REPLICATE)",
        {
            "test_type": "tukey",
            "parameter": "SoilMoisture",
            "data": generate_data("2025-06-01", 30, ["A", "B", "C", "D"], 20, freq_minutes=3)
        }
    ))

    timings = []
    for name, payload in test_cases:
        elapsed, status = run_test_case(name, payload)
        timings.append((name, elapsed, status))

    print("\n--- Benchmark Summary ---")
    for name, elapsed, status in timings:
        print(f"{name}: {elapsed:.3f}s (status {status})")

if __name__ == "__main__":
    main()

# -----------------------------
# Batching Note
# -----------------------------
# For very large/high-frequency datasets, consider splitting the data into batches
# (e.g., by day or by a set number of timestamps) and processing each batch sequentially.
# This approach reduces memory usage and can make the system more robust for cloud deployment. 