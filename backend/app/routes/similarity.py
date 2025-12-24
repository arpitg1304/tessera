"""
Similarity search endpoints.
"""
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
import numpy as np
from sklearn.neighbors import NearestNeighbors
import logging

from ..config import config
from ..services.embedding_processor import load_embeddings
from ..database import db

logger = logging.getLogger(__name__)
router = APIRouter()


class SimilarityRequest(BaseModel):
    """Request for finding similar episodes."""
    source_indices: list[int] = Field(
        ...,
        description="Indices of episodes to find similar to",
        min_length=1
    )
    k: int = Field(
        default=10,
        description="Number of similar episodes to return per source",
        ge=1,
        le=100
    )
    include_distances: bool = Field(
        default=False,
        description="Whether to include distance values in response"
    )


class SimilarityResponse(BaseModel):
    """Response with similar episodes."""
    similar_indices: list[int] = Field(
        description="Indices of similar episodes (deduplicated)"
    )
    n_results: int = Field(
        description="Total number of similar episodes found"
    )
    distances: list[float] | None = Field(
        default=None,
        description="Distances for each similar episode (if requested)"
    )


@router.post("/projects/{project_id}/similar", response_model=SimilarityResponse)
async def find_similar_episodes(
    project_id: str,
    request: SimilarityRequest
):
    """
    Find similar episodes using K-nearest neighbors on embeddings.

    Uses the original high-dimensional embeddings (not UMAP 2D) for
    accurate similarity computation.

    Args:
        project_id: The project ID
        request: Similarity search request

    Returns:
        Similar episode indices and optional distances
    """
    # Get project
    project = db.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Load embeddings
    embeddings_path = config.get_embeddings_path(project_id)
    if not embeddings_path.exists():
        raise HTTPException(status_code=404, detail="Embeddings file not found")

    try:
        embeddings = load_embeddings(embeddings_path)
        n_episodes = len(embeddings)

        # Validate indices
        for idx in request.source_indices:
            if idx < 0 or idx >= n_episodes:
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid index {idx}. Must be between 0 and {n_episodes - 1}"
                )

        # Build K-NN index
        # Use k+1 to account for the source episode itself being in results
        k_neighbors = min(request.k + 1, n_episodes)
        knn = NearestNeighbors(
            n_neighbors=k_neighbors,
            metric='cosine',
            algorithm='auto'
        )
        knn.fit(embeddings)

        # Find neighbors for each source episode
        all_similar_indices = set()
        all_distances = {}

        for source_idx in request.source_indices:
            source_embedding = embeddings[source_idx:source_idx+1]

            # Find K nearest neighbors
            distances, indices = knn.kneighbors(source_embedding)

            # Flatten arrays
            distances = distances[0]
            indices = indices[0]

            # Add to results (excluding the source index itself)
            for idx, dist in zip(indices, distances):
                idx = int(idx)
                if idx not in request.source_indices:
                    all_similar_indices.add(idx)
                    # Keep minimum distance if index appears multiple times
                    if idx not in all_distances or dist < all_distances[idx]:
                        all_distances[idx] = float(dist)

        # Sort by distance (most similar first)
        sorted_indices = sorted(
            all_similar_indices,
            key=lambda idx: all_distances[idx]
        )

        # Limit to k results
        sorted_indices = sorted_indices[:request.k]

        # Prepare response
        response = SimilarityResponse(
            similar_indices=sorted_indices,
            n_results=len(sorted_indices)
        )

        if request.include_distances:
            response.distances = [all_distances[idx] for idx in sorted_indices]

        logger.info(
            f"Found {len(sorted_indices)} similar episodes for "
            f"{len(request.source_indices)} source(s) in project {project_id}"
        )

        return response

    except Exception as e:
        logger.error(f"Error finding similar episodes: {e}")
        raise HTTPException(status_code=500, detail=str(e))
