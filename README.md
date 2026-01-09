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
git clone https://github.com/arpitg1304/tessera.git
cd tessera

# Copy environment file and configure
cp .env.example .env
# Edit .env to set ADMIN_PASSWORD for the admin panel

# Start services
docker-compose up -d

# Open in browser
open http://localhost:8080
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
└── metadata/           # Optional but recommended
    ├── success         # (N,) bool
    ├── task            # (N,) string
    └── episode_length  # (N,) int
```

See [docs/embedding_format.md](docs/embedding_format.md) for full specification.

### Why Add Metadata?

Metadata unlocks powerful filtering and sampling capabilities:

| Metadata Field | What You Can Do |
|----------------|-----------------|
| `success` | Sample diverse episodes *only from successful runs* |
| `task` | Balance your dataset across different tasks |
| `episode_length` | Filter out episodes that are too short/long |
| `robot_type` | Ensure coverage across different robots |
| `environment` | Sample from specific simulation environments |

**Example workflow:**
1. Filter to `success=true` episodes
2. Sample 1,000 diverse episodes using K-means
3. Export episode IDs for training

Without metadata, you can only sample from all episodes. With metadata, you can curate precisely the subset you need.

## Generating Embeddings

### Quick Start: LeRobot Datasets

For LeRobot datasets from HuggingFace, use the included script:

```bash
# One command to download, generate embeddings, and upload
examples/scripts/generate-embeddings-from-hf.sh arpitg1304/eval_smolvla_stack_lego
```

See [EMBEDDINGS_README.md](EMBEDDINGS_README.md) for full documentation on:
- Generating CLIP embeddings from LeRobot datasets
- Different embedding modes (single frame, average, start+end)
- Custom video keys and camera views
- Batch processing multiple datasets

### Custom Embeddings

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
| Uploads per IP per day | 20 |

## Self-Hosting

See [docs/self_hosting.md](docs/self_hosting.md) for production deployment guide with nginx and SSL.

For basic self-hosting, the default `docker-compose.yml` works out of the box. For production with a custom domain, you'll need to:
1. Set up nginx as a reverse proxy
2. Configure SSL certificates (e.g., with Let's Encrypt)
3. Set a strong `ADMIN_PASSWORD` in your `.env` file

## Contributing

Contributions welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

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
