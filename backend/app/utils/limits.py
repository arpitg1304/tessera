"""
Rate limiting and resource management utilities.
"""
import shutil
from pathlib import Path

from ..config import config
from ..database import db


def check_rate_limit_exceeded(ip_address: str) -> tuple[bool, str]:
    """
    Check if an IP has exceeded upload limits.

    Args:
        ip_address: The client IP address

    Returns:
        Tuple of (exceeded: bool, message: str)
    """
    # Check hourly limit
    hourly_count = db.get_upload_count(ip_address, hours=1)
    if hourly_count >= config.MAX_UPLOADS_PER_IP_PER_HOUR:
        return True, f"Hourly upload limit reached ({config.MAX_UPLOADS_PER_IP_PER_HOUR}/hour). Please try again later."

    # Check daily limit
    daily_count = db.get_upload_count(ip_address, hours=24)
    if daily_count >= config.MAX_UPLOADS_PER_IP_PER_DAY:
        return True, f"Daily upload limit reached ({config.MAX_UPLOADS_PER_IP_PER_DAY}/day). Please try again tomorrow."

    return False, ""


def record_upload(ip_address: str) -> None:
    """Record an upload for rate limiting."""
    db.record_upload(ip_address)


def get_disk_usage_percent() -> float:
    """
    Get current disk usage percentage for storage path.

    Returns:
        Disk usage as a percentage (0-100)
    """
    try:
        total, used, free = shutil.disk_usage(config.STORAGE_PATH)
        return (used / total) * 100
    except Exception:
        # If we can't check, assume it's okay
        return 0.0


def get_storage_stats() -> dict:
    """
    Get detailed storage statistics.

    Returns:
        Dictionary with storage stats
    """
    try:
        total, used, free = shutil.disk_usage(config.STORAGE_PATH)
        return {
            "total_gb": total / (1024 ** 3),
            "used_gb": used / (1024 ** 3),
            "free_gb": free / (1024 ** 3),
            "usage_percent": (used / total) * 100
        }
    except Exception as e:
        return {"error": str(e)}


def check_storage_available() -> tuple[bool, str]:
    """
    Check if there's enough storage available for uploads.

    Returns:
        Tuple of (available: bool, message: str)
    """
    usage = get_disk_usage_percent()

    if usage > config.EMERGENCY_CLEANUP_THRESHOLD * 100:
        return False, "Storage capacity reached. Please try again later."

    if usage > 85:
        return True, "Warning: Storage is getting full."

    return True, ""


def enforce_storage_limits() -> str:
    """
    Delete old projects if storage is too full.

    Returns:
        Status message
    """
    usage = get_disk_usage_percent()

    if usage > config.EMERGENCY_CLEANUP_THRESHOLD * 100:
        # Delete oldest 20% of projects
        total = db.get_total_projects()
        n_to_delete = max(1, int(total * 0.2))

        oldest = db.get_oldest_projects(n_to_delete)
        for project in oldest:
            project_dir = Path(project['embeddings_path']).parent
            if project_dir.exists():
                shutil.rmtree(project_dir)
            db.delete_project(project['id'])

        return f"emergency_cleanup: deleted {len(oldest)} projects"

    return "ok"


def get_file_size_mb(file_path: Path) -> float:
    """
    Get file size in megabytes.

    Args:
        file_path: Path to the file

    Returns:
        File size in MB
    """
    return file_path.stat().st_size / (1024 * 1024)
