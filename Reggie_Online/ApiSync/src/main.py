from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
import os
import logging
from datetime import datetime

# Configure logging with timestamps
# Force configuration to ensure our format is used
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s | %(levelname)-8s | %(name)s | %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S',
    force=True  # Force reconfiguration even if logging was already configured
)

# Import routers
from .api.get_endpoints import router as get_router
from .api.firestore_endpoints import router as fs_router
from .api.websocket_endpoints import websocket_ping

app = FastAPI(title="ApiSync", version="1.0.0")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(get_router)
app.include_router(fs_router)  # Firestore endpoints

# Register WebSocket endpoints
app.websocket("/ws/ping")(websocket_ping)

# Serve frontend static files
frontend_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend")
if os.path.exists(frontend_path):
    app.mount("/static", StaticFiles(directory=frontend_path), name="static")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

