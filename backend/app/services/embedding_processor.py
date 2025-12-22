"""
Embedding file processing and data loading.
"""
import h5py
import json
import numpy as np
from pathlib import Path
from typing import Any

from ..config import config


def load_embeddings(file_path: str | Path) -> np.ndarray:
    """
    Load embeddings from an HDF5 file.

    Args:
        file_path: Path to the .h5 file

    Returns:
        Embeddings as numpy array of shape (N, D)
    """
    with h5py.File(file_path, 'r') as f:
        return np.array(f['embeddings'], dtype=np.float32)


def load_episode_ids(file_path: str | Path) -> list[str]:
    """
    Load episode IDs from an HDF5 file.

    Args:
        file_path: Path to the .h5 file

    Returns:
        List of episode ID strings
    """
    with h5py.File(file_path, 'r') as f:
        episode_ids = f['episode_ids'][:]
        # Handle bytes vs string
        if episode_ids.dtype.kind == 'S' or episode_ids.dtype.kind == 'O':
            return [
                eid.decode('utf-8') if isinstance(eid, bytes) else str(eid)
                for eid in episode_ids
            ]
        return [str(eid) for eid in episode_ids]


def load_metadata(file_path: str | Path) -> dict[str, list[Any]]:
    """
    Load all metadata from an HDF5 file.

    Args:
        file_path: Path to the .h5 file

    Returns:
        Dictionary mapping metadata field names to lists of values
    """
    metadata = {}

    with h5py.File(file_path, 'r') as f:
        if 'metadata' not in f:
            return metadata

        metadata_group = f['metadata']
        for key in metadata_group.keys():
            data = metadata_group[key][:]

            # Handle different data types
            if data.dtype.kind == 'S' or data.dtype.kind == 'O':
                # String/bytes data
                metadata[key] = [
                    d.decode('utf-8') if isinstance(d, bytes) else str(d)
                    for d in data
                ]
            elif data.dtype.kind == 'b':
                # Boolean data
                metadata[key] = [bool(d) for d in data]
            elif np.issubdtype(data.dtype, np.integer):
                # Integer data
                metadata[key] = [int(d) for d in data]
            elif np.issubdtype(data.dtype, np.floating):
                # Float data
                metadata[key] = [float(d) for d in data]
            else:
                # Default: convert to string
                metadata[key] = [str(d) for d in data]

    return metadata


def get_metadata_summary(file_path: str | Path) -> dict[str, dict]:
    """
    Get a summary of metadata fields (for UI display).

    Args:
        file_path: Path to the .h5 file

    Returns:
        Dictionary with metadata field summaries
    """
    summary = {}

    with h5py.File(file_path, 'r') as f:
        if 'metadata' not in f:
            return summary

        metadata_group = f['metadata']
        for key in metadata_group.keys():
            data = metadata_group[key][:]

            field_summary = {
                "dtype": str(data.dtype),
                "count": len(data)
            }

            # Add type-specific stats
            if data.dtype.kind == 'b':
                # Boolean
                field_summary["type"] = "boolean"
                field_summary["true_count"] = int(np.sum(data))
                field_summary["false_count"] = int(len(data) - np.sum(data))
            elif np.issubdtype(data.dtype, np.integer):
                # Integer
                field_summary["type"] = "integer"
                field_summary["min"] = int(np.min(data))
                field_summary["max"] = int(np.max(data))
                field_summary["mean"] = float(np.mean(data))
            elif np.issubdtype(data.dtype, np.floating):
                # Float
                field_summary["type"] = "float"
                field_summary["min"] = float(np.min(data))
                field_summary["max"] = float(np.max(data))
                field_summary["mean"] = float(np.mean(data))
            else:
                # String/categorical
                field_summary["type"] = "categorical"
                unique_values = np.unique(data)
                field_summary["unique_count"] = len(unique_values)
                if len(unique_values) <= 20:
                    # Include categories if not too many
                    field_summary["categories"] = [
                        v.decode('utf-8') if isinstance(v, bytes) else str(v)
                        for v in unique_values
                    ]

            summary[key] = field_summary

    return summary


def cache_metadata(project_id: str, file_path: str | Path) -> None:
    """
    Cache metadata to a JSON file for quick access.

    Args:
        project_id: The project ID
        file_path: Path to the embeddings file
    """
    cache_path = config.get_metadata_cache_path(project_id)

    metadata = load_metadata(file_path)
    episode_ids = load_episode_ids(file_path)
    summary = get_metadata_summary(file_path)

    cache_data = {
        "episode_ids": episode_ids,
        "metadata": metadata,
        "summary": summary
    }

    with open(cache_path, 'w') as f:
        json.dump(cache_data, f)


def load_cached_metadata(project_id: str) -> dict | None:
    """
    Load cached metadata if available.

    Args:
        project_id: The project ID

    Returns:
        Cached metadata dict or None if not cached
    """
    cache_path = config.get_metadata_cache_path(project_id)

    if not cache_path.exists():
        return None

    with open(cache_path, 'r') as f:
        return json.load(f)


def get_embedding_stats(file_path: str | Path) -> dict:
    """
    Get statistics about the embeddings.

    Args:
        file_path: Path to the .h5 file

    Returns:
        Dictionary with embedding statistics
    """
    with h5py.File(file_path, 'r') as f:
        embeddings = f['embeddings']
        n_episodes, embedding_dim = embeddings.shape

        # Sample for statistics
        sample_size = min(1000, n_episodes)
        sample_indices = np.random.choice(n_episodes, sample_size, replace=False)
        sample = embeddings[sorted(sample_indices)]

        # Compute norms
        norms = np.linalg.norm(sample, axis=1)

        return {
            "n_episodes": n_episodes,
            "embedding_dim": embedding_dim,
            "norm_min": float(np.min(norms)),
            "norm_max": float(np.max(norms)),
            "norm_mean": float(np.mean(norms)),
            "norm_std": float(np.std(norms))
        }
