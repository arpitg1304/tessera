#!/bin/bash
# Helper script to run the generate_lerobot_embeddings.py script in Docker
#
# Usage:
#   ./run-embeddings.sh /path/to/lerobot/dataset [additional args...]
#
# Examples:
#   ./run-embeddings.sh /path/to/dataset
#   ./run-embeddings.sh /path/to/dataset --mode start_end -o my_embeddings.h5
#   ./run-embeddings.sh /path/to/d1 /path/to/d2 --names "Task A" "Task B"

if [ $# -eq 0 ]; then
    echo "Error: No dataset path provided"
    echo "Usage: $0 /path/to/dataset [additional args...]"
    echo ""
    echo "Run with --help to see all available options:"
    echo "  $0 --help"
    exit 1
fi

# Check if asking for help
if [ "$1" = "--help" ] || [ "$1" = "-h" ]; then
    docker run --rm tessera-embeddings --help
    exit 0
fi

# Get the current directory to mount for output
CURRENT_DIR=$(pwd)

# Build the docker command
# Mount the current directory as /output for saving embeddings
# Mount each dataset path provided
DOCKER_CMD="docker run --rm"

# Mount current directory for output
DOCKER_CMD="$DOCKER_CMD -v \"${CURRENT_DIR}:/output\""
DOCKER_CMD="$DOCKER_CMD -w /output"

# Collect all dataset paths and mount them
DATASET_PATHS=()
OTHER_ARGS=()
COLLECTING_DATASETS=true

for arg in "$@"; do
    # Check if this looks like a path (starts with / or ./)
    if [[ "$arg" =~ ^(/|\./) ]] && [ -d "$arg" ]; then
        # It's a directory, mount it
        REAL_PATH=$(cd "$arg" && pwd)
        DOCKER_CMD="$DOCKER_CMD -v \"${REAL_PATH}:${REAL_PATH}:ro\""
        DATASET_PATHS+=("$REAL_PATH")
    elif [[ "$arg" =~ ^- ]]; then
        # It's a flag, stop collecting datasets
        COLLECTING_DATASETS=false
        OTHER_ARGS+=("$arg")
    else
        # Could be an argument value
        OTHER_ARGS+=("$arg")
    fi
done

# Add the image name
DOCKER_CMD="$DOCKER_CMD tessera-embeddings"

# Add dataset paths
for path in "${DATASET_PATHS[@]}"; do
    DOCKER_CMD="$DOCKER_CMD \"$path\""
done

# Add other arguments
for arg in "${OTHER_ARGS[@]}"; do
    DOCKER_CMD="$DOCKER_CMD \"$arg\""
done

echo "Running: $DOCKER_CMD"
echo ""

# Execute the command
eval $DOCKER_CMD
