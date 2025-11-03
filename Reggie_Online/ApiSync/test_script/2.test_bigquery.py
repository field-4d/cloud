"""
Python script to test BigQuery metadata endpoint.
Install: pip install requests pandas
"""
import requests
import json
import sys
import pandas as pd
import os

BASE_URL = "http://localhost:8000"


def test_bigquery_metadata(dataset: str = None, table: str = None, limit: int = 100, offset: int = 0):
    """
    Test the BigQuery metadata endpoint.
    
    Args:
        dataset: BigQuery dataset name (optional, will prompt if not provided)
        table: Table name (optional, will prompt if not provided)
        limit: Maximum number of rows to return (default: 100)
        offset: Number of rows to skip (default: 0)
    """
    # Get dataset and table if not provided
    if not dataset:
        dataset = input("Enter dataset name (e.g., f4d_test): ").strip()
    
    if not table:
        table = input("Enter table name (e.g., aaaaaaaaaaaa_metadata): ").strip()
    
    if not dataset or not table:
        print("Error: Both dataset and table are required!")
        return
    
    # Construct URL with query parameters
    url = f"{BASE_URL}/GCP-BQ/metadata"
    params = {
        "dataset": dataset,
        "table": table,
        "limit": limit,
        "offset": offset
    }
    
    print(f"\n=== Testing BigQuery Metadata Endpoint ===")
    print(f"URL: {url}")
    print(f"Parameters:")
    print(f"  - Dataset: {dataset}")
    print(f"  - Table: {table}")
    print(f"  - Limit: {limit}")
    print(f"  - Offset: {offset}")
    print(f"\nSending request...")
    
    try:
        # Send GET request
        response = requests.get(url, params=params)
        
        # Check response status
        print(f"\nStatus Code: {response.status_code}")
        
        if response.status_code == 200:
            # Parse JSON response
            data = response.json()
            
            print(f"\n✓ Success!")
            print(f"\nResponse Summary:")
            print(f"  - Success: {data.get('success')}")
            print(f"  - Project: {data.get('project')}")
            print(f"  - Dataset: {data.get('dataset')}")
            print(f"  - Table: {data.get('table')}")
            print(f"  - Full Table: {data.get('full_table')}")
            print(f"  - Count: {data.get('count')} rows")
            print(f"  - Limit: {data.get('limit')}")
            print(f"  - Offset: {data.get('offset')}")
            
            # Display data as DataFrame
            rows = data.get('data', [])
            if rows:
                # Convert to DataFrame
                df = pd.DataFrame(rows)
                # if output folder do not exist create it and save the dataframe to it
                if not os.path.exists('output'):
                    os.makedirs('output')
                df.to_csv(f'output/{dataset}_{table}.csv', index=False)
                
                print(f"\n{'='*80}")
                print(f"Data as DataFrame ({len(rows)} rows, {len(df.columns)} columns):")
                print(f"{'='*80}")
                print(df.to_string())
                print(f"{'='*80}")
                
                # Display summary
                print(f"\nDataFrame Info:")
                print(f"  - Shape: {df.shape[0]} rows × {df.shape[1]} columns")
                print(f"  - Columns: {list(df.columns)}")
                
            else:
                print(f"\n  No data returned")
            
            # Optionally save full response to file
            Show_Full_JSON = False
            if Show_Full_JSON:
                print(f"\nFull Response (JSON):")
                print(json.dumps(data, indent=2, default=str))
            else:
                print(f"\nFull Response (JSON):")
                print(json.dumps(data, indent=2, default=str))
            
        else:
            print(f"\n✗ Error!")
            print(f"Response: {response.text}")
            
    except requests.exceptions.ConnectionError:
        print(f"\n✗ Connection Error!")
        print(f"Make sure the FastAPI server is running on {BASE_URL}")
        print(f"Start the server with: python -m uvicorn src.main:app --reload")
        
    except Exception as e:
        print(f"\n✗ Error: {e}")
        import traceback
        traceback.print_exc()


def test_multiple_tables():
    """
    Test multiple table queries with predefined test cases.
    """
    test_cases = [
        {"dataset": "f4d_test", "table": "aaaaaaaaaaaa_metadata"},
        {"dataset": "f4d_test", "table": "asdf"},
        {"dataset": "asdf", "table": "asdf"},
        # Add more test cases as needed
    ]
    
    print(f"\n=== Testing Multiple Tables ===")
    
    for i, test_case in enumerate(test_cases, 1):
        print(f"\n{'='*50}")
        print(f"Test Case {i}/{len(test_cases)}")
        print(f"{'='*50}")
        test_bigquery_metadata(**test_case, limit=10)


if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Test BigQuery metadata endpoint")
    parser.add_argument("--dataset", "-d", type=str, help="BigQuery dataset name")
    parser.add_argument("--table", "-t", type=str, help="Table name")
    parser.add_argument("--limit", "-l", type=int, default=100, help="Limit number of rows (default: 100)")
    parser.add_argument("--offset", "-o", type=int, default=0, help="Offset for pagination (default: 0)")
    parser.add_argument("--multiple", "-m", action="store_true", help="Run multiple test cases")
    
    args = parser.parse_args()
    
    if args.multiple:
        test_multiple_tables()
    else:
        test_bigquery_metadata(
            dataset=args.dataset,
            table=args.table,
            limit=args.limit,
            offset=args.offset
        )

