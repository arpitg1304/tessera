"""
Visualization endpoints for UMAP and scatter plot data.
"""
from fastapi import APIRouter, HTTPException, BackgroundTasks
from typing import Optional

from ..database import db
from ..models import VisualizationResponse, VisualizationStatus
from ..services.dimensionality_reduction import (
    compute_or_load_umap,
    get_cached_umap,
    estimate_umap_time
)
from ..services.embedding_processor import (
    load_episode_ids,
    load_metadata,
    load_cached_metadata,
    cache_metadata
)

router = APIRouter()


@router.get("/{project_id}/visualization", response_model=VisualizationResponse)
async def get_visualization(project_id: str):
    """
    Get visualization data for a project.

    Returns 2D UMAP coordinates and metadata for scatter plot rendering.
    UMAP is computed on first request and cached for future use.
    """
    project = db.get_project(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")

    embeddings_path = db.get_embeddings_path(project_id)
    if embeddings_path is None:
        raise HTTPException(status_code=404, detail="Embeddings file not found")

    # Get or compute UMAP coordinates
    try:
        coords_2d, was_cached = compute_or_load_umap(project_id, embeddings_path)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to compute visualization: {str(e)}"
        )

    # Load episode IDs and metadata
    try:
        # Try cached metadata first
        cached = load_cached_metadata(project_id)
        if cached:
            episode_ids = cached["episode_ids"]
            metadata = cached["metadata"]
        else:
            episode_ids = load_episode_ids(embeddings_path)
            metadata = load_metadata(embeddings_path)
            # Cache for future use
            cache_metadata(project_id, embeddings_path)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to load metadata: {str(e)}"
        )

    return VisualizationResponse(
        coordinates=coords_2d.tolist(),
        episode_ids=episode_ids,
        metadata=metadata,
        n_episodes=len(episode_ids),
        umap_cached=was_cached
    )


@router.get("/{project_id}/visualization/status", response_model=VisualizationStatus)
async def get_visualization_status(project_id: str):
    """
    Check if UMAP visualization is ready or still computing.
    """
    project = db.get_project(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")

    # Check if cached
    cached = get_cached_umap(project_id)
    if cached is not None:
        return VisualizationStatus(
            status="ready",
            message="Visualization is ready"
        )

    # Estimate computation time
    est_time = estimate_umap_time(project.n_episodes, project.embedding_dim)

    return VisualizationStatus(
        status="pending",
        message=f"UMAP not yet computed. Estimated time: {est_time:.0f} seconds"
    )


@router.post("/{project_id}/visualization/compute")
async def trigger_umap_computation(
    project_id: str,
    background_tasks: BackgroundTasks
):
    """
    Trigger UMAP computation in the background.

    This endpoint returns immediately and computation happens async.
    Use the status endpoint to check progress.
    """
    project = db.get_project(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")

    # Check if already computed
    cached = get_cached_umap(project_id)
    if cached is not None:
        return {"status": "already_computed", "message": "UMAP already available"}

    embeddings_path = db.get_embeddings_path(project_id)

    # Add to background tasks
    def compute_umap_task():
        try:
            compute_or_load_umap(project_id, embeddings_path)
        except Exception as e:
            # Log error but don't raise (background task)
            import logging
            logging.error(f"UMAP computation failed for {project_id}: {e}")

    background_tasks.add_task(compute_umap_task)

    est_time = estimate_umap_time(project.n_episodes, project.embedding_dim)

    return {
        "status": "computing",
        "message": f"UMAP computation started. Estimated time: {est_time:.0f} seconds"
    }


@router.get("/{project_id}/coordinates")
async def get_coordinates_only(project_id: str):
    """
    Get just the 2D coordinates (lighter response for updates).
    """
    project = db.get_project(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")

    cached = get_cached_umap(project_id)
    if cached is None:
        raise HTTPException(
            status_code=404,
            detail="Visualization not yet computed. Call /visualization first."
        )

    return {
        "coordinates": cached.tolist(),
        "n_episodes": len(cached)
    }
