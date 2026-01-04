# Public Embedding Datasets for Testing Tessera

This document lists publicly available embedding datasets that can be used to test Tessera.

## Image & Vision Datasets

### 1. LAION2B CLIP Embeddings (SISAP 2024 Challenge)

**Best for testing:** Large-scale image embeddings with CLIP

- **Format:** HDF5 (.h5)
- **Embeddings:** 768-dimensional CLIP embeddings (16-bit float)
- **Sizes:** 300K, 10M, 100M subsets available
- **Source:** [SISAP 2024 Challenge](https://sisap-challenges.github.io/2024/datasets/)

**Download:**
```bash
# 300K subset (~1.5 GB)
curl -O https://sisap-23-challenge.s3.amazonaws.com/SISAP23-Challenge/laion2B-en-clip768v2-n=300K.h5

# 10M subset (~50 GB)
curl -O https://sisap-23-challenge.s3.amazonaws.com/SISAP23-Challenge/laion2B-en-clip768v2-n=10M.h5

# 100M subset (~500 GB) - WARNING: Very large!
curl -O https://sisap-23-challenge.s3.amazonaws.com/SISAP23-Challenge/laion2B-en-clip768v2-n=100M.h5
```

**Note:** These files may need format conversion to match Tessera's expected structure (embeddings, episode_ids, metadata).

---

## Robotics Datasets

### 2. NVIDIA PhysicalAI Robotics Manipulation (2025)

**Best for testing:** Recent robotics dataset with augmented demonstrations

- **Format:** HDF5 (.hdf5)
- **Episodes:** 1000 demonstrations each (Mimic + Cosmos variants)
- **Source:** [Hugging Face - NVIDIA PhysicalAI](https://huggingface.co/datasets/nvidia/PhysicalAI-Robotics-Manipulation-Augmented)

**Download:**
```bash
# Install Hugging Face datasets library
pip install datasets

# Download via Python
from datasets import load_dataset
dataset = load_dataset("nvidia/PhysicalAI-Robotics-Manipulation-Augmented")
```

**Files:**
- `mimic_dataset_1k.hdf5` - 1000 Mimic-generated demonstrations
- `cosmos_dataset_1k.hdf5` - 1000 Cosmos-augmented demonstrations

**Note:** Will need to extract/generate embeddings from the raw data using CLIP or R3M.

---

### 3. Open X-Embodiment Dataset

**Best for testing:** Large-scale multi-robot dataset with language embeddings

- **Format:** RLDS (TFRecord), includes USE embeddings
- **Episodes:** Millions across 22+ robot types
- **Source:** [Open X-Embodiment](https://robotics-transformer-x.github.io/) | [GitHub](https://github.com/google-deepmind/open_x_embodiment)

**Download:**
```python
import tensorflow_datasets as tfds

# List available datasets
tfds.list_builders('rlds')

# Load specific dataset
dataset = tfds.load('fractal20220817_data', split='train')
```

**Language Embeddings:** Natural language instructions are transformed into USE (Universal Sentence Encoder) embeddings.

**Note:** Requires conversion from TFRecord to HDF5 format for Tessera.

---

### 4. LeRobot Datasets (Hugging Face)

**Best for testing:** State-of-the-art robotics datasets in standardized format

- **Format:** Parquet + MP4 (v3.0), supports HDF5 conversion
- **Source:** [Hugging Face LeRobot](https://github.com/huggingface/lerobot) | [Documentation](https://huggingface.co/docs/lerobot/en/index)

**Popular Datasets:**
- `lerobot/aloha_mobile_cabinet`
- `lerobot/pusht`
- `lerobot/umi_cup_in_the_wild`
- `lerobot/xarm_lift_medium`

**Download:**
```python
from lerobot.common.datasets.lerobot_dataset import LeRobotDataset

# Download dataset (caches to ~/.cache/huggingface/lerobot)
dataset = LeRobotDataset("lerobot/pusht")
```

**Convert to Tessera format:**

```bash
# Quick way - directly from HuggingFace
examples/scripts/generate-embeddings-from-hf.sh lerobot/pusht

# Or use locally downloaded datasets
examples/scripts/run-embeddings.sh /path/to/lerobot/dataset
```

This automatically:
1. Extracts frames from episode videos
2. Generates CLIP embeddings (512-dimensional)
3. Creates Tessera-compatible HDF5 file
4. Uploads to Tessera

See [EMBEDDINGS_README.md](../EMBEDDINGS_README.md) for full documentation.

---

### 5. RoboTurk Real Robot Dataset

**Best for testing:** Real robot manipulation with HDF5 format

- **Format:** HDF5 (.hdf5)
- **Source:** [RoboTurk Stanford](https://roboturk.stanford.edu/dataset_real.html)

**Download:**
Available from Stanford website with postprocessed HDF5 files containing:
- Control data from user
- Joint data from robot
- Timestamps

**Note:** Raw HDF5 files need embedding generation before use with Tessera.

---

## Quick Start: Testing with LAION CLIP Embeddings

The LAION CLIP embeddings are the easiest to test with since they're already in HDF5 format:

```bash
# Download 300K subset
cd examples
curl -O https://sisap-23-challenge.s3.amazonaws.com/SISAP23-Challenge/laion2B-en-clip768v2-n=300K.h5

# Convert to Tessera format (you'll need to write a conversion script)
python convert_laion_to_tessera.py laion2B-en-clip768v2-n=300K.h5 laion_300k_tessera.h5

# Upload to Tessera
# Visit http://localhost:8080 and drag-drop the file
```

---

## Conversion Notes

Most datasets will need conversion to Tessera's expected format:

```
tessera_dataset.h5
├── embeddings          # (N, D) float32 array
├── episode_ids         # (N,) string array
└── metadata/           # Optional group
    ├── success         # (N,) bool
    ├── task            # (N,) string
    ├── dataset         # (N,) string
    └── episode_length  # (N,) int
```

### Conversion Steps:

1. **Load source data:** Read HDF5/TFRecord/Parquet files
2. **Generate embeddings:** If not present, use CLIP/R3M/etc.
3. **Create metadata:** Extract task labels, success flags, etc.
4. **Save in Tessera format:** Use h5py to write the required structure

See `examples/format_spec_example.py` for the exact format specification.

---

## Dataset Size Recommendations

For testing different performance scenarios:

- **Small (100-1K episodes):** Local testing, quick iteration
- **Medium (1K-10K episodes):** Our synthetic `huge_dataset_10k.h5`
- **Large (10K-100K episodes):** LAION 300K subset
- **Very Large (100K+ episodes):** LAION 10M subset (stress test)

---

## Sources

- [SISAP 2024 Challenge Datasets](https://sisap-challenges.github.io/2024/datasets/)
- [NVIDIA PhysicalAI Dataset](https://huggingface.co/datasets/nvidia/PhysicalAI-Robotics-Manipulation-Augmented)
- [Open X-Embodiment](https://robotics-transformer-x.github.io/)
- [Hugging Face LeRobot](https://github.com/huggingface/lerobot)
- [RoboTurk Dataset](https://roboturk.stanford.edu/dataset_real.html)
- [CLIP Retrieval](https://github.com/rom1504/clip-retrieval)
