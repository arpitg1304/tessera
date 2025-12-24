#!/usr/bin/env python3
"""
Generate a synthetic embedding file for testing.

This creates a realistic embedding dataset with:
- Configurable number of episodes
- Configurable embedding dimension
- Metadata fields: success, task, dataset, episode_length
- Structured clusters to test similarity search
"""

import h5py
import numpy as np
import argparse
from pathlib import Path

def main():
    parser = argparse.ArgumentParser(description='Generate synthetic embeddings for testing')
    parser.add_argument('-n', '--episodes', type=int, default=1000,
                        help='Number of episodes to generate (default: 1000)')
    parser.add_argument('-d', '--dim', type=int, default=512,
                        help='Embedding dimension (default: 512)')
    parser.add_argument('-o', '--output', type=str, default=None,
                        help='Output file path (default: large_dataset_embeddings.h5)')
    parser.add_argument('-s', '--seed', type=int, default=42,
                        help='Random seed for reproducibility (default: 42)')

    args = parser.parse_args()

    # Configuration
    N_EPISODES = args.episodes
    EMBEDDING_DIM = args.dim

    if args.output:
        OUTPUT_FILE = Path(args.output)
    else:
        OUTPUT_FILE = Path(__file__).parent / "large_dataset_embeddings.h5"

    # Set random seed for reproducibility
    np.random.seed(args.seed)

    print(f"Generating synthetic embeddings for {N_EPISODES} episodes...")

    # Create structured embeddings with clear clusters
    # We'll create 5 main clusters representing different "tasks"
    N_CLUSTERS = 5
    EPISODES_PER_CLUSTER = N_EPISODES // N_CLUSTERS

    embeddings = []
    tasks = []
    datasets = []
    success_labels = []
    episode_lengths = []

    task_names = ["pick_cube", "stack_blocks", "open_drawer", "press_button", "pour_water"]
    dataset_names = ["sim_dataset_v1", "sim_dataset_v2", "real_robot_data"]

    for cluster_id in range(N_CLUSTERS):
        # Create a cluster center in high-dimensional space
        cluster_center = np.random.randn(EMBEDDING_DIM) * 2

        # Add episodes around this center
        for i in range(EPISODES_PER_CLUSTER):
            # Add noise to cluster center
            noise = np.random.randn(EMBEDDING_DIM) * 0.5
            embedding = cluster_center + noise

            # Normalize (common for neural network embeddings)
            embedding = embedding / (np.linalg.norm(embedding) + 1e-8)

            embeddings.append(embedding)

            # Generate metadata
            task = task_names[cluster_id]
            dataset = np.random.choice(dataset_names)

            # Success rate varies by task (some tasks are harder)
            success_rate = 0.9 - (cluster_id * 0.1)  # First task easiest
            success = np.random.random() < success_rate

            # Episode length varies by task
            base_length = 50 + (cluster_id * 30)
            episode_length = int(base_length + np.random.randn() * 20)
            episode_length = max(10, min(300, episode_length))  # Clamp to reasonable range

            tasks.append(task)
            datasets.append(dataset)
            success_labels.append(success)
            episode_lengths.append(episode_length)

    # Handle remaining episodes (if N_EPISODES is not divisible by N_CLUSTERS)
    remaining = N_EPISODES - len(embeddings)
    for i in range(remaining):
        cluster_id = np.random.randint(N_CLUSTERS)
        cluster_center = np.random.randn(EMBEDDING_DIM) * 2
        noise = np.random.randn(EMBEDDING_DIM) * 0.5
        embedding = (cluster_center + noise) / (np.linalg.norm(cluster_center + noise) + 1e-8)
        embeddings.append(embedding)

        tasks.append(task_names[cluster_id])
        datasets.append(np.random.choice(dataset_names))
        success_labels.append(np.random.random() < 0.7)
        episode_lengths.append(int(100 + np.random.randn() * 30))

    # Convert to numpy arrays
    embeddings = np.array(embeddings, dtype=np.float32)
    tasks = np.array(tasks, dtype='S')  # Byte strings
    datasets = np.array(datasets, dtype='S')
    success_labels = np.array(success_labels, dtype=bool)
    episode_lengths = np.array(episode_lengths, dtype=np.int32)

    # Generate episode IDs
    episode_ids = [f"episode_{i:05d}" for i in range(N_EPISODES)]
    episode_ids = np.array(episode_ids, dtype='S')

    print(f"Embeddings shape: {embeddings.shape}")
    print(f"Task distribution: {dict(zip(*np.unique(tasks, return_counts=True)))}")
    print(f"Dataset distribution: {dict(zip(*np.unique(datasets, return_counts=True)))}")
    print(f"Success rate: {success_labels.mean():.2%}")
    print(f"Episode length range: {episode_lengths.min()} - {episode_lengths.max()}")

    # Save to HDF5 file
    print(f"\nSaving to {OUTPUT_FILE}...")
    with h5py.File(OUTPUT_FILE, 'w') as f:
        # Required fields
        f.create_dataset('embeddings', data=embeddings, compression='gzip')
        f.create_dataset('episode_ids', data=episode_ids)

        # Metadata group
        metadata_group = f.create_group('metadata')
        metadata_group.create_dataset('task', data=tasks)
        metadata_group.create_dataset('dataset', data=datasets)
        metadata_group.create_dataset('success', data=success_labels)
        metadata_group.create_dataset('episode_length', data=episode_lengths)

    print(f"✓ Generated {OUTPUT_FILE}")
    print(f"  - {N_EPISODES} episodes")
    print(f"  - {EMBEDDING_DIM}D embeddings")
    print(f"  - {len(task_names)} tasks")
    print(f"  - {len(dataset_names)} datasets")
    print(f"  - File size: {OUTPUT_FILE.stat().st_size / 1024 / 1024:.2f} MB")
    print("\nYou can now upload this file to test Tessera with a larger dataset!")


if __name__ == '__main__':
    main()
