from fastapi import FastAPI, HTTPException, Depends
from app.test_models import (
    TestRequest, TukeyTestRequest
)
from app import stat_engine
from app.config import BatchValidationConfig, AppConfig
from app.auth.models import LoginRequest, LoginResponse, User
from app.auth.cloud_auth_service import cloud_auth
from app.auth.middleware import get_current_user
import pandas as pd
import logging
import json

# Configure logging
logging.basicConfig(level=getattr(logging, AppConfig.LOG_LEVEL))
logger = logging.getLogger(__name__)

app = FastAPI(
    title=AppConfig.API_TITLE,
    version=AppConfig.API_VERSION
)

@app.get("/health")
def health():
    """Basic health check endpoint."""
    return {
        "status": "ok", 
        "version": AppConfig.API_VERSION,
        "batch_validation": {
            "max_batch_size": 15000,
            "description": "Maximum 15,000 data points per batch",
            "recommended_batch_sizes": {
                "≤ 50K points": "10,000 batch size",
                "≤ 200K points": "8,000 batch size", 
                "≤ 1M points": "5,000 batch size",
                "> 1M points": "3,000 batch size"
            }
        }
    }

@app.post("/auth/login", response_model=LoginResponse)
async def login(login_request: LoginRequest):
    """
    User login endpoint.
    
    Args:
        login_request: Login credentials (email, password)
        
    Returns:
        LoginResponse with token and user data on success
    """
    try:
        # Authenticate via Cloud Function
        auth_response = cloud_auth.login_and_get_token(login_request.email, login_request.password)
        
        if auth_response is None:
            return LoginResponse(
                success=False,
                error="Invalid email or password"
            )
        
        # Extract data from Cloud Function response
        token = auth_response.get("token")
        user_data = auth_response.get("user", {})
        
        # Create user object with data from Cloud Function
        user = User(
            email=user_data.get("email", login_request.email),
            created_at=user_data.get("created_at"),
            last_login=user_data.get("last_login")
        )
        
        return LoginResponse(
            success=True,
            token=token,
            user=user
        )
        
    except Exception as e:
        logger.error(f"Login failed: {str(e)}")
        return LoginResponse(
            success=False,
            error="Login failed. Please try again."
        )

@app.get("/auth/me", response_model=User)
async def get_current_user_info(current_user: User = Depends(get_current_user)):
    """
    Get current user information.
    
    Args:
        current_user: Current authenticated user (from token)
        
    Returns:
        User information
    """
    return current_user

# Individual test endpoints
@app.post("/analyze/tukey")
async def analyze_tukey(payload: TukeyTestRequest, current_user: User = Depends(get_current_user)):
    """ANOVA with Tukey's test endpoint."""
    data = [d.dict() for d in payload.data]
    
    # Validate batch size
    validation = BatchValidationConfig.validate_batch_size(len(data))
    if not validation['valid']:
        raise HTTPException(
            status_code=400, 
            detail=validation['error_message']
        )
    
    try:
        # Process single batch
        test_params = {"alpha": payload.alpha}
        df = pd.DataFrame(data)
        results = stat_engine.run_anova_tukey(df, **test_params)
        
        return {
            "parameter": payload.parameter,
            "test_type": "tukey",
            "batch_size": len(data),
            "user": current_user.email,
            "results": results
        }
    except Exception as e:
        logger.error(f"Tukey test failed: {str(e)}")
        raise HTTPException(status_code=400, detail=f"Tukey test failed: {str(e)}")



# Legacy endpoint for backward compatibility
@app.post("/analyze")
async def analyze(payload: TestRequest, current_user: User = Depends(get_current_user)):
    """
    Legacy endpoint for backward compatibility.
    This endpoint is deprecated - use specific test endpoints instead.
    """
    logger.warning("Using deprecated /analyze endpoint. Consider using specific test endpoints.")
    
    data = [d.dict() for d in payload.data]
    
    # Validate batch size
    validation = BatchValidationConfig.validate_batch_size(len(data))
    if not validation['valid']:
        raise HTTPException(
            status_code=400, 
            detail=validation['error_message']
        )
    
    # Map test types to functions
    test_functions = {
        "tukey": stat_engine.run_anova_tukey
    }
    
    if payload.test_type not in test_functions:
        raise HTTPException(status_code=400, detail=f"Unsupported test type: {payload.test_type}")
    
    test_function = test_functions[payload.test_type]
    test_params = {"alpha": 0.05}  # Default alpha for legacy endpoint
    
    try:
        # Process single batch
        df = pd.DataFrame(data)
        results = test_function(df, **test_params)
        
        return {
            "parameter": payload.parameter,
            "test_type": payload.test_type,
            "batch_size": len(data),
            "user": current_user.email,
            "results": results
        }
    except Exception as e:
        logger.error(f"Statistical test failed: {str(e)}")
        raise HTTPException(status_code=400, detail=f"Statistical test failed: {str(e)}") 