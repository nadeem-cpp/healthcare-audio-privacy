# Path: main.py
"""
Purpose:
    FastAPI application entrypoint for the AIDN Signal API.

What it does:
    - Creates the FastAPI app and disables Swagger/OpenAPI when ENVIRONMENT=production.
    - Adds CORS and slowapi rate-limiter middleware, then mounts API and webhook routers.
    - On startup: loads model/file config into app.state, warms ConfigCache, and starts the APScheduler job for Google Calendar watch channels.
    - Exposes /health and closes the DB connection on shutdown.
"""
from fastapi import FastAPI
from routers.routers import api_router
from db.db import (
    init_db,
    close_db_conn
)
from middlewares.cors import add_cors_middleware
from middlewares.limiter import add_slowapi_middleware, limiter
from contextlib import asynccontextmanager


from config import ENVIRONMENT, APP_NAME


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()

    yield

    await close_db_conn()


_enable_docs = ENVIRONMENT.lower() != "production"

app = FastAPI(
    title=APP_NAME or "API",
    docs_url="/docs" if _enable_docs else None,
    redoc_url="/redoc" if _enable_docs else None,
    openapi_url="/openapi.json" if _enable_docs else None,
    lifespan=lifespan
)

app.state.limiter = limiter

add_cors_middleware(app)
add_slowapi_middleware(app)

app.include_router(api_router, prefix="/api")


@app.get("/health")
async def health_check():
    return {
        "status": "ok",
        "message": f"{APP_NAME or 'API'} is running",
    }

