from fastapi import FastAPI, HTTPException
from app.test_models import (
    TestRequest, TukeyTestRequest
)
from app import stat_engine
from app.config import BatchValidationConfig, AppConfig
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

# Individual test endpoints
@app.post("/analyze/tukey")
async def analyze_tukey(payload: TukeyTestRequest):
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
            "results": results
        }
    except Exception as e:
        logger.error(f"Tukey test failed: {str(e)}")
        raise HTTPException(status_code=400, detail=f"Tukey test failed: {str(e)}")



# Legacy endpoint for backward compatibility
@app.post("/analyze")
async def analyze(payload: TestRequest):
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
            "results": results
        }
    except Exception as e:
        logger.error(f"Statistical test failed: {str(e)}")
        raise HTTPException(status_code=400, detail=f"Statistical test failed: {str(e)}") 