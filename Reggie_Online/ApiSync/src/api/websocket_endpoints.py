"""
WebSocket endpoints for the ApiSync application.
"""
from fastapi import WebSocket, WebSocketDisconnect
from datetime import datetime
import json
import logging
import time
from typing import List
# Uses Firestore for sensor validation and registration/updates
from .firestore_repository import validate_sensor_lla, register_sensor, update_sensor_last_seen, update_sensor_last_package

# Set up logger
logger = logging.getLogger(__name__)


class ConnectionManager:
    """Manages WebSocket connections and broadcasts messages to all clients."""
    
    def __init__(self):
        self.active_connections: List[WebSocket] = []
    
    async def connect(self, websocket: WebSocket):
        """Accept and add a new WebSocket connection."""
        start_time = time.time()
        await websocket.accept()
        self.active_connections.append(websocket)
        duration = time.time() - start_time
        logger.info(
            f"[WEBSOCKET_CONNECT] Client connected | "
            f"Total connections: {len(self.active_connections)} | "
            f"Duration: {duration:.3f}s"
        )
    
    def disconnect(self, websocket: WebSocket):
        """Remove a WebSocket connection."""
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
        logger.info(
            f"[WEBSOCKET_DISCONNECT] Client disconnected | "
            f"Total connections: {len(self.active_connections)}"
        )
    
    async def broadcast(self, message: dict):
        """Broadcast a message to all connected clients."""
        start_time = time.time()
        disconnected = []
        total_clients = len(self.active_connections)
        
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception as e:
                logger.error(
                    f"[BROADCAST_ERROR] Failed to send message to client | "
                    f"Error: {str(e)}"
                )
                disconnected.append(connection)
        
        # Remove disconnected clients
        for connection in disconnected:
            self.disconnect(connection)
        
        duration = time.time() - start_time
        logger.info(
            f"[BROADCAST] Message broadcasted | "
            f"Clients: {total_clients} | "
            f"Failed: {len(disconnected)} | "
            f"Duration: {duration:.3f}s"
        )


# Create a global connection manager instance
manager = ConnectionManager()


async def websocket_ping(websocket: WebSocket):
    """WebSocket endpoint for ping messages."""
    logger.info(f"[ENDPOINT] WebSocket /ws/ping | Connection established")
    operation_start = time.time()
    logger.info(f"[WEBSOCKET_PING] Connection established")
    await manager.connect(websocket)
    
    try:
        while True:
            payload_start = time.time()
            
            # Receive JSON payload from client
            data = await websocket.receive_text()
            receive_time = time.time() - payload_start
            
            try:
                payload = json.loads(data)
            except json.JSONDecodeError as e:
                logger.error(
                    f"[WEBSOCKET_PING] Invalid JSON received | "
                    f"Error: {str(e)} | "
                    f"Data: {data[:100]}"
                )
                error_response = {
                    "received": False,
                    "timestamp": datetime.now().replace(microsecond=0).isoformat(),
                    "error": "Invalid JSON format"
                }
                await manager.broadcast(error_response)
                continue
            
            # Extract payload fields (support both 'owner' and 'hostname' for backward compatibility)
            owner = payload.get("owner") or payload.get("hostname")
            mac_address = payload.get("mac_address")
            LLA = payload.get("LLA")
            payload_type = payload.get("type")
            
            logger.info(
                f"[WEBSOCKET_PING] Payload received | "
                f"Type: {payload_type} | "
                f"Owner: {owner} | "
                f"MAC: {mac_address} | "
                f"LLA: {LLA} | "
                f"Receive time: {receive_time:.3f}s"
            )
            
            # Validate LLA if all required fields are present
            validation_start = time.time()
            validation = {
                "is_valid": False,
                "message": "Validation skipped - missing required fields",
                "error": None
            }
            
            if owner and mac_address and LLA:
                # Perform validation
                logger.debug(
                    f"[WEBSOCKET_PING] Starting validation | "
                    f"Owner: {owner}, MAC: {mac_address}, LLA: {LLA}"
                )
                validation = await validate_sensor_lla(owner, mac_address, LLA)
                validation_duration = time.time() - validation_start
                
                # Log as WARNING if invalid, INFO if valid
                if validation['is_valid']:
                    logger.info(
                        f"[WEBSOCKET_PING] Validation completed | "
                        f"Result: VALID | "
                        f"Message: {validation['message']} | "
                        f"Duration: {validation_duration:.3f}s"
                    )
                else:
                    logger.warning(
                        f"[WEBSOCKET_PING] Validation completed | "
                        f"Result: INVALID | "
                        f"Message: {validation['message']} | "
                        f"Duration: {validation_duration:.3f}s"
                    )
                
                # Auto-register or update sensor if type is "Ping"
                # This implements the smart behavior: register missing sensors, update existing ones
                if payload_type and payload_type.lower() == "ping":
                    registration_start = time.time()
                    
                    if validation['is_valid']:
                        # Sensor exists and is valid - update last_seen timestamp
                        update_result = await update_sensor_last_seen(owner, mac_address, LLA)
                        registration_duration = time.time() - registration_start
                        
                        if update_result.get('success'):
                            logger.info(
                                f"[WEBSOCKET_PING] Sensor last_seen updated | "
                                f"LLA: {LLA} | "
                                f"Duration: {registration_duration:.3f}s"
                            )
                        else:
                            logger.warning(
                                f"[WEBSOCKET_PING] Failed to update sensor | "
                                f"LLA: {LLA} | "
                                f"Error: {update_result.get('message')} | "
                                f"Duration: {registration_duration:.3f}s"
                            )
                    elif validation.get('message') == "LLA not found in metadata":
                        # Sensor doesn't exist - register it
                        register_result = await register_sensor(owner, mac_address, LLA)
                        registration_duration = time.time() - registration_start
                        
                        if register_result.get('success'):
                            logger.info(
                                f"[WEBSOCKET_PING] New sensor registered | "
                                f"LLA: {LLA} | "
                                f"Duration: {registration_duration:.3f}s"
                            )
                            # Update validation to reflect successful auto-registration
                            # Mark as valid so frontend shows blink animation
                            validation['is_valid'] = True
                            validation['message'] = "Sensor added"
                            validation['error'] = None
                        else:
                            logger.warning(
                                f"[WEBSOCKET_PING] Failed to register sensor | "
                                f"LLA: {LLA} | "
                                f"Error: {register_result.get('message')} | "
                                f"Duration: {registration_duration:.3f}s"
                            )
                    # For other validation errors (owner mismatch, MAC mismatch, etc.), don't auto-register
            else:
                validation = {
                    "is_valid": False,
                    "message": "Validation skipped - missing required fields (owner, mac_address, or LLA)",
                    "error": None
                }
                logger.warning(
                    f"[WEBSOCKET_PING] Validation skipped | "
                    f"Missing fields - Owner: {owner}, MAC: {mac_address}, LLA: {LLA}"
                )
            
            # Handle Last_Package type messages
            if payload_type and payload_type.lower() == "last_package":
                package_start = time.time()
                # Extract owner and mac_address for auto-registration (support both 'owner' and 'hostname')
                package_owner = payload.get("owner") or payload.get("hostname")
                package_mac_address = payload.get("mac_address")
                sensors_data = payload.get("sensors", {})
                updated_llas = []
                registered_llas = []
                errors = []
                
                # Handle both array and dictionary formats
                if isinstance(sensors_data, list):
                    # Convert array to dictionary keyed by LLA
                    sensors_dict = {}
                    for sensor in sensors_data:
                        if isinstance(sensor, dict) and "LLA" in sensor:
                            lla_key = sensor.pop("LLA")
                            sensors_dict[lla_key] = sensor
                    sensors_data = sensors_dict
                elif not isinstance(sensors_data, dict):
                    sensors_data = {}
                
                # Process all sensors in a batch operation
                # Filter out invalid package data first
                valid_sensors_data = {}
                for lla_key, package_data in sensors_data.items():
                    if isinstance(package_data, dict):
                        valid_sensors_data[lla_key] = package_data
                    else:
                        errors.append(f"Invalid package data for LLA {lla_key}")
                
                # Use batch update if we have valid sensors
                updated_sensors = {}  # Store LLA -> package_data mapping
                if valid_sensors_data:
                    # Pass owner and mac_address for auto-registration
                    batch_result = await update_sensor_last_package(
                        valid_sensors_data,
                        hostname=package_owner,  # Repository function still uses 'hostname' parameter name
                        mac_address=package_mac_address
                    )
                    
                    # Always process successful operations, even if some failed
                    batch_updated_llas = batch_result.get('updated_llas', [])
                    batch_registered_llas = batch_result.get('registered_llas') or []
                    
                    updated_llas.extend(batch_updated_llas)
                    registered_llas.extend(batch_registered_llas)
                    
                    # Store package data for successfully processed sensors (updated + registered)
                    all_processed_llas = batch_updated_llas + batch_registered_llas
                    for lla_key in all_processed_llas:
                        if lla_key in valid_sensors_data:
                            updated_sensors[lla_key] = valid_sensors_data[lla_key]
                    
                    # Handle failed sensors from batch operation
                    failed_llas = batch_result.get('failed_llas') or {}
                    if failed_llas:
                        for lla_key, error_msg in failed_llas.items():
                            errors.append(f"Failed to update {lla_key}: {error_msg}")
                            logger.warning(
                                f"[WEBSOCKET_LAST_PACKAGE] Failed to process sensor | "
                                f"LLA: {lla_key} | "
                                f"Error: {error_msg}"
                            )
                    
                    # Log the result
                    if batch_result.get('success'):
                        logger.info(
                            f"[WEBSOCKET_LAST_PACKAGE] Batch operation completed | "
                            f"Updated: {len(batch_updated_llas)} sensors | "
                            f"Registered: {len(batch_registered_llas)} sensors | "
                            f"Failed: {len(failed_llas)} sensors"
                        )
                    else:
                        # Some operations failed, but log what succeeded
                        logger.warning(
                            f"[WEBSOCKET_LAST_PACKAGE] Batch operation partially completed | "
                            f"Updated: {len(batch_updated_llas)} sensors | "
                            f"Registered: {len(batch_registered_llas)} sensors | "
                            f"Failed: {len(failed_llas)} sensors | "
                            f"Message: {batch_result.get('message', 'Unknown error')}"
                        )
                        # If no operations succeeded at all, add general error
                        if len(all_processed_llas) == 0:
                            error_msg = batch_result.get('message', 'Batch update failed')
                            errors.append(error_msg)
                
                package_duration = time.time() - package_start
                logger.info(
                    f"[WEBSOCKET_LAST_PACKAGE] Package processed | "
                    f"Updated: {len(updated_llas)} sensors | "
                    f"Registered: {len(registered_llas)} sensors | "
                    f"Errors: {len(errors)} | "
                    f"Duration: {package_duration:.3f}s"
                )
                
                # Create Last_Package response with package data for each processed sensor
                response = {
                    "received": True,
                    "timestamp": datetime.now().replace(microsecond=0).isoformat(),
                    "type": "Last_Package",
                    "owner": package_owner,  # Include owner for frontend metadata access
                    "hostname": package_owner,  # Include for backward compatibility
                    "mac_address": package_mac_address,  # Include mac_address for frontend metadata access
                    "updated_llas": updated_llas,
                    "registered_llas": registered_llas if registered_llas else None,
                    "sensors": updated_sensors,  # Include package data for each sensor (updated + registered)
                    "errors": errors if errors else None
                }
                
                # Broadcast to all connected clients (including frontend)
                broadcast_start = time.time()
                await manager.broadcast(response)
                broadcast_duration = time.time() - broadcast_start
                
                total_duration = time.time() - payload_start
                logger.info(
                    f"[WEBSOCKET_LAST_PACKAGE] Payload processed | "
                    f"Total duration: {total_duration:.3f}s | "
                    f"Broadcast: {broadcast_duration:.3f}s"
                )
                continue
            
            # Create response with the payload information and validation (for Ping type)
            response = {
                "received": True,
                "timestamp": datetime.now().replace(microsecond=0).isoformat(),
                "payload": {
                    "owner": owner,
                    "hostname": owner,  # Include for backward compatibility
                    "mac_address": mac_address,
                    "type": payload_type,
                    "LLA": LLA,
                    "validation": validation
                }
            }
            
            # Broadcast to all connected clients (including frontend)
            broadcast_start = time.time()
            await manager.broadcast(response)
            broadcast_duration = time.time() - broadcast_start
            
            total_duration = time.time() - payload_start
            logger.info(
                f"[WEBSOCKET_PING] Payload processed | "
                f"Total duration: {total_duration:.3f}s | "
                f"Broadcast: {broadcast_duration:.3f}s"
            )
            
    except WebSocketDisconnect:
        connection_duration = time.time() - operation_start
        logger.info(
            f"[WEBSOCKET_PING] Client disconnected normally | "
            f"Connection duration: {connection_duration:.3f}s"
        )
        manager.disconnect(websocket)
    except Exception as e:
        connection_duration = time.time() - operation_start
        logger.error(
            f"[WEBSOCKET_PING] Error handling WebSocket | "
            f"Error: {str(e)} | "
            f"Connection duration: {connection_duration:.3f}s",
            exc_info=True
        )
        manager.disconnect(websocket)
        await websocket.close()

