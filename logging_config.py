# Path: logging_config.py
"""
Purpose:
    Configures the application's logging system.

What it does:
    - Defines a standard log format.
    - Sets the root logger's level to INFO.
    - Configures a stream handler to output logs to standard output (stdout).
    - Provides a named logger 'AIDN Signal' for use throughout the project.
"""
import sys
import logging
from config import APP_NAME


# Define log format
LOG_FORMAT = "%(levelname)s - %(funcName)s - %(message)s"


# Configure root logger
logging.basicConfig(
    level=logging.INFO,
    format=LOG_FORMAT,
    handlers=[
        logging.StreamHandler(sys.stdout),  # Console handler
    ]
)

# Get logger
logger = logging.getLogger(APP_NAME or "API")

