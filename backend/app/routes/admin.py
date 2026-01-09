"""
Admin panel endpoints for system monitoring and management.
"""
from fastapi import APIRouter, HTTPException, Depends, status
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
import logging
import secrets

from ..config import config
from ..database import db
from ..utils.limits import get_storage_stats
from ..services.storage import get_project_size_mb, list_project_files

logger = logging.getLogger(__name__)
router = APIRouter()
security = HTTPBasic()


def verify_admin(credentials: HTTPBasicCredentials = Depends(security)):
    """
    Verify admin credentials using HTTP Basic Auth.

    Args:
        credentials: HTTP Basic Auth credentials

    Raises:
        HTTPException: If credentials are invalid
    """
    # Use constant-time comparison to prevent timing attacks
    correct_password = secrets.compare_digest(
        credentials.password,
        config.ADMIN_PASSWORD
    )

    if not (credentials.username == "admin" and correct_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
            headers={"WWW-Authenticate": "Basic"},
        )

    return credentials.username


class ProjectInfo(BaseModel):
    """Detailed project information for admin panel."""
    id: str
    dataset_name: Optional[str]
    description: Optional[str]
    n_episodes: int
    embedding_dim: int
    created_at: datetime
    expires_at: datetime
    storage_mb: float
    has_success_labels: bool
    has_task_labels: bool
    has_episode_length: bool
    is_example: bool = False


class RateLimitInfo(BaseModel):
    """Rate limit information."""
    ip_address: str
    upload_count: int
    last_upload: datetime


class SystemStats(BaseModel):
    """Overall system statistics."""
    total_projects: int
    total_storage_gb: float
    storage_used_gb: float
    storage_available_gb: float
    storage_usage_percent: float
    total_episodes: int
    active_ips: int


class AdminDashboard(BaseModel):
    """Complete admin dashboard data."""
    system_stats: SystemStats
    projects: List[ProjectInfo]
    rate_limits: List[RateLimitInfo]


@router.get("/admin/dashboard", response_model=AdminDashboard)
async def get_admin_dashboard(admin: str = Depends(verify_admin)):
    """
    Get complete admin dashboard data.

    Returns:
        System statistics, all projects, and rate limit info
    """
    try:
        # Get storage stats
        storage_stats = get_storage_stats()

        # Get all projects from database
        from ..database import get_connection

        projects = []
        total_episodes = 0

        with get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT id, dataset_name, description, n_episodes, embedding_dim,
                       created_at, expires_at, has_success_labels, has_task_labels,
                       has_episode_length, is_example
                FROM projects
                ORDER BY created_at DESC
            """)

            for row in cursor.fetchall():
                project_id = row["id"]

                # Get storage size for this project
                try:
                    storage_mb = get_project_size_mb(project_id)
                except Exception as e:
                    logger.warning(f"Could not get size for project {project_id}: {e}")
                    storage_mb = 0.0

                projects.append(ProjectInfo(
                    id=project_id,
                    dataset_name=row["dataset_name"],
                    description=row["description"],
                    n_episodes=row["n_episodes"],
                    embedding_dim=row["embedding_dim"],
                    created_at=datetime.fromisoformat(row["created_at"]),
                    expires_at=datetime.fromisoformat(row["expires_at"]),
                    storage_mb=storage_mb,
                    has_success_labels=bool(row["has_success_labels"]),
                    has_task_labels=bool(row["has_task_labels"]),
                    has_episode_length=bool(row["has_episode_length"]),
                    is_example=bool(row["is_example"]) if row["is_example"] is not None else False
                ))

                total_episodes += row["n_episodes"]

        # Get rate limit info
        rate_limits = []
        with get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT ip_address, COUNT(*) as upload_count, MAX(upload_timestamp) as last_upload
                FROM rate_limits
                WHERE upload_timestamp > datetime('now', '-24 hours')
                GROUP BY ip_address
                ORDER BY upload_count DESC
            """)

            for row in cursor.fetchall():
                rate_limits.append(RateLimitInfo(
                    ip_address=row["ip_address"],
                    upload_count=row["upload_count"],
                    last_upload=datetime.fromisoformat(row["last_upload"])
                ))

        # Build system stats
        system_stats = SystemStats(
            total_projects=len(projects),
            total_storage_gb=storage_stats.get("total_gb", 0),
            storage_used_gb=storage_stats.get("used_gb", 0),
            storage_available_gb=storage_stats.get("available_gb", 0),
            storage_usage_percent=storage_stats.get("usage_percent", 0),
            total_episodes=total_episodes,
            active_ips=len(rate_limits)
        )

        return AdminDashboard(
            system_stats=system_stats,
            projects=projects,
            rate_limits=rate_limits
        )

    except Exception as e:
        logger.error(f"Error getting admin dashboard: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/admin/projects/{project_id}")
async def delete_project_admin(project_id: str, admin: str = Depends(verify_admin)):
    """
    Delete a project (admin endpoint).

    Args:
        project_id: Project ID to delete
    """
    try:
        from ..services.storage import delete_project_files

        # Delete files
        deleted = delete_project_files(project_id)

        # Delete from database
        db.delete_project(project_id)

        logger.info(f"Admin deleted project {project_id}")

        return {
            "success": True,
            "project_id": project_id,
            "files_deleted": deleted
        }

    except Exception as e:
        logger.error(f"Error deleting project {project_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/admin/cleanup")
async def cleanup_expired_projects(admin: str = Depends(verify_admin)):
    """
    Clean up expired projects.

    Returns:
        Number of projects cleaned up
    """
    try:
        from ..services.storage import delete_project_files

        expired = db.get_expired_projects()
        cleaned = 0

        for project in expired:
            try:
                delete_project_files(project["id"])
                db.delete_project(project["id"])
                cleaned += 1
                logger.info(f"Cleaned up expired project: {project['id']}")
            except Exception as e:
                logger.error(f"Error cleaning up project {project['id']}: {e}")

        return {
            "success": True,
            "projects_cleaned": cleaned
        }

    except Exception as e:
        logger.error(f"Error during cleanup: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/admin/config")
async def get_system_config(admin: str = Depends(verify_admin)):
    """Get system configuration."""
    return {
        "max_file_size_mb": config.MAX_FILE_SIZE_MB,
        "max_episodes": config.MAX_EPISODES,
        "max_embedding_dim": config.MAX_EMBEDDING_DIM,
        "project_retention_days": config.PROJECT_RETENTION_DAYS,
        "storage_path": str(config.STORAGE_PATH),
        "database_path": str(config.DATABASE_PATH),
        "uploads_per_day_limit": config.UPLOADS_PER_DAY_LIMIT
    }


class SetExampleRequest(BaseModel):
    """Request to mark a project as an example."""
    dataset_name: Optional[str] = None
    description: Optional[str] = None
    order: int = 0


@router.post("/admin/projects/{project_id}/set-example")
async def set_project_as_example(
    project_id: str,
    request: SetExampleRequest,
    admin: str = Depends(verify_admin)
):
    """
    Mark a project as a featured example.

    Args:
        project_id: Project ID to mark as example
        request: Example metadata
    """
    try:
        from ..database import get_connection

        # Check project exists
        project = db.get_project(project_id)
        if project is None:
            raise HTTPException(status_code=404, detail="Project not found")

        # Update project with example flag and metadata
        with get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                UPDATE projects
                SET is_example = TRUE,
                    example_order = ?,
                    expires_at = datetime('9999-12-31'),
                    dataset_name = COALESCE(?, dataset_name),
                    description = COALESCE(?, description)
                WHERE id = ?
            """, (request.order, request.dataset_name, request.description, project_id))
            conn.commit()

        logger.info(f"Admin marked project {project_id} as example")

        return {
            "success": True,
            "project_id": project_id,
            "is_example": True
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error setting project as example: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/admin/projects/{project_id}/unset-example")
async def unset_project_as_example(
    project_id: str,
    admin: str = Depends(verify_admin)
):
    """
    Remove example status from a project.
    """
    try:
        from ..database import get_connection
        from datetime import timedelta

        project = db.get_project(project_id)
        if project is None:
            raise HTTPException(status_code=404, detail="Project not found")

        # Reset example flag and set normal expiration
        new_expires = datetime.now() + timedelta(days=config.PROJECT_RETENTION_DAYS)

        with get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                UPDATE projects
                SET is_example = FALSE,
                    example_order = 0,
                    expires_at = ?
                WHERE id = ?
            """, (new_expires, project_id))
            conn.commit()

        logger.info(f"Admin removed example status from project {project_id}")

        return {
            "success": True,
            "project_id": project_id,
            "is_example": False
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error unsetting project as example: {e}")
        raise HTTPException(status_code=500, detail=str(e))
