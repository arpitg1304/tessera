"""
Tessera - Robotics Dataset Diversity Analysis

FastAPI application initialization and configuration.
"""
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import config
from .database import init_db
from .routes import upload, projects, visualization, sampling, export
from .services.storage import ensure_storage_path
from .utils.limits import get_storage_stats

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler for startup/shutdown events."""
    # Startup
    logger.info("Starting Tessera API...")

    # Ensure storage directories exist
    ensure_storage_path()
    logger.info(f"Storage path: {config.STORAGE_PATH}")

    # Initialize database
    init_db()
    logger.info(f"Database initialized: {config.DATABASE_PATH}")

    # Log storage stats
    stats = get_storage_stats()
    if "error" not in stats:
        logger.info(
            f"Storage: {stats['used_gb']:.2f}GB used / "
            f"{stats['total_gb']:.2f}GB total ({stats['usage_percent']:.1f}%)"
        )

    yield

    # Shutdown
    logger.info("Shutting down Tessera API...")


# Create FastAPI application
app = FastAPI(
    title="Tessera API",
    description="Robotics Dataset Diversity Analysis and Intelligent Episode Sampling",
    version="1.0.0",
    lifespan=lifespan
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:5173",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
        # Add production domain when deployed
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Include routers
app.include_router(
    upload.router,
    prefix="/api",
    tags=["Upload"]
)

app.include_router(
    projects.router,
    prefix="/api/project",
    tags=["Projects"]
)

app.include_router(
    visualization.router,
    prefix="/api/project",
    tags=["Visualization"]
)

app.include_router(
    sampling.router,
    prefix="/api/project",
    tags=["Sampling"]
)

app.include_router(
    export.router,
    prefix="/api/project",
    tags=["Export"]
)


# Health check endpoint
@app.get("/health", tags=["Health"])
async def health_check():
    """Health check endpoint."""
    from .database import db

    stats = get_storage_stats()
    total_projects = db.get_total_projects()

    return {
        "status": "healthy",
        "version": "1.0.0",
        "storage_usage_percent": stats.get("usage_percent"),
        "active_projects": total_projects
    }


@app.get("/", tags=["Health"])
async def root():
    """Root endpoint."""
    return {
        "name": "Tessera API",
        "version": "1.0.0",
        "description": "Robotics Dataset Diversity Analysis",
        "docs": "/docs",
        "health": "/health"
    }


# API info endpoint
@app.get("/api", tags=["Info"])
async def api_info():
    """API information endpoint."""
    return {
        "endpoints": {
            "upload": "POST /api/upload",
            "validate": "POST /api/validate",
            "project": "GET /api/project/{id}",
            "visualization": "GET /api/project/{id}/visualization",
            "sample": "POST /api/project/{id}/sample",
            "export": "POST /api/project/{id}/export"
        },
        "limits": {
            "max_file_size_mb": config.MAX_FILE_SIZE_MB,
            "max_episodes": config.MAX_EPISODES,
            "max_embedding_dim": config.MAX_EMBEDDING_DIM,
            "project_retention_days": config.PROJECT_RETENTION_DAYS
        }
    }
