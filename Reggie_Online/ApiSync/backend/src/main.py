from fastapi import FastAPI
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

openapi_tags = [
    {
        "name": "system",
        "description": "System and service-level endpoints.",
    },
    {
        "name": "permissions",
        "description": "Resolve user access permissions.",
    },
    {
        "name": "metadata",
        "description": "Read-only metadata query endpoints.",
    },
    {
        "name": "phone-app",
        "description": "Phone app NFC metadata endpoints.",
    },
    {
        "name": "sensors",
        "description": "Sensor registration and update actions.",
    },
]

app = FastAPI(title="ApiSync", version="1.0.0", openapi_tags=openapi_tags)

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

# Frontend is hosted separately; backend is API-only

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run(app, host="0.0.0.0", port=port)

