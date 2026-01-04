#!/usr/bin/env python3
"""
Format Specification Example - Shows the exact HDF5 structure for Tessera.

This script creates a minimal embeddings file that demonstrates
all required and optional fields in the Tessera format.

Usage:
    python format_spec_example.py

Output:
    format_example.h5 - Minimal valid Tessera file
"""

import numpy as np
import h5py


def create_format_example():
    """Create a minimal example file showing the exact Tessera format."""

    print("Creating format_example.h5...")
    print()

    with h5py.File('format_example.h5', 'w') as f:
        # ============================================
        # REQUIRED: embeddings
        # ============================================
        # Shape: (N, D) where N = number of episodes, D = embedding dimension
        # dtype: float32 or float64
        # Note: Should be L2 normalized for best UMAP results

        N = 100  # 100 episodes
        D = 512  # 512-dimensional embeddings (CLIP ViT-B/32 default)

        embeddings = np.random.randn(N, D).astype(np.float32)
        embeddings = embeddings / np.linalg.norm(embeddings, axis=1, keepdims=True)

        f.create_dataset('embeddings', data=embeddings)
        print("✓ embeddings: shape (N, D) = ({}, {})".format(N, D))
        print("  - dtype: float32 or float64")
        print("  - should be L2 normalized")
        print()

        # ============================================
        # REQUIRED: episode_ids
        # ============================================
        # Shape: (N,) - same length as embeddings
        # dtype: string (variable length) or bytes

        episode_ids = [f"episode_{i:05d}" for i in range(N)]

        f.create_dataset('episode_ids', data=episode_ids)
        print("✓ episode_ids: shape (N,) = ({},)".format(N))
        print("  - dtype: string or bytes")
        print("  - must be unique identifiers")
        print()

        # ============================================
        # OPTIONAL: metadata group
        # ============================================
        # Contains additional arrays, each of shape (N,)
        # All arrays must have same length as embeddings

        metadata = f.create_group('metadata')
        print("✓ metadata/ (optional group)")

        # --- success (boolean) ---
        # For filtering/coloring by success/failure
        success = np.random.choice([True, False], size=N, p=[0.7, 0.3])
        metadata.create_dataset('success', data=success)
        print("  • success: shape (N,), dtype bool")

        # --- episode_length (integer) ---
        # For coloring by episode length
        episode_length = np.random.randint(50, 200, size=N)
        metadata.create_dataset('episode_length', data=episode_length)
        print("  • episode_length: shape (N,), dtype int")

        # --- task (string/categorical) ---
        # For stratified sampling
        tasks = ["pick", "place", "stack", "push"]
        task_labels = np.random.choice(tasks, size=N)
        metadata.create_dataset('task', data=task_labels)
        print("  • task: shape (N,), dtype string")

        # --- dataset (string) ---
        # For multi-dataset projects
        datasets = ["sim", "real"]
        dataset_labels = np.random.choice(datasets, size=N)
        metadata.create_dataset('dataset', data=dataset_labels)
        print("  • dataset: shape (N,), dtype string")

        # --- custom fields ---
        # You can add any additional metadata fields
        robot_id = np.random.randint(1, 4, size=N)
        metadata.create_dataset('robot_id', data=robot_id)
        print("  • robot_id: shape (N,), dtype int (custom field)")

    print()
    print("=" * 50)
    print("HDF5 Structure Summary:")
    print("=" * 50)
    print("""
format_example.h5
├── embeddings          # REQUIRED: (N, D) float32
├── episode_ids         # REQUIRED: (N,) string
└── metadata/           # OPTIONAL: group
    ├── success         # (N,) bool
    ├── episode_length  # (N,) int
    ├── task            # (N,) string
    ├── dataset         # (N,) string
    └── robot_id        # (N,) int (custom)
""")

    print("Validation Rules:")
    print("  1. 'embeddings' must be 2D array")
    print("  2. 'episode_ids' length must match embeddings count")
    print("  3. All metadata arrays must match embeddings count")
    print("  4. Maximum embedding dimension: 2048")
    print("  5. Maximum episodes: 200,000")
    print()
    print("Upload to Tessera:")
    print("  tessera upload format_example.h5")


if __name__ == "__main__":
    create_format_example()
