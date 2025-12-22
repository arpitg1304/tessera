#!/usr/bin/env python3
"""
LeRobot Example - Generate CLIP embeddings from a LeRobot dataset.

This script extracts a frame from each episode and encodes it using CLIP.
The resulting embeddings can be uploaded to Tessera for visualization.

Requirements:
    pip install lerobot torch clip-by-openai pillow h5py numpy

Usage:
    python lerobot_example.py lerobot/pusht
    python lerobot_example.py lerobot/aloha_sim_transfer_cube

Output:
    {dataset_name}_embeddings.h5 - Ready to upload to Tessera
"""

import sys
import argparse
from pathlib import Path

import numpy as np
import h5py


def generate_lerobot_embeddings(
    dataset_name: str,
    output_path: str = None,
    frame_position: str = "middle",
    device: str = None
):
    """
    Generate CLIP embeddings from a LeRobot dataset.

    Args:
        dataset_name: LeRobot dataset name (e.g., 'lerobot/pusht')
        output_path: Output .h5 file path
        frame_position: Which frame to use ('start', 'middle', 'end')
        device: torch device ('cuda', 'cpu', or auto-detect)
    """
    # Import here to allow running without dependencies for testing
    try:
        import torch
        import clip
        from PIL import Image
        from lerobot.common.datasets.lerobot_dataset import LeRobotDataset
    except ImportError as e:
        print(f"Error: Missing dependency - {e}")
        print("\nInstall with:")
        print("  pip install lerobot torch clip-by-openai pillow")
        sys.exit(1)

    # Auto-detect device
    if device is None:
        device = "cuda" if torch.cuda.is_available() else "cpu"

    print(f"Device: {device}")

    # Load CLIP model
    print("Loading CLIP model (ViT-B/32)...")
    model, preprocess = clip.load("ViT-B/32", device=device)
    model.eval()

    # Load LeRobot dataset
    print(f"Loading dataset: {dataset_name}...")
    dataset = LeRobotDataset(dataset_name)

    num_episodes = dataset.num_episodes
    print(f"Found {num_episodes} episodes")

    # Prepare output
    if output_path is None:
        safe_name = dataset_name.replace('/', '_')
        output_path = f"{safe_name}_embeddings.h5"

    embeddings = []
    episode_ids = []
    episode_lengths = []
    success_labels = []

    print(f"\nProcessing episodes...")

    for ep_idx in range(num_episodes):
        # Get episode data
        episode = dataset.get_episode(ep_idx)
        episode_length = len(episode)

        # Select frame based on position
        if frame_position == "start":
            frame_idx = 0
        elif frame_position == "end":
            frame_idx = episode_length - 1
        else:  # middle
            frame_idx = episode_length // 2

        # Get observation image
        obs = episode[frame_idx]

        # Try different observation keys that might contain images
        image = None
        for key in ['observation.image', 'observation.images.top', 'observation.images.wrist', 'image']:
            if key in obs:
                image = obs[key]
                break

        if image is None:
            print(f"  Warning: No image found for episode {ep_idx}, skipping")
            continue

        # Convert to PIL Image if needed
        if isinstance(image, np.ndarray):
            # Handle different image formats
            if image.dtype == np.float32 or image.dtype == np.float64:
                image = (image * 255).astype(np.uint8)
            if len(image.shape) == 4:
                image = image[0]  # Remove batch dimension
            if image.shape[0] == 3:
                image = np.transpose(image, (1, 2, 0))  # CHW -> HWC
            image = Image.fromarray(image)
        elif hasattr(image, 'numpy'):  # torch tensor
            image = image.numpy()
            if image.shape[0] == 3:
                image = np.transpose(image, (1, 2, 0))
            image = Image.fromarray(image.astype(np.uint8))

        # Preprocess and encode
        image_input = preprocess(image).unsqueeze(0).to(device)

        with torch.no_grad():
            embedding = model.encode_image(image_input)
            embedding = embedding.cpu().numpy()[0]
            # Normalize
            embedding = embedding / np.linalg.norm(embedding)

        embeddings.append(embedding)
        episode_ids.append(f"ep_{ep_idx:05d}")
        episode_lengths.append(episode_length)

        # Try to get success label if available
        success = obs.get('success', obs.get('is_success', True))
        success_labels.append(bool(success))

        if (ep_idx + 1) % 100 == 0 or ep_idx == num_episodes - 1:
            print(f"  Processed {ep_idx + 1}/{num_episodes} episodes")

    # Convert to numpy arrays
    embeddings = np.array(embeddings, dtype=np.float32)
    episode_lengths = np.array(episode_lengths, dtype=np.int32)
    success_labels = np.array(success_labels, dtype=bool)

    # Save to HDF5
    print(f"\nSaving to {output_path}...")

    with h5py.File(output_path, 'w') as f:
        f.create_dataset('embeddings', data=embeddings)
        f.create_dataset('episode_ids', data=episode_ids)

        metadata = f.create_group('metadata')
        metadata.create_dataset('episode_length', data=episode_lengths)
        metadata.create_dataset('success', data=success_labels)
        metadata.create_dataset('dataset', data=[dataset_name] * len(embeddings))

    print()
    print(f"✓ Generated embeddings for {len(embeddings)} episodes")
    print(f"✓ Embedding dimension: {embeddings.shape[1]}")
    print(f"✓ Output file: {output_path}")
    print()
    print("Upload to Tessera:")
    print(f"  tessera upload {output_path}")


def main():
    parser = argparse.ArgumentParser(
        description="Generate CLIP embeddings from LeRobot dataset"
    )
    parser.add_argument(
        "dataset",
        help="LeRobot dataset name (e.g., 'lerobot/pusht')"
    )
    parser.add_argument(
        "-o", "--output",
        help="Output file path (default: {dataset}_embeddings.h5)"
    )
    parser.add_argument(
        "--frame",
        choices=["start", "middle", "end"],
        default="middle",
        help="Which frame to use for embedding (default: middle)"
    )
    parser.add_argument(
        "--device",
        choices=["cuda", "cpu"],
        help="Device to use (default: auto-detect)"
    )

    args = parser.parse_args()

    generate_lerobot_embeddings(
        dataset_name=args.dataset,
        output_path=args.output,
        frame_position=args.frame,
        device=args.device
    )


if __name__ == "__main__":
    main()
