"""
Firestore GET endpoints for querying sensor metadata.
Provides API responses for Firestore metadata queries.
"""
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import Optional, List
from google.cloud.exceptions import NotFound
import logging
import time

from .firestore_repository import get_sensor_metadata, get_all_sensors_metadata, get_experiment_names, register_sensor, update_sensor_last_seen, update_sensor_metadata, batch_update_sensor_metadata
from .permissions_client import resolve_owner_and_mac, resolve_all_owners_and_macs, PermissionsNotFoundError, PermissionsServiceError

# Set up logger
logger = logging.getLogger(__name__)

router = APIRouter()


class SensorRegisterRequest(BaseModel):
    """Request model for sensor registration endpoint."""
    hostname: str
    mac_address: str
    lla: str


class SensorUpdateRequest(BaseModel):
    """Request model for sensor update endpoint."""
    hostname: str
    mac_address: str
    lla: str


class SensorMetadataUpdateRequest(BaseModel):
    """Request model for sensor metadata update endpoint.
    
    Supports both single and batch formats:
    - Single: {"owner": "...", "mac_address": "...", "lla": "...", "updates": {...}}
    - Batch: {"sensors": [{"lla": "...", "owner": "...", "mac_address": "...", "updates": {...}}, ...]}
    
    Note: For backward compatibility, 'hostname' is also accepted but will be mapped to 'owner'.
    """
    owner: Optional[str] = None
    hostname: Optional[str] = None  # Deprecated: use 'owner' instead
    mac_address: Optional[str] = None
    lla: Optional[str] = None
    updates: Optional[dict] = None
    sensors: Optional[List[dict]] = None  # For batch updates


class OwnerMacGroup(BaseModel):
    """Model for owner with MAC addresses."""
    owner: str
    mac_addresses: List[str]


class PermissionsResolveResponse(BaseModel):
    """Response model for permissions resolve endpoint."""
    success: bool
    email: str
    owners: List[OwnerMacGroup]


@router.get("/GCP-FS/metadata/active")
async def query_active_metadata(
    mac_address: str,
    lla: str,
    owner: Optional[str] = None,
    hostname: Optional[str] = None
):
    """
    Query Firestore for sensor metadata by LLA.
    
    Uses /GCP-FS/ prefix for Firestore endpoints.
    
    Args:
        owner: Owner identifier (e.g., "Icore_Pi", "f4d_test") - preferred parameter
        hostname: Owner/hostname (e.g., "f4d_test") - backward compatibility alias for owner
        mac_address: MAC address (e.g., "aaaaaaaaaaaa")
        lla: LLA value (required) - Firestore document ID
    
    Returns:
        dict: Query results with metadata in JSON format:
            - success (bool): True if successful
            - project (str): GCP project ID
            - dataset (str): hostname (for compatibility)
            - table (str): {mac_address}_metadata (for compatibility)
            - full_table (str): Full table identifier (for compatibility)
            - count (int): Number of records (always 1 for single LLA)
            - data (list): List of metadata records
    
    Raises:
        HTTPException 422: If neither owner nor hostname is provided
        HTTPException 404: If sensor document not found
        HTTPException 400: If owner or MAC address doesn't match
        HTTPException 500: If Firestore error occurs
    
    Example:
        GET /GCP-FS/metadata/active?owner=Icore_Pi&mac_address=2ccf6730ab5f&lla=fd002124b00ccf7399b
        GET /GCP-FS/metadata/active?hostname=f4d_test&mac_address=aaaaaaaaaaaa&lla=fd002124b00ccf7399b
    """
    # Use owner if provided, otherwise fall back to hostname
    hostname_value = owner if owner is not None else hostname
    
    if hostname_value is None:
        raise HTTPException(
            status_code=422,
            detail="Either 'owner' or 'hostname' parameter is required"
        )
    logger.info(f"[ENDPOINT] GET /GCP-FS/metadata/active | Hostname: {hostname_value} | MAC: {mac_address} | LLA: {lla}")
    operation_start = time.time()
    logger.info(
        f"[QUERY_ACTIVE_METADATA] Starting query | "
        f"Hostname: {hostname_value} | "
        f"MAC: {mac_address} | "
        f"LLA: {lla}"
    )
    
    try:
        # Get metadata from Firestore
        result = await get_sensor_metadata(hostname_value, mac_address, lla)
        
        total_duration = time.time() - operation_start
        logger.info(
            f"[QUERY_ACTIVE_METADATA] Query completed | "
            f"Count: {result['count']} | "
            f"Total duration: {total_duration:.3f}s"
        )
        
        return result
    
    except NotFound as e:
        error_msg = f"Metadata not found for LLA: {lla}"
        total_duration = time.time() - operation_start
        logger.warning(
            f"[QUERY_ACTIVE_METADATA] Document not found | "
            f"LLA: {lla} | "
            f"Duration: {total_duration:.3f}s"
        )
        raise HTTPException(status_code=404, detail=error_msg)
    
    except ValueError as e:
        # Owner or MAC mismatch
        error_msg = str(e)
        total_duration = time.time() - operation_start
        logger.warning(
            f"[QUERY_ACTIVE_METADATA] Validation failed | "
            f"Error: {error_msg} | "
            f"Duration: {total_duration:.3f}s"
        )
        raise HTTPException(status_code=400, detail=error_msg)
    
    except Exception as e:
        # Get more detailed error information
        error_type = type(e).__name__
        error_repr = repr(e)
        error_str = str(e) if str(e) else "No error message available"
        
        error_msg = (
            f"Error querying metadata: {error_str} "
            f"(Type: {error_type})"
        )
        total_duration = time.time() - operation_start
        logger.error(
            f"[QUERY_ACTIVE_METADATA] Unexpected error | "
            f"Type: {error_type} | "
            f"Error: {error_repr} | "
            f"Duration: {total_duration:.3f}s",
            exc_info=True
        )
        raise HTTPException(status_code=500, detail=error_msg)


@router.post("/FS/sensor/register")
async def register_sensor_endpoint(request: SensorRegisterRequest):
    """
    Register a new sensor in Firestore.
    
    Behavior:
    - If document EXISTS: Return error (sensor already registered)
    - If document MISSING: Create new document with base schema
    
    Args:
        request: SensorRegisterRequest with hostname, mac_address, and lla
    
    Returns:
        dict: Operation result:
            - success (bool): True if operation succeeded
            - status (str): "created" or "error"
            - message (str): Human-readable message
    
    Example:
        POST /FS/sensor/register
        {
            "hostname": "f4d_test",
            "mac_address": "aaaaaaaaaaaa",
            "lla": "fd002124b00ccf7399b"
        }
    """
    logger.info(f"[ENDPOINT] POST /FS/sensor/register | Hostname: {request.hostname} | MAC: {request.mac_address} | LLA: {request.lla}")
    operation_start = time.time()
    logger.info(
        f"[REGISTER_SENSOR_ENDPOINT] Request received | "
        f"Hostname: {request.hostname} | "
        f"MAC: {request.mac_address} | "
        f"LLA: {request.lla}"
    )
    
    try:
        # Call repository function
        result = await register_sensor(
            hostname=request.hostname,
            mac_address=request.mac_address,
            lla=request.lla
        )
        
        total_duration = time.time() - operation_start
        logger.info(
            f"[REGISTER_SENSOR_ENDPOINT] Operation completed | "
            f"Status: {result['status']} | "
            f"Duration: {total_duration:.3f}s"
        )
        
        # Return appropriate HTTP status based on result
        if not result.get("success", False):
            raise HTTPException(status_code=400, detail=result.get("message", "Registration failed"))
        
        return result
    
    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    except Exception as e:
        error_type = type(e).__name__
        error_str = str(e) if str(e) else "No error message available"
        
        error_msg = (
            f"Error processing request: {error_str} "
            f"(Type: {error_type})"
        )
        total_duration = time.time() - operation_start
        logger.error(
            f"[REGISTER_SENSOR_ENDPOINT] Unexpected error | "
            f"Type: {error_type} | "
            f"Error: {error_str} | "
            f"Duration: {total_duration:.3f}s",
            exc_info=True
        )
        raise HTTPException(status_code=500, detail=error_msg)


@router.post("/FS/sensor/update")
async def update_sensor_endpoint(request: SensorUpdateRequest):
    """
    Update existing sensor's last_seen timestamp.
    
    Behavior:
    - If document EXISTS: Update only `last_seen` and `updated_at` with SERVER_TIMESTAMP
    - If document MISSING: Return error (sensor not found)
    
    Note: This endpoint currently only updates last_seen. More update capabilities
    will be added later to update other fields in the base_sensor_document.
    
    Args:
        request: SensorUpdateRequest with hostname, mac_address, and lla
    
    Returns:
        dict: Operation result:
            - success (bool): True if operation succeeded
            - status (str): "updated" or "error"
            - message (str): Human-readable message
    
    Example:
        POST /FS/sensor/update
        {
            "hostname": "f4d_test",
            "mac_address": "aaaaaaaaaaaa",
            "lla": "fd002124b00ccf7399b"
        }
    """
    logger.info(f"[ENDPOINT] POST /FS/sensor/update | Hostname: {request.hostname} | MAC: {request.mac_address} | LLA: {request.lla}")
    operation_start = time.time()
    logger.info(
        f"[UPDATE_SENSOR_ENDPOINT] Request received | "
        f"Hostname: {request.hostname} | "
        f"MAC: {request.mac_address} | "
        f"LLA: {request.lla}"
    )
    
    try:
        # Call repository function
        result = await update_sensor_last_seen(
            hostname=request.hostname,
            mac_address=request.mac_address,
            lla=request.lla
        )
        
        total_duration = time.time() - operation_start
        logger.info(
            f"[UPDATE_SENSOR_ENDPOINT] Operation completed | "
            f"Status: {result['status']} | "
            f"Duration: {total_duration:.3f}s"
        )
        
        # Return appropriate HTTP status based on result
        if not result.get("success", False):
            raise HTTPException(status_code=404, detail=result.get("message", "Update failed"))
        
        return result
    
    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    except Exception as e:
        error_type = type(e).__name__
        error_str = str(e) if str(e) else "No error message available"
        
        error_msg = (
            f"Error processing request: {error_str} "
            f"(Type: {error_type})"
        )
        total_duration = time.time() - operation_start
        logger.error(
            f"[UPDATE_SENSOR_ENDPOINT] Unexpected error | "
            f"Type: {error_type} | "
            f"Error: {error_str} | "
            f"Duration: {total_duration:.3f}s",
            exc_info=True
        )
        raise HTTPException(status_code=500, detail=error_msg)


@router.post("/FS/sensor/update-metadata")
async def update_sensor_metadata_endpoint(request: SensorMetadataUpdateRequest):
    """
    Update sensor metadata in Firestore with flexible field updates.
    
    This endpoint supports both single and batch updates:
    - Single sensor: Provide hostname, mac_address, lla, and updates
    - Batch (multiple sensors): Provide sensors array with multiple update objects
    
    Args:
        request: SensorMetadataUpdateRequest with either:
            - Single format: hostname, mac_address, lla, updates
            - Batch format: sensors array
    
    Returns:
        dict: Operation result:
            - success (bool): True if operation succeeded
            - status (str): "updated" or "error"
            - message (str): Human-readable message
            - updated_fields (list): List of fields that were updated (single mode)
            - updated_llas (list): List of successfully updated LLAs (batch mode)
            - failed_llas (dict): Dictionary of failed LLAs with error messages (batch mode)
    
    Examples:
        # Single sensor update
        POST /FS/sensor/update-metadata
        {
            "hostname": "f4d_test",
            "mac_address": "aaaaaaaaaaaa",
            "lla": "fd002124b00ccf7399b",
            "updates": {
                "exp_name": "New Experiment Name",
                "label": "New Label"
            }
        }
        
        # Batch update (multiple sensors)
        POST /FS/sensor/update-metadata
        {
            "sensors": [
                {
                    "lla": "fd002124b00ccf7399b",
                    "hostname": "f4d_test",
                    "mac_address": "aaaaaaaaaaaa",
                    "updates": {"label": "Label1"}
                },
                {
                    "lla": "fd002124b00ccf7399a",
                    "hostname": "f4d_test",
                    "mac_address": "aaaaaaaaaaaa",
                    "updates": {"label": "Label2"}
                }
            ]
        }
    """
    operation_start = time.time()
    
    try:
        # Auto-detect format: batch if "sensors" array is provided, otherwise single
        if request.sensors is not None:
            # Batch mode
            logger.info(f"[ENDPOINT] POST /FS/sensor/update-metadata | Batch mode | Sensors: {len(request.sensors)}")
            logger.info(
                f"[UPDATE_SENSOR_METADATA_ENDPOINT] Batch request received | "
                f"Sensors: {len(request.sensors)}"
            )
            
            # Call batch repository function
            result = await batch_update_sensor_metadata(request.sensors)
            
            total_duration = time.time() - operation_start
            logger.info(
                f"[UPDATE_SENSOR_METADATA_ENDPOINT] Batch operation completed | "
                f"Status: {result['status']} | "
                f"Updated: {len(result.get('updated_llas', []))} | "
                f"Failed: {len(result.get('failed_llas', {}) or {})} | "
                f"Duration: {total_duration:.3f}s"
            )
            
            # Return appropriate HTTP status based on result
            if not result.get("success", False):
                raise HTTPException(status_code=400, detail=result.get("message", "Batch update failed"))
            
            return result
        
        else:
            # Single sensor mode (backward compatible)
            if not request.lla or not request.updates:
                raise HTTPException(
                    status_code=400,
                    detail="For single sensor update, 'lla' and 'updates' are required. For batch update, use 'sensors' array."
                )
            
            # Get owner from request (prefer owner over hostname for backward compatibility)
            owner = request.owner or request.hostname or ""
            
            logger.info(f"[ENDPOINT] POST /FS/sensor/update-metadata | Single mode | Owner: {owner} | MAC: {request.mac_address} | LLA: {request.lla} | Updates: {list(request.updates.keys())}")
            
            logger.info(
                f"[UPDATE_SENSOR_METADATA_ENDPOINT] Single request received | "
                f"Owner: {owner} | "
                f"MAC: {request.mac_address} | "
                f"LLA: {request.lla} | "
                f"Updates: {list(request.updates.keys())}"
            )
    
            # Call single repository function (repository still uses hostname parameter name)
            result = await update_sensor_metadata(
                hostname=owner,
                mac_address=request.mac_address or "",
                lla=request.lla,
                updates=request.updates
            )
        
        total_duration = time.time() - operation_start
        logger.info(
            f"[UPDATE_SENSOR_METADATA_ENDPOINT] Operation completed | "
            f"Status: {result['status']} | "
            f"Duration: {total_duration:.3f}s"
        )
        
        # Return appropriate HTTP status based on result
        if not result.get("success", False):
            raise HTTPException(status_code=400, detail=result.get("message", "Update failed"))
        
        return result
    
    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    except Exception as e:
        error_type = type(e).__name__
        error_str = str(e) if str(e) else "No error message available"
        
        error_msg = (
            f"Error processing request: {error_str} "
            f"(Type: {error_type})"
        )
        total_duration = time.time() - operation_start
        logger.error(
            f"[UPDATE_SENSOR_METADATA_ENDPOINT] Unexpected error | "
            f"Type: {error_type} | "
            f"Error: {error_str} | "
            f"Duration: {total_duration:.3f}s",
            exc_info=True
        )
        raise HTTPException(status_code=500, detail=error_msg)


@router.get("/GCP-FS/metadata/sensors")
async def get_all_sensors_metadata_endpoint(
    owner: str,
    mac_address: str,
    exp_name: Optional[str] = None
):
    """
    Get all sensors metadata from Firestore filtered by owner and mac_address.
    
    Query Parameters:
        owner (required): Owner identifier (e.g., "f4d_test")
        mac_address (required): MAC address (e.g., "aaaaaaaaaaaa")
        exp_name (optional): Filter by exact experiment name match
    
    Returns:
        dict: Query results with metadata in JSON format:
            - success (bool): True if successful
            - project (str): GCP project ID
            - dataset (str): owner (for compatibility)
            - table (str): {mac_address}_metadata (for compatibility)
            - full_table (str): Full table identifier (for compatibility)
            - count (int): Number of records found
            - data (list): List of metadata records
    
    Raises:
        HTTPException 500: If Firestore error occurs
    
    Example:
        GET /GCP-FS/metadata/sensors?owner=f4d_test&mac_address=aaaaaaaaaaaa
        GET /GCP-FS/metadata/sensors?owner=f4d_test&mac_address=aaaaaaaaaaaa&exp_name=Image_V2
    """
    logger.info(f"[ENDPOINT] GET /GCP-FS/metadata/sensors | Owner: {owner} | MAC: {mac_address} | Exp_Name: {exp_name or 'None'}")
    operation_start = time.time()
    logger.info(
        f"[GET_ALL_SENSORS_METADATA_ENDPOINT] Starting query | "
        f"Owner: {owner} | "
        f"MAC: {mac_address} | "
        f"Exp_Name: {exp_name or 'None'}"
    )
    
    try:
        # Get metadata from Firestore
        result = await get_all_sensors_metadata(owner, mac_address, exp_name)
        
        total_duration = time.time() - operation_start
        logger.info(
            f"[GET_ALL_SENSORS_METADATA_ENDPOINT] Query completed | "
            f"Count: {result['count']} | "
            f"Total duration: {total_duration:.3f}s"
        )
        
        return result
    
    except Exception as e:
        # Get more detailed error information
        error_type = type(e).__name__
        error_repr = repr(e)
        error_str = str(e) if str(e) else "No error message available"
        
        error_msg = (
            f"Error querying sensors metadata: {error_str} "
            f"(Type: {error_type})"
        )
        total_duration = time.time() - operation_start
        logger.error(
            f"[GET_ALL_SENSORS_METADATA_ENDPOINT] Unexpected error | "
            f"Type: {error_type} | "
            f"Error: {error_repr} | "
            f"Duration: {total_duration:.3f}s",
            exc_info=True
        )
        raise HTTPException(status_code=500, detail=error_msg)


@router.get("/GCP-FS/metadata/experiments")
async def get_experiment_names_endpoint(
    owner: str,
    mac_address: str
):
    """
    Get all experiment names with statistics from Firestore filtered by owner and mac_address.
    
    Query Parameters:
        owner (required): Owner identifier (e.g., "f4d_test")
        mac_address (required): MAC address (e.g., "aaaaaaaaaaaa")
    
    Returns:
        dict: Query results with experiment statistics:
            - success (bool): True if successful
            - project (str): GCP project ID
            - dataset (str): owner (for compatibility)
            - table (str): {mac_address}_metadata (for compatibility)
            - count (int): Number of unique experiments
            - experiments (list): List of experiment objects with:
                - exp_name (str): Experiment name
                - total_sensors (int): Total number of sensors in this experiment
                - active_count (int): Number of sensors with active_exp == True
                - inactive_count (int): Number of sensors with active_exp == False
    
    Raises:
        HTTPException 500: If Firestore error occurs
    
    Example:
        GET /GCP-FS/metadata/experiments?owner=f4d_test&mac_address=aaaaaaaaaaaa
    """
    logger.info(f"[ENDPOINT] GET /GCP-FS/metadata/experiments | Owner: {owner} | MAC: {mac_address}")
    operation_start = time.time()
    logger.info(
        f"[GET_EXPERIMENT_NAMES_ENDPOINT] Starting query | "
        f"Owner: {owner} | "
        f"MAC: {mac_address}"
    )
    
    try:
        # Get experiment names from Firestore
        result = await get_experiment_names(owner, mac_address)
        
        total_duration = time.time() - operation_start
        logger.info(
            f"[GET_EXPERIMENT_NAMES_ENDPOINT] Query completed | "
            f"Count: {result['count']} | "
            f"Total duration: {total_duration:.3f}s"
        )
        
        return result
    
    except Exception as e:
        # Get more detailed error information
        error_type = type(e).__name__
        error_repr = repr(e)
        error_str = str(e) if str(e) else "No error message available"
        
        error_msg = (
            f"Error querying experiment names: {error_str} "
            f"(Type: {error_type})"
        )
        total_duration = time.time() - operation_start
        logger.error(
            f"[GET_EXPERIMENT_NAMES_ENDPOINT] Unexpected error | "
            f"Type: {error_type} | "
            f"Error: {error_repr} | "
            f"Duration: {total_duration:.3f}s",
            exc_info=True
        )
        raise HTTPException(status_code=500, detail=error_msg)


@router.get("/GCP-FS/permissions/resolve", response_model=PermissionsResolveResponse, tags=["default"])
async def resolve_permissions_endpoint(email: str = Query(..., description="User's email address")):
    """
    Resolve all owner and MAC address combinations from user email using Field4D permissions backend.
    Returns all permissions grouped by owner, since users can have access to multiple owners
    and each owner can have multiple MAC addresses.
    
    Query Parameters:
        email (required): User's email address
        
    Returns:
        PermissionsResolveResponse: Response with owners array, each containing owner and mac_addresses list
        
    Raises:
        HTTPException 404: If no permissions found for the email
        HTTPException 400/500: If permissions service returns error
        HTTPException 502/503: If permissions service is unavailable
    """
    logger.info(f"[ENDPOINT] GET /GCP-FS/permissions/resolve | Email: {email}")
    operation_start = time.time()
    
    try:
        result = await resolve_all_owners_and_macs(email)
        
        total_duration = time.time() - operation_start
        logger.info(
            f"[RESOLVE_PERMISSIONS] Successfully resolved | "
            f"Email: {email} | "
            f"Owners: {len(result['owners'])} | "
            f"Total MACs: {sum(len(owner['mac_addresses']) for owner in result['owners'])} | "
            f"Duration: {total_duration:.3f}s"
        )
        
        return PermissionsResolveResponse(
            success=True,
            email=result["email"],
            owners=result["owners"]
        )
        
    except PermissionsNotFoundError as e:
        total_duration = time.time() - operation_start
        logger.warning(
            f"[RESOLVE_PERMISSIONS] No permissions found | "
            f"Email: {email} | "
            f"Duration: {total_duration:.3f}s"
        )
        raise HTTPException(
            status_code=404,
            detail="No permissions found for this email"
        )
    except PermissionsServiceError as e:
        total_duration = time.time() - operation_start
        status_code = e.status_code or 500
        
        # Map status codes appropriately
        if status_code in [502, 503]:
            error_msg = "Upstream permissions service unavailable"
        else:
            error_msg = str(e) if str(e) else "Permissions service error"
        
        logger.error(
            f"[RESOLVE_PERMISSIONS] Service error | "
            f"Email: {email} | "
            f"Status: {status_code} | "
            f"Error: {error_msg} | "
            f"Duration: {total_duration:.3f}s",
            exc_info=True
        )
        raise HTTPException(status_code=status_code, detail=error_msg)
    except Exception as e:
        total_duration = time.time() - operation_start
        error_type = type(e).__name__
        error_str = str(e) if str(e) else "No error message available"
        error_msg = (
            f"Unexpected error resolving permissions: {error_str} "
            f"(Type: {error_type})"
        )
        logger.error(
            f"[RESOLVE_PERMISSIONS] Unexpected error | "
            f"Email: {email} | "
            f"Type: {error_type} | "
            f"Error: {error_str} | "
            f"Duration: {total_duration:.3f}s",
            exc_info=True
        )
        raise HTTPException(status_code=500, detail=error_msg)
