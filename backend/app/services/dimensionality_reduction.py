"""
UMAP dimensionality reduction service.
"""
import numpy as np
from pathlib import Path
from typing import Optional
import logging

from ..config import config

logger = logging.getLogger(__name__)


def compute_umap_reduction(
    embeddings: np.ndarray,
    n_neighbors: int = None,
    min_dist: float = None,
    metric: str = None,
    random_state: int = None
) -> np.ndarray:
    """
    Compute UMAP 2D reduction of embeddings.

    Args:
        embeddings: Input embeddings of shape (N, D)
        n_neighbors: UMAP n_neighbors parameter
        min_dist: UMAP min_dist parameter
        metric: Distance metric to use
        random_state: Random seed for reproducibility

    Returns:
        2D coordinates of shape (N, 2)
    """
    import umap

    # Use config defaults if not specified
    n_neighbors = n_neighbors or config.UMAP_N_NEIGHBORS
    min_dist = min_dist or config.UMAP_MIN_DIST
    metric = metric or config.UMAP_METRIC
    random_state = random_state or config.UMAP_RANDOM_STATE

    logger.info(
        f"Computing UMAP reduction: {embeddings.shape[0]} points, "
        f"dim={embeddings.shape[1]}, n_neighbors={n_neighbors}"
    )

    # Adjust n_neighbors if we have fewer samples
    actual_n_neighbors = min(n_neighbors, embeddings.shape[0] - 1)

    reducer = umap.UMAP(
        n_components=2,
        n_neighbors=actual_n_neighbors,
        min_dist=min_dist,
        metric=metric,
        random_state=random_state,
        low_memory=True  # Better for large datasets
    )

    coords_2d = reducer.fit_transform(embeddings)

    # Normalize to reasonable range for visualization
    coords_2d = normalize_coordinates(coords_2d)

    logger.info("UMAP reduction complete")
    return coords_2d.astype(np.float32)


def normalize_coordinates(coords: np.ndarray) -> np.ndarray:
    """
    Normalize coordinates to [-1, 1] range.

    Args:
        coords: Input coordinates of shape (N, 2)

    Returns:
        Normalized coordinates
    """
    # Center at origin
    coords = coords - coords.mean(axis=0)

    # Scale to fit in [-1, 1]
    max_abs = np.max(np.abs(coords))
    if max_abs > 0:
        coords = coords / max_abs

    return coords


def get_cached_umap(project_id: str) -> Optional[np.ndarray]:
    """
    Load cached UMAP coordinates if available.

    Args:
        project_id: The project ID

    Returns:
        Cached 2D coordinates or None
    """
    cache_path = config.get_umap_cache_path(project_id)

    if cache_path.exists():
        logger.info(f"Loading cached UMAP for project {project_id}")
        return np.load(cache_path)

    return None


def cache_umap(project_id: str, coords_2d: np.ndarray) -> None:
    """
    Cache UMAP coordinates to disk.

    Args:
        project_id: The project ID
        coords_2d: 2D coordinates to cache
    """
    cache_path = config.get_umap_cache_path(project_id)
    logger.info(f"Caching UMAP for project {project_id}")
    np.save(cache_path, coords_2d)


def compute_or_load_umap(
    project_id: str,
    embeddings_path: str | Path
) -> tuple[np.ndarray, bool]:
    """
    Get UMAP coordinates, computing if not cached.

    Args:
        project_id: The project ID
        embeddings_path: Path to the embeddings file

    Returns:
        Tuple of (coordinates, was_cached)
    """
    from .embedding_processor import load_embeddings

    # Try cache first
    cached = get_cached_umap(project_id)
    if cached is not None:
        return cached, True

    # Compute UMAP
    embeddings = load_embeddings(embeddings_path)
    coords_2d = compute_umap_reduction(embeddings)

    # Cache for future use
    cache_umap(project_id, coords_2d)

    return coords_2d, False


def estimate_umap_time(n_samples: int, embedding_dim: int) -> float:
    """
    Estimate UMAP computation time in seconds.

    This is a rough estimate based on empirical observations.

    Args:
        n_samples: Number of samples
        embedding_dim: Embedding dimension

    Returns:
        Estimated time in seconds
    """
    # Rough estimate: ~0.001s per sample for typical embedding dims
    # Scales roughly with O(n * log(n)) for UMAP
    import math

    base_time = 5.0  # Minimum overhead
    per_sample = 0.0005 * math.log(max(n_samples, 100))
    dim_factor = 1 + (embedding_dim / 512) * 0.5

    return base_time + (n_samples * per_sample * dim_factor)
