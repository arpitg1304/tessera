"""
File storage operations.
"""
import os
import shutil
from pathlib import Path
from typing import Optional
import logging

from ..config import config

logger = logging.getLogger(__name__)


def create_project_directory(project_id: str) -> Path:
    """
    Create storage directory for a project.

    Args:
        project_id: The project ID

    Returns:
        Path to the project directory
    """
    project_dir = config.get_project_dir(project_id)
    project_dir.mkdir(parents=True, exist_ok=True)
    logger.info(f"Created project directory: {project_dir}")
    return project_dir


def move_to_permanent_storage(
    temp_path: Path,
    project_id: str
) -> Path:
    """
    Move uploaded file to permanent storage.

    Args:
        temp_path: Path to temporary file
        project_id: The project ID

    Returns:
        Path to the permanent file
    """
    project_dir = create_project_directory(project_id)
    permanent_path = config.get_embeddings_path(project_id)

    shutil.move(str(temp_path), str(permanent_path))
    logger.info(f"Moved file to permanent storage: {permanent_path}")

    return permanent_path


def delete_project_files(project_id: str) -> bool:
    """
    Delete all files for a project.

    Args:
        project_id: The project ID

    Returns:
        True if deleted, False if not found
    """
    project_dir = config.get_project_dir(project_id)

    if project_dir.exists():
        shutil.rmtree(project_dir)
        logger.info(f"Deleted project directory: {project_dir}")
        return True

    return False


def get_project_size_mb(project_id: str) -> float:
    """
    Get total size of project files in MB.

    Args:
        project_id: The project ID

    Returns:
        Size in MB
    """
    project_dir = config.get_project_dir(project_id)

    if not project_dir.exists():
        return 0.0

    total_size = sum(
        f.stat().st_size
        for f in project_dir.rglob('*')
        if f.is_file()
    )

    return total_size / (1024 * 1024)


def list_project_files(project_id: str) -> list[dict]:
    """
    List all files in a project directory.

    Args:
        project_id: The project ID

    Returns:
        List of file info dictionaries
    """
    project_dir = config.get_project_dir(project_id)

    if not project_dir.exists():
        return []

    files = []
    for f in project_dir.iterdir():
        if f.is_file():
            files.append({
                "name": f.name,
                "size_mb": f.stat().st_size / (1024 * 1024),
                "modified": f.stat().st_mtime
            })

    return files


def cleanup_temp_file(temp_path: Path) -> None:
    """
    Clean up a temporary file.

    Args:
        temp_path: Path to the temporary file
    """
    if temp_path.exists():
        os.remove(temp_path)
        logger.debug(f"Cleaned up temp file: {temp_path}")


def get_total_storage_used_gb() -> float:
    """
    Get total storage used by all projects in GB.

    Returns:
        Total storage in GB
    """
    if not config.STORAGE_PATH.exists():
        return 0.0

    total_size = sum(
        f.stat().st_size
        for f in config.STORAGE_PATH.rglob('*')
        if f.is_file()
    )

    return total_size / (1024 ** 3)


def ensure_storage_path() -> None:
    """Ensure the storage path exists."""
    config.ensure_directories()
