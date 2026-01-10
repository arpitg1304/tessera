# Embedding Format Specification

Tessera uses HDF5 (`.h5`) files to store episode embeddings and metadata. This document specifies the exact format requirements.

## File Structure

```
embeddings.h5
├── embeddings          # OPTIONAL (for metadata-only mode)
├── episode_ids         # REQUIRED
├── thumbnails          # OPTIONAL (JPEG-compressed images for hover preview)
└── metadata/           # OPTIONAL but recommended
    ├── success
    ├── episode_length
    ├── task
    ├── dataset
    └── [custom fields]
```

## Metadata-Only Mode

Tessera supports a **metadata-only mode** where the `embeddings` dataset is optional. This is useful when you want to:
- Filter and sample episodes based on metadata without generating embeddings
- Quickly explore episode distributions by category
- Export episode IDs based on metadata criteria

In metadata-only mode:
- The 2D scatter plot visualization is disabled
- K-means diversity sampling is disabled (requires embeddings)
- Stratified and random sampling remain available
- All filtering and export features work normally

## Datasets

### `embeddings` (Optional)

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

## Thumbnails (Optional)

The `thumbnails` dataset allows embedding preview images for each episode. When present, Tessera displays these images on hover in the scatter plot visualization.

### `thumbnails`

JPEG-compressed images stored as variable-length byte arrays.

| Property | Value |
|----------|-------|
| **Shape** | `(N,)` |
| **dtype** | Variable-length bytes (`h5py.vlen_dtype(np.uint8)`) |
| **Max size** | ~10KB per thumbnail recommended |
| **Recommended resolution** | 128x128 or 160x120 pixels |

**Best Practices:**
- Use JPEG compression (quality 70-85) for small file sizes
- Resize images to thumbnail resolution before compression
- Use the first frame of each episode for consistency
- Total thumbnails should add <50MB to file size

**Example:**
```python
import io
import numpy as np
import h5py
from PIL import Image

def compress_thumbnail(image: np.ndarray, size=(128, 128), quality=80) -> bytes:
    """Compress an image to JPEG bytes."""
    pil_image = Image.fromarray(image)
    pil_image = pil_image.resize(size, Image.LANCZOS)
    buffer = io.BytesIO()
    pil_image.save(buffer, format='JPEG', quality=quality)
    return buffer.getvalue()

# Create thumbnails from first frames
thumbnails = []
for episode in episodes:
    first_frame = get_first_frame(episode)  # Your frame extraction function
    thumbnail_bytes = compress_thumbnail(first_frame)
    thumbnails.append(np.frombuffer(thumbnail_bytes, dtype=np.uint8))

# Save to HDF5
with h5py.File('embeddings.h5', 'a') as f:
    vlen_dtype = h5py.vlen_dtype(np.uint8)
    f.create_dataset('thumbnails', data=thumbnails, dtype=vlen_dtype)
```

### Custom Fields

You can add any custom metadata fields:

```python
with h5py.File('embeddings.h5', 'a') as f:
    metadata = f.require_group('metadata')
    metadata.create_dataset('robot_id', data=[1, 2, 1, 2, ...])
    metadata.create_dataset('gripper_state', data=[0.5, 0.3, ...])
```

## Why Add Metadata?

Metadata enables **filtered sampling** - the ability to sample diverse episodes from a specific subset of your data. Without metadata, you can only sample from all episodes.

### Use Cases

| Scenario | Metadata Fields | Workflow |
|----------|-----------------|----------|
| Train only on successful demonstrations | `success` (bool) | Filter `success=true`, then K-means sample |
| Balance across tasks | `task` (string) | Use stratified sampling by `task` |
| Exclude short episodes | `episode_length` (int) | Filter `episode_length > 50`, then sample |
| Multi-robot dataset | `robot_type` (string) | Filter to specific robot, sample diverse episodes |
| Sim-to-real transfer | `is_real` (bool) | Filter `is_real=true` for fine-tuning data |
| Multi-environment training | `environment` (string) | Stratified sample across environments |

### Example: Curating a Training Set

```python
# Your dataset has 50,000 episodes with mixed success rates
# Goal: 5,000 diverse successful episodes

# 1. Generate embeddings with metadata
with h5py.File('embeddings.h5', 'w') as f:
    f.create_dataset('embeddings', data=embeddings)
    f.create_dataset('episode_ids', data=episode_ids)

    metadata = f.create_group('metadata')
    metadata.create_dataset('success', data=success_labels)  # bool array
    metadata.create_dataset('task', data=task_labels)        # string array

# 2. Upload to Tessera

# 3. In Tessera UI:
#    - Add filter: success = true (shows 35,000 episodes)
#    - Select K-means sampling, 5,000 samples
#    - Click "Generate Sample"
#    - Export episode IDs

# 4. Use exported IDs in your training script
```

### Recommended Metadata for Robotics

For robotics datasets, we recommend including:

- **`success`** (bool): Whether the episode achieved its goal
- **`task`** (string): Task name or category
- **`episode_length`** (int): Number of timesteps
- **`robot_type`** (string): Robot model/configuration
- **`environment`** (string): Simulation environment or real-world setting
- **`dataset`** (string): Source dataset name (for merged datasets)

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
