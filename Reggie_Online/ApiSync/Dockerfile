# ApiSync backend - GCP Cloud Run
FROM python:3.11-slim

WORKDIR /app

# Copy backend contents (auth/.env excluded via .dockerignore)
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/src ./src
COPY backend/auth ./auth

# Expose port for Cloud Run (uses PORT env var at runtime)
EXPOSE 8080

# Cloud Run sets PORT; default 8080
ENV PORT=8080
# Use exec form so uvicorn receives OS signals (e.g. SIGTERM for graceful shutdown)
CMD ["sh", "-c", "exec uvicorn src.main:app --host 0.0.0.0 --port ${PORT}"]
