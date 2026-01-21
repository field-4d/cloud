"""
GET endpoints for the ApiSync application.
"""
from fastapi import APIRouter
from fastapi.responses import FileResponse, HTMLResponse
import os
import logging

# Set up logger
logger = logging.getLogger(__name__)
# Ensure logger is configured
if not logger.handlers:
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter('%(asctime)s | %(levelname)-8s | %(name)s | %(message)s', datefmt='%Y-%m-%d %H:%M:%S'))
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)

router = APIRouter()


@router.get("/health")
async def health_check():
    """Health check endpoint."""
    logger.info(f"[ENDPOINT] GET /health")
    print(f"[ENDPOINT] GET /health")  # Also print to ensure visibility
    return {"status": "ok"}


@router.get("/", response_class=HTMLResponse)
async def frontend():
    """Serve the frontend HTML page."""
    frontend_file = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "frontend", "index.html")
    if os.path.exists(frontend_file):
        return FileResponse(frontend_file, media_type="text/html")
    return HTMLResponse(content="<h1>Frontend not found</h1><p>Please ensure frontend/index.html exists.</p>")

