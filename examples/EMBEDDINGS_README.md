# Generating CLIP Embeddings for LeRobot Datasets

Generate CLIP embeddings from LeRobot datasets and upload them to Tessera for visualization.

## 🚀 Quick Start: From HuggingFace Dataset

The easiest way to generate embeddings from a HuggingFace dataset:

```bash
examples/scripts/generate-embeddings-from-hf.sh <dataset-name>
```

**Examples:**
```bash
# Basic usage - downloads dataset, generates embeddings, uploads to Tessera
examples/scripts/generate-embeddings-from-hf.sh arpitg1304/eval_smolvla_stack_lego

# With custom embedding options
examples/scripts/generate-embeddings-from-hf.sh lerobot/pusht --mode start_end

# Custom output filename
examples/scripts/generate-embeddings-from-hf.sh username/dataset --output my_embeddings.h5
```

This script:
1. ✅ Downloads the dataset from HuggingFace
2. ✅ Generates CLIP embeddings using Docker
3. ✅ Uploads to Tessera and gives you the URL

## 📋 Manual Workflow

### Step 1: Download Dataset (if needed)

If you don't have a local LeRobot dataset yet:

```bash
python -c "
from huggingface_hub import snapshot_download
snapshot_download(
    repo_id='username/dataset-name',
    repo_type='dataset',
    local_dir='~/datasets/lerobot/username/dataset-name'
)
"
```

### Step 2: Generate Embeddings

**Using the helper script:**
```bash
examples/scripts/run-embeddings.sh /path/to/your/dataset
```

**Using Docker directly:**
```bash
docker run --rm \
  -v $(pwd):/output \
  -v /path/to/dataset:/data:ro \
  tessera-embeddings /data -o /output/embeddings.h5
```

**Using Python directly (if you have dependencies installed):**
```bash
source venv/bin/activate
python examples/scripts/generate_lerobot_embeddings.py /path/to/dataset
```

### Step 3: Upload to Tessera

```bash
# Upload to Tessera (adjust port as needed)
curl -X POST http://localhost:8080/api/upload -F 'file=@embeddings.h5'
```

## 🎛️ Embedding Options

### Embedding Modes

- **`single`** (default): Uses one frame per episode
  - `--frame start`: First frame
  - `--frame middle`: Middle frame (default)
  - `--frame end`: Last frame

- **`average`**: Averages embeddings from N evenly-spaced frames
  - `--num-frames 5`: Number of frames to average (default: 5)

- **`start_end`**: Concatenates start and end frame embeddings
  - Produces 1024-dimensional embeddings (2x normal)

### Other Options

- `--video-key KEY`: Which camera view to use (default: `observation.images.front`)
- `--names "Name1" "Name2"`: Dataset names for multi-dataset files
- `-o FILE, --output FILE`: Output filename

### Examples

```bash
# Use start and end frames concatenated
examples/scripts/generate-embeddings-from-hf.sh arpitg1304/dataset --mode start_end

# Average 10 frames per episode
examples/scripts/generate-embeddings-from-hf.sh arpitg1304/dataset --mode average --num-frames 10

# Use first frame from wrist camera
examples/scripts/generate-embeddings-from-hf.sh arpitg1304/dataset \
  --frame start \
  --video-key observation.images.wrist

# Multiple datasets combined
examples/scripts/run-embeddings.sh /path/to/dataset1 /path/to/dataset2 \
  --names "Push Task" "Pick Task" \
  -o combined_embeddings.h5
```

## 📦 Output Format

The generated HDF5 file contains:

```python
embeddings.h5
├── embeddings          # (N, 512) or (N, 1024) array - CLIP embeddings
├── episode_ids         # (N,) array - Episode identifiers
└── metadata/
    ├── episode_length  # (N,) array - Length of each episode
    ├── success         # (N,) array - Success labels
    └── dataset         # (N,) array - Dataset labels (for multi-dataset)
```

You can inspect the file with:

```python
import h5py

with h5py.File('embeddings.h5', 'r') as f:
    print('Keys:', list(f.keys()))
    print('Embeddings shape:', f['embeddings'].shape)
    print('Episode IDs:', f['episode_ids'][:])
```

## 🐳 Docker Setup

### Rebuild the Docker Image

If you need to rebuild the Docker image (e.g., after modifying the Dockerfile):

```bash
docker build -f Dockerfile.embeddings -t tessera-embeddings .
```

### What's in the Docker Image?

- Python 3.11
- FFmpeg (for video processing)
- PyTorch & TorchVision
- OpenAI CLIP
- PyAV (video I/O)
- H5py, NumPy, Pillow

## 📁 File Structure

```
tessera/
├── Dockerfile.embeddings           # Docker image definition
├── EMBEDDINGS_README.md            # This file
└── examples/scripts/
    ├── generate-embeddings-from-hf.sh  # End-to-end script (HF → Embeddings → Tessera)
    ├── run-embeddings.sh               # Helper for running Docker with local datasets
    ├── generate_lerobot_embeddings.py  # Main embedding generation script
    └── simple_clip_example.py          # Example for dummy embeddings
```

## 🛠️ Troubleshooting

### "Docker image not found"
```bash
docker build -f Dockerfile.embeddings -t tessera-embeddings .
```

### "Permission denied" when running scripts
```bash
chmod +x examples/scripts/generate-embeddings-from-hf.sh
chmod +x examples/scripts/run-embeddings.sh
```

### "venv not found" error
Make sure you're running from the tessera project directory:
```bash
cd /Users/arpitgupta/tessera
examples/scripts/generate-embeddings-from-hf.sh dataset-name
```

### "No such file or directory" for dataset
- Check that the dataset path is absolute (starts with `/`)
- Verify the dataset was downloaded: `ls ~/datasets/lerobot/`
- For local datasets, use: `examples/scripts/run-embeddings.sh $(pwd)/path/to/dataset`

### Upload fails / Port issues
Tessera can run on different ports. Try:
- Port 8080: `http://localhost:8080/api/upload`
- Port 8001: `http://localhost:8001/api/upload`

Check which port Tessera is running on and update the upload command.

## 🔧 Advanced Usage

### Using Python Directly (without Docker)

If you prefer not to use Docker, install dependencies in a venv:

```bash
python -m venv venv-embeddings
source venv-embeddings/bin/activate
pip install torch git+https://github.com/openai/CLIP.git pillow av h5py numpy

python examples/scripts/generate_lerobot_embeddings.py /path/to/dataset
```

### Custom CLIP Model

Edit `generate_lerobot_embeddings.py` line 321 to use a different CLIP model:

```python
model, preprocess = clip.load("ViT-L/14", device=device)  # Larger model
```

Available models: `RN50`, `RN101`, `ViT-B/32`, `ViT-B/16`, `ViT-L/14`, `ViT-L/14@336px`

### Batch Processing Multiple Datasets

```bash
# Process all datasets in a directory
for dataset in ~/datasets/lerobot/*/; do
    examples/scripts/run-embeddings.sh "$dataset"
done
```

## 📚 References

- [LeRobot Dataset Format](https://github.com/huggingface/lerobot)
- [OpenAI CLIP](https://github.com/openai/CLIP)
- [Tessera Documentation](https://github.com/tessera-project/tessera)
