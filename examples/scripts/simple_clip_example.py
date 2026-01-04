#!/usr/bin/env python3
"""
Simple CLIP Example - Generate dummy embeddings in Tessera format.

This script demonstrates the expected .h5 file format for Tessera.
It generates random embeddings as a placeholder - in practice, you would
use CLIP or another encoder to generate real embeddings from your data.

Usage:
    python simple_clip_example.py

Output:
    dummy_embeddings.h5 - Ready to upload to Tessera
"""

import numpy as np
import h5py


def generate_dummy_embeddings(
    n_episodes: int = 1000,
    embedding_dim: int = 512,
    output_path: str = "dummy_embeddings.h5"
):
    """
    Generate a dummy embeddings file in Tessera format.

    Args:
        n_episodes: Number of episodes to generate
        embedding_dim: Dimension of embeddings (512 for CLIP ViT-B/32)
        output_path: Output file path
    """
    print(f"Generating {n_episodes} dummy embeddings...")

    # Generate random embeddings (normally you'd use CLIP here)
    # Normalizing to unit length as CLIP embeddings typically are
    embeddings = np.random.randn(n_episodes, embedding_dim).astype(np.float32)
    embeddings = embeddings / np.linalg.norm(embeddings, axis=1, keepdims=True)

    # Generate episode IDs
    episode_ids = [f"episode_{i:05d}" for i in range(n_episodes)]

    # Generate dummy metadata
    # Success: 70% success rate
    success = np.random.choice([True, False], size=n_episodes, p=[0.7, 0.3])

    # Episode length: random between 50 and 200 frames
    episode_lengths = np.random.randint(50, 200, size=n_episodes)

    # Task labels: 5 different tasks
    tasks = ["pick_cube", "place_cube", "stack", "push", "reach"]
    task_labels = np.random.choice(tasks, size=n_episodes)

    # Save in Tessera format
    print(f"Saving to {output_path}...")

    with h5py.File(output_path, 'w') as f:
        # Required: embeddings array
        f.create_dataset('embeddings', data=embeddings)

        # Required: episode IDs
        f.create_dataset('episode_ids', data=episode_ids)

        # Optional: metadata group
        metadata = f.create_group('metadata')
        metadata.create_dataset('success', data=success)
        metadata.create_dataset('episode_length', data=episode_lengths)
        metadata.create_dataset('task', data=task_labels)

    print()
    print("✓ Created dummy_embeddings.h5")
    print(f"✓ {n_episodes:,} episodes")
    print(f"✓ Embedding dimension: {embedding_dim}")
    print(f"✓ Metadata: success, episode_length, task")
    print()
    print("Upload to Tessera:")
    print(f"  tessera upload {output_path}")
    print()
    print("Or drag and drop in the web interface!")


if __name__ == "__main__":
    generate_dummy_embeddings()
