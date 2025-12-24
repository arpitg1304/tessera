"""
Clustering service for automatic cluster detection in embeddings.
"""
import logging
from typing import Optional, Tuple
import numpy as np
from sklearn.cluster import KMeans, DBSCAN

logger = logging.getLogger(__name__)


def cluster_embeddings(
    embeddings: np.ndarray,
    method: str = "kmeans",
    n_clusters: Optional[int] = None,
    min_cluster_size: int = 15,
    min_samples: int = 5,
) -> Tuple[np.ndarray, dict]:
    """
    Cluster embeddings using DBSCAN or K-means.

    Args:
        embeddings: (N, D) array of embeddings
        method: "dbscan" or "kmeans"
        n_clusters: Number of clusters (required for kmeans)
        min_cluster_size: Minimum cluster size for DBSCAN (eps parameter)
        min_samples: Minimum samples for DBSCAN core points

    Returns:
        cluster_labels: (N,) array of cluster assignments (-1 for noise in DBSCAN)
        metadata: Dict with clustering statistics
    """
    n_episodes = embeddings.shape[0]

    logger.info(f"Clustering {n_episodes} episodes using {method}")

    if method == "dbscan":
        return _cluster_dbscan(embeddings, min_cluster_size, min_samples)
    elif method == "kmeans":
        if n_clusters is None:
            # Auto-select number of clusters based on dataset size
            n_clusters = min(int(np.sqrt(n_episodes / 2)), 20)
        return _cluster_kmeans(embeddings, n_clusters)
    else:
        raise ValueError(f"Unknown clustering method: {method}")


def _cluster_dbscan(
    embeddings: np.ndarray,
    min_cluster_size: int,
    min_samples: int,
) -> Tuple[np.ndarray, dict]:
    """Cluster using DBSCAN (density-based)."""

    # Estimate eps based on dataset
    # Use 95th percentile of distances to 10th nearest neighbor
    from sklearn.neighbors import NearestNeighbors

    n_episodes = embeddings.shape[0]
    k = min(10, n_episodes // 10)

    nbrs = NearestNeighbors(n_neighbors=k).fit(embeddings)
    distances, _ = nbrs.kneighbors(embeddings)
    eps = np.percentile(distances[:, -1], 95)

    clusterer = DBSCAN(
        eps=eps,
        min_samples=min_samples,
        metric="euclidean",
        n_jobs=-1,
    )

    cluster_labels = clusterer.fit_predict(embeddings)

    # Get cluster statistics
    unique_labels = np.unique(cluster_labels)
    n_clusters_found = len(unique_labels[unique_labels != -1])
    n_noise = np.sum(cluster_labels == -1)

    # Calculate cluster sizes
    cluster_sizes = {}
    for label in unique_labels:
        if label != -1:
            cluster_sizes[int(label)] = int(np.sum(cluster_labels == label))

    metadata = {
        "method": "dbscan",
        "n_clusters": n_clusters_found,
        "n_noise": int(n_noise),
        "noise_ratio": float(n_noise / n_episodes),
        "cluster_sizes": cluster_sizes,
        "eps": float(eps),
        "min_samples": min_samples,
    }

    logger.info(
        f"DBSCAN found {n_clusters_found} clusters, {n_noise} noise points "
        f"({100 * n_noise / n_episodes:.1f}%) with eps={eps:.4f}"
    )

    return cluster_labels, metadata


def _cluster_kmeans(
    embeddings: np.ndarray,
    n_clusters: int,
) -> Tuple[np.ndarray, dict]:
    """Cluster using K-means."""

    kmeans = KMeans(
        n_clusters=n_clusters,
        random_state=42,
        n_init=10,
        max_iter=300,
    )

    cluster_labels = kmeans.fit_predict(embeddings)

    # Calculate cluster sizes
    unique_labels = np.unique(cluster_labels)
    cluster_sizes = {}
    for label in unique_labels:
        cluster_sizes[int(label)] = int(np.sum(cluster_labels == label))

    # Calculate inertia (sum of squared distances to nearest cluster center)
    inertia = float(kmeans.inertia_)

    metadata = {
        "method": "kmeans",
        "n_clusters": n_clusters,
        "cluster_sizes": cluster_sizes,
        "inertia": inertia,
    }

    logger.info(f"K-means created {n_clusters} clusters, inertia={inertia:.2f}")

    return cluster_labels, metadata


def auto_select_n_clusters(n_episodes: int, embedding_dim: int) -> int:
    """
    Automatically select a reasonable number of clusters based on dataset size.

    Args:
        n_episodes: Number of episodes
        embedding_dim: Embedding dimensionality

    Returns:
        Recommended number of clusters
    """
    # Rule of thumb: sqrt(n/2), bounded between 3 and 50
    n_clusters = int(np.sqrt(n_episodes / 2))
    n_clusters = max(3, min(n_clusters, 50))

    # Adjust based on embedding dimensionality
    # Higher dimensions can support more clusters
    if embedding_dim > 512:
        n_clusters = min(n_clusters + 5, 50)

    return n_clusters
