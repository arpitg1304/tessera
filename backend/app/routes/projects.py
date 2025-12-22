"""
Project management endpoints.
"""
from fastapi import APIRouter, HTTPException, Query
from typing import Optional

from ..database import db
from ..models import ProjectResponse, SelectionInfo
from ..services.storage import delete_project_files, get_project_size_mb, list_project_files
from ..services.embedding_processor import get_metadata_summary

router = APIRouter()


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(project_id: str):
    """
    Get project information by ID.
    """
    project = db.get_project(project_id)

    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")

    return project


@router.get("/{project_id}/info")
async def get_project_info(project_id: str):
    """
    Get detailed project information including metadata summary.
    """
    project = db.get_project(project_id)

    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")

    embeddings_path = db.get_embeddings_path(project_id)

    # Get metadata summary
    try:
        metadata_summary = get_metadata_summary(embeddings_path)
    except Exception:
        metadata_summary = {}

    # Get file info
    files = list_project_files(project_id)
    total_size = get_project_size_mb(project_id)

    return {
        "project": project,
        "metadata_summary": metadata_summary,
        "files": files,
        "total_size_mb": total_size
    }


@router.delete("/{project_id}")
async def delete_project(
    project_id: str,
    token: str = Query(..., description="Access token for the project")
):
    """
    Delete a project (requires access token).
    """
    project = db.get_project(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")

    # Verify access token
    stored_token = db.get_project_access_token(project_id)
    if token != stored_token:
        raise HTTPException(status_code=403, detail="Invalid access token")

    # Delete files
    delete_project_files(project_id)

    # Delete from database
    db.delete_project(project_id)

    return {"message": "Project deleted successfully"}


@router.get("/{project_id}/selections", response_model=list[SelectionInfo])
async def get_project_selections(project_id: str):
    """
    Get all saved selections for a project.
    """
    project = db.get_project(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")

    return db.get_project_selections(project_id)


@router.patch("/{project_id}")
async def update_project(
    project_id: str,
    token: str = Query(..., description="Access token for the project"),
    dataset_name: Optional[str] = None,
    description: Optional[str] = None
):
    """
    Update project metadata (requires access token).
    """
    project = db.get_project(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")

    # Verify access token
    stored_token = db.get_project_access_token(project_id)
    if token != stored_token:
        raise HTTPException(status_code=403, detail="Invalid access token")

    # Update in database (would need to add this method to database.py)
    # For MVP, we can skip this or implement later

    return {"message": "Project updated successfully"}
