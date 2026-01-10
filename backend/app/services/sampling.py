"""
Sampling algorithms for episode selection.
"""
import numpy as np
from typing import Optional
import logging

logger = logging.getLogger(__name__)


def kmeans_diversity_sampling(
    embeddings: np.ndarray,
    n_samples: int,
    random_state: int = 42
) -> np.ndarray:
    """
    Select n_samples episodes that maximize coverage of embedding space.
    Uses K-means clustering and selects nearest neighbors to centroids.

    Args:
        embeddings: Input embeddings of shape (N, D)
        n_samples: Number of samples to select
        random_state: Random seed for reproducibility

    Returns:
        Array of selected indices
    """
    from sklearn.cluster import KMeans
    from sklearn.metrics.pairwise import euclidean_distances

    logger.info(f"K-means diversity sampling: {n_samples} from {len(embeddings)}")

    # Handle edge cases
    if n_samples >= len(embeddings):
        return np.arange(len(embeddings))

    if n_samples <= 0:
        return np.array([], dtype=np.int64)

    # Fit K-means
    kmeans = KMeans(
        n_clusters=n_samples,
        random_state=random_state,
        n_init=10
    )
    kmeans.fit(embeddings)

    # Find nearest neighbor to each centroid
    distances = euclidean_distances(embeddings, kmeans.cluster_centers_)
    selected_indices = np.argmin(distances, axis=0)

    # Ensure unique indices (in case two centroids have same nearest neighbor)
    selected_indices = np.unique(selected_indices)

    # If we don't have enough due to duplicates, add more
    if len(selected_indices) < n_samples:
        remaining = set(range(len(embeddings))) - set(selected_indices)
        remaining = np.array(list(remaining))
        np.random.seed(random_state)
        additional = np.random.choice(
            remaining,
            size=n_samples - len(selected_indices),
            replace=False
        )
        selected_indices = np.concatenate([selected_indices, additional])

    return np.sort(selected_indices)


def stratified_sampling(
    embeddings: Optional[np.ndarray],
    metadata: dict,
    n_samples: int,
    stratify_by: str = 'success',
    random_state: int = 42,
    n_total: Optional[int] = None
) -> np.ndarray:
    """
    Select samples maintaining distribution across metadata categories.

    Args:
        embeddings: Input embeddings (used for count reference, optional if n_total provided)
        metadata: Dictionary of metadata fields
        n_samples: Total number of samples to select
        stratify_by: Metadata field to stratify by
        random_state: Random seed for reproducibility
        n_total: Total number of episodes (required if embeddings is None)

    Returns:
        Array of selected indices
    """
    # Get total count from embeddings or n_total parameter
    if embeddings is not None:
        n_total = len(embeddings)
    elif n_total is None:
        # Fallback: infer from metadata
        n_total = len(list(metadata.values())[0]) if metadata else 0

    logger.info(f"Stratified sampling by '{stratify_by}': {n_samples} from {n_total}")

    if stratify_by not in metadata:
        raise ValueError(f"Metadata field '{stratify_by}' not found")

    if n_samples >= n_total:
        return np.arange(n_total)

    np.random.seed(random_state)

    labels = np.array(metadata[stratify_by])
    unique_labels = np.unique(labels)

    # Calculate samples per category (proportional)
    label_counts = {label: np.sum(labels == label) for label in unique_labels}
    total_count = sum(label_counts.values())

    samples_per_label = {}
    remaining = n_samples

    # Allocate proportionally
    for i, label in enumerate(unique_labels):
        if i == len(unique_labels) - 1:
            # Last category gets remainder
            samples_per_label[label] = remaining
        else:
            count = label_counts[label]
            n_label = int(n_samples * count / total_count)
            # Ensure at least 1 sample per category if possible
            n_label = max(1, min(n_label, count, remaining))
            samples_per_label[label] = n_label
            remaining -= n_label

    # Sample from each category
    selected_indices = []
    for label in unique_labels:
        label_indices = np.where(labels == label)[0]
        n_label_samples = min(samples_per_label[label], len(label_indices))

        if n_label_samples > 0:
            selected = np.random.choice(
                label_indices,
                size=n_label_samples,
                replace=False
            )
            selected_indices.extend(selected)

    return np.sort(np.array(selected_indices))


def random_sampling(
    embeddings: Optional[np.ndarray],
    n_samples: int,
    random_state: int = 42,
    n_total: Optional[int] = None
) -> np.ndarray:
    """
    Random sampling baseline.

    Args:
        embeddings: Input embeddings (used for count, optional if n_total provided)
        n_samples: Number of samples to select
        random_state: Random seed for reproducibility
        n_total: Total number of episodes (required if embeddings is None)

    Returns:
        Array of selected indices
    """
    # Get total count from embeddings or n_total parameter
    if embeddings is not None:
        n_total = len(embeddings)
    elif n_total is None:
        raise ValueError("Either embeddings or n_total must be provided")

    logger.info(f"Random sampling: {n_samples} from {n_total}")

    if n_samples >= n_total:
        return np.arange(n_total)

    np.random.seed(random_state)
    return np.sort(np.random.choice(n_total, size=n_samples, replace=False))


def compute_coverage_score(
    embeddings: Optional[np.ndarray],
    selected_indices: np.ndarray,
    percentile: float = 75.0,
    n_total: Optional[int] = None
) -> float:
    """
    Compute what percentage of the embedding space is covered by selection.
    Uses nearest neighbor distance metric.

    Args:
        embeddings: All embeddings of shape (N, D), or None for metadata-only
        selected_indices: Indices of selected samples
        percentile: Percentile threshold for coverage
        n_total: Total number of episodes (used when embeddings is None)

    Returns:
        Coverage score between 0 and 1 (or selection ratio if no embeddings)
    """
    if len(selected_indices) == 0:
        return 0.0

    # For metadata-only projects, return simple selection ratio
    if embeddings is None:
        if n_total is None or n_total == 0:
            return 0.0
        return float(len(selected_indices)) / n_total

    from sklearn.metrics.pairwise import euclidean_distances

    if len(selected_indices) >= len(embeddings):
        return 1.0

    selected_embeddings = embeddings[selected_indices]

    # For each episode, find distance to nearest selected episode
    # Process in batches to avoid memory issues
    batch_size = 5000
    min_distances = []

    for i in range(0, len(embeddings), batch_size):
        batch = embeddings[i:i + batch_size]
        distances = euclidean_distances(batch, selected_embeddings)
        min_distances.extend(np.min(distances, axis=1))

    min_distances = np.array(min_distances)

    # Coverage score: percentage within threshold distance
    threshold = np.percentile(min_distances, percentile)
    coverage = np.mean(min_distances <= threshold)

    return float(coverage)


def sample_episodes(
    embeddings: Optional[np.ndarray],
    n_samples: int,
    strategy: str = "kmeans",
    metadata: Optional[dict] = None,
    stratify_by: Optional[str] = None,
    random_state: int = 42,
    n_total: Optional[int] = None
) -> tuple[np.ndarray, float]:
    """
    Sample episodes using the specified strategy.

    Args:
        embeddings: Input embeddings of shape (N, D), or None for metadata-only
        n_samples: Number of samples to select
        strategy: Sampling strategy ("kmeans", "stratified", "random")
        metadata: Metadata dictionary (required for stratified)
        stratify_by: Field to stratify by (required for stratified)
        random_state: Random seed
        n_total: Total episode count (required for metadata-only projects)

    Returns:
        Tuple of (selected_indices, coverage_score)
    """
    # Determine total count
    if embeddings is not None:
        n_total = len(embeddings)
    elif n_total is None and metadata:
        n_total = len(list(metadata.values())[0])

    if strategy == "kmeans":
        if embeddings is None:
            raise ValueError("K-means sampling requires embeddings")
        selected = kmeans_diversity_sampling(embeddings, n_samples, random_state)
    elif strategy == "stratified":
        if metadata is None or stratify_by is None:
            raise ValueError("Stratified sampling requires metadata and stratify_by")
        selected = stratified_sampling(
            embeddings, metadata, n_samples, stratify_by, random_state, n_total
        )
    elif strategy == "random":
        selected = random_sampling(embeddings, n_samples, random_state, n_total)
    else:
        raise ValueError(f"Unknown strategy: {strategy}")

    coverage = compute_coverage_score(embeddings, selected, n_total=n_total)

    return selected, coverage
