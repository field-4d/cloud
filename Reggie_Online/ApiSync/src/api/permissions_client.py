"""
Permissions client for Field4D backend integration.
Handles async HTTP requests to resolve owner and MAC address by email.
"""
import httpx
import logging
import time
from typing import Dict, Tuple

from auth.firestore_config import get_permissions_base_url

logger = logging.getLogger(__name__)


class PermissionsNotFoundError(Exception):
    """Raised when no permissions are found for an email (404)."""
    pass


class PermissionsServiceError(Exception):
    """Raised when the permissions service returns an error (400, 500, network errors)."""
    def __init__(self, message: str, status_code: int = None):
        self.status_code = status_code
        super().__init__(message)


async def fetch_user_permissions(email: str) -> Dict:
    """
    Call the external GET /api/permissions?email=<email> endpoint
    on the Field4D backend and return the parsed JSON response.
    
    Args:
        email: User's email address
        
    Returns:
        dict: Parsed JSON response from the permissions API
        
    Raises:
        PermissionsNotFoundError: If no permissions found (404)
        PermissionsServiceError: If service error occurs (400, 500, network/timeout)
    """
    operation_start = time.time()
    logger.info(f"[PERMISSIONS_CLIENT] Fetching permissions for email: {email}")
    
    try:
        base_url = get_permissions_base_url()
        url = f"{base_url.rstrip('/')}/api/permissions"
        
        logger.debug(f"[PERMISSIONS_CLIENT] Request URL: {url}")
        
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(url, params={"email": email})
            
            request_duration = time.time() - operation_start
            
            if response.status_code == 200:
                data = response.json()
                logger.info(
                    f"[PERMISSIONS_CLIENT] Permissions fetched successfully | "
                    f"Email: {email} | "
                    f"Duration: {request_duration:.3f}s"
                )
                return data
            elif response.status_code == 404:
                logger.warning(
                    f"[PERMISSIONS_CLIENT] No permissions found | "
                    f"Email: {email} | "
                    f"Duration: {request_duration:.3f}s"
                )
                raise PermissionsNotFoundError(f"No permissions found for email: {email}")
            elif response.status_code == 400:
                error_msg = f"Bad request for email {email}"
                try:
                    error_data = response.json()
                    error_msg = error_data.get("detail", error_data.get("message", error_msg))
                except:
                    error_msg = response.text or error_msg
                logger.error(
                    f"[PERMISSIONS_CLIENT] Bad request | "
                    f"Email: {email} | "
                    f"Error: {error_msg} | "
                    f"Duration: {request_duration:.3f}s"
                )
                raise PermissionsServiceError(error_msg, status_code=400)
            elif response.status_code == 500:
                error_msg = f"Internal server error from permissions service"
                try:
                    error_data = response.json()
                    error_msg = error_data.get("detail", error_data.get("message", error_msg))
                except:
                    error_msg = response.text or error_msg
                logger.error(
                    f"[PERMISSIONS_CLIENT] Server error | "
                    f"Email: {email} | "
                    f"Error: {error_msg} | "
                    f"Duration: {request_duration:.3f}s"
                )
                raise PermissionsServiceError(error_msg, status_code=500)
            else:
                error_msg = f"Unexpected status code: {response.status_code}"
                logger.error(
                    f"[PERMISSIONS_CLIENT] Unexpected status | "
                    f"Email: {email} | "
                    f"Status: {response.status_code} | "
                    f"Duration: {request_duration:.3f}s"
                )
                raise PermissionsServiceError(error_msg, status_code=response.status_code)
                
    except httpx.TimeoutException as e:
        request_duration = time.time() - operation_start
        logger.error(
            f"[PERMISSIONS_CLIENT] Request timeout | "
            f"Email: {email} | "
            f"Duration: {request_duration:.3f}s",
            exc_info=True
        )
        raise PermissionsServiceError(
            "Permissions service request timed out",
            status_code=503
        )
    except httpx.RequestError as e:
        request_duration = time.time() - operation_start
        logger.error(
            f"[PERMISSIONS_CLIENT] Network error | "
            f"Email: {email} | "
            f"Error: {str(e)} | "
            f"Duration: {request_duration:.3f}s",
            exc_info=True
        )
        raise PermissionsServiceError(
            f"Failed to connect to permissions service: {str(e)}",
            status_code=502
        )
    except PermissionsNotFoundError:
        raise
    except PermissionsServiceError:
        raise
    except Exception as e:
        request_duration = time.time() - operation_start
        logger.error(
            f"[PERMISSIONS_CLIENT] Unexpected error | "
            f"Email: {email} | "
            f"Error: {str(e)} | "
            f"Duration: {request_duration:.3f}s",
            exc_info=True
        )
        raise PermissionsServiceError(
            f"Unexpected error fetching permissions: {str(e)}",
            status_code=500
        )


async def resolve_owner_and_mac(email: str) -> Tuple[str, str]:
    """
    Calls fetch_user_permissions(email), takes the FIRST permission in the "permissions" array,
    and returns (owner, mac_address) tuple.
    
    Args:
        email: User's email address
        
    Returns:
        tuple[str, str]: (owner, mac_address) from the first permission
        
    Raises:
        PermissionsNotFoundError: If no permissions found
        PermissionsServiceError: If service error occurs
        ValueError: If response format is invalid or permissions array is empty
    """
    operation_start = time.time()
    logger.info(f"[PERMISSIONS_CLIENT] Resolving owner and MAC for email: {email}")
    
    try:
        data = await fetch_user_permissions(email)
        
        # Validate response structure
        if not isinstance(data, dict):
            raise ValueError("Invalid response format: expected dict")
        
        if not data.get("success", False):
            error_msg = data.get("message", "Permissions service returned success=false")
            logger.error(f"[PERMISSIONS_CLIENT] Service returned success=false | Email: {email} | Message: {error_msg}")
            raise PermissionsServiceError(error_msg, status_code=500)
        
        permissions = data.get("permissions", [])
        if not permissions or len(permissions) == 0:
            logger.warning(f"[PERMISSIONS_CLIENT] Empty permissions array | Email: {email}")
            raise PermissionsNotFoundError(f"No permissions found for email: {email}")
        
        # Get first permission
        first_permission = permissions[0]
        owner = first_permission.get("owner")
        mac_address = first_permission.get("mac_address")
        
        if not owner or not mac_address:
            logger.error(
                f"[PERMISSIONS_CLIENT] Missing owner or mac_address in permission | "
                f"Email: {email} | "
                f"Owner: {owner} | "
                f"MAC: {mac_address}"
            )
            raise ValueError(
                f"Permission data incomplete: owner={owner}, mac_address={mac_address}"
            )
        
        operation_duration = time.time() - operation_start
        logger.info(
            f"[PERMISSIONS_CLIENT] Successfully resolved | "
            f"Email: {email} | "
            f"Owner: {owner} | "
            f"MAC: {mac_address} | "
            f"Duration: {operation_duration:.3f}s"
        )
        
        return (owner, mac_address)
        
    except (PermissionsNotFoundError, PermissionsServiceError, ValueError):
        raise
    except Exception as e:
        operation_duration = time.time() - operation_start
        logger.error(
            f"[PERMISSIONS_CLIENT] Error resolving owner/MAC | "
            f"Email: {email} | "
            f"Error: {str(e)} | "
            f"Duration: {operation_duration:.3f}s",
            exc_info=True
        )
        raise PermissionsServiceError(
            f"Error resolving owner and MAC address: {str(e)}",
            status_code=500
        )


async def resolve_all_owners_and_macs(email: str) -> Dict:
    """
    Calls fetch_user_permissions(email), groups all permissions by owner,
    and returns a dictionary with email and grouped owners with their MAC addresses.
    
    Args:
        email: User's email address
        
    Returns:
        dict: Dictionary with email and owners list:
            {
                "email": str,
                "owners": [
                    {
                        "owner": str,
                        "mac_addresses": List[str]  # All unique MAC addresses for this owner
                    },
                    ...
                ]
            }
        
    Raises:
        PermissionsNotFoundError: If no permissions found
        PermissionsServiceError: If service error occurs
        ValueError: If response format is invalid
    """
    operation_start = time.time()
    logger.info(f"[PERMISSIONS_CLIENT] Resolving all owners and MACs for email: {email}")
    
    try:
        data = await fetch_user_permissions(email)
        
        # Validate response structure
        if not isinstance(data, dict):
            raise ValueError("Invalid response format: expected dict")
        
        if not data.get("success", False):
            error_msg = data.get("message", "Permissions service returned success=false")
            logger.error(f"[PERMISSIONS_CLIENT] Service returned success=false | Email: {email} | Message: {error_msg}")
            raise PermissionsServiceError(error_msg, status_code=500)
        
        permissions = data.get("permissions", [])
        if not permissions or len(permissions) == 0:
            logger.warning(f"[PERMISSIONS_CLIENT] Empty permissions array | Email: {email}")
            raise PermissionsNotFoundError(f"No permissions found for email: {email}")
        
        # Group permissions by owner
        owners_dict = {}
        for permission in permissions:
            owner = permission.get("owner")
            mac_address = permission.get("mac_address")
            
            if not owner or not mac_address:
                logger.warning(
                    f"[PERMISSIONS_CLIENT] Skipping permission with missing owner or MAC | "
                    f"Email: {email} | "
                    f"Owner: {owner} | "
                    f"MAC: {mac_address}"
                )
                continue
            
            # Initialize owner entry if not exists
            if owner not in owners_dict:
                owners_dict[owner] = {
                    "owner": owner,
                    "mac_addresses": []
                }
            
            # Add MAC address if not already present (deduplication)
            if mac_address not in owners_dict[owner]["mac_addresses"]:
                owners_dict[owner]["mac_addresses"].append(mac_address)
        
        # Convert to list maintaining order (first appearance)
        owners_list = list(owners_dict.values())
        
        if len(owners_list) == 0:
            logger.warning(f"[PERMISSIONS_CLIENT] No valid permissions after processing | Email: {email}")
            raise PermissionsNotFoundError(f"No valid permissions found for email: {email}")
        
        operation_duration = time.time() - operation_start
        logger.info(
            f"[PERMISSIONS_CLIENT] Successfully resolved all owners/MACs | "
            f"Email: {email} | "
            f"Owners: {len(owners_list)} | "
            f"Total MACs: {sum(len(owner['mac_addresses']) for owner in owners_list)} | "
            f"Duration: {operation_duration:.3f}s"
        )
        
        return {
            "email": email,
            "owners": owners_list
        }
        
    except (PermissionsNotFoundError, PermissionsServiceError, ValueError):
        raise
    except Exception as e:
        operation_duration = time.time() - operation_start
        logger.error(
            f"[PERMISSIONS_CLIENT] Error resolving all owners/MACs | "
            f"Email: {email} | "
            f"Error: {str(e)} | "
            f"Duration: {operation_duration:.3f}s",
            exc_info=True
        )
        raise PermissionsServiceError(
            f"Error resolving all owners and MAC addresses: {str(e)}",
            status_code=500
        )

