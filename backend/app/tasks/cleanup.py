"""
Cleanup tasks for expired projects and orphaned files.

Run via cron: 0 3 * * * python -m app.tasks.cleanup
"""
import os
import shutil
import logging
from pathlib import Path
from datetime import datetime

from ..config import config
from ..database import db

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def cleanup_expired_projects() -> int:
    """
    Delete projects older than retention period.

    Returns:
        Number of projects deleted
    """
    expired = db.get_expired_projects()

    deleted_count = 0
    for project in expired:
        project_id = project['id']
        embeddings_path = project['embeddings_path']

        # Delete files
        project_dir = Path(embeddings_path).parent
        if project_dir.exists():
            try:
                shutil.rmtree(project_dir)
                logger.info(f"Deleted files for expired project: {project_id}")
            except Exception as e:
                logger.error(f"Failed to delete files for {project_id}: {e}")
                continue

        # Delete database entry
        if db.delete_project(project_id):
            deleted_count += 1
            logger.info(f"Deleted expired project from database: {project_id}")

    return deleted_count


def cleanup_orphaned_files() -> int:
    """
    Delete files with no database entry.

    Returns:
        Number of orphaned directories deleted
    """
    if not config.STORAGE_PATH.exists():
        return 0

    deleted_count = 0
    for project_dir in config.STORAGE_PATH.iterdir():
        if not project_dir.is_dir():
            continue

        project_id = project_dir.name

        # Check if project exists in database
        if db.get_project(project_id) is None:
            try:
                shutil.rmtree(project_dir)
                deleted_count += 1
                logger.info(f"Deleted orphaned files for: {project_id}")
            except Exception as e:
                logger.error(f"Failed to delete orphaned files for {project_id}: {e}")

    return deleted_count


def cleanup_old_rate_limits() -> int:
    """
    Clean up old rate limit entries.

    Returns:
        Number of entries deleted
    """
    return db.cleanup_old_rate_limits(hours=24)


def run_all_cleanup() -> dict:
    """
    Run all cleanup tasks.

    Returns:
        Dictionary with cleanup statistics
    """
    logger.info("Starting cleanup tasks...")
    start_time = datetime.now()

    stats = {
        "expired_projects": cleanup_expired_projects(),
        "orphaned_files": cleanup_orphaned_files(),
        "old_rate_limits": cleanup_old_rate_limits(),
        "duration_seconds": 0
    }

    stats["duration_seconds"] = (datetime.now() - start_time).total_seconds()

    logger.info(f"Cleanup complete: {stats}")
    return stats


if __name__ == "__main__":
    # Run cleanup when executed directly
    run_all_cleanup()
