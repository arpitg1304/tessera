"""
Tessera Configuration
"""
import os
from pathlib import Path


class Config:
    """Application configuration with resource limits and paths."""

    # Upload limits
    MAX_FILE_SIZE_MB: int = 100
    MAX_EPISODES: int = 200_000
    MAX_EMBEDDING_DIM: int = 2048

    # Rate limits
    MAX_UPLOADS_PER_IP_PER_DAY: int = 20
    MAX_UPLOADS_PER_IP_PER_HOUR: int = 2

    # Storage
    MAX_TOTAL_STORAGE_GB: int = 40
    PROJECT_RETENTION_DAYS: int = 7
    EMERGENCY_CLEANUP_THRESHOLD: float = 0.90

    # Processing
    MAX_UMAP_PROCESSING_TIME_SECONDS: int = 60
    MAX_CONCURRENT_UMAP: int = 2

    # Paths - use environment variables or defaults
    BASE_PATH: Path = Path(os.getenv("TESSERA_BASE_PATH", "/var/tessera"))
    STORAGE_PATH: Path = Path(os.getenv("STORAGE_PATH", "/var/tessera/storage"))
    DATABASE_PATH: Path = Path(os.getenv("DATABASE_PATH", "/var/tessera/tessera.db"))

    # UMAP settings
    UMAP_N_NEIGHBORS: int = 15
    UMAP_MIN_DIST: float = 0.1
    UMAP_METRIC: str = "cosine"
    UMAP_RANDOM_STATE: int = 42

    # Project ID settings
    PROJECT_ID_LENGTH: int = 8

    # Admin panel security
    ADMIN_PASSWORD: str = os.getenv("ADMIN_PASSWORD", "admin123")  # Change in production!
    UPLOADS_PER_DAY_LIMIT: int = 10  # Max uploads per IP per day

    @classmethod
    def ensure_directories(cls) -> None:
        """Ensure all required directories exist."""
        cls.BASE_PATH.mkdir(parents=True, exist_ok=True)
        cls.STORAGE_PATH.mkdir(parents=True, exist_ok=True)

    @classmethod
    def get_project_dir(cls, project_id: str) -> Path:
        """Get the storage directory for a project."""
        return cls.STORAGE_PATH / project_id

    @classmethod
    def get_embeddings_path(cls, project_id: str) -> Path:
        """Get the embeddings file path for a project."""
        return cls.get_project_dir(project_id) / "embeddings.h5"

    @classmethod
    def get_umap_cache_path(cls, project_id: str) -> Path:
        """Get the UMAP cache file path for a project."""
        return cls.get_project_dir(project_id) / "umap_2d.npy"

    @classmethod
    def get_metadata_cache_path(cls, project_id: str) -> Path:
        """Get the metadata cache file path for a project."""
        return cls.get_project_dir(project_id) / "metadata.json"


# Create a singleton config instance
config = Config()
