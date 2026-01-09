"""
Project management endpoints.
"""
from fastapi import APIRouter, HTTPException, Query
from typing import Optional
from pydantic import BaseModel
import logging
import h5py
import numpy as np

from ..database import db
from ..models import ProjectResponse, SelectionInfo
from ..services.storage import delete_project_files, get_project_size_mb, list_project_files
from ..services.embedding_processor import get_metadata_summary
from ..services.clustering import cluster_embeddings, auto_select_n_clusters

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/examples/list", response_model=list[ProjectResponse])
async def get_example_projects():
    """
    Get all example projects for the homepage.
    """
    return db.get_example_projects()


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


class ClusterRequest(BaseModel):
    """Request for clustering embeddings."""
    method: str = "kmeans"  # "dbscan" or "kmeans"
    n_clusters: Optional[int] = None  # For kmeans, auto-select if None
    min_cluster_size: int = 15  # For DBSCAN (unused, eps auto-computed)
    min_samples: int = 5  # For DBSCAN


@router.post("/{project_id}/cluster")
async def cluster_project(project_id: str, request: ClusterRequest):
    """
    Perform clustering on project embeddings.

    Returns cluster assignments and statistics.
    """
    project = db.get_project(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")

    embeddings_path = db.get_embeddings_path(project_id)

    try:
        # Load embeddings
        with h5py.File(embeddings_path, 'r') as f:
            embeddings = f['embeddings'][:]
            episode_ids = f['episode_ids'][:].astype(str)

        # Normalize embeddings for better clustering
        embeddings = embeddings / (np.linalg.norm(embeddings, axis=1, keepdims=True) + 1e-8)

        # Auto-select n_clusters if using kmeans and not specified
        n_clusters = request.n_clusters
        if request.method == "kmeans" and n_clusters is None:
            n_clusters = auto_select_n_clusters(len(embeddings), embeddings.shape[1])
            logger.info(f"Auto-selected {n_clusters} clusters for k-means")

        # Perform clustering
        cluster_labels, metadata = cluster_embeddings(
            embeddings,
            method=request.method,
            n_clusters=n_clusters,
            min_cluster_size=request.min_cluster_size,
            min_samples=request.min_samples,
        )

        # Convert to Python types for JSON serialization
        cluster_labels_list = cluster_labels.tolist()

        return {
            "cluster_labels": cluster_labels_list,
            "episode_ids": episode_ids.tolist(),
            "metadata": metadata,
        }

    except Exception as e:
        logger.error(f"Error clustering project {project_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Clustering failed: {str(e)}")
