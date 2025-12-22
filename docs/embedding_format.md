# Embedding Format Specification

Tessera uses HDF5 (`.h5`) files to store episode embeddings and metadata. This document specifies the exact format requirements.

## File Structure

```
embeddings.h5
├── embeddings          # REQUIRED
├── episode_ids         # REQUIRED
└── metadata/           # OPTIONAL
    ├── success
    ├── episode_length
    ├── task
    ├── dataset
    └── [custom fields]
```

## Required Datasets

### `embeddings`

The main embedding array containing vector representations of each episode.

| Property | Value |
|----------|-------|
| **Shape** | `(N, D)` where N = episodes, D = dimension |
| **dtype** | `float32` or `float64` |
| **Max N** | 200,000 episodes |
| **Max D** | 2,048 dimensions |

**Best Practices:**
- L2 normalize embeddings for better UMAP visualization
- Use `float32` to reduce file size
- Avoid NaN or Inf values (file will be rejected)

**Example:**
```python
import numpy as np
import h5py

embeddings = np.random.randn(1000, 512).astype(np.float32)
embeddings = embeddings / np.linalg.norm(embeddings, axis=1, keepdims=True)

with h5py.File('embeddings.h5', 'w') as f:
    f.create_dataset('embeddings', data=embeddings)
```

### `episode_ids`

Unique identifiers for each episode.

| Property | Value |
|----------|-------|
| **Shape** | `(N,)` |
| **dtype** | Variable-length string or bytes |
| **Length** | Must match embeddings count |

**Example:**
```python
episode_ids = [f"episode_{i:05d}" for i in range(1000)]

with h5py.File('embeddings.h5', 'a') as f:
    f.create_dataset('episode_ids', data=episode_ids)
```

## Optional Metadata

The `metadata/` group can contain any number of additional arrays. Each array must have length `N` (matching embeddings count).

### Standard Fields

These fields are recognized by Tessera for special functionality:

#### `metadata/success`

Boolean success/failure labels for each episode.

| Property | Value |
|----------|-------|
| **Shape** | `(N,)` |
| **dtype** | `bool` |
| **Use** | Color by success/failure in visualization |

#### `metadata/episode_length`

Number of frames/timesteps in each episode.

| Property | Value |
|----------|-------|
| **Shape** | `(N,)` |
| **dtype** | `int32` or `int64` |
| **Use** | Color by episode length (gradient) |

#### `metadata/task`

Task or category labels for each episode.

| Property | Value |
|----------|-------|
| **Shape** | `(N,)` |
| **dtype** | Variable-length string |
| **Use** | Color by task, stratified sampling |

#### `metadata/dataset`

Dataset source labels (for multi-dataset projects).

| Property | Value |
|----------|-------|
| **Shape** | `(N,)` |
| **dtype** | Variable-length string |
| **Use** | Filter by dataset, stratified sampling |

### Custom Fields

You can add any custom metadata fields:

```python
with h5py.File('embeddings.h5', 'a') as f:
    metadata = f.require_group('metadata')
    metadata.create_dataset('robot_id', data=[1, 2, 1, 2, ...])
    metadata.create_dataset('gripper_state', data=[0.5, 0.3, ...])
```

## Validation Rules

Tessera validates uploaded files against these rules:

1. File must be valid HDF5 format
2. `embeddings` dataset must exist and be 2D
3. `episode_ids` dataset must exist
4. `episode_ids` length must equal number of embeddings
5. All metadata arrays must have matching length
6. No NaN or Inf values in embeddings (sampled check)
7. File size must be under 100MB
8. Episode count must be under 200,000
9. Embedding dimension must be under 2,048

## File Size Guidelines

| Episodes | Dimension | Approx. Size |
|----------|-----------|--------------|
| 1,000 | 512 | ~2 MB |
| 10,000 | 512 | ~20 MB |
| 50,000 | 512 | ~100 MB |
| 100,000 | 512 | ~200 MB* |

*Files over 100MB will be rejected.

## Example: Complete File

```python
import numpy as np
import h5py

# Parameters
n_episodes = 5000
embedding_dim = 512

# Generate embeddings (normally from CLIP, R3M, etc.)
embeddings = np.random.randn(n_episodes, embedding_dim).astype(np.float32)
embeddings = embeddings / np.linalg.norm(embeddings, axis=1, keepdims=True)

# Generate metadata
episode_ids = [f"ep_{i:05d}" for i in range(n_episodes)]
success = np.random.choice([True, False], size=n_episodes, p=[0.7, 0.3])
episode_length = np.random.randint(50, 200, size=n_episodes)
task = np.random.choice(["pick", "place", "stack"], size=n_episodes)

# Save file
with h5py.File('my_embeddings.h5', 'w') as f:
    # Required
    f.create_dataset('embeddings', data=embeddings)
    f.create_dataset('episode_ids', data=episode_ids)

    # Optional metadata
    metadata = f.create_group('metadata')
    metadata.create_dataset('success', data=success)
    metadata.create_dataset('episode_length', data=episode_length)
    metadata.create_dataset('task', data=task)

print("File created successfully!")
```

## Troubleshooting

### "embeddings must be 2D array"

Your embeddings have the wrong shape. Ensure shape is `(N, D)` not `(N,)` or `(N, D, 1)`.

### "episode_ids length doesn't match"

The number of episode IDs must exactly match the number of embeddings.

### "Embeddings contain NaN values"

Check your embedding generation - some frames may have failed to encode.

### "File too large"

Reduce the number of episodes or use `float32` instead of `float64`.
