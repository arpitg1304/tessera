# Tessera Examples

This directory contains example scripts for generating embeddings in Tessera format.

## Quick Start

### 1. Generate Dummy Embeddings (Test File)

```bash
python simple_clip_example.py
# Creates: dummy_embeddings.h5
```

This creates a test file with random embeddings. Use this to verify Tessera is working.

### 2. LeRobot Dataset Embeddings

```bash
# Install dependencies
pip install lerobot torch clip-by-openai pillow h5py numpy

# Generate embeddings
python lerobot_example.py lerobot/pusht
# Creates: lerobot_pusht_embeddings.h5
```

### 3. Format Specification Reference

```bash
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
