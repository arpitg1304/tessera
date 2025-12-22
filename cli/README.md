# Tessera CLI

Command-line tool for validating and uploading embeddings to Tessera.

## Installation

```bash
cd cli
pip install -e .
```

## Usage

### Validate a file

```bash
tessera validate embeddings.h5
```

### Upload to Tessera

```bash
# Upload to local server
tessera upload embeddings.h5

# Upload to remote server
tessera upload embeddings.h5 --host https://tessera.yourdomain.com
```

### Check project info

```bash
tessera info abc123xyz
```

### Health check

```bash
tessera health
```

## Environment Variables

- `TESSERA_HOST`: Default server URL (e.g., `https://tessera.yourdomain.com`)

## File Format

The CLI validates that your `.h5` file follows the Tessera format:

```
embeddings.h5
├── embeddings (N x D float32 array)
├── episode_ids (N string array)
└── metadata/ (optional)
    ├── success (N bool array)
    ├── task (N string array)
    └── episode_length (N int array)
```
