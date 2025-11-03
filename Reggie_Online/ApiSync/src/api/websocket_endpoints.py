"""
WebSocket endpoints for the ApiSync application.
"""
from fastapi import WebSocket, WebSocketDisconnect
from datetime import datetime
import json
import logging
import time
from typing import List
from .bigquery_endpoints import validate_sensor_lla

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
            
            # Extract payload fields
            hostname = payload.get("hostname")
            mac_address = payload.get("mac_address")
            LLA = payload.get("LLA")
            payload_type = payload.get("type")
            
            logger.info(
                f"[WEBSOCKET_PING] Payload received | "
                f"Type: {payload_type} | "
                f"Hostname: {hostname} | "
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
            
            if hostname and mac_address and LLA:
                # Perform validation
                logger.debug(
                    f"[WEBSOCKET_PING] Starting validation | "
                    f"Hostname: {hostname}, MAC: {mac_address}, LLA: {LLA}"
                )
                validation = await validate_sensor_lla(hostname, mac_address, LLA)
                validation_duration = time.time() - validation_start
                logger.info(
                    f"[WEBSOCKET_PING] Validation completed | "
                    f"Result: {'VALID' if validation['is_valid'] else 'INVALID'} | "
                    f"Message: {validation['message']} | "
                    f"Duration: {validation_duration:.3f}s"
                )
            else:
                validation = {
                    "is_valid": False,
                    "message": "Validation skipped - missing required fields (hostname, mac_address, or LLA)",
                    "error": None
                }
                logger.warning(
                    f"[WEBSOCKET_PING] Validation skipped | "
                    f"Missing fields - Hostname: {hostname}, MAC: {mac_address}, LLA: {LLA}"
                )
            
            # Create response with the payload information and validation
            response = {
                "received": True,
                "timestamp": datetime.now().replace(microsecond=0).isoformat(),
                "payload": {
                    "hostname": hostname,
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

