# Tessera

**Dataset Diversity Analysis for Robotics ML**

Tessera is a web application for visualizing episode embeddings and selecting maximally diverse training subsets. It helps ML engineers curate better training datasets by understanding the structure of their data.

> **Train on 10K diverse episodes instead of 50K random ones.**

## Features

- **Interactive 2D Visualization**: UMAP-reduced scatter plot of your episode embeddings
- **Intelligent Sampling**: K-means diversity sampling to maximize coverage
- **Stratified Sampling**: Balance across metadata categories (task, success, etc.)
- **Export**: Download selected episode IDs as JSON/CSV with Python code snippets
- **No Account Required**: Upload, visualize, share with a link

## Quick Start

### Using Docker (Recommended)

```bash
# Clone the repository
git clone https://github.com/yourusername/tessera.git
cd tessera

# Start services
docker-compose up -d

# Open in browser
open http://localhost
```

### Manual Setup

**Backend:**
```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev
```

**CLI:**
```bash
cd cli
pip install -e .
tessera --help
```

## How It Works

1. **Generate Embeddings**: Use CLIP, R3M, or your own encoder on your data
2. **Upload to Tessera**: Drag and drop your `.h5` file
3. **Explore**: Interactive 2D visualization of your embedding space
4. **Sample**: Select diverse episodes using K-means or stratified sampling
5. **Export**: Download episode IDs for use in your training pipeline

## File Format

Tessera expects HDF5 files with this structure:

```
embeddings.h5
├── embeddings          # (N, D) float32 array
├── episode_ids         # (N,) string array
└── metadata/           # Optional
    ├── success         # (N,) bool
    ├── task            # (N,) string
    └── episode_length  # (N,) int
```

See [docs/embedding_format.md](docs/embedding_format.md) for full specification.

## Example: Generate Embeddings

```python
import numpy as np
import h5py

# Your embedding generation code here
embeddings = your_encoder.encode(episodes)

# Save in Tessera format
with h5py.File('embeddings.h5', 'w') as f:
    f.create_dataset('embeddings', data=embeddings)
    f.create_dataset('episode_ids', data=episode_ids)

    metadata = f.create_group('metadata')
    metadata.create_dataset('success', data=success_labels)
    metadata.create_dataset('task', data=task_labels)
```

More examples in [examples/](examples/).

## LeRobot Dataset Embeddings

Tessera includes scripts to generate CLIP embeddings from [LeRobot](https://github.com/huggingface/lerobot) datasets.

### Installation

```bash
pip install torch git+https://github.com/openai/CLIP.git pillow av h5py numpy
```

For GPU acceleration, ensure PyTorch is installed with CUDA support.

### From Local Cache

If you have a LeRobot dataset cached locally (e.g., downloaded via `huggingface-cli`):

```bash
python examples/generate_lerobot_embeddings.py /path/to/dataset
```

### From HuggingFace Hub

To download and process a dataset from the HuggingFace Hub:

```bash
pip install lerobot
python examples/lerobot_example.py lerobot/pusht
```

### Embedding Modes

The `generate_lerobot_embeddings.py` script supports three embedding modes:

| Mode | Output Dim | Description |
|------|------------|-------------|
| `single` | 512 | Use one frame (start, middle, or end) |
| `average` | 512 | Average embeddings from N evenly-spaced frames |
| `start_end` | 1024 | Concatenate start and end frame embeddings |

**Single frame (default):**
```bash
python examples/generate_lerobot_embeddings.py /path/to/dataset --mode single --frame middle
```

**Multi-frame average:**
```bash
python examples/generate_lerobot_embeddings.py /path/to/dataset --mode average --num-frames 5
```

**Start + end concatenation (recommended for task progression):**
```bash
python examples/generate_lerobot_embeddings.py /path/to/dataset --mode start_end
```

### GPU Support

Both scripts automatically detect and use CUDA if available. Force a specific device with:

```bash
python examples/generate_lerobot_embeddings.py /path/to/dataset --device cuda
python examples/generate_lerobot_embeddings.py /path/to/dataset --device cpu
```

### Full Options

```bash
python examples/generate_lerobot_embeddings.py --help

Options:
  -o, --output         Output file path (default: {dataset}_embeddings.h5)
  --mode               Embedding mode: single, average, start_end
  --frame              Frame position for single mode: start, middle, end
  --num-frames         Number of frames for average mode (default: 5)
  --video-key          Camera view to use (default: observation.images.front)
  --device             Device: cuda or cpu (default: auto-detect)
```

### Choosing an Embedding Mode

- **single (middle)**: Fast, good for simple tasks where middle frame is representative
- **average**: Captures more of the episode, better for varied scenes
- **start_end**: Best for tasks where progression matters (e.g., pick-and-place, assembly) - the 1024-dim embedding captures both initial and final states

## CLI Usage

```bash
# Validate file format
tessera validate embeddings.h5

# Upload to Tessera
tessera upload embeddings.h5

# Check server health
tessera health
```

## API

REST API documentation: [docs/api.md](docs/api.md)

```bash
# Upload
curl -X POST http://localhost:8000/api/upload -F "file=@embeddings.h5"

# Get visualization
curl http://localhost:8000/api/project/{id}/visualization

# Sample episodes
curl -X POST http://localhost:8000/api/project/{id}/sample \
  -H "Content-Type: application/json" \
  -d '{"strategy": "kmeans", "n_samples": 1000}'
```

## Architecture

- **Backend**: FastAPI (Python 3.11+)
- **Frontend**: React 18 + TypeScript + Vite + Tailwind
- **Visualization**: Deck.gl (WebGL scatter plot)
- **Dimensionality Reduction**: UMAP
- **Sampling**: K-means, stratified, random
- **Storage**: SQLite + filesystem

## Resource Limits

| Limit | Value |
|-------|-------|
| Max file size | 100 MB |
| Max episodes | 200,000 |
| Max embedding dimension | 2,048 |
| Project retention | 7 days |
| Uploads per IP per day | 5 |

## Self-Hosting

See [docs/self_hosting.md](docs/self_hosting.md) for deployment guide.

```bash
# Production deployment
docker-compose -f docker-compose.prod.yml up -d
```

## Contributing

Contributions welcome! Please open an issue first to discuss changes.

## Related Tools

Tessera is inspired by and complementary to several existing embedding visualization tools:

- **[TensorFlow Projector](https://projector.tensorflow.org/)** - Google's web-based embedding visualizer with t-SNE, UMAP, and PCA. Great for general-purpose embedding exploration. Tessera adds robotics-specific features like diversity sampling and metadata filtering.
- **[Embedding Projector](https://github.com/tensorflow/embedding-projector-standalone)** - Standalone version of TF Projector
- **[Atlas](https://github.com/nomic-ai/nomic)** - Nomic's embedding visualization platform with collaborative features
- **[Weights & Biases](https://wandb.ai/)** - MLOps platform with embedding visualization in experiment tracking

Tessera differentiates by:
- **Robotics Focus**: Built for episode embeddings with task/success metadata
- **Diversity Sampling**: K-means and stratified sampling for dataset curation
- **No Login Required**: Ephemeral projects with shareable links
- **Lightweight**: Self-hostable with Docker, no cloud dependencies

## License

MIT License - see [LICENSE](LICENSE) for details.

---

**Bring Your Own Embeddings** - Generate embeddings on your infrastructure, visualize on Tessera.
