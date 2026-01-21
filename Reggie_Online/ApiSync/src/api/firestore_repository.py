"""
Firestore repository for sensor metadata operations.
Provides validation and metadata retrieval functions that maintain
Firestore metadata operations with standardized response formats.
"""
import os
import sys
import logging
import time
from pathlib import Path
from typing import Optional, Dict, Any, List
from google.cloud.firestore import AsyncClient, SERVER_TIMESTAMP
from google.cloud.exceptions import NotFound

# Add project root to path to import auth module
project_root = Path(__file__).parent.parent.parent
if str(project_root) not in sys.path:
    sys.path.insert(0, str(project_root))

from auth.firestore_config import get_client
from .firestore_batch import FirestoreBatchWriter

# Set up logger
logger = logging.getLogger(__name__)

# Collection name for sensors
SENSORS_COLLECTION = "sensors"


def _create_base_sensor_document(owner: str, mac: str, lla: str) -> Dict[str, Any]:
    """
    Create a base sensor document with minimal required fields.
    This is used when a new sensor is registered via Ping message.
    
    Args:
        owner: Owner/hostname (e.g., "f4d_test")
        mac: MAC address (e.g., "aaaaaaaaaaaa")
        lla: LLA value (document ID)
    
    Returns:
        dict: Base document structure with minimal defaults
    """
    return {
        "owner": owner,
        "mac": mac,
        "lla": lla,
        # Experiment fields (flat, not nested)
        "exp_id": "",
        "exp_name": "",
        "exp_location": None,
        "label": "",
        "label_options": [],
        "location": None,
        "rfid": "",
        "coordinates": {
            "x": None,
            "y": None,
            "z": None
        },
        "frequency": None,
        # Sensor fields (flat, not nested)
        "is_active": True,
        "is_valid": True,
        "active_exp": False,  # Default to False until explicitly set
        # Alerts (nested)
        "alerts": {
            "alerted": False,
            "battery_percentage": None,
            "email_sent": False
        },
        # Last package data (nested, extendable object)
        "last_package": {},
        # Timestamps - use SERVER_TIMESTAMP for consistency
        "last_seen": SERVER_TIMESTAMP,
        "exp_started_at": None,
        "exp_ended_at": None,
        "created_at": SERVER_TIMESTAMP,
        "updated_at": SERVER_TIMESTAMP
    }


def _map_firestore_to_api_format(doc_data: Dict[str, Any], lla: str) -> Dict[str, Any]:
    """
    Map Firestore document structure to standardized API format.
    This ensures compatibility with the frontend.
    
    Args:
        doc_data: Firestore document data
        lla: LLA value (document ID)
    
    Returns:
        dict: Mapped data in API format
    """
    # Extract nested fields (coordinates and alerts are nested)
    coordinates = doc_data.get("coordinates") or {}
    alerts = doc_data.get("alerts", {})
    
    # Map to API format (matching the expected frontend structure)
    # Note: Exp_ID in Firestore may be a string (e.g., "EXP_001") while the API may expect integers.
    # The frontend should handle both formats. If conversion is needed, it can be done here.
    exp_id = doc_data.get("exp_id", "")
    # Try to convert to int if it's numeric, otherwise keep as string
    try:
        if isinstance(exp_id, str) and exp_id.isdigit():
            exp_id = int(exp_id)
    except (ValueError, AttributeError):
        pass  # Keep as string if conversion fails
    
    mapped = {
        "Owner": doc_data.get("owner", ""),
        "Mac_Address": doc_data.get("mac", ""),
        "LLA": lla,  # Use the document ID (LLA)
        "Exp_ID": exp_id,
        "Exp_Name": doc_data.get("exp_name", ""),
        "Exp_Location": doc_data.get("exp_location", ""),
        "Active_Exp": doc_data.get("active_exp", False),
        "Label": doc_data.get("label", ""),
        "Label_Options": doc_data.get("label_options", []),
        "Location": doc_data.get("location", ""),
        "RFID": doc_data.get("rfid", ""),
        "Coordinates_X": coordinates.get("x") if isinstance(coordinates, dict) and coordinates.get("x") is not None else 0,
        "Coordinates_Y": coordinates.get("y") if isinstance(coordinates, dict) and coordinates.get("y") is not None else 0,
        "Coordinates_Z": coordinates.get("z") if isinstance(coordinates, dict) and coordinates.get("z") is not None else 0,
        "Frequency": doc_data.get("frequency", None),  # May not exist in Firestore
        "Is_Active": doc_data.get("is_active", False),
        "Is_Valid": doc_data.get("is_valid", False),
        "Alerted": alerts.get("alerted", False),
        "Battery_Percentage": alerts.get("battery_percentage", None),
        "Email_Sent": alerts.get("email_sent", False),
    }
    
    # Handle Timestamp fields - convert to ISO format strings
    # Firestore Timestamps are converted to datetime objects by the client
    from datetime import datetime
    
    last_seen = doc_data.get("last_seen")
    if last_seen:
        if isinstance(last_seen, datetime):
            mapped["Last_Seen"] = last_seen.isoformat()
        else:
            mapped["Last_Seen"] = str(last_seen)
    
    exp_started_at = doc_data.get("exp_started_at")
    if exp_started_at:
        if isinstance(exp_started_at, datetime):
            mapped["Exp_Started_At"] = exp_started_at.isoformat()
        else:
            mapped["Exp_Started_At"] = str(exp_started_at)
    
    exp_ended_at = doc_data.get("exp_ended_at")
    if exp_ended_at:
        if isinstance(exp_ended_at, datetime):
            mapped["Exp_Ended_At"] = exp_ended_at.isoformat()
        else:
            mapped["Exp_Ended_At"] = str(exp_ended_at)
    
    created_at = doc_data.get("created_at")
    if created_at:
        if isinstance(created_at, datetime):
            mapped["Created_At"] = created_at.isoformat()
        else:
            mapped["Created_At"] = str(created_at)
    
    updated_at = doc_data.get("updated_at")
    if updated_at:
        if isinstance(updated_at, datetime):
            mapped["Updated_At"] = updated_at.isoformat()
        else:
            mapped["Updated_At"] = str(updated_at)
    
    return mapped


async def validate_sensor_lla(hostname: str, mac_address: str, lla: str) -> Dict[str, Any]:
    """
    Validate if LLA exists in Firestore and matches hostname and mac_address.
    
    Validation rules:
    - Document must exist in sensors/{LLA}
    - owner must match hostname
    - mac must match mac_address
    
    Args:
        hostname: Owner/hostname (e.g., "f4d_test")
        mac_address: MAC address (e.g., "aaaaaaaaaaaa")
        lla: LLA value to validate (e.g., "fd002124b00ccf7399b")
    
    Returns:
        dict: Validation result with keys:
            - is_valid (bool): True if LLA found and matches, False otherwise
            - message (str): Human-readable message
            - error (str or None): Error message if validation failed
    """
    operation_start = time.time()
    logger.info(
        f"[VALIDATE_SENSOR_LLA] Starting validation | "
        f"Hostname: {hostname} | "
        f"MAC: {mac_address} | "
        f"LLA: {lla}"
    )
    
    try:
        # Get Firestore client
        client_start = time.time()
        db = await get_client()
        client_duration = time.time() - client_start
        logger.debug(f"[VALIDATE_SENSOR_LLA] Client obtained | Duration: {client_duration:.3f}s")
        
        # Get document reference: sensors/{LLA}
        doc_ref = db.collection(SENSORS_COLLECTION).document(lla)
        
        # Fetch document
        query_start = time.time()
        doc = await doc_ref.get()
        query_duration = time.time() - query_start
        
        if not doc.exists:
            # Document doesn't exist
            total_duration = time.time() - operation_start
            logger.info(
                f"[VALIDATE_SENSOR_LLA] Validation failed - LLA not found | "
                f"Query duration: {query_duration:.3f}s | "
                f"Total duration: {total_duration:.3f}s"
            )
            return {
                "is_valid": False,
                "message": "LLA not found in metadata",
                "error": None
            }
        
        # Document exists - validate owner and mac
        doc_data = doc.to_dict()
        doc_owner = doc_data.get("owner", "")
        doc_mac = doc_data.get("mac", "")
        
        if doc_owner != hostname:
            total_duration = time.time() - operation_start
            logger.warning(
                f"[VALIDATE_SENSOR_LLA] Validation failed - owner mismatch | "
                f"Expected: {hostname} | "
                f"Found: {doc_owner} | "
                f"Query duration: {query_duration:.3f}s | "
                f"Total duration: {total_duration:.3f}s"
            )
            return {
                "is_valid": False,
                "message": f"Owner mismatch: expected '{hostname}', found '{doc_owner}'",
                "error": None
            }
        
        if doc_mac != mac_address:
            total_duration = time.time() - operation_start
            logger.warning(
                f"[VALIDATE_SENSOR_LLA] Validation failed - MAC mismatch | "
                f"Expected: {mac_address} | "
                f"Found: {doc_mac} | "
                f"Query duration: {query_duration:.3f}s | "
                f"Total duration: {total_duration:.3f}s"
            )
            return {
                "is_valid": False,
                "message": f"MAC address mismatch: expected '{mac_address}', found '{doc_mac}'",
                "error": None
            }
        
        # All validations passed
        total_duration = time.time() - operation_start
        logger.info(
            f"[VALIDATE_SENSOR_LLA] Validation successful | "
            f"Query duration: {query_duration:.3f}s | "
            f"Total duration: {total_duration:.3f}s"
        )
        return {
            "is_valid": True,
            "message": "LLA found in metadata",
            "error": None
        }
    
    except NotFound:
        # Document not found
        total_duration = time.time() - operation_start
        logger.warning(
            f"[VALIDATE_SENSOR_LLA] Document not found | "
            f"LLA: {lla} | "
            f"Duration: {total_duration:.3f}s"
        )
        return {
            "is_valid": False,
            "message": "LLA not found in metadata",
            "error": None
        }
    except Exception as e:
        error_msg = f"Firestore error: {str(e)}"
        total_duration = time.time() - operation_start
        logger.error(
            f"[VALIDATE_SENSOR_LLA] Firestore error | "
            f"Error: {error_msg} | "
            f"Duration: {total_duration:.3f}s",
            exc_info=True
        )
        return {
            "is_valid": False,
            "message": "Validation failed",
            "error": error_msg
        }


async def get_sensor_metadata(
    hostname: str,
    mac_address: str,
    lla: str
) -> Dict[str, Any]:
    """
    Get sensor metadata from Firestore for a specific LLA.
    
    Args:
        hostname: Owner/hostname (e.g., "f4d_test")
        mac_address: MAC address (e.g., "aaaaaaaaaaaa")
        lla: LLA value (document ID)
    
    Returns:
        dict: Response in standardized API format:
            - success (bool): True if successful
            - count (int): Number of records (always 1 or 0 for single LLA)
            - data (list): List of mapped metadata records
            - project, dataset, table, full_table: For backward compatibility
    
    Raises:
        NotFound: If document doesn't exist
        ValueError: If owner or mac doesn't match
    """
    operation_start = time.time()
    logger.info(
        f"[GET_SENSOR_METADATA] Starting query | "
        f"Hostname: {hostname} | "
        f"MAC: {mac_address} | "
        f"LLA: {lla}"
    )
    
    try:
        # Get Firestore client
        db = await get_client()
        
        # Get document reference: sensors/{LLA}
        doc_ref = db.collection(SENSORS_COLLECTION).document(lla)
        doc = await doc_ref.get()
        
        if not doc.exists:
            raise NotFound(f"Document not found: sensors/{lla}")
        
        doc_data = doc.to_dict()
        
        # Validate owner and mac (same as validation)
        doc_owner = doc_data.get("owner", "")
        doc_mac = doc_data.get("mac", "")
        
        if doc_owner != hostname:
            raise ValueError(f"Owner mismatch: expected '{hostname}', found '{doc_owner}'")
        
        if doc_mac != mac_address:
            raise ValueError(f"MAC address mismatch: expected '{mac_address}', found '{doc_mac}'")
        
        # Map to API format
        mapped_data = _map_firestore_to_api_format(doc_data, lla)
        
        total_duration = time.time() - operation_start
        logger.info(
            f"[GET_SENSOR_METADATA] Query completed | "
            f"Count: 1 | "
            f"Total duration: {total_duration:.3f}s"
        )
        
        # Return in standardized API format
        # Note: Firestore doesn't have project/dataset/table concepts,
        # but we include these fields for backward compatibility
        project_id = os.getenv("GCP_PROJECT_ID", "unknown")
        return {
            "success": True,
            "project": project_id,
            "dataset": hostname,  # Use hostname as dataset for compatibility
            "table": f"{mac_address}_metadata",  # Use mac_address_metadata as table name
            "full_table": f"{project_id}.{hostname}.{mac_address}_metadata",
            "count": 1,
            "data": [mapped_data]
        }
    
    except NotFound as e:
        total_duration = time.time() - operation_start
        logger.warning(
            f"[GET_SENSOR_METADATA] Document not found | "
            f"LLA: {lla} | "
            f"Duration: {total_duration:.3f}s"
        )
        raise
    except Exception as e:
        total_duration = time.time() - operation_start
        logger.error(
            f"[GET_SENSOR_METADATA] Error | "
            f"Error: {str(e)} | "
            f"Duration: {total_duration:.3f}s",
            exc_info=True
        )
        raise


async def get_all_sensors_metadata(
    owner: str,
    mac_address: str,
    exp_name: Optional[str] = None
) -> Dict[str, Any]:
    """
    Get all sensors metadata from Firestore filtered by owner and mac_address.
    
    Args:
        owner: Owner identifier (e.g., "f4d_test")
        mac_address: MAC address (e.g., "aaaaaaaaaaaa")
        exp_name: Optional experiment name for exact match filtering
    
    Returns:
        dict: Response in standardized API format:
            - success (bool): True if successful
            - count (int): Number of records found
            - data (list): List of mapped metadata records
            - project, dataset, table, full_table: For backward compatibility
    
    Raises:
        Exception: If Firestore error occurs
    """
    operation_start = time.time()
    logger.info(
        f"[GET_ALL_SENSORS_METADATA] Starting query | "
        f"Owner: {owner} | "
        f"MAC: {mac_address} | "
        f"Exp_Name: {exp_name or 'None'}"
    )
    
    try:
        # Get Firestore client
        db = await get_client()
        
        # Build query: sensors collection filtered by owner and mac
        query = db.collection(SENSORS_COLLECTION).where("owner", "==", owner).where("mac", "==", mac_address)
        
        # Add exp_name filter if provided
        if exp_name is not None:
            query = query.where("exp_name", "==", exp_name)
        
        # Execute query
        query_start = time.time()
        docs = query.stream()
        query_duration = time.time() - query_start
        
        # Convert async generator to list
        doc_list = []
        async for doc in docs:
            doc_list.append(doc)
        
        # Map documents to API format
        mapped_data_list = []
        for doc in doc_list:
            doc_data = doc.to_dict()
            lla = doc.id  # Document ID is the LLA
            mapped_data = _map_firestore_to_api_format(doc_data, lla)
            mapped_data_list.append(mapped_data)
        
        total_duration = time.time() - operation_start
        logger.info(
            f"[GET_ALL_SENSORS_METADATA] Query completed | "
            f"Count: {len(mapped_data_list)} | "
            f"Query duration: {query_duration:.3f}s | "
            f"Total duration: {total_duration:.3f}s"
        )
        
        # Return in standardized API format
        project_id = os.getenv("GCP_PROJECT_ID", "unknown")
        return {
            "success": True,
            "project": project_id,
            "dataset": owner,  # Use owner as dataset for compatibility
            "table": f"{mac_address}_metadata",  # Use mac_address_metadata as table name
            "full_table": f"{project_id}.{owner}.{mac_address}_metadata",
            "count": len(mapped_data_list),
            "data": mapped_data_list
        }
    
    except Exception as e:
        total_duration = time.time() - operation_start
        logger.error(
            f"[GET_ALL_SENSORS_METADATA] Error | "
            f"Error: {str(e)} | "
            f"Duration: {total_duration:.3f}s",
            exc_info=True
        )
        raise


async def get_experiment_names(
    owner: str,
    mac_address: str
) -> Dict[str, Any]:
    """
    Get all experiment names with statistics from Firestore filtered by owner and mac_address.
    
    Args:
        owner: Owner identifier (e.g., "f4d_test")
        mac_address: MAC address (e.g., "aaaaaaaaaaaa")
    
    Returns:
        dict: Response with experiment statistics:
            - success (bool): True if successful
            - count (int): Number of unique experiments
            - experiments (list): List of experiment objects with:
                - exp_name (str): Experiment name
                - total_sensors (int): Total number of sensors in this experiment
                - active_count (int): Number of sensors with active_exp == True
                - inactive_count (int): Number of sensors with active_exp == False
            - project, dataset, table: For backward compatibility
    
    Raises:
        Exception: If Firestore error occurs
    """
    operation_start = time.time()
    logger.info(
        f"[GET_EXPERIMENT_NAMES] Starting query | "
        f"Owner: {owner} | "
        f"MAC: {mac_address}"
    )
    
    try:
        # Get Firestore client
        db = await get_client()
        
        # Build query: sensors collection filtered by owner and mac
        query = db.collection(SENSORS_COLLECTION).where("owner", "==", owner).where("mac", "==", mac_address)
        
        # Execute query
        query_start = time.time()
        docs = query.stream()
        query_duration = time.time() - query_start
        
        # Convert async generator to list
        doc_list = []
        async for doc in docs:
            doc_list.append(doc)
        
        # Group by exp_name and collect statistics
        experiments_dict = {}
        for doc in doc_list:
            doc_data = doc.to_dict()
            exp_name = doc_data.get("exp_name", "") or ""  # Handle None/empty
            
            # Initialize experiment entry if not exists
            if exp_name not in experiments_dict:
                experiments_dict[exp_name] = {
                    "exp_name": exp_name,
                    "total_sensors": 0,
                    "active_count": 0,
                    "inactive_count": 0
                }
            
            # Update statistics
            experiments_dict[exp_name]["total_sensors"] += 1
            active_exp = doc_data.get("active_exp", False)
            if active_exp:
                experiments_dict[exp_name]["active_count"] += 1
            else:
                experiments_dict[exp_name]["inactive_count"] += 1
        
        # Convert to list
        experiments_list = list(experiments_dict.values())
        
        total_duration = time.time() - operation_start
        logger.info(
            f"[GET_EXPERIMENT_NAMES] Query completed | "
            f"Unique experiments: {len(experiments_list)} | "
            f"Query duration: {query_duration:.3f}s | "
            f"Total duration: {total_duration:.3f}s"
        )
        
        # Return in standardized API format
        project_id = os.getenv("GCP_PROJECT_ID", "unknown")
        return {
            "success": True,
            "project": project_id,
            "dataset": owner,  # Use owner as dataset for compatibility
            "table": f"{mac_address}_metadata",  # Use mac_address_metadata as table name
            "count": len(experiments_list),
            "experiments": experiments_list
        }
    
    except Exception as e:
        total_duration = time.time() - operation_start
        logger.error(
            f"[GET_EXPERIMENT_NAMES] Error | "
            f"Error: {str(e)} | "
            f"Duration: {total_duration:.3f}s",
            exc_info=True
        )
        raise


async def register_sensor(
    hostname: str,
    mac_address: str,
    lla: str
) -> Dict[str, Any]:
    """
    Register a new sensor in Firestore.
    
    Behavior:
    - If document EXISTS: Return error (sensor already registered)
    - If document MISSING: Create new document with base schema
    
    Args:
        hostname: Owner/hostname (e.g., "f4d_test")
        mac_address: MAC address (e.g., "aaaaaaaaaaaa")
        lla: LLA value (document ID)
    
    Returns:
        dict: Operation result with keys:
            - success (bool): True if operation succeeded
            - status (str): "created" or "error"
            - message (str): Human-readable message
    """
    operation_start = time.time()
    logger.info(
        f"[REGISTER_SENSOR] Starting operation | "
        f"Hostname: {hostname} | "
        f"MAC: {mac_address} | "
        f"LLA: {lla}"
    )
    
    try:
        # Get Firestore client
        db = await get_client()
        
        # Get document reference: sensors/{LLA}
        doc_ref = db.collection(SENSORS_COLLECTION).document(lla)
        
        # Check if document exists
        doc = await doc_ref.get()
        
        if doc.exists:
            # Document already exists - return error
            total_duration = time.time() - operation_start
            logger.warning(
                f"[REGISTER_SENSOR] Document already exists | "
                f"LLA: {lla} | "
                f"Duration: {total_duration:.3f}s"
            )
            
            return {
                "success": False,
                "status": "error",
                "message": f"Sensor with LLA '{lla}' already exists. Use update endpoint instead."
            }
        else:
            # Document does not exist - create new document with base schema
            base_doc = _create_base_sensor_document(hostname, mac_address, lla)
            await doc_ref.set(base_doc)
            
            total_duration = time.time() - operation_start
            logger.info(
                f"[REGISTER_SENSOR] Document created | "
                f"LLA: {lla} | "
                f"Duration: {total_duration:.3f}s"
            )
            
            return {
                "success": True,
                "status": "created",
                "message": f"Created new sensor document for {lla}"
            }
    
    except Exception as e:
        error_msg = f"Firestore error: {str(e)}"
        total_duration = time.time() - operation_start
        logger.error(
            f"[REGISTER_SENSOR] Error | "
            f"Error: {error_msg} | "
            f"Duration: {total_duration:.3f}s",
            exc_info=True
        )
        return {
            "success": False,
            "status": "error",
            "message": error_msg
        }


async def update_sensor_last_seen(
    hostname: str,
    mac_address: str,
    lla: str
) -> Dict[str, Any]:
    """
    Update existing sensor's last_seen timestamp.
    
    Behavior:
    - If document EXISTS: Update only `last_seen` and `updated_at` with SERVER_TIMESTAMP
    - If document MISSING: Return error (sensor not found)
    
    Args:
        hostname: Owner/hostname (e.g., "f4d_test")
        mac_address: MAC address (e.g., "aaaaaaaaaaaa")
        lla: LLA value (document ID)
    
    Returns:
        dict: Operation result with keys:
            - success (bool): True if operation succeeded
            - status (str): "updated" or "error"
            - message (str): Human-readable message
    """
    operation_start = time.time()
    logger.info(
        f"[UPDATE_SENSOR_LAST_SEEN] Starting operation | "
        f"Hostname: {hostname} | "
        f"MAC: {mac_address} | "
        f"LLA: {lla}"
    )
    
    try:
        # Get Firestore client
        db = await get_client()
        
        # Get document reference: sensors/{LLA}
        doc_ref = db.collection(SENSORS_COLLECTION).document(lla)
        
        # Check if document exists
        doc = await doc_ref.get()
        
        if not doc.exists:
            # Document does not exist - return error
            total_duration = time.time() - operation_start
            logger.warning(
                f"[UPDATE_SENSOR_LAST_SEEN] Document not found | "
                f"LLA: {lla} | "
                f"Duration: {total_duration:.3f}s"
            )
            
            return {
                "success": False,
                "status": "error",
                "message": f"Sensor with LLA '{lla}' not found. Use register endpoint first."
            }
        
        # Document exists - update only last_seen timestamp
        # Note: We update regardless of owner/mac match because LLA is the primary key
        # The document exists, so we trust it and just update the timestamp
        await doc_ref.update({
            "last_seen": SERVER_TIMESTAMP,
            "updated_at": SERVER_TIMESTAMP
        })
        
        total_duration = time.time() - operation_start
        logger.info(
            f"[UPDATE_SENSOR_LAST_SEEN] Document updated | "
            f"LLA: {lla} | "
            f"Duration: {total_duration:.3f}s"
        )
        
        return {
            "success": True,
            "status": "updated",
            "message": f"Updated last_seen timestamp for sensor {lla}"
        }
    
    except Exception as e:
        error_msg = f"Firestore error: {str(e)}"
        total_duration = time.time() - operation_start
        logger.error(
            f"[UPDATE_SENSOR_LAST_SEEN] Error | "
            f"Error: {error_msg} | "
            f"Duration: {total_duration:.3f}s",
            exc_info=True
        )
        return {
            "success": False,
            "status": "error",
            "message": error_msg
        }


async def update_sensor_metadata(
    hostname: str,
    mac_address: str,
    lla: str,
    updates: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Update sensor metadata in Firestore with flexible field updates.
    
    This function allows updating any combination of sensor fields.
    Only the fields provided in the updates dict will be modified.
    
    Args:
        hostname: Owner/hostname (e.g., "f4d_test")
        mac_address: MAC address (e.g., "aaaaaaaaaaaa")
        lla: LLA value (document ID)
        updates: Dictionary of fields to update. Can include:
            - exp_name: Experiment name
            - exp_location: Experiment location
            - label: Sensor label
            - location: Sensor location
            - coordinates: Dict with x, y, z keys
            - Any other fields from the sensor document
    
    Returns:
        dict: Operation result with keys:
            - success (bool): True if operation succeeded
            - status (str): "updated" or "error"
            - message (str): Human-readable message
    """
    operation_start = time.time()
    logger.info(
        f"[UPDATE_SENSOR_METADATA] Starting operation | "
        f"Hostname: {hostname} | "
        f"MAC: {mac_address} | "
        f"LLA: {lla} | "
        f"Updates: {list(updates.keys())}"
    )
    
    try:
        # Get Firestore client
        db = await get_client()
        
        # Get document reference: sensors/{LLA}
        doc_ref = db.collection(SENSORS_COLLECTION).document(lla)
        
        # Check if document exists
        doc = await doc_ref.get()
        
        if not doc.exists:
            # Document does not exist - return error
            total_duration = time.time() - operation_start
            logger.warning(
                f"[UPDATE_SENSOR_METADATA] Document not found | "
                f"LLA: {lla} | "
                f"Duration: {total_duration:.3f}s"
            )
            
            return {
                "success": False,
                "status": "error",
                "message": f"Sensor with LLA '{lla}' not found."
            }
        
        # Validate owner and mac (optional - can be skipped if not provided)
        doc_data = doc.to_dict()
        doc_owner = doc_data.get("owner", "")
        doc_mac = doc_data.get("mac", "")
        
        if hostname and doc_owner != hostname:
            total_duration = time.time() - operation_start
            logger.warning(
                f"[UPDATE_SENSOR_METADATA] Owner mismatch | "
                f"Expected: {hostname}, Found: {doc_owner} | "
                f"Duration: {total_duration:.3f}s"
            )
            return {
                "success": False,
                "status": "error",
                "message": f"Owner mismatch: expected '{hostname}', found '{doc_owner}'"
            }
        
        if mac_address and doc_mac != mac_address:
            total_duration = time.time() - operation_start
            logger.warning(
                f"[UPDATE_SENSOR_METADATA] MAC mismatch | "
                f"Expected: {mac_address}, Found: {doc_mac} | "
                f"Duration: {total_duration:.3f}s"
            )
            return {
                "success": False,
                "status": "error",
                "message": f"MAC address mismatch: expected '{mac_address}', found '{doc_mac}'"
            }
        
        # Prepare update dictionary
        firestore_updates = {
            "updated_at": SERVER_TIMESTAMP
        }
        
        # Map frontend field names to Firestore field names
        field_mapping = {
            "exp_name": "exp_name",
            "exp_location": "exp_location",
            "label": "label",
            "location": "location",
            "coordinates": "coordinates",
            "label_options": "label_options",
            "rfid": "rfid",
            "frequency": "frequency",
            "is_active": "is_active",
            "is_valid": "is_valid",
            "active_exp": "active_exp",
            "exp_id": "exp_id",
            # Add any other fields as needed
        }
        
        # Process updates
        for key, value in updates.items():
            if key in field_mapping:
                firestore_key = field_mapping[key]
                
                # Special handling for coordinates
                if key == "coordinates" and isinstance(value, dict):
                    # Ensure coordinates is a proper dict with x, y, z (all keys present, even if None)
                    firestore_updates[firestore_key] = {
                        "x": value.get("x") if "x" in value else None,
                        "y": value.get("y") if "y" in value else None,
                        "z": value.get("z") if "z" in value else None
                    }
                else:
                    # Direct field update
                    firestore_updates[firestore_key] = value
            else:
                # Allow direct field updates if key doesn't match mapping
                # This provides flexibility for future fields
                logger.debug(
                    f"[UPDATE_SENSOR_METADATA] Direct field update | "
                    f"Key: {key} (not in mapping)"
                )
                firestore_updates[key] = value
        
        # Perform update
        await doc_ref.update(firestore_updates)
        
        total_duration = time.time() - operation_start
        logger.info(
            f"[UPDATE_SENSOR_METADATA] Document updated | "
            f"LLA: {lla} | "
            f"Fields updated: {list(firestore_updates.keys())} | "
            f"Duration: {total_duration:.3f}s"
        )
        
        return {
            "success": True,
            "status": "updated",
            "message": f"Successfully updated sensor metadata for {lla}",
            "updated_fields": list(firestore_updates.keys())
        }
    
    except Exception as e:
        error_msg = f"Firestore error: {str(e)}"
        total_duration = time.time() - operation_start
        logger.error(
            f"[UPDATE_SENSOR_METADATA] Error | "
            f"Error: {error_msg} | "
            f"Duration: {total_duration:.3f}s",
            exc_info=True
        )
        return {
            "success": False,
            "status": "error",
            "message": error_msg
        }


async def batch_update_sensor_metadata(
    sensors_updates: List[Dict[str, Any]]
) -> Dict[str, Any]:
    """
    Batch update metadata for multiple sensors in Firestore.
    This efficiently updates multiple sensors in a single batch operation (up to 500).
    
    Args:
        sensors_updates: List of update dictionaries, each containing:
            - lla (str): LLA value (document ID)
            - hostname (str, optional): Owner/hostname for validation
            - mac_address (str, optional): MAC address for validation
            - updates (dict): Dictionary of fields to update
    
    Returns:
        dict: Operation result with keys:
            - success (bool): True if all operations succeeded
            - status (str): "updated" or "error"
            - message (str): Human-readable message
            - updated_llas (list): List of successfully updated LLAs
            - failed_llas (dict): Dictionary of failed LLAs with error messages
            - total_operations (int): Total number of operations attempted
    """
    operation_start = time.time()
    logger.info(
        f"[BATCH_UPDATE_SENSOR_METADATA] Starting batch operation | "
        f"Sensors: {len(sensors_updates)}"
    )
    
    updated_llas = []
    failed_llas = {}
    total_operations = 0
    
    try:
        # Get Firestore client
        db = await get_client()
        
        # Create batch writer
        batch_writer = FirestoreBatchWriter(db)
        
        # Process each sensor update
        for sensor_update in sensors_updates:
            lla = sensor_update.get("lla")
            if not lla:
                failed_llas[lla or "unknown"] = "Missing LLA field"
                continue
            
            hostname = sensor_update.get("hostname")
            mac_address = sensor_update.get("mac_address")
            updates = sensor_update.get("updates", {})
            
            if not updates:
                failed_llas[lla] = "Empty updates dictionary"
                continue
            
            try:
                # Get document reference
                doc_ref = db.collection(SENSORS_COLLECTION).document(lla)
                
                # Check if document exists
                doc = await doc_ref.get()
                
                if not doc.exists:
                    failed_llas[lla] = "Sensor not found"
                    continue
                
                # Validate owner and mac if provided
                doc_data = doc.to_dict()
                doc_owner = doc_data.get("owner", "")
                doc_mac = doc_data.get("mac", "")
                
                if hostname and doc_owner != hostname:
                    failed_llas[lla] = f"Owner mismatch: expected '{hostname}', found '{doc_owner}'"
                    continue
                
                if mac_address and doc_mac != mac_address:
                    failed_llas[lla] = f"MAC mismatch: expected '{mac_address}', found '{doc_mac}'"
                    continue
                
                # Prepare update dictionary
                firestore_updates = {
                    "updated_at": SERVER_TIMESTAMP
                }
                
                # Map frontend field names to Firestore field names
                field_mapping = {
                    "exp_name": "exp_name",
                    "exp_location": "exp_location",
                    "label": "label",
                    "location": "location",
                    "coordinates": "coordinates",
                    "label_options": "label_options",
                    "rfid": "rfid",
                    "frequency": "frequency",
                    "is_active": "is_active",
                    "is_valid": "is_valid",
                    "active_exp": "active_exp",
                    "exp_id": "exp_id",
                }
                
                # Process updates
                for key, value in updates.items():
                    if key in field_mapping:
                        firestore_key = field_mapping[key]
                        
                        # Special handling for coordinates
                        if key == "coordinates" and isinstance(value, dict):
                            firestore_updates[firestore_key] = {
                                "x": value.get("x") if "x" in value else None,
                                "y": value.get("y") if "y" in value else None,
                                "z": value.get("z") if "z" in value else None
                            }
                        else:
                            firestore_updates[firestore_key] = value
                    else:
                        # Allow direct field updates
                        firestore_updates[key] = value
                
                # Add to batch
                batch_writer.add_update(doc_ref, firestore_updates)
                total_operations += 1
                
            except Exception as e:
                failed_llas[lla] = f"Error processing update: {str(e)}"
                logger.warning(
                    f"[BATCH_UPDATE_SENSOR_METADATA] Failed to process sensor {lla} | "
                    f"Error: {str(e)}"
                )
        
        # Commit batch if there are operations
        if total_operations > 0:
            await batch_writer.commit()
            # Get list of successfully updated LLAs
            updated_llas = [
                su.get("lla") for su in sensors_updates 
                if su.get("lla") and su.get("lla") not in failed_llas
            ]
            logger.info(
                f"[BATCH_UPDATE_SENSOR_METADATA] Batch committed | "
                f"Updated: {len(updated_llas)} | "
                f"Failed: {len(failed_llas)} | "
                f"Operations: {total_operations}"
            )
        else:
            logger.warning(
                f"[BATCH_UPDATE_SENSOR_METADATA] No valid operations to commit | "
                f"All sensors failed validation"
            )
        
        total_duration = time.time() - operation_start
        success = len(failed_llas) == 0 and len(updated_llas) > 0
        
        logger.info(
            f"[BATCH_UPDATE_SENSOR_METADATA] Batch operation completed | "
            f"Updated: {len(updated_llas)} | "
            f"Failed: {len(failed_llas)} | "
            f"Duration: {total_duration:.3f}s"
        )
        
        return {
            "success": success,
            "status": "updated" if success else "error",
            "message": f"Updated {len(updated_llas)} sensor(s), {len(failed_llas)} failed" if failed_llas else f"Successfully updated {len(updated_llas)} sensor(s)",
            "updated_llas": updated_llas,
            "failed_llas": failed_llas if failed_llas else None,
            "total_operations": total_operations
        }
    
    except Exception as e:
        error_msg = f"Batch operation error: {str(e)}"
        total_duration = time.time() - operation_start
        logger.error(
            f"[BATCH_UPDATE_SENSOR_METADATA] Error | "
            f"Error: {error_msg} | "
            f"Duration: {total_duration:.3f}s",
            exc_info=True
        )
        return {
            "success": False,
            "status": "error",
            "message": error_msg,
            "updated_llas": updated_llas,
            "failed_llas": failed_llas if failed_llas else None,
            "total_operations": total_operations
        }


async def update_sensor_last_package(
    sensors_data: Dict[str, Dict[str, Any]],
    hostname: Optional[str] = None,
    mac_address: Optional[str] = None
) -> Dict[str, Any]:
    """
    Update the last_package field for one or more sensors in Firestore.
    This efficiently updates sensors using batch operations (up to 500 per batch).
    Works for both single sensor (dict with 1 key) and multiple sensors.
    
    If hostname and mac_address are provided, missing sensors will be automatically
    registered with Last_Package data included in the same batch operation.
    
    Args:
        sensors_data: Dictionary mapping LLA to package_data dictionaries.
                     Example (single): {"lla1": {"temp": 25.0}}
                     Example (multiple): {"lla1": {"temp": 25.0}, "lla2": {"temp": 26.0}}
        hostname: Optional hostname/owner for auto-registration of missing sensors.
        mac_address: Optional MAC address for auto-registration of missing sensors.
    
    Returns:
        dict: Operation result with keys:
            - success (bool): True if all operations succeeded
            - status (str): "updated" or "error"
            - message (str): Human-readable message
            - updated_llas (list): List of successfully updated LLAs (existing sensors)
            - registered_llas (list): List of successfully registered LLAs (new sensors)
            - failed_llas (dict): Dictionary of failed LLAs with error messages
            - total_operations (int): Total number of operations attempted
    """
    operation_start = time.time()
    logger.info(
        f"[UPDATE_SENSOR_LAST_PACKAGE] Starting operation | "
        f"Sensors: {len(sensors_data)} | "
        f"Auto-register: {hostname is not None and mac_address is not None}"
    )
    
    updated_llas = []
    registered_llas = []
    failed_llas = {}
    total_operations = 0
    
    try:
        # Get Firestore client
        db = await get_client()
        
        # Create batch writer
        batch_writer = FirestoreBatchWriter(db)
        
        # First, verify all documents exist and prepare batch operations
        doc_refs = {}
        for lla in sensors_data.keys():
            doc_ref = db.collection(SENSORS_COLLECTION).document(lla)
            doc_refs[lla] = doc_ref
        
        # Check which documents exist (can batch these queries too)
        # But for now, let's check them individually to handle missing docs gracefully
        existing_llas = []
        missing_llas = []
        
        for lla, doc_ref in doc_refs.items():
            try:
                doc = await doc_ref.get()
                if doc.exists:
                    existing_llas.append(lla)
                else:
                    missing_llas.append(lla)
            except Exception as e:
                missing_llas.append(lla)
                failed_llas[lla] = f"Error checking document: {str(e)}"
        
        # Add update operations for existing documents to batch
        for lla in existing_llas:
            package_data = sensors_data[lla]
            doc_ref = doc_refs[lla]
            
            update_data = {
                "last_package": package_data,
                "last_seen": SERVER_TIMESTAMP,
                "updated_at": SERVER_TIMESTAMP
            }
            
            batch_writer.add_update(doc_ref, update_data)
            updated_llas.append(lla)  # Track which sensors are being updated
            total_operations += 1
        
        # Auto-register missing sensors if hostname and mac_address are provided
        if missing_llas and hostname and mac_address:
            for lla in missing_llas:
                # Skip if already in failed_llas (error during check)
                if lla in failed_llas:
                    continue
                
                try:
                    package_data = sensors_data[lla]
                    doc_ref = doc_refs[lla]
                    
                    # Create base document with Last_Package data included
                    base_doc = _create_base_sensor_document(hostname, mac_address, lla)
                    base_doc["last_package"] = package_data  # Include Last_Package data
                    base_doc["last_seen"] = SERVER_TIMESTAMP
                    
                    # Use SET operation to create new document
                    batch_writer.add_set(doc_ref, base_doc)
                    registered_llas.append(lla)
                    total_operations += 1
                    
                    logger.debug(
                        f"[UPDATE_SENSOR_LAST_PACKAGE] Auto-registering sensor | "
                        f"LLA: {lla} | "
                        f"Hostname: {hostname} | "
                        f"MAC: {mac_address}"
                    )
                except Exception as e:
                    failed_llas[lla] = f"Error preparing registration: {str(e)}"
                    logger.warning(
                        f"[UPDATE_SENSOR_LAST_PACKAGE] Failed to prepare registration | "
                        f"LLA: {lla} | "
                        f"Error: {str(e)}"
                    )
        elif missing_llas:
            # Missing sensors but no hostname/mac_address provided
            for lla in missing_llas:
                if lla not in failed_llas:
                    failed_llas[lla] = "Sensor not found (hostname/mac_address required for auto-registration)"
                    logger.warning(
                        f"[UPDATE_SENSOR_LAST_PACKAGE] Cannot auto-register sensor | "
                        f"LLA: {lla} | "
                        f"Reason: Missing hostname or mac_address"
                    )
        
        # Commit batch if there are operations
        if total_operations > 0:
            await batch_writer.commit()
            # Combine updated and registered LLAs for total count
            all_processed_llas = updated_llas + registered_llas
            logger.info(
                f"[UPDATE_SENSOR_LAST_PACKAGE] Batch committed | "
                f"Updated: {len(updated_llas)} | "
                f"Registered: {len(registered_llas)} | "
                f"Failed: {len(failed_llas)} | "
                f"Operations: {total_operations}"
            )
        else:
            logger.warning(
                f"[UPDATE_SENSOR_LAST_PACKAGE] No valid operations to commit | "
                f"All sensors failed validation"
            )
        
        total_duration = time.time() - operation_start
        all_processed_llas = updated_llas + registered_llas
        success = len(failed_llas) == 0 and len(all_processed_llas) > 0
        
        # Build message
        message_parts = []
        if len(updated_llas) > 0:
            message_parts.append(f"updated {len(updated_llas)} sensor(s)")
        if len(registered_llas) > 0:
            message_parts.append(f"registered {len(registered_llas)} sensor(s)")
        if len(failed_llas) > 0:
            message_parts.append(f"{len(failed_llas)} failed")
        
        message = ", ".join(message_parts) if message_parts else "No operations performed"
        
        logger.info(
            f"[UPDATE_SENSOR_LAST_PACKAGE] Operation completed | "
            f"Updated: {len(updated_llas)} | "
            f"Registered: {len(registered_llas)} | "
            f"Failed: {len(failed_llas)} | "
            f"Duration: {total_duration:.3f}s"
        )
        
        return {
            "success": success,
            "status": "updated" if success else "error",
            "message": message,
            "updated_llas": updated_llas,
            "registered_llas": registered_llas if registered_llas else None,
            "failed_llas": failed_llas if failed_llas else None,
            "total_operations": total_operations
        }
    
    except Exception as e:
        error_msg = f"Operation error: {str(e)}"
        total_duration = time.time() - operation_start
        logger.error(
            f"[UPDATE_SENSOR_LAST_PACKAGE] Error | "
            f"Error: {error_msg} | "
            f"Duration: {total_duration:.3f}s",
            exc_info=True
        )
        return {
            "success": False,
            "status": "error",
            "message": error_msg,
            "updated_llas": updated_llas,
            "registered_llas": registered_llas if registered_llas else None,
            "failed_llas": failed_llas if failed_llas else None,
            "total_operations": total_operations
        }
