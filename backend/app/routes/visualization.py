"""
Visualization endpoints for UMAP and scatter plot data.
"""
from fastapi import APIRouter, HTTPException, BackgroundTasks
from fastapi.responses import Response
from typing import Optional
import h5py
import io
from PIL import Image

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
    For metadata-only projects, returns empty coordinates.
    """
    project = db.get_project(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")

    embeddings_path = db.get_embeddings_path(project_id)
    if embeddings_path is None:
        raise HTTPException(status_code=404, detail="Embeddings file not found")

    # For metadata-only projects, skip UMAP computation
    coords_2d = None
    was_cached = False

    if project.has_embeddings:
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

    # For metadata-only projects, return empty coordinates
    if coords_2d is None:
        coords_2d_list = []
    else:
        coords_2d_list = coords_2d.tolist()

    return VisualizationResponse(
        coordinates=coords_2d_list,
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


@router.get("/{project_id}/thumbnail/{episode_index}")
async def get_thumbnail(project_id: str, episode_index: int):
    """
    Get the thumbnail image for a specific episode.

    Returns JPEG image bytes directly for efficient loading.
    """
    project = db.get_project(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")

    if not project.has_thumbnails:
        raise HTTPException(status_code=404, detail="Project does not have thumbnails")

    if episode_index < 0 or episode_index >= project.n_episodes:
        raise HTTPException(status_code=404, detail="Episode index out of range")

    embeddings_path = db.get_embeddings_path(project_id)
    if embeddings_path is None:
        raise HTTPException(status_code=404, detail="Embeddings file not found")

    try:
        with h5py.File(embeddings_path, 'r') as f:
            if 'thumbnails' not in f:
                raise HTTPException(status_code=404, detail="Thumbnails not found in file")

            thumbnails = f['thumbnails']
            thumbnail_data = thumbnails[episode_index]

            # Convert to bytes if it's a numpy array
            if hasattr(thumbnail_data, 'tobytes'):
                image_bytes = thumbnail_data.tobytes()
            else:
                image_bytes = bytes(thumbnail_data)

            return Response(
                content=image_bytes,
                media_type="image/jpeg",
                headers={
                    "Cache-Control": "public, max-age=86400"  # Cache for 24 hours
                }
            )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to load thumbnail: {str(e)}"
        )


@router.get("/{project_id}/gif/{episode_index}")
async def get_gif(project_id: str, episode_index: int):
    """
    Get the animated GIF for a specific episode.

    Returns GIF image bytes directly for efficient loading.
    GIFs show the full episode trajectory as an animation.
    """
    project = db.get_project(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")

    if not project.has_gifs:
        raise HTTPException(status_code=404, detail="Project does not have GIFs")

    if episode_index < 0 or episode_index >= project.n_episodes:
        raise HTTPException(status_code=404, detail="Episode index out of range")

    embeddings_path = db.get_embeddings_path(project_id)
    if embeddings_path is None:
        raise HTTPException(status_code=404, detail="Embeddings file not found")

    try:
        with h5py.File(embeddings_path, 'r') as f:
            if 'gifs' not in f:
                raise HTTPException(status_code=404, detail="GIFs not found in file")

            gifs = f['gifs']
            gif_data = gifs[episode_index]

            # Convert to bytes if it's a numpy array
            if hasattr(gif_data, 'tobytes'):
                image_bytes = gif_data.tobytes()
            else:
                image_bytes = bytes(gif_data)

            return Response(
                content=image_bytes,
                media_type="image/gif",
                headers={
                    "Cache-Control": "public, max-age=86400"  # Cache for 24 hours
                }
            )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to load GIF: {str(e)}"
        )


@router.get("/{project_id}/gif/{episode_index}/frame")
async def get_gif_first_frame(project_id: str, episode_index: int):
    """
    Get the first frame of a GIF as a static JPEG image.

    Used for gallery thumbnails to avoid loading all GIFs at once.
    """
    project = db.get_project(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")

    if not project.has_gifs:
        raise HTTPException(status_code=404, detail="Project does not have GIFs")

    if episode_index < 0 or episode_index >= project.n_episodes:
        raise HTTPException(status_code=404, detail="Episode index out of range")

    embeddings_path = db.get_embeddings_path(project_id)
    if embeddings_path is None:
        raise HTTPException(status_code=404, detail="Embeddings file not found")

    try:
        with h5py.File(embeddings_path, 'r') as f:
            if 'gifs' not in f:
                raise HTTPException(status_code=404, detail="GIFs not found in file")

            gifs = f['gifs']
            gif_data = gifs[episode_index]

            # Convert to bytes if it's a numpy array
            if hasattr(gif_data, 'tobytes'):
                gif_bytes = gif_data.tobytes()
            else:
                gif_bytes = bytes(gif_data)

            # Extract first frame from GIF and convert to JPEG
            gif_image = Image.open(io.BytesIO(gif_bytes))
            # Convert to RGB (GIFs may be in palette mode)
            rgb_image = gif_image.convert('RGB')

            # Save as JPEG
            output = io.BytesIO()
            rgb_image.save(output, format='JPEG', quality=85)
            jpeg_bytes = output.getvalue()

            return Response(
                content=jpeg_bytes,
                media_type="image/jpeg",
                headers={
                    "Cache-Control": "public, max-age=86400"  # Cache for 24 hours
                }
            )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to extract frame from GIF: {str(e)}"
        )
