"""
Input validation utilities.
"""
import h5py
import numpy as np
from pathlib import Path
from typing import Optional

from ..config import config
from ..models import ValidationResult


def validate_embeddings_file(file_path: str | Path) -> ValidationResult:
    """
    Validate an HDF5 embeddings file.

    Args:
        file_path: Path to the .h5 file

    Returns:
        ValidationResult with validation status and extracted metadata
    """
    file_path = Path(file_path)
    errors = []
    warnings = []

    # Check file exists
    if not file_path.exists():
        return ValidationResult(
            valid=False,
            n_episodes=0,
            embedding_dim=0,
            errors=["File does not exist"]
        )

    # Check file extension
    if file_path.suffix.lower() not in ['.h5', '.hdf5']:
        warnings.append("File extension is not .h5 or .hdf5")

    try:
        with h5py.File(file_path, 'r') as f:
            # Check required 'embeddings' dataset
            if 'embeddings' not in f:
                errors.append("Missing required 'embeddings' dataset")
                return ValidationResult(
                    valid=False,
                    n_episodes=0,
                    embedding_dim=0,
                    errors=errors,
                    warnings=warnings
                )

            embeddings = f['embeddings']

            # Check embeddings is 2D
            if len(embeddings.shape) != 2:
                errors.append(
                    f"'embeddings' must be 2D array, got shape {embeddings.shape}"
                )
                return ValidationResult(
                    valid=False,
                    n_episodes=0,
                    embedding_dim=0,
                    errors=errors,
                    warnings=warnings
                )

            n_episodes, embedding_dim = embeddings.shape

            # Check limits
            if n_episodes > config.MAX_EPISODES:
                errors.append(
                    f"Too many episodes: {n_episodes} > {config.MAX_EPISODES}"
                )

            if embedding_dim > config.MAX_EMBEDDING_DIM:
                errors.append(
                    f"Embedding dimension too large: {embedding_dim} > {config.MAX_EMBEDDING_DIM}"
                )

            # Check dtype
            if embeddings.dtype not in [np.float32, np.float64]:
                warnings.append(
                    f"Embeddings dtype is {embeddings.dtype}, expected float32 or float64"
                )

            # Check for NaN or Inf values (sample check for performance)
            sample_size = min(1000, n_episodes)
            sample_indices = np.random.choice(n_episodes, sample_size, replace=False)
            sample_data = embeddings[sorted(sample_indices)]

            if np.any(np.isnan(sample_data)):
                errors.append("Embeddings contain NaN values")

            if np.any(np.isinf(sample_data)):
                errors.append("Embeddings contain infinite values")

            # Check required 'episode_ids' dataset
            if 'episode_ids' not in f:
                errors.append("Missing required 'episode_ids' dataset")
            else:
                episode_ids = f['episode_ids']
                if len(episode_ids) != n_episodes:
                    errors.append(
                        f"episode_ids length ({len(episode_ids)}) doesn't match "
                        f"embeddings count ({n_episodes})"
                    )

            # Check optional metadata
            has_success = False
            has_task = False
            has_episode_length = False
            has_dataset = False
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
                    elif key == 'dataset':
                        has_dataset = True

            if len(errors) > 0:
                return ValidationResult(
                    valid=False,
                    n_episodes=n_episodes,
                    embedding_dim=embedding_dim,
                    has_success=has_success,
                    has_task=has_task,
                    has_episode_length=has_episode_length,
                    has_dataset=has_dataset,
                    metadata_fields=metadata_fields,
                    errors=errors,
                    warnings=warnings
                )

            return ValidationResult(
                valid=True,
                n_episodes=n_episodes,
                embedding_dim=embedding_dim,
                has_success=has_success,
                has_task=has_task,
                has_episode_length=has_episode_length,
                has_dataset=has_dataset,
                metadata_fields=metadata_fields,
                errors=[],
                warnings=warnings
            )

    except Exception as e:
        return ValidationResult(
            valid=False,
            n_episodes=0,
            embedding_dim=0,
            errors=[f"Failed to read HDF5 file: {str(e)}"],
            warnings=warnings
        )


def validate_project_id(project_id: str) -> bool:
    """
    Validate a project ID format.

    Args:
        project_id: The project ID to validate

    Returns:
        True if valid, False otherwise
    """
    if not project_id:
        return False

    # Check length
    if len(project_id) != config.PROJECT_ID_LENGTH:
        return False

    # Check characters (lowercase alphanumeric only)
    allowed = set('abcdefghijklmnopqrstuvwxyz0123456789')
    return all(c in allowed for c in project_id)
