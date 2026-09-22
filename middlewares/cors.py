# Path: middlewares/cors.py
"""
Purpose:
    Configures Cross-Origin Resource Sharing (CORS) for the application.

What it does:
    - Adds the CORSMiddleware to the FastAPI application.
    - Allows only origins listed in CORS_ALLOWED_ORIGINS from the environment.
    - Enables support for credentials in cross-origin requests.
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import CORS_ALLOWED_ORIGINS


def add_cors_middleware(app: FastAPI):
    app.add_middleware(
        CORSMiddleware,
        allow_origins=CORS_ALLOWED_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
