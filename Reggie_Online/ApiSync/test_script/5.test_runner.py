"""
Comprehensive test runner for all ApiSync test scripts.
Tests normal functionality and edge cases, returns pass/fail status.
"""
import asyncio
import json
import websockets
import requests
import time
import sys
import io
import csv
import argparse
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Any, Optional
from dataclasses import dataclass
from enum import Enum

# Fix Windows console encoding for emoji characters
if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

# Enable unbuffered output
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(line_buffering=True)
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(line_buffering=True)

# Configuration
BASE_URL = "http://localhost:8000"
WS_URI = "ws://localhost:8000/ws/ping"
TIMEOUT = 10


class TestStatus(Enum):
    """Test status enumeration."""
    PASS = "PASS"
    FAIL = "FAIL"
    SKIP = "SKIP"


@dataclass
class TestResult:
    """Test result data class."""
    name: str
    status: TestStatus
    message: str
    duration: float
    error: Optional[str] = None
    metrics: Optional[Dict[str, Any]] = None  # For performance metrics


class TestRunner:
    """Comprehensive test runner for ApiSync endpoints."""
    
    def __init__(self, export_csv: Optional[str] = None, export_txt: Optional[str] = None, no_export: bool = False):
        self.results: List[TestResult] = []
        self.start_time = time.time()
        self.export_csv = export_csv
        self.export_txt = export_txt
        self.no_export = no_export
        self.output_lines: List[str] = []  # Store all output for text export
    
    def check_server(self) -> bool:
        """Check if the server is running."""
        try:
            response = requests.get(f"{BASE_URL}/health", timeout=5)
            return response.status_code == 200
        except:
            return False
    
    def _calculate_metrics(self, response_times: List[float], total_count: int, total_duration: float) -> Dict[str, Any]:
        """Calculate performance metrics from response times."""
        if not response_times:
            return {
                "avg_response": 0.0,
                "min_response": 0.0,
                "max_response": 0.0,
                "requests_per_sec": 0.0
            }
        
        return {
            "avg_response": sum(response_times) / len(response_times),
            "min_response": min(response_times),
            "max_response": max(response_times),
            "requests_per_sec": total_count / total_duration if total_duration > 0 else 0.0
        }
    
    def add_result(self, name: str, status: TestStatus, message: str, duration: float, error: Optional[str] = None):
        """Add a test result."""
        self.results.append(TestResult(name, status, message, duration, error))
        status_icon = "✅" if status == TestStatus.PASS else "❌" if status == TestStatus.FAIL else "⏭️"
        output_line = f"{status_icon} {name}: {message} ({duration:.3f}s)"
        print(output_line)
        self.output_lines.append(output_line)
        if error:
            error_line = f"   Error: {error}"
            print(error_line)
            self.output_lines.append(error_line)
    
    # ==================== WebSocket Ping Tests ====================
    
    async def test_websocket_ping_normal(self) -> TestResult:
        """Test normal WebSocket ping functionality."""
        start = time.time()
        try:
            async with websockets.connect(WS_URI) as ws:
                payload = {
                    "owner": "Icore_Pi",
                    "mac_address": "2ccf6730ab5f",
                    "type": "Ping",
                    "LLA": "fd002124b00ccf7399b"
                }
                await ws.send(json.dumps(payload))
                response = await asyncio.wait_for(ws.recv(), timeout=TIMEOUT)
                data = json.loads(response)
                
                if data.get("received") and "payload" in data:
                    return TestResult(
                        "WebSocket Ping - Normal",
                        TestStatus.PASS,
                        "Normal ping successful",
                        time.time() - start
                    )
                else:
                    return TestResult(
                        "WebSocket Ping - Normal",
                        TestStatus.FAIL,
                        "Invalid response format",
                        time.time() - start,
                        str(data)
                    )
        except Exception as e:
            return TestResult(
                "WebSocket Ping - Normal",
                TestStatus.FAIL,
                "Test failed",
                time.time() - start,
                str(e)
            )
    
    async def test_websocket_ping_missing_fields(self) -> TestResult:
        """Test WebSocket ping with missing required fields."""
        start = time.time()
        try:
            async with websockets.connect(WS_URI) as ws:
                # Missing owner
                payload = {
                    "mac_address": "2ccf6730ab5f",
                    "type": "Ping",
                    "LLA": "fd002124b00ccf7399b"
                }
                await ws.send(json.dumps(payload))
                response = await asyncio.wait_for(ws.recv(), timeout=TIMEOUT)
                data = json.loads(response)
                
                validation = data.get("payload", {}).get("validation", {})
                if not validation.get("is_valid") and "missing required fields" in validation.get("message", "").lower():
                    return TestResult(
                        "WebSocket Ping - Missing Fields",
                        TestStatus.PASS,
                        "Correctly rejected missing fields",
                        time.time() - start
                    )
                else:
                    return TestResult(
                        "WebSocket Ping - Missing Fields",
                        TestStatus.FAIL,
                        "Should reject missing fields",
                        time.time() - start,
                        f"Response: {validation}"
                    )
        except Exception as e:
            return TestResult(
                "WebSocket Ping - Missing Fields",
                TestStatus.FAIL,
                "Test failed",
                time.time() - start,
                str(e)
            )
    
    async def test_websocket_ping_invalid_json(self) -> TestResult:
        """Test WebSocket ping with invalid JSON."""
        start = time.time()
        try:
            async with websockets.connect(WS_URI) as ws:
                await ws.send("invalid json {")
                response = await asyncio.wait_for(ws.recv(), timeout=TIMEOUT)
                data = json.loads(response)
                
                if "error" in data and "Invalid JSON" in data.get("error", ""):
                    return TestResult(
                        "WebSocket Ping - Invalid JSON",
                        TestStatus.PASS,
                        "Correctly rejected invalid JSON",
                        time.time() - start
                    )
                else:
                    return TestResult(
                        "WebSocket Ping - Invalid JSON",
                        TestStatus.FAIL,
                        "Should reject invalid JSON",
                        time.time() - start,
                        str(data)
                    )
        except Exception as e:
            return TestResult(
                "WebSocket Ping - Invalid JSON",
                TestStatus.FAIL,
                "Test failed",
                time.time() - start,
                str(e)
            )
    
    async def test_websocket_ping_empty_payload(self) -> TestResult:
        """Test WebSocket ping with empty payload."""
        start = time.time()
        try:
            async with websockets.connect(WS_URI) as ws:
                await ws.send(json.dumps({}))
                response = await asyncio.wait_for(ws.recv(), timeout=TIMEOUT)
                data = json.loads(response)
                
                validation = data.get("payload", {}).get("validation", {})
                if not validation.get("is_valid"):
                    return TestResult(
                        "WebSocket Ping - Empty Payload",
                        TestStatus.PASS,
                        "Correctly rejected empty payload",
                        time.time() - start
                    )
                else:
                    return TestResult(
                        "WebSocket Ping - Empty Payload",
                        TestStatus.FAIL,
                        "Should reject empty payload",
                        time.time() - start,
                        str(validation)
                    )
        except Exception as e:
            return TestResult(
                "WebSocket Ping - Empty Payload",
                TestStatus.FAIL,
                "Test failed",
                time.time() - start,
                str(e)
            )
    
    async def test_websocket_ping_wrong_type(self) -> TestResult:
        """Test WebSocket ping with wrong data types."""
        start = time.time()
        try:
            async with websockets.connect(WS_URI) as ws:
                payload = {
                    "owner": 123,  # Should be string
                    "mac_address": "2ccf6730ab5f",
                    "type": "Ping",
                    "LLA": "fd002124b00ccf7399b"
                }
                await ws.send(json.dumps(payload))
                response = await asyncio.wait_for(ws.recv(), timeout=TIMEOUT)
                data = json.loads(response)
                
                # Should still process but validation might fail
                if "payload" in data:
                    return TestResult(
                        "WebSocket Ping - Wrong Type",
                        TestStatus.PASS,
                        "Handled wrong type gracefully",
                        time.time() - start
                    )
                else:
                    return TestResult(
                        "WebSocket Ping - Wrong Type",
                        TestStatus.FAIL,
                        "Should handle wrong type",
                        time.time() - start,
                        str(data)
                    )
        except Exception as e:
            return TestResult(
                "WebSocket Ping - Wrong Type",
                TestStatus.FAIL,
                "Test failed",
                time.time() - start,
                str(e)
            )
    
    async def test_websocket_ping_rapid_same_lla(self, count: int) -> TestResult:
        """Test WebSocket ping with rapid successive pings for the same LLA."""
        start = time.time()
        try:
            async with websockets.connect(WS_URI) as ws:
                payload = {
                    "owner": "Icore_Pi",
                    "mac_address": "2ccf6730ab5f",
                    "type": "Ping",
                    "LLA": "fd002124b00ccf7399b"
                }
                
                success_count = 0
                errors = []
                response_times = []
                
                # Send rapid pings
                for i in range(count):
                    try:
                        ping_start = time.time()
                        await ws.send(json.dumps(payload))
                        response = await asyncio.wait_for(ws.recv(), timeout=TIMEOUT)
                        ping_duration = time.time() - ping_start
                        response_times.append(ping_duration)
                        
                        data = json.loads(response)
                        if data.get("received") and "payload" in data:
                            success_count += 1
                        else:
                            errors.append(f"Invalid response at ping {i+1}")
                    except Exception as e:
                        errors.append(f"Error at ping {i+1}: {str(e)}")
                
                duration = time.time() - start
                metrics = self._calculate_metrics(response_times, count, duration)
                
                if success_count == count:
                    msg = (f"All {count} pings successful in {duration:.2f}s | "
                          f"Avg: {metrics['avg_response']:.3f}s | "
                          f"Rate: {metrics['requests_per_sec']:.1f} req/s")
                    return TestResult(
                        f"WebSocket Ping - Rapid {count} (Same LLA)",
                        TestStatus.PASS,
                        msg,
                        duration,
                        None,
                        metrics
                    )
                else:
                    return TestResult(
                        f"WebSocket Ping - Rapid {count} (Same LLA)",
                        TestStatus.FAIL,
                        f"Only {success_count}/{count} pings successful",
                        duration,
                        f"Errors: {errors[:3]}" if errors else "Unknown errors",
                        metrics
                    )
        except Exception as e:
            return TestResult(
                f"WebSocket Ping - Rapid {count} (Same LLA)",
                TestStatus.FAIL,
                "Test failed",
                time.time() - start,
                str(e)
            )
    
    async def test_websocket_ping_rapid_different_lla(self, count: int) -> TestResult:
        """Test WebSocket ping with rapid successive pings for different LLAs."""
        start = time.time()
        try:
            async with websockets.connect(WS_URI) as ws:
                # List of different LLAs to test
                llas = [
                    "fd002124b00ccf7399b",
                    "fd002124b00ccf7399a",
                    "fd002124b0021f9fecc",
                    "fd002124b00d6b2703",
                    "fd002124b001665e500",
                    "fd002124b00aa9e4512",
                    "fd002124b00aa9e4513",
                    "1234567890",
                    "1234567892",
                    "test_lla_001",
                    "test_lla_002",
                    "test_lla_003",
                    "test_lla_004",
                    "test_lla_005",
                    "test_lla_006",
                    "test_lla_007",
                    "test_lla_008",
                    "test_lla_009",
                    "test_lla_010",
                    "test_lla_011"
                ]
                
                success_count = 0
                errors = []
                response_times = []
                
                # Send rapid pings with different LLAs
                for i in range(count):
                    lla = llas[i % len(llas)]  # Cycle through LLAs if count > len(llas)
                    payload = {
                        "owner": "Icore_Pi",
                        "mac_address": "2ccf6730ab5f",
                        "type": "Ping",
                        "LLA": lla
                    }
                    try:
                        ping_start = time.time()
                        await ws.send(json.dumps(payload))
                        response = await asyncio.wait_for(ws.recv(), timeout=TIMEOUT)
                        ping_duration = time.time() - ping_start
                        response_times.append(ping_duration)
                        
                        data = json.loads(response)
                        if data.get("received") and "payload" in data:
                            success_count += 1
                        else:
                            errors.append(f"Invalid response at ping {i+1} (LLA: {lla})")
                    except Exception as e:
                        errors.append(f"Error at ping {i+1} (LLA: {lla}): {str(e)}")
                
                duration = time.time() - start
                metrics = self._calculate_metrics(response_times, count, duration)
                
                if success_count == count:
                    msg = (f"All {count} pings successful in {duration:.2f}s | "
                          f"Avg: {metrics['avg_response']:.3f}s | "
                          f"Rate: {metrics['requests_per_sec']:.1f} req/s")
                    return TestResult(
                        f"WebSocket Ping - Rapid {count} (Different LLA)",
                        TestStatus.PASS,
                        msg,
                        duration,
                        None,
                        metrics
                    )
                else:
                    return TestResult(
                        f"WebSocket Ping - Rapid {count} (Different LLA)",
                        TestStatus.FAIL,
                        f"Only {success_count}/{count} pings successful",
                        duration,
                        f"Errors: {errors[:3]}" if errors else "Unknown errors",
                        metrics
                    )
        except Exception as e:
            return TestResult(
                f"WebSocket Ping - Rapid {count} (Different LLA)",
                TestStatus.FAIL,
                "Test failed",
                time.time() - start,
                str(e)
            )
    
    # ==================== Metadata Update Tests ====================
    
    def test_metadata_update_normal(self) -> TestResult:
        """Test normal metadata update functionality."""
        start = time.time()
        try:
            url = f"{BASE_URL}/FS/sensor/update-metadata"
            payload = {
                "hostname": "Icore_Pi",
                "mac_address": "2ccf6730ab5f",
                "lla": "fd002124b00ccf7399b",
                "updates": {
                    "label": "Test_Label",
                    "exp_name": "Test_Experiment"
                }
            }
            response = requests.post(url, json=payload, timeout=TIMEOUT)
            
            if response.status_code == 200:
                data = response.json()
                if data.get("success"):
                    return TestResult(
                        "Metadata Update - Normal",
                        TestStatus.PASS,
                        "Normal update successful",
                        time.time() - start
                    )
                else:
                    return TestResult(
                        "Metadata Update - Normal",
                        TestStatus.FAIL,
                        "Update returned success=False",
                        time.time() - start,
                        str(data)
                    )
            else:
                return TestResult(
                    "Metadata Update - Normal",
                    TestStatus.FAIL,
                    f"HTTP {response.status_code}",
                    time.time() - start,
                    response.text[:200]
                )
        except Exception as e:
            return TestResult(
                "Metadata Update - Normal",
                TestStatus.FAIL,
                "Test failed",
                time.time() - start,
                str(e)
            )
    
    def test_metadata_update_missing_fields(self) -> TestResult:
        """Test metadata update with missing required fields."""
        start = time.time()
        try:
            url = f"{BASE_URL}/FS/sensor/update-metadata"
            # Missing owner
            payload = {
                "mac_address": "2ccf6730ab5f",
                "lla": "fd002124b00ccf7399b",
                "updates": {"label": "Test"}
            }
            response = requests.post(url, json=payload, timeout=TIMEOUT)
            
            if response.status_code in [400, 422]:  # Validation error
                return TestResult(
                    "Metadata Update - Missing Fields",
                    TestStatus.PASS,
                    "Correctly rejected missing fields",
                    time.time() - start
                )
            else:
                return TestResult(
                    "Metadata Update - Missing Fields",
                    TestStatus.FAIL,
                    f"Should return 400/422, got {response.status_code}",
                    time.time() - start,
                    response.text[:200]
                )
        except Exception as e:
            return TestResult(
                "Metadata Update - Missing Fields",
                TestStatus.FAIL,
                "Test failed",
                time.time() - start,
                str(e)
            )
    
    def test_metadata_update_empty_updates(self) -> TestResult:
        """Test metadata update with empty updates dict."""
        start = time.time()
        try:
            url = f"{BASE_URL}/FS/sensor/update-metadata"
            payload = {
                "hostname": "Icore_Pi",
                "mac_address": "2ccf6730ab5f",
                "lla": "fd002124b00ccf7399b",
                "updates": {}
            }
            response = requests.post(url, json=payload, timeout=TIMEOUT)
            
            # Should either succeed (no-op) or reject
            if response.status_code in [200, 400]:
                return TestResult(
                    "Metadata Update - Empty Updates",
                    TestStatus.PASS,
                    "Handled empty updates",
                    time.time() - start
                )
            else:
                return TestResult(
                    "Metadata Update - Empty Updates",
                    TestStatus.FAIL,
                    f"Unexpected status {response.status_code}",
                    time.time() - start,
                    response.text[:200]
                )
        except Exception as e:
            return TestResult(
                "Metadata Update - Empty Updates",
                TestStatus.FAIL,
                "Test failed",
                time.time() - start,
                str(e)
            )
    
    def test_metadata_update_invalid_sensor(self) -> TestResult:
        """Test metadata update with non-existent sensor."""
        start = time.time()
        try:
            url = f"{BASE_URL}/FS/sensor/update-metadata"
            payload = {
                "hostname": "Icore_Pi",
                "mac_address": "2ccf6730ab5f",
                "lla": "nonexistent_sensor_12345",
                "updates": {"label": "Test"}
            }
            response = requests.post(url, json=payload, timeout=TIMEOUT)
            
            if response.status_code in [400, 404]:
                return TestResult(
                    "Metadata Update - Invalid Sensor",
                    TestStatus.PASS,
                    "Correctly rejected invalid sensor",
                    time.time() - start
                )
            else:
                return TestResult(
                    "Metadata Update - Invalid Sensor",
                    TestStatus.FAIL,
                    f"Should return 400/404, got {response.status_code}",
                    time.time() - start,
                    response.text[:200]
                )
        except Exception as e:
            return TestResult(
                "Metadata Update - Invalid Sensor",
                TestStatus.FAIL,
                "Test failed",
                time.time() - start,
                str(e)
            )
    
    def test_metadata_update_invalid_json(self) -> TestResult:
        """Test metadata update with invalid JSON."""
        start = time.time()
        try:
            url = f"{BASE_URL}/FS/sensor/update-metadata"
            response = requests.post(
                url,
                data="invalid json {",
                headers={"Content-Type": "application/json"},
                timeout=TIMEOUT
            )
            
            if response.status_code in [400, 422]:
                return TestResult(
                    "Metadata Update - Invalid JSON",
                    TestStatus.PASS,
                    "Correctly rejected invalid JSON",
                    time.time() - start
                )
            else:
                return TestResult(
                    "Metadata Update - Invalid JSON",
                    TestStatus.FAIL,
                    f"Should return 400/422, got {response.status_code}",
                    time.time() - start,
                    response.text[:200]
                )
        except Exception as e:
            return TestResult(
                "Metadata Update - Invalid JSON",
                TestStatus.FAIL,
                "Test failed",
                time.time() - start,
                str(e)
            )
    
    def test_metadata_update_rapid_same_lla(self, count: int) -> TestResult:
        """Test metadata update with rapid successive updates for the same LLA."""
        start = time.time()
        url = f"{BASE_URL}/FS/sensor/update-metadata"
        payload = {
            "owner": "developerroom",
            "mac_address": "2ccf6730ab8c",
            "lla": "fd002124b00ccf7399b",
            "updates": {
                "label": f"Rapid_Test_{count}"
            }
        }
        
        success_count = 0
        errors = []
        response_times = []
        
        # Send rapid updates
        for i in range(count):
            try:
                # Update label with unique value for each request
                payload["updates"]["label"] = f"Rapid_Test_{i+1}_{count}"
                update_start = time.time()
                response = requests.post(url, json=payload, timeout=TIMEOUT)
                update_duration = time.time() - update_start
                response_times.append(update_duration)
                
                if response.status_code == 200:
                    data = response.json()
                    if data.get("success"):
                        success_count += 1
                    else:
                        errors.append(f"Update {i+1} returned success=False")
                else:
                    errors.append(f"Update {i+1} returned status {response.status_code}")
            except Exception as e:
                errors.append(f"Error at update {i+1}: {str(e)}")
        
        duration = time.time() - start
        metrics = self._calculate_metrics(response_times, count, duration)
        
        if success_count == count:
            msg = (f"All {count} updates successful in {duration:.2f}s | "
                  f"Avg: {metrics['avg_response']:.3f}s | "
                  f"Rate: {metrics['requests_per_sec']:.1f} req/s")
            return TestResult(
                f"Metadata Update - Rapid {count} (Same LLA)",
                TestStatus.PASS,
                msg,
                duration,
                None,
                metrics
            )
        else:
            return TestResult(
                f"Metadata Update - Rapid {count} (Same LLA)",
                TestStatus.FAIL,
                f"Only {success_count}/{count} updates successful",
                duration,
                f"Errors: {errors[:3]}" if errors else "Unknown errors",
                metrics
            )
    
    def test_metadata_update_rapid_different_lla(self, count: int) -> TestResult:
        """Test metadata update with rapid successive updates for different LLAs.
        
        This test validates async behavior by sending rapid sequential requests to different sensors.
        Each request updates a different sensor, demonstrating that async Firestore operations
        allow the server to handle multiple concurrent requests efficiently without blocking.
        """
        start = time.time()
        url = f"{BASE_URL}/FS/sensor/update-metadata"
        
        # List of different LLAs to test
        llas = [
            "fd002124b00ccf7399b",
            "fd002124b00ccf7399a",
            "fd002124b0021f9fecc",
            "fd002124b00d6b2703",
            "fd002124b001665e500",
            "fd002124b00aa9e4512",
            "fd002124b00aa9e4513",
            "1234567890",
            "1234567892",
            "test_lla_001",
            "test_lla_002",
            "test_lla_003",
            "test_lla_004",
            "test_lla_005",
            "test_lla_006",
            "test_lla_007",
            "test_lla_008",
            "test_lla_009",
            "test_lla_010",
            "test_lla_011"
        ]
        
        success_count = 0
        errors = []
        response_times = []
        
        # Send rapid updates with different LLAs
        for i in range(count):
            lla = llas[i % len(llas)]  # Cycle through LLAs if count > len(llas)
            payload = {
                "hostname": "Icore_Pi",
                "mac_address": "2ccf6730ab5f",
                "lla": lla,
                "updates": {
                    "label": f"Rapid_Test_{i+1}_{count}"
                }
            }
            try:
                update_start = time.time()
                response = requests.post(url, json=payload, timeout=TIMEOUT)
                update_duration = time.time() - update_start
                response_times.append(update_duration)
                
                if response.status_code == 200:
                    data = response.json()
                    if data.get("success"):
                        success_count += 1
                    else:
                        errors.append(f"Update {i+1} (LLA: {lla}) returned success=False")
                else:
                    errors.append(f"Update {i+1} (LLA: {lla}) returned status {response.status_code}")
            except Exception as e:
                errors.append(f"Error at update {i+1} (LLA: {lla}): {str(e)}")
        
        duration = time.time() - start
        metrics = self._calculate_metrics(response_times, count, duration)
        
        if success_count == count:
            msg = (f"All {count} updates successful in {duration:.2f}s | "
                  f"Avg: {metrics['avg_response']:.3f}s | "
                  f"Rate: {metrics['requests_per_sec']:.1f} req/s")
            return TestResult(
                f"Metadata Update - Rapid {count} (Different LLA)",
                TestStatus.PASS,
                msg,
                duration,
                None,
                metrics
            )
        else:
            return TestResult(
                f"Metadata Update - Rapid {count} (Different LLA)",
                TestStatus.FAIL,
                f"Only {success_count}/{count} updates successful",
                duration,
                f"Errors: {errors[:3]}" if errors else "Unknown errors",
                metrics
            )
    
    # ==================== Last Package Tests ====================
    
    async def test_last_package_normal_dict(self) -> TestResult:
        """Test normal Last_Package with dictionary format."""
        start = time.time()
        try:
            async with websockets.connect(WS_URI) as ws:
                payload = {
                    "type": "Last_Package",
                    "owner": "Icore_Pi",
                    "mac_address": "2ccf6730ab5f",
                    "sensors": {
                        "fd002124b00ccf7399b": {
                            "temperature": 23.5,
                            "humidity": 65.2,
                            "solar_intensity": 850.0,
                            "battery": 3750
                        }
                    }
                }
                await ws.send(json.dumps(payload))
                response = await asyncio.wait_for(ws.recv(), timeout=TIMEOUT)
                data = json.loads(response)
                
                if data.get("type") == "Last_Package" and "updated_llas" in data:
                    return TestResult(
                        "Last Package - Normal Dict",
                        TestStatus.PASS,
                        "Normal dictionary format successful",
                        time.time() - start
                    )
                else:
                    return TestResult(
                        "Last Package - Normal Dict",
                        TestStatus.FAIL,
                        "Invalid response format",
                        time.time() - start,
                        str(data)
                    )
        except Exception as e:
            return TestResult(
                "Last Package - Normal Dict",
                TestStatus.FAIL,
                "Test failed",
                time.time() - start,
                str(e)
            )
    
    async def test_last_package_normal_array(self) -> TestResult:
        """Test normal Last_Package with array format."""
        start = time.time()
        try:
            async with websockets.connect(WS_URI) as ws:
                payload = {
                    "type": "Last_Package",
                    "owner": "Icore_Pi",
                    "mac_address": "2ccf6730ab5f",
                    "sensors": [
                        {
                            "LLA": "fd002124b00ccf7399a",
                            "temperature": 22.8,
                            "humidity": 62.3,
                            "battery": 3400
                        }
                    ]
                }
                await ws.send(json.dumps(payload))
                response = await asyncio.wait_for(ws.recv(), timeout=TIMEOUT)
                data = json.loads(response)
                
                if data.get("type") == "Last_Package" and "updated_llas" in data:
                    return TestResult(
                        "Last Package - Normal Array",
                        TestStatus.PASS,
                        "Normal array format successful",
                        time.time() - start
                    )
                else:
                    return TestResult(
                        "Last Package - Normal Array",
                        TestStatus.FAIL,
                        "Invalid response format",
                        time.time() - start,
                        str(data)
                    )
        except Exception as e:
            return TestResult(
                "Last Package - Normal Array",
                TestStatus.FAIL,
                "Test failed",
                time.time() - start,
                str(e)
            )
    
    async def test_last_package_low_battery(self) -> TestResult:
        """Test Last_Package with low battery (< 2700 mV)."""
        start = time.time()
        try:
            async with websockets.connect(WS_URI) as ws:
                payload = {
                    "type": "Last_Package",
                    "owner": "Icore_Pi",
                    "mac_address": "2ccf6730ab5f",
                    "sensors": {
                        "fd002124b00ccf7399b": {
                            "temperature": 23.5,
                            "battery": 2500  # Below threshold
                        }
                    }
                }
                await ws.send(json.dumps(payload))
                response = await asyncio.wait_for(ws.recv(), timeout=TIMEOUT)
                data = json.loads(response)
                
                # Should still process (battery validation might be in frontend)
                if data.get("type") == "Last_Package":
                    return TestResult(
                        "Last Package - Low Battery",
                        TestStatus.PASS,
                        "Handled low battery value",
                        time.time() - start
                    )
                else:
                    return TestResult(
                        "Last Package - Low Battery",
                        TestStatus.FAIL,
                        "Should handle low battery",
                        time.time() - start,
                        str(data)
                    )
        except Exception as e:
            return TestResult(
                "Last Package - Low Battery",
                TestStatus.FAIL,
                "Test failed",
                time.time() - start,
                str(e)
            )
    
    async def test_last_package_missing_sensors(self) -> TestResult:
        """Test Last_Package with missing sensors field."""
        start = time.time()
        try:
            async with websockets.connect(WS_URI) as ws:
                payload = {
                    "type": "Last_Package",
                    "owner": "Icore_Pi",
                    "mac_address": "2ccf6730ab5f"
                    # Missing sensors field
                }
                await ws.send(json.dumps(payload))
                response = await asyncio.wait_for(ws.recv(), timeout=TIMEOUT)
                data = json.loads(response)
                
                # Should handle gracefully
                if data.get("type") == "Last_Package":
                    return TestResult(
                        "Last Package - Missing Sensors",
                        TestStatus.PASS,
                        "Handled missing sensors field",
                        time.time() - start
                    )
                else:
                    return TestResult(
                        "Last Package - Missing Sensors",
                        TestStatus.FAIL,
                        "Should handle missing sensors",
                        time.time() - start,
                        str(data)
                    )
        except Exception as e:
            return TestResult(
                "Last Package - Missing Sensors",
                TestStatus.FAIL,
                "Test failed",
                time.time() - start,
                str(e)
            )
    
    async def test_last_package_empty_sensors(self) -> TestResult:
        """Test Last_Package with empty sensors dict."""
        start = time.time()
        try:
            async with websockets.connect(WS_URI) as ws:
                payload = {
                    "type": "Last_Package",
                    "owner": "Icore_Pi",
                    "mac_address": "2ccf6730ab5f",
                    "sensors": {}
                }
                await ws.send(json.dumps(payload))
                response = await asyncio.wait_for(ws.recv(), timeout=TIMEOUT)
                data = json.loads(response)
                
                if data.get("type") == "Last_Package":
                    return TestResult(
                        "Last Package - Empty Sensors",
                        TestStatus.PASS,
                        "Handled empty sensors",
                        time.time() - start
                    )
                else:
                    return TestResult(
                        "Last Package - Empty Sensors",
                        TestStatus.FAIL,
                        "Should handle empty sensors",
                        time.time() - start,
                        str(data)
                    )
        except Exception as e:
            return TestResult(
                "Last Package - Empty Sensors",
                TestStatus.FAIL,
                "Test failed",
                time.time() - start,
                str(e)
            )
    
    async def test_last_package_invalid_sensor_id(self) -> TestResult:
        """Test Last_Package with invalid sensor ID."""
        start = time.time()
        try:
            async with websockets.connect(WS_URI) as ws:
                payload = {
                    "type": "Last_Package",
                    "owner": "Icore_Pi",
                    "mac_address": "2ccf6730ab5f",
                    "sensors": {
                        "nonexistent_sensor_99999": {
                            "temperature": 23.5,
                            "battery": 3500
                        }
                    }
                }
                await ws.send(json.dumps(payload))
                response = await asyncio.wait_for(ws.recv(), timeout=TIMEOUT)
                data = json.loads(response)
                
                # Should return errors for invalid sensor
                if data.get("type") == "Last_Package" and ("errors" in data or len(data.get("updated_llas", [])) == 0):
                    return TestResult(
                        "Last Package - Invalid Sensor ID",
                        TestStatus.PASS,
                        "Correctly handled invalid sensor",
                        time.time() - start
                    )
                else:
                    return TestResult(
                        "Last Package - Invalid Sensor ID",
                        TestStatus.FAIL,
                        "Should handle invalid sensor",
                        time.time() - start,
                        str(data)
                    )
        except Exception as e:
            return TestResult(
                "Last Package - Invalid Sensor ID",
                TestStatus.FAIL,
                "Test failed",
                time.time() - start,
                str(e)
            )
    
    async def test_last_package_malformed_array(self) -> TestResult:
        """Test Last_Package with malformed array (missing LLA)."""
        start = time.time()
        try:
            async with websockets.connect(WS_URI) as ws:
                payload = {
                    "type": "Last_Package",
                    "owner": "Icore_Pi",
                    "mac_address": "2ccf6730ab5f",
                    "sensors": [
                        {
                            # Missing LLA field
                            "temperature": 23.5,
                            "battery": 3500
                        }
                    ]
                }
                await ws.send(json.dumps(payload))
                response = await asyncio.wait_for(ws.recv(), timeout=TIMEOUT)
                data = json.loads(response)
                
                # Should handle gracefully
                if data.get("type") == "Last_Package":
                    return TestResult(
                        "Last Package - Malformed Array",
                        TestStatus.PASS,
                        "Handled malformed array",
                        time.time() - start
                    )
                else:
                    return TestResult(
                        "Last Package - Malformed Array",
                        TestStatus.FAIL,
                        "Should handle malformed array",
                        time.time() - start,
                        str(data)
                    )
        except Exception as e:
            return TestResult(
                "Last Package - Malformed Array",
                TestStatus.FAIL,
                "Test failed",
                time.time() - start,
                str(e)
            )
    
    async def test_last_package_batch_multiple_sensors(self) -> TestResult:
        """Test Last_Package batch functionality with multiple sensors in one payload."""
        start = time.time()
        try:
            async with websockets.connect(WS_URI) as ws:
                # Test with 10 sensors in a single batch payload
                sensors_dict = {}
                test_llas = [
                    "fd002124b00ccf7399b",
                    "fd002124b00ccf7399a",
                    "fd002124b0021f9fecc",
                    "fd002124b00d6b2703",
                    "fd002124b001665e500",
                    "fd002124b00aa9e4512",
                    "fd002124b00aa9e4513",
                    "1234567890",
                    "1234567892",
                    "test_lla_001"
                ]
                
                # Create sensor data for each LLA
                for i, lla in enumerate(test_llas):
                    sensors_dict[lla] = {
                        "temperature": 20.0 + i * 0.5,
                        "humidity": 60.0 + i,
                        "solar_intensity": 800.0 + i * 10,
                        "battery": 3500 + i * 50
                    }
                
                payload = {
                    "type": "Last_Package",
                    "owner": "Icore_Pi",
                    "mac_address": "2ccf6730ab5f",
                    "sensors": sensors_dict
                }
                
                await ws.send(json.dumps(payload))
                response = await asyncio.wait_for(ws.recv(), timeout=TIMEOUT * 2)  # Longer timeout for batch
                data = json.loads(response)
                
                if data.get("type") == "Last_Package":
                    updated_llas = data.get("updated_llas", [])
                    errors = data.get("errors")
                    sensor_count = len(test_llas)
                    updated_count = len(updated_llas)
                    error_count = len(errors) if errors else 0
                    
                    # Batch should update multiple sensors efficiently
                    if updated_count > 0:
                        msg = (f"Batch updated {updated_count}/{sensor_count} sensors | "
                              f"Errors: {error_count}")
                        return TestResult(
                            "Last Package - Batch Multiple Sensors",
                            TestStatus.PASS,
                            msg,
                            time.time() - start
                        )
                    else:
                        return TestResult(
                            "Last Package - Batch Multiple Sensors",
                            TestStatus.FAIL,
                            f"No sensors updated in batch (errors: {error_count})",
                            time.time() - start,
                            str(errors) if errors else "Unknown error"
                        )
                else:
                    return TestResult(
                        "Last Package - Batch Multiple Sensors",
                        TestStatus.FAIL,
                        "Invalid response format",
                        time.time() - start,
                        str(data)
                    )
        except Exception as e:
            return TestResult(
                "Last Package - Batch Multiple Sensors",
                TestStatus.FAIL,
                "Test failed",
                time.time() - start,
                str(e)
            )
    
    # ==================== Connection Tests ====================
    
    def test_server_connection(self) -> TestResult:
        """Test server connection."""
        start = time.time()
        if self.check_server():
            return TestResult(
                "Server Connection",
                TestStatus.PASS,
                "Server is running",
                time.time() - start
            )
        else:
            return TestResult(
                "Server Connection",
                TestStatus.FAIL,
                "Server is not running",
                time.time() - start,
                "Cannot connect to server"
            )
    
    async def test_websocket_connection(self) -> TestResult:
        """Test WebSocket connection."""
        start = time.time()
        try:
            async with websockets.connect(WS_URI) as ws:
                return TestResult(
                    "WebSocket Connection",
                    TestStatus.PASS,
                    "WebSocket connection successful",
                    time.time() - start
                )
        except Exception as e:
            return TestResult(
                "WebSocket Connection",
                TestStatus.FAIL,
                "WebSocket connection failed",
                time.time() - start,
                str(e)
            )
    
    # ==================== Test Execution ====================
    
    async def run_all_tests(self):
        """Run all tests."""
        header = "="*70
        title = "APISYNC COMPREHENSIVE TEST SUITE"
        base_url_line = f"Base URL: {BASE_URL}"
        ws_uri_line = f"WebSocket URI: {WS_URI}"
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        
        print("\n" + header)
        print(title)
        print(header)
        print(base_url_line)
        print(ws_uri_line)
        print(f"Test Started: {timestamp}")
        print(header + "\n")
        
        # Store header in output
        self.output_lines.extend([
            "", header, title, header, base_url_line, ws_uri_line,
            f"Test Started: {timestamp}", header, ""
        ])
        
        # Check server first
        server_test = self.test_server_connection()
        self.add_result(server_test.name, server_test.status, server_test.message, server_test.duration, server_test.error)
        
        if server_test.status == TestStatus.FAIL:
            error_msg = "\n❌ Server is not running. Please start the server first."
            print(error_msg)
            self.output_lines.append(error_msg)
            self.export_results()
            return
        
        # WebSocket Connection Test
        ws_test = await self.test_websocket_connection()
        self.add_result(ws_test.name, ws_test.status, ws_test.message, ws_test.duration, ws_test.error)
        
        section_header = "="*70
        ws_section = "WEBSOCKET PING TESTS"
        
        print("\n" + section_header)
        print(ws_section)
        print(section_header)
        self.output_lines.extend(["", section_header, ws_section, section_header])
        
        # WebSocket Ping Tests
        await self.run_test(self.test_websocket_ping_normal())
        await self.run_test(self.test_websocket_ping_missing_fields())
        await self.run_test(self.test_websocket_ping_invalid_json())
        await self.run_test(self.test_websocket_ping_empty_payload())
        await self.run_test(self.test_websocket_ping_wrong_type())
        
        # Rapid WebSocket Ping Tests - Same LLA
        print("\n" + "-"*70)
        print("Rapid WebSocket Ping Tests (Same LLA)")
        print("-"*70)
        self.output_lines.extend(["", "-"*70, "Rapid WebSocket Ping Tests (Same LLA)", "-"*70])
        await self.run_test(self.test_websocket_ping_rapid_same_lla(5))
        await self.run_test(self.test_websocket_ping_rapid_same_lla(10))
        await self.run_test(self.test_websocket_ping_rapid_same_lla(15))
        await self.run_test(self.test_websocket_ping_rapid_same_lla(20))
        
        # Rapid WebSocket Ping Tests - Different LLA
        print("\n" + "-"*70)
        print("Rapid WebSocket Ping Tests (Different LLA)")
        print("-"*70)
        self.output_lines.extend(["", "-"*70, "Rapid WebSocket Ping Tests (Different LLA)", "-"*70])
        await self.run_test(self.test_websocket_ping_rapid_different_lla(5))
        await self.run_test(self.test_websocket_ping_rapid_different_lla(10))
        await self.run_test(self.test_websocket_ping_rapid_different_lla(15))
        await self.run_test(self.test_websocket_ping_rapid_different_lla(20))
        
        metadata_section = "METADATA UPDATE TESTS"
        print("\n" + section_header)
        print(metadata_section)
        print(section_header)
        self.output_lines.extend(["", section_header, metadata_section, section_header])
        
        # Metadata Update Tests
        self.run_test_sync(self.test_metadata_update_normal())
        self.run_test_sync(self.test_metadata_update_missing_fields())
        self.run_test_sync(self.test_metadata_update_empty_updates())
        self.run_test_sync(self.test_metadata_update_invalid_sensor())
        self.run_test_sync(self.test_metadata_update_invalid_json())
        
        # Rapid Metadata Update Tests - Same LLA
        print("\n" + "-"*70)
        print("Rapid Metadata Update Tests (Same LLA)")
        print("-"*70)
        self.output_lines.extend(["", "-"*70, "Rapid Metadata Update Tests (Same LLA)", "-"*70])
        self.run_test_sync(self.test_metadata_update_rapid_same_lla(5))
        self.run_test_sync(self.test_metadata_update_rapid_same_lla(10))
        self.run_test_sync(self.test_metadata_update_rapid_same_lla(15))
        self.run_test_sync(self.test_metadata_update_rapid_same_lla(20))
        
        # Rapid Metadata Update Tests - Different LLA
        # Note: These tests validate async behavior by sending rapid sequential requests
        # to different sensors, demonstrating non-blocking async Firestore operations
        print("\n" + "-"*70)
        print("Rapid Metadata Update Tests (Different LLA - Async Batch Behavior)")
        print("-"*70)
        self.output_lines.extend(["", "-"*70, "Rapid Metadata Update Tests (Different LLA - Async Batch Behavior)", "-"*70])
        self.run_test_sync(self.test_metadata_update_rapid_different_lla(5))
        self.run_test_sync(self.test_metadata_update_rapid_different_lla(10))
        self.run_test_sync(self.test_metadata_update_rapid_different_lla(15))
        self.run_test_sync(self.test_metadata_update_rapid_different_lla(20))
        
        last_package_section = "LAST PACKAGE TESTS"
        print("\n" + section_header)
        print(last_package_section)
        print(section_header)
        self.output_lines.extend(["", section_header, last_package_section, section_header])
        
        # Last Package Tests
        await self.run_test(self.test_last_package_normal_dict())
        await self.run_test(self.test_last_package_normal_array())
        await self.run_test(self.test_last_package_low_battery())
        await self.run_test(self.test_last_package_missing_sensors())
        await self.run_test(self.test_last_package_empty_sensors())
        await self.run_test(self.test_last_package_invalid_sensor_id())
        await self.run_test(self.test_last_package_malformed_array())
        
        # Last Package Batch Test - Multiple Sensors
        print("\n" + "-"*70)
        print("Last Package Batch Tests (Multiple Sensors)")
        print("-"*70)
        self.output_lines.extend(["", "-"*70, "Last Package Batch Tests (Multiple Sensors)", "-"*70])
        await self.run_test(self.test_last_package_batch_multiple_sensors())
        
        # Print summary
        self.print_summary()
    
    async def run_test(self, test_coro):
        """Run an async test."""
        result = await test_coro
        self.add_result(result.name, result.status, result.message, result.duration, result.error)
    
    def run_test_sync(self, result: TestResult):
        """Run a sync test."""
        self.add_result(result.name, result.status, result.message, result.duration, result.error)
    
    def print_summary(self):
        """Print test summary."""
        total_duration = time.time() - self.start_time
        passed = sum(1 for r in self.results if r.status == TestStatus.PASS)
        failed = sum(1 for r in self.results if r.status == TestStatus.FAIL)
        skipped = sum(1 for r in self.results if r.status == TestStatus.SKIP)
        total = len(self.results)
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        
        summary_header = "="*70
        summary_title = "TEST SUMMARY"
        
        print("\n" + summary_header)
        print(summary_title)
        print(summary_header)
        print(f"Total Tests: {total}")
        print(f"✅ Passed: {passed}")
        print(f"❌ Failed: {failed}")
        print(f"⏭️  Skipped: {skipped}")
        print(f"⏱️  Total Duration: {total_duration:.2f}s")
        print(f"Test Completed: {timestamp}")
        print(summary_header)
        
        # Store summary in output
        self.output_lines.extend([
            "", summary_header, summary_title, summary_header,
            f"Total Tests: {total}",
            f"✅ Passed: {passed}",
            f"❌ Failed: {failed}",
            f"⏭️  Skipped: {skipped}",
            f"⏱️  Total Duration: {total_duration:.2f}s",
            f"Test Completed: {timestamp}",
            summary_header
        ])
        
        if failed > 0:
            failed_header = "\n❌ FAILED TESTS:"
            print(failed_header)
            self.output_lines.append(failed_header)
            for result in self.results:
                if result.status == TestStatus.FAIL:
                    fail_line = f"   - {result.name}: {result.message}"
                    print(fail_line)
                    self.output_lines.append(fail_line)
                    if result.error:
                        error_line = f"     Error: {result.error[:100]}"
                        print(error_line)
                        self.output_lines.append(error_line)
        
        if failed == 0:
            success_msg = "\n🎉 ALL TESTS PASSED! 🎉"
            print(success_msg)
            self.output_lines.append(success_msg)
        else:
            fail_msg = f"\n⚠️  {failed} TEST(S) FAILED"
            print(fail_msg)
            self.output_lines.append(fail_msg)
        
        # Performance Summary
        rapid_tests = [r for r in self.results if "Rapid" in r.name and r.metrics]
        if rapid_tests:
            print("\n" + "="*70)
            print("PERFORMANCE SUMMARY")
            print("="*70)
            self.output_lines.extend(["", "="*70, "PERFORMANCE SUMMARY", "="*70])
            
            # Group by test type
            ws_ping_tests = [r for r in rapid_tests if "WebSocket Ping" in r.name]
            metadata_tests = [r for r in rapid_tests if "Metadata Update" in r.name]
            
            if ws_ping_tests:
                print("\nWebSocket Ping Performance:")
                self.output_lines.append("\nWebSocket Ping Performance:")
                for test in ws_ping_tests:
                    m = test.metrics
                    print(f"  {test.name}:")
                    print(f"    - Avg Response: {m.get('avg_response', 0):.3f}s")
                    print(f"    - Min Response: {m.get('min_response', 0):.3f}s")
                    print(f"    - Max Response: {m.get('max_response', 0):.3f}s")
                    print(f"    - Throughput: {m.get('requests_per_sec', 0):.2f} req/s")
                    self.output_lines.extend([
                        f"  {test.name}:",
                        f"    - Avg Response: {m.get('avg_response', 0):.3f}s",
                        f"    - Min Response: {m.get('min_response', 0):.3f}s",
                        f"    - Max Response: {m.get('max_response', 0):.3f}s",
                        f"    - Throughput: {m.get('requests_per_sec', 0):.2f} req/s"
                    ])
            
            if metadata_tests:
                print("\nMetadata Update Performance:")
                self.output_lines.append("\nMetadata Update Performance:")
                for test in metadata_tests:
                    m = test.metrics
                    print(f"  {test.name}:")
                    print(f"    - Avg Response: {m.get('avg_response', 0):.3f}s")
                    print(f"    - Min Response: {m.get('min_response', 0):.3f}s")
                    print(f"    - Max Response: {m.get('max_response', 0):.3f}s")
                    print(f"    - Throughput: {m.get('requests_per_sec', 0):.2f} req/s")
                    self.output_lines.extend([
                        f"  {test.name}:",
                        f"    - Avg Response: {m.get('avg_response', 0):.3f}s",
                        f"    - Min Response: {m.get('min_response', 0):.3f}s",
                        f"    - Max Response: {m.get('max_response', 0):.3f}s",
                        f"    - Throughput: {m.get('requests_per_sec', 0):.2f} req/s"
                    ])
            
            print("="*70)
            self.output_lines.append("="*70)
        
        print(summary_header + "\n")
        self.output_lines.append(summary_header + "\n")
        
        # Export results
        self.export_results()
        
        # Return exit code
        sys.exit(0 if failed == 0 else 1)
    
    def export_results(self):
        """Export test results to CSV and/or text files."""
        if self.no_export:
            return  # Skip export if --no-export flag is set
        
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        
        # Export CSV (always export unless --no-export)
        csv_path = self.export_csv
        if csv_path is None:
            # Default CSV export
            csv_path = Path("test_script/logs") / f"test_results_{timestamp}.csv"
        else:
            csv_path = Path(csv_path)
            if csv_path.suffix != '.csv':
                csv_path = csv_path.parent / f"{csv_path.stem}_{timestamp}.csv"
        
        try:
            csv_path.parent.mkdir(parents=True, exist_ok=True)
            with open(csv_path, 'w', newline='', encoding='utf-8') as f:
                writer = csv.writer(f)
                # Write header
                writer.writerow(['Test Name', 'Status', 'Message', 'Duration (s)', 'Error', 
                               'Avg Response (s)', 'Min Response (s)', 'Max Response (s)', 'Requests/sec'])
                # Write results
                for result in self.results:
                    metrics = result.metrics or {}
                    writer.writerow([
                        result.name,
                        result.status.value,
                        result.message,
                        f"{result.duration:.3f}",
                        result.error if result.error else "",
                        f"{metrics.get('avg_response', 0):.3f}" if metrics else "",
                        f"{metrics.get('min_response', 0):.3f}" if metrics else "",
                        f"{metrics.get('max_response', 0):.3f}" if metrics else "",
                        f"{metrics.get('requests_per_sec', 0):.2f}" if metrics else ""
                    ])
            print(f"📄 CSV exported to: {csv_path}")
        except Exception as e:
            print(f"❌ Failed to export CSV: {e}")
        
        # Export text file
        txt_path = self.export_txt
        if txt_path is None:
            # Default text export
            txt_path = Path("test_script/logs") / f"test_results_{timestamp}.txt"
        else:
            txt_path = Path(txt_path)
            if not txt_path.suffix or txt_path.suffix != '.txt':
                txt_path = txt_path.parent / f"{txt_path.stem}_{timestamp}.txt"
        
        try:
            txt_path.parent.mkdir(parents=True, exist_ok=True)
            with open(txt_path, 'w', encoding='utf-8') as f:
                f.write('\n'.join(self.output_lines))
            print(f"📄 Text log exported to: {txt_path}")
        except Exception as e:
            print(f"❌ Failed to export text log: {e}")


async def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="Comprehensive test runner for ApiSync endpoints",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Run tests with default export locations
  python test_script/test_runner.py
  
  # Export to specific CSV file
  python test_script/test_runner.py --csv results.csv
  
  # Export to specific text file
  python test_script/test_runner.py --txt results.txt
  
  # Export to both CSV and text files
  python test_script/test_runner.py --csv results.csv --txt results.txt
  
  # Disable exports (no export flags)
  python test_script/test_runner.py --no-export
        """
    )
    parser.add_argument(
        '--csv',
        type=str,
        default=None,
        help='Path to export CSV file (default: test_script/logs/test_results_TIMESTAMP.csv)'
    )
    parser.add_argument(
        '--txt',
        type=str,
        default=None,
        help='Path to export text file (default: test_script/logs/test_results_TIMESTAMP.txt)'
    )
    parser.add_argument(
        '--no-export',
        action='store_true',
        help='Disable automatic export (overrides --csv and --txt)'
    )
    
    args = parser.parse_args()
    
    runner = TestRunner(
        export_csv=args.csv,
        export_txt=args.txt,
        no_export=args.no_export
    )
    await runner.run_all_tests()


if __name__ == "__main__":
    asyncio.run(main())

