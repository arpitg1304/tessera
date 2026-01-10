"""
Sampling endpoints for episode selection.
"""
from fastapi import APIRouter, HTTPException
from typing import Optional
import numpy as np

from ..database import db
from ..models import SamplingRequest, SamplingResponse
from ..services.sampling import sample_episodes, compute_coverage_score
from ..services.embedding_processor import load_embeddings, load_metadata, load_episode_ids

router = APIRouter()


@router.post("/{project_id}/sample", response_model=SamplingResponse)
async def sample_episodes_endpoint(
    project_id: str,
    request: SamplingRequest
):
    """
    Sample episodes using the specified strategy.

    Strategies:
    - kmeans: K-means diversity sampling (maximizes coverage)
    - stratified: Stratified sampling by metadata field
    - random: Random baseline sampling
    """
    project = db.get_project(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")

    embeddings_path = db.get_embeddings_path(project_id)
    if embeddings_path is None:
        raise HTTPException(status_code=404, detail="Embeddings file not found")

    # Check if embeddings are required for this strategy
    needs_embeddings = request.strategy == "kmeans"
    if needs_embeddings and not project.has_embeddings:
        raise HTTPException(
            status_code=400,
            detail="K-means sampling requires embeddings. Use stratified or random sampling for metadata-only projects."
        )

    # Load embeddings only if needed
    embeddings = None
    if project.has_embeddings:
        try:
            embeddings = load_embeddings(embeddings_path)
        except Exception as e:
            if needs_embeddings:
                raise HTTPException(
                    status_code=500,
                    detail=f"Failed to load embeddings: {str(e)}"
                )
            # For non-embedding strategies, continue without embeddings

    # Handle filter_indices - if provided, we sample only from these indices
    filter_indices = None
    index_mapping = None  # Maps filtered index back to original index
    if request.filter_indices is not None and len(request.filter_indices) > 0:
        filter_indices = np.array(request.filter_indices)
        # Validate indices are within bounds
        if np.any(filter_indices < 0) or np.any(filter_indices >= project.n_episodes):
            raise HTTPException(
                status_code=400,
                detail=f"filter_indices must be between 0 and {project.n_episodes - 1}"
            )
        available_count = len(filter_indices)
        # Store mapping from filtered space to original space
        index_mapping = filter_indices
        # Filter embeddings to only include filtered indices (if embeddings exist)
        if embeddings is not None:
            embeddings = embeddings[filter_indices]
    else:
        available_count = project.n_episodes

    # Validate n_samples against available episodes (filtered or total)
    if request.n_samples > available_count:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot sample {request.n_samples} episodes from {available_count} available"
        )

    # Load metadata if needed for stratified sampling
    metadata = None
    if request.strategy == "stratified":
        if not request.stratify_by:
            raise HTTPException(
                status_code=400,
                detail="stratify_by field is required for stratified sampling"
            )
        try:
            metadata = load_metadata(embeddings_path)
        except Exception as e:
            raise HTTPException(
                status_code=500,
                detail=f"Failed to load metadata: {str(e)}"
            )

        if request.stratify_by not in metadata:
            available = list(metadata.keys())
            raise HTTPException(
                status_code=400,
                detail=f"Field '{request.stratify_by}' not found. Available: {available}"
            )

        # Filter metadata to match filtered embeddings
        if index_mapping is not None:
            metadata = {
                key: [values[i] for i in index_mapping]
                for key, values in metadata.items()
            }

    # Perform sampling (on filtered embeddings if filter_indices provided)
    try:
        selected_indices, coverage_score = sample_episodes(
            embeddings=embeddings,
            n_samples=request.n_samples,
            strategy=request.strategy,
            metadata=metadata,
            stratify_by=request.stratify_by,
            random_state=request.random_seed,
            n_total=available_count  # Pass total for metadata-only projects
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Sampling failed: {str(e)}"
        )

    # Map selected indices back to original indices if we filtered
    if index_mapping is not None:
        selected_indices = index_mapping[selected_indices]

    # Get episode IDs for selected indices
    try:
        all_episode_ids = load_episode_ids(embeddings_path)
        selected_episode_ids = [all_episode_ids[i] for i in selected_indices]
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to load episode IDs: {str(e)}"
        )

    # Optionally save selection
    selection_id = None
    if request.selection_name:
        try:
            selection_id = db.save_selection(
                project_id=project_id,
                selection_name=request.selection_name,
                strategy=request.strategy,
                n_samples=len(selected_indices),
                selected_indices=selected_indices.tolist(),
                coverage_score=coverage_score
            )
        except Exception as e:
            # Don't fail the request, just log warning
            import logging
            logging.warning(f"Failed to save selection: {e}")

    return SamplingResponse(
        selected_indices=selected_indices.tolist(),
        selected_episode_ids=selected_episode_ids,
        n_samples=len(selected_indices),
        strategy=request.strategy,
        coverage_score=coverage_score,
        selection_id=selection_id
    )


@router.get("/{project_id}/coverage")
async def compute_coverage(
    project_id: str,
    indices: str  # Comma-separated list of indices
):
    """
    Compute coverage score for a custom selection of indices.
    """
    project = db.get_project(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")

    embeddings_path = db.get_embeddings_path(project_id)

    # Parse indices
    try:
        selected_indices = [int(i.strip()) for i in indices.split(",")]
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail="Invalid indices format. Use comma-separated integers."
        )

    # Validate indices
    if any(i < 0 or i >= project.n_episodes for i in selected_indices):
        raise HTTPException(
            status_code=400,
            detail=f"Indices must be between 0 and {project.n_episodes - 1}"
        )

    # Load embeddings and compute coverage
    try:
        embeddings = load_embeddings(embeddings_path)
        import numpy as np
        coverage = compute_coverage_score(embeddings, np.array(selected_indices))
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to compute coverage: {str(e)}"
        )

    return {
        "n_selected": len(selected_indices),
        "n_total": project.n_episodes,
        "coverage_score": coverage
    }


@router.get("/{project_id}/selection/{selection_id}")
async def get_selection(project_id: str, selection_id: int):
    """
    Get a saved selection by ID.
    """
    project = db.get_project(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")

    selection = db.get_selection(selection_id)
    if selection is None:
        raise HTTPException(status_code=404, detail="Selection not found")

    if selection["project_id"] != project_id:
        raise HTTPException(status_code=403, detail="Selection belongs to different project")

    # Get episode IDs
    embeddings_path = db.get_embeddings_path(project_id)
    try:
        all_episode_ids = load_episode_ids(embeddings_path)
        selected_episode_ids = [all_episode_ids[i] for i in selection["selected_indices"]]
    except Exception:
        selected_episode_ids = []

    return {
        "id": selection["id"],
        "selection_name": selection["selection_name"],
        "strategy": selection["strategy"],
        "n_samples": selection["n_samples"],
        "selected_indices": selection["selected_indices"],
        "selected_episode_ids": selected_episode_ids,
        "coverage_score": selection["coverage_score"],
        "created_at": selection["created_at"]
    }
