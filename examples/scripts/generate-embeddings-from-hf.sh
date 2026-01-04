#!/bin/bash
# End-to-end script to download a HuggingFace LeRobot dataset and generate CLIP embeddings
#
# Usage:
#   ./generate-embeddings-from-hf.sh <huggingface-dataset-name> [embedding-options...]
#
# Examples:
#   ./generate-embeddings-from-hf.sh arpitg1304/eval_smolvla_stack_lego
#   ./generate-embeddings-from-hf.sh lerobot/pusht --mode start_end
#   ./generate-embeddings-from-hf.sh username/dataset --output my_embeddings.h5

set -e

if [ $# -eq 0 ]; then
    echo "Usage: $0 <huggingface-dataset-name> [embedding-options...]"
    echo ""
    echo "Examples:"
    echo "  $0 arpitg1304/eval_smolvla_stack_lego"
    echo "  $0 lerobot/pusht --mode start_end"
    echo "  $0 username/dataset --output my_embeddings.h5"
    echo ""
    echo "Available embedding options:"
    echo "  --mode {single,average,start_end}  Embedding mode (default: single)"
    echo "  --frame {start,middle,end}         Frame for 'single' mode (default: middle)"
    echo "  --num-frames N                     Frames for 'average' mode (default: 5)"
    echo "  --video-key KEY                    Camera view (default: observation.images.front)"
    echo "  --output FILE                      Output filename (default: auto-generated)"
    exit 1
fi

DATASET_NAME="$1"
shift  # Remove first argument, rest are embedding options

# Extract dataset name for local path
CLEAN_NAME=$(echo "$DATASET_NAME" | tr '/' '_')
LOCAL_DIR="$HOME/datasets/lerobot/$DATASET_NAME"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Tessera: Generate Embeddings from HuggingFace Dataset"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📦 Dataset: $DATASET_NAME"
echo "📂 Local path: $LOCAL_DIR"
echo ""

# Check if venv exists
if [ ! -d "venv" ]; then
    echo "❌ Error: venv not found. Please run from the tessera directory."
    exit 1
fi

# Step 1: Download dataset
echo "⏬ Step 1/3: Downloading dataset from HuggingFace..."
echo ""

python_code="
from huggingface_hub import snapshot_download
import os

local_dir = os.path.expanduser('$LOCAL_DIR')
print(f'Downloading to: {local_dir}')

try:
    path = snapshot_download(
        repo_id='$DATASET_NAME',
        repo_type='dataset',
        local_dir=local_dir
    )
    print(f'✅ Download complete: {path}')
except Exception as e:
    print(f'❌ Download failed: {e}')
    exit(1)
"

./venv/bin/python -c "$python_code"

if [ $? -ne 0 ]; then
    echo "❌ Failed to download dataset"
    exit 1
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Step 2: Generate embeddings
echo "🎨 Step 2/3: Generating CLIP embeddings..."
echo ""

# Set default output filename if not provided
OUTPUT_FILE="${CLEAN_NAME}_embeddings.h5"
for arg in "$@"; do
    if [[ "$prev_arg" == "--output" ]] || [[ "$prev_arg" == "-o" ]]; then
        OUTPUT_FILE="$arg"
    fi
    prev_arg="$arg"
done

docker run --rm \
  -v "$(pwd):/output" \
  -v "$LOCAL_DIR:$LOCAL_DIR:ro" \
  tessera-embeddings "$LOCAL_DIR" -o "/output/$OUTPUT_FILE" "$@"

if [ $? -ne 0 ]; then
    echo "❌ Failed to generate embeddings"
    exit 1
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Step 3: Upload to Tessera
echo "☁️  Step 3/3: Uploading to Tessera..."
echo ""

# Try port 8080 first, then 8001
TESSERA_PORT=8080
if ! curl -s -f "http://localhost:$TESSERA_PORT/api/upload" -X POST -F "file=@$OUTPUT_FILE" > /dev/null 2>&1; then
    TESSERA_PORT=8001
fi

UPLOAD_RESPONSE=$(curl -s -X POST "http://localhost:$TESSERA_PORT/api/upload" -F "file=@$OUTPUT_FILE")

if [ $? -eq 0 ]; then
    PROJECT_ID=$(echo "$UPLOAD_RESPONSE" | grep -o '"project_id":"[^"]*"' | cut -d'"' -f4)
    VIEW_URL=$(echo "$UPLOAD_RESPONSE" | grep -o '"view_url":"[^"]*"' | cut -d'"' -f4)
    EDIT_URL=$(echo "$UPLOAD_RESPONSE" | grep -o '"edit_url":"[^"]*"' | cut -d'"' -f4)

    echo "✅ Upload successful!"
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "🎉 All done!"
    echo ""
    echo "📊 View your embeddings:"
    echo "   http://localhost:$TESSERA_PORT$VIEW_URL"
    echo ""
    echo "✏️  Edit project:"
    echo "   http://localhost:$TESSERA_PORT$EDIT_URL"
    echo ""
    echo "📁 Embeddings file: $OUTPUT_FILE"
    echo ""
else
    echo "⚠️  Upload failed. You can manually upload later:"
    echo "   curl -X POST http://localhost:$TESSERA_PORT/api/upload -F 'file=@$OUTPUT_FILE'"
    echo ""
    echo "📁 Embeddings saved to: $OUTPUT_FILE"
    echo ""
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
