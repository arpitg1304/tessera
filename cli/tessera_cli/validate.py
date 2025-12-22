"""
Embedding file validation for CLI.
"""
import h5py
import numpy as np
from pathlib import Path
from typing import TypedDict


class ValidationResult(TypedDict):
    valid: bool
    n_episodes: int
    embedding_dim: int
    has_success: bool
    has_task: bool
    has_episode_length: bool
    metadata_fields: list[str]
    errors: list[str]
    warnings: list[str]


# Limits
MAX_EPISODES = 200_000
MAX_EMBEDDING_DIM = 2048


def validate_file(file_path: str) -> ValidationResult:
    """
    Validate an HDF5 embeddings file.

    Args:
        file_path: Path to the .h5 file

    Returns:
        ValidationResult with validation status and metadata

    Raises:
        ValueError: If file is invalid
    """
    path = Path(file_path)
    errors = []
    warnings = []

    # Check file exists
    if not path.exists():
        raise ValueError(f"File does not exist: {file_path}")

    # Check file extension
    if path.suffix.lower() not in ['.h5', '.hdf5']:
        warnings.append("File extension is not .h5 or .hdf5")

    try:
        with h5py.File(path, 'r') as f:
            # Check required 'embeddings' dataset
            if 'embeddings' not in f:
                raise ValueError("Missing required 'embeddings' dataset")

            embeddings = f['embeddings']

            # Check embeddings is 2D
            if len(embeddings.shape) != 2:
                raise ValueError(
                    f"'embeddings' must be 2D array, got shape {embeddings.shape}"
                )

            n_episodes, embedding_dim = embeddings.shape

            # Check limits
            if n_episodes > MAX_EPISODES:
                raise ValueError(
                    f"Too many episodes: {n_episodes:,} > {MAX_EPISODES:,}"
                )

            if embedding_dim > MAX_EMBEDDING_DIM:
                raise ValueError(
                    f"Embedding dimension too large: {embedding_dim} > {MAX_EMBEDDING_DIM}"
                )

            # Check dtype
            if embeddings.dtype not in [np.float32, np.float64]:
                warnings.append(
                    f"Embeddings dtype is {embeddings.dtype}, expected float32 or float64"
                )

            # Check for NaN or Inf values (sample check)
            sample_size = min(1000, n_episodes)
            sample_indices = np.random.choice(n_episodes, sample_size, replace=False)
            sample_data = embeddings[sorted(sample_indices)]

            if np.any(np.isnan(sample_data)):
                raise ValueError("Embeddings contain NaN values")

            if np.any(np.isinf(sample_data)):
                raise ValueError("Embeddings contain infinite values")

            # Check required 'episode_ids' dataset
            if 'episode_ids' not in f:
                raise ValueError("Missing required 'episode_ids' dataset")

            episode_ids = f['episode_ids']
            if len(episode_ids) != n_episodes:
                raise ValueError(
                    f"episode_ids length ({len(episode_ids)}) doesn't match "
                    f"embeddings count ({n_episodes})"
                )

            # Check optional metadata
            has_success = False
            has_task = False
            has_episode_length = False
            metadata_fields = []

            if 'metadata' in f:
                metadata_group = f['metadata']

                for key in metadata_group.keys():
                    metadata_fields.append(key)
                    data = metadata_group[key]

                    # Check array length matches
                    if len(data) != n_episodes:
                        errors.append(
                            f"metadata/{key} length ({len(data)}) doesn't match "
                            f"embeddings count ({n_episodes})"
                        )

                    # Track known metadata fields
                    if key == 'success':
                        has_success = True
                    elif key == 'task':
                        has_task = True
                    elif key == 'episode_length':
                        has_episode_length = True

            if errors:
                raise ValueError("; ".join(errors))

            return ValidationResult(
                valid=True,
                n_episodes=n_episodes,
                embedding_dim=embedding_dim,
                has_success=has_success,
                has_task=has_task,
                has_episode_length=has_episode_length,
                metadata_fields=metadata_fields,
                errors=[],
                warnings=warnings
            )

    except h5py.H5Error as e:
        raise ValueError(f"Failed to read HDF5 file: {str(e)}")
