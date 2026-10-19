import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
ASSETS_DIR = BASE_DIR / "assets"

# Server configuration
BASE_URL = os.environ.get("AURORA_BASE_URL", "http://localhost:3000")
API_URL = f"{BASE_URL}/api"

# MySQL configuration
MYSQL_CONFIG = {
    "host": os.environ.get("AURORA_DB_HOST", "127.0.0.1"),
    "port": int(os.environ.get("AURORA_DB_PORT", "3306")),
    "user": os.environ.get("AURORA_DB_USER", "aurora_user"),
    "password": os.environ.get("AURORA_DB_PASSWORD", "aurora_password"),
    "database": os.environ.get("AURORA_DB_NAME", "db_aurora"),
    "charset": "utf8mb4",
    "autocommit": True,
}

# Redis configuration
REDIS_CONFIG = {
    "host": os.environ.get("AURORA_REDIS_HOST", "127.0.0.1"),
    "port": int(os.environ.get("AURORA_REDIS_PORT", "6379")),
    "db": int(os.environ.get("AURORA_REDIS_DB", "0")),
    "decode_responses": True,
}

# Sample test assets
ASSET_CIRCUIT_PDF = str(ASSETS_DIR / "sample_circuit.pdf")
ASSET_EXERCISES_PDF = str(ASSETS_DIR / "sample_exercises.pdf")
ASSET_TIMER_PDF = str(ASSETS_DIR / "sample_timer.pdf")
ASSET_NEGOCIACION_PDF = str(ASSETS_DIR / "sample_negociacion.pdf")
ASSET_IMAGE_JPG = str(ASSETS_DIR / "sample_image.jpg")
ASSET_DOCUMENT_HTML = str(ASSETS_DIR / "sample_document.html")
ASSET_PROTECTED_PDF = str(ASSETS_DIR / "sample_protected.pdf")
