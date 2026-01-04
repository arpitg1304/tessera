# Tessera Examples

This directory contains example scripts, sample data, and utilities for generating embeddings in Tessera format.

## Directory Structure

```
examples/
├── README.md              # This file
├── DATASETS.md           # Information about available robotics datasets
├── scripts/              # Scripts for generating embeddings
│   ├── simple_clip_example.py          # Quick test with dummy data
│   ├── generate_large_embeddings.py    # Configurable synthetic datasets
│   ├── generate_lerobot_embeddings.py  # Advanced LeRobot processing (used by Docker)
│   ├── generate-embeddings-from-hf.sh  # End-to-end HuggingFace workflow
│   ├── run-embeddings.sh               # Helper for local datasets
│   ├── merge_embeddings.py             # Combine multiple HDF5 files
│   └── format_spec_example.py          # Format specification reference
├── sample_data/          # Pre-generated HDF5 files for testing
│   ├── stack_lego_embeddings.h5
│   ├── stack_lego_start_end_embeddings.h5
│   ├── combined_stack_lego_place_cylinder.h5
│   ├── large_dataset_embeddings.h5
│   └── huge_dataset_10k.h5
└── docker/               # Docker utilities
    └── Dockerfile.embeddings
```

## Quick Start

### 1. Generate Dummy Embeddings (Test File)

```bash
cd scripts
python simple_clip_example.py
# Creates: dummy_embeddings.h5
```

This creates a test file with random embeddings. Use this to verify Tessera is working.

### 2. LeRobot Dataset Embeddings

**Easy way - from HuggingFace dataset:**

```bash
# From project root (not inside examples/)
examples/scripts/generate-embeddings-from-hf.sh lerobot/pusht

# This will:
# 1. Download the dataset from HuggingFace
# 2. Generate CLIP embeddings using Docker
# 3. Upload to Tessera and give you the URL
```

See [EMBEDDINGS_README.md](../EMBEDDINGS_README.md) for full documentation on embedding generation options (modes, camera views, etc.).

### 3. Large Synthetic Dataset (Configurable)

```bash
cd scripts

# Default: 1000 episodes, 512D embeddings
python generate_large_embeddings.py
# Creates: large_dataset_embeddings.h5 (1.87 MB)

# Custom size: 10k episodes
python generate_large_embeddings.py -n 10000 -o huge_dataset_10k.h5
# Creates: huge_dataset_10k.h5 (18.54 MB)

# Full options:
python generate_large_embeddings.py --help
# -n, --episodes: Number of episodes (default: 1000)
# -d, --dim: Embedding dimension (default: 512)
# -o, --output: Output file path
# -s, --seed: Random seed for reproducibility (default: 42)
```

This generates realistic synthetic datasets with structured clusters across 5 different tasks. Perfect for testing:
- Performance with larger datasets (1k, 10k, 100k episodes)
- Similarity search functionality
- Cluster visualization and navigation
- Metadata filtering
- Zoom and interaction performance

### 4. Use Pre-Generated Sample Data

```bash
# Sample files are ready to use in sample_data/
ls -lh sample_data/*.h5

# Upload any of them directly to Tessera
```

### 5. Format Specification Reference

```bash
cd scripts
python format_spec_example.py
# Creates: format_example.h5 with documented structure
```

## File Format

Tessera expects HDF5 files with this structure:

```
embeddings.h5
├── embeddings          # REQUIRED: (N, D) float32 array
│                       #   N = number of episodes
│                       #   D = embedding dimension (max 2048)
│
├── episode_ids         # REQUIRED: (N,) string array
│                       #   Unique identifier for each episode
│
└── metadata/           # OPTIONAL: group with additional arrays
    ├── success         # (N,) bool - success/failure labels
    ├── episode_length  # (N,) int - number of frames
    ├── task            # (N,) string - task categories
    └── dataset         # (N,) string - dataset names
```

## Generating Your Own Embeddings

### Using CLIP (Recommended)

```python
import torch
import clip
import numpy as np
import h5py
from PIL import Image

# Load CLIP
device = "cuda" if torch.cuda.is_available() else "cpu"
model, preprocess = clip.load("ViT-B/32", device=device)

embeddings = []
episode_ids = []

for episode in your_dataset:
    # Get representative frame (e.g., middle frame)
    frame = episode.get_frame(len(episode) // 2)

    # Preprocess and encode
    image = preprocess(Image.fromarray(frame)).unsqueeze(0).to(device)
    with torch.no_grad():
        embedding = model.encode_image(image)
        embedding = embedding.cpu().numpy()[0]
        embedding = embedding / np.linalg.norm(embedding)

    embeddings.append(embedding)
    episode_ids.append(episode.id)

# Save in Tessera format
with h5py.File("my_embeddings.h5", "w") as f:
    f.create_dataset("embeddings", data=np.array(embeddings))
    f.create_dataset("episode_ids", data=episode_ids)
```

### Using Other Encoders

You can use any embedding model:

- **R3M**: `pip install r3m` - Robotics-focused representations
- **MVP**: Multi-task vision-language model
- **DinoV2**: Self-supervised visual features
- **Custom**: Your own trained encoder

The key requirement is that embeddings should be:
1. L2 normalized (unit length)
2. Float32 or Float64
3. Same dimension for all episodes

## Uploading to Tessera

### CLI

```bash
# Install CLI
cd ../cli
pip install -e .

# Validate file
tessera validate my_embeddings.h5

# Upload
tessera upload my_embeddings.h5
```

### Web Interface

1. Open Tessera in your browser
2. Drag and drop your `.h5` file
3. Wait for UMAP visualization to compute
4. Explore and sample!

## Tips

1. **Normalize embeddings**: UMAP works better with L2-normalized embeddings
2. **Choose representative frames**: Middle frame often works well
3. **Include metadata**: Success labels enable stratified sampling
4. **Keep files under 100MB**: Larger files may be rejected
