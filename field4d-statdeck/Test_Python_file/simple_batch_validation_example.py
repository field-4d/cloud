#!/usr/bin/env python3
"""
Simple Batch Size Validation Example for Field4D StatDeck

This file demonstrates the simplified batch validation rule:
- Maximum batch size: 15,000 data points
- Any batch larger than 15K will be rejected
"""

import json
from typing import Dict, Any, List

# Import the validation config from the app
import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'app'))

from config import BatchValidationConfig

def create_sample_data(n_points: int) -> List[Dict[str, Any]]:
    """Create sample data for testing."""
    data = []
    for i in range(n_points):
        data.append({
            "timestamp": f"2024-01-01T{i:02d}:00:00Z",
            "label": f"Treatment_{(i % 4) + 1}",
            "value": 50.0 + (i % 20)
        })
    return data

def test_batch_validation(batch_size: int, scenario_name: str):
    """
    Test batch validation for a specific scenario.
    
    Args:
        batch_size: Number of data points in the batch
        scenario_name: Description of the scenario
    """
    print(f"\n{'='*60}")
    print(f"SCENARIO: {scenario_name}")
    print(f"Batch Size: {batch_size:,} points")
    print(f"{'='*60}")
    
    # Test validation
    validation_result = BatchValidationConfig.validate_batch_size(batch_size)
    
    print(f"Validation Result: {'✅ PASS' if validation_result['valid'] else '❌ FAIL'}")
    print(f"Maximum Allowed: {validation_result['max_allowed']:,} points")
    
    if not validation_result['valid']:
        print(f"\nError Message:")
        print(validation_result['error_message'])
        print(f"Recommended Batch Size: {validation_result.get('recommended_batch_size', 'N/A'):,} points")
    
    # Show what would happen with API call
    if validation_result['valid']:
        print(f"\n✅ This batch would be ACCEPTED by the API")
        print(f"   Status Code: 200 OK")
        print(f"   Processing: Would proceed with statistical analysis")
    else:
        print(f"\n❌ This batch would be REJECTED by the API")
        print(f"   Status Code: 400 Bad Request")
        print(f"   Action Required: Use recommended batch size of {validation_result.get('recommended_batch_size', 'N/A'):,} points")
    
    return validation_result

def demonstrate_batch_splitting(large_dataset_size: int):
    """
    Show how to split a large dataset into valid batches.
    """
    print(f"\n{'='*60}")
    print(f"BATCH SPLITTING STRATEGY")
    print(f"Original Dataset: {large_dataset_size:,} points")
    print(f"{'='*60}")
    
    max_batch_size = BatchValidationConfig.MAX_BATCH_SIZE
    num_batches = (large_dataset_size + max_batch_size - 1) // max_batch_size
    
    print(f"Maximum Batch Size: {max_batch_size:,}")
    print(f"Number of Batches: {num_batches}")
    
    # Show batch breakdown
    print(f"\nBatch Breakdown:")
    remaining = large_dataset_size
    for i in range(num_batches):
        current_batch_size = min(max_batch_size, remaining)
        print(f"  Batch {i+1}: {current_batch_size:,} points")
        remaining -= current_batch_size
    
    print(f"\nProcessing Strategy:")
    print(f"  1. Split {large_dataset_size:,} points into {num_batches} batches")
    print(f"  2. Each batch ≤ {max_batch_size:,} points")
    print(f"  3. Send each batch as separate API request")
    print(f"  4. Collect and combine results")

def create_example_files():
    """Create example JSON files for different batch sizes."""
    
    # Get the current directory (Test_Python_file)
    current_dir = os.path.dirname(__file__)
    
    # Small dataset (valid)
    small_data = create_sample_data(5000)
    with open(os.path.join(current_dir, "example_small_batch.json"), "w") as f:
        json.dump({
            "parameter": "SoilMoisture",
            "test_type": "tukey",
            "data": small_data
        }, f, indent=2)
    print(f"✅ Created example_small_batch.json ({len(small_data):,} points)")
    
    # Medium dataset (valid)
    medium_data = create_sample_data(12000)
    with open(os.path.join(current_dir, "example_medium_batch.json"), "w") as f:
        json.dump({
            "parameter": "SoilMoisture",
            "test_type": "tukey",
            "data": medium_data
        }, f, indent=2)
    print(f"✅ Created example_medium_batch.json ({len(medium_data):,} points)")
    
    # Large dataset (invalid - too big)
    large_data = create_sample_data(20000)
    with open(os.path.join(current_dir, "example_large_batch_invalid.json"), "w") as f:
        json.dump({
            "parameter": "SoilMoisture",
            "test_type": "tukey",
            "data": large_data
        }, f, indent=2)
    print(f"✅ Created example_large_batch_invalid.json ({len(large_data):,} points)")

def main():
    """Run all batch validation examples."""
    print("🚀 Field4D StatDeck - Simple Batch Size Validation")
    print("=" * 60)
    print(f"Rule: Maximum {BatchValidationConfig.MAX_BATCH_SIZE:,} data points per batch")
    
    # Create example files first
    print(f"\n📁 Creating Example Files...")
    create_example_files()
    
    # Test various scenarios
    scenarios = [
        # (batch_size, scenario_name)
        (5000, "Small Batch - Well within limits"),
        (10000, "Medium Batch - Comfortable size"),
        (15000, "Large Batch - Exactly at limit"),
        (20000, "Very Large Batch - Exceeds limit (should recommend 10K)"),
        (50000, "Huge Batch - Exceeds limit (should recommend 10K)"),
        (100000, "Massive Batch - Exceeds limit (should recommend 8K)"),
        (250000, "Enormous Batch - Exceeds limit (should recommend 5K)"),
        (1500000, "Gigantic Batch - Exceeds limit (should recommend 3K)")
    ]
    
    print(f"\n🧪 Testing Batch Validation Scenarios...")
    passed_count = 0
    failed_count = 0
    
    for batch_size, scenario_name in scenarios:
        result = test_batch_validation(batch_size, scenario_name)
        if result['valid']:
            passed_count += 1
        else:
            failed_count += 1
    
    # Demonstrate batch splitting for a failed case
    print(f"\n📊 BATCH SPLITTING DEMONSTRATION")
    demonstrate_batch_splitting(50000)  # Large dataset that needs splitting
    
    # Summary
    print(f"\n{'='*60}")
    print(f"SUMMARY")
    print(f"{'='*60}")
    print(f"Total Scenarios Tested: {len(scenarios)}")
    print(f"✅ Passed Validation: {passed_count}")
    print(f"❌ Failed Validation: {failed_count}")
    print(f"Success Rate: {(passed_count/len(scenarios)*100):.1f}%")
    
    print(f"\n📋 Key Takeaways:")
    print(f"  • Maximum batch size: {BatchValidationConfig.MAX_BATCH_SIZE:,} points")
    print(f"  • Any batch > {BatchValidationConfig.MAX_BATCH_SIZE:,} will be rejected")
    print(f"  • Split large datasets into smaller batches")
    print(f"  • Check README for recommended batch sizes for different scenarios")

if __name__ == "__main__":
    main() 