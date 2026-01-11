#!/usr/bin/env python3
"""
Merge multiple embedding files into a single file for Tessera.

This script combines embeddings from multiple .h5 files, preserving
metadata, thumbnails, GIFs, and adding a 'dataset' field for visualization grouping.

Usage:
    python merge_embeddings.py file1.h5 file2.h5 file3.h5 -o combined.h5
    python merge_embeddings.py *.h5 -o combined.h5
"""

import argparse
import sys
from pathlib import Path

import numpy as np
import h5py


def merge_embeddings(
    input_files: list,
    output_path: str,
    dataset_names: list = None
):
    """
    Merge multiple embedding files into one.

    Args:
        input_files: List of .h5 file paths
        output_path: Output file path
        dataset_names: Optional list of dataset names (defaults to filenames)
    """
    if len(input_files) < 2:
        print("Error: Need at least 2 files to merge")
        sys.exit(1)

    # Use filenames as dataset names if not provided
    if dataset_names is None:
        dataset_names = [Path(f).stem.replace('_embeddings', '') for f in input_files]

    if len(dataset_names) != len(input_files):
        print(f"Error: {len(dataset_names)} names provided for {len(input_files)} files")
        sys.exit(1)

    all_embeddings = []
    all_episode_ids = []
    all_datasets = []
    all_metadata = {}
    all_thumbnails = []
    all_gifs = []

    embedding_dim = None
    has_thumbnails = None
    has_gifs = None

    print(f"Merging {len(input_files)} files...")

    for i, (file_path, dataset_name) in enumerate(zip(input_files, dataset_names)):
        print(f"  [{i+1}/{len(input_files)}] {file_path} -> '{dataset_name}'")

        try:
            with h5py.File(file_path, 'r') as f:
                # Read embeddings
                embeddings = f['embeddings'][:]
                n_episodes = len(embeddings)

                # Check embedding dimension consistency
                if embedding_dim is None:
                    embedding_dim = embeddings.shape[1]
                elif embeddings.shape[1] != embedding_dim:
                    print(f"    Warning: Dimension mismatch ({embeddings.shape[1]} vs {embedding_dim})")
                    print(f"    Skipping {file_path}")
                    continue

                all_embeddings.append(embeddings)

                # Read episode IDs
                if 'episode_ids' in f:
                    episode_ids = [eid.decode() if isinstance(eid, bytes) else eid
                                   for eid in f['episode_ids'][:]]
                    # Prefix with dataset name to ensure uniqueness
                    episode_ids = [f"{dataset_name}/{eid}" for eid in episode_ids]
                else:
                    episode_ids = [f"{dataset_name}/ep_{j:05d}" for j in range(n_episodes)]

                all_episode_ids.extend(episode_ids)

                # Add dataset labels
                all_datasets.extend([dataset_name] * n_episodes)

                # Read metadata
                if 'metadata' in f:
                    for key in f['metadata'].keys():
                        if key not in all_metadata:
                            all_metadata[key] = []

                        values = f['metadata'][key][:]
                        if values.dtype.kind == 'S' or values.dtype.kind == 'O':
                            values = [v.decode() if isinstance(v, bytes) else v for v in values]
                        else:
                            values = list(values)

                        all_metadata[key].extend(values)

                # Read thumbnails (variable-length byte arrays)
                file_has_thumbnails = 'thumbnails' in f
                if has_thumbnails is None:
                    has_thumbnails = file_has_thumbnails
                elif has_thumbnails != file_has_thumbnails:
                    print(f"    Warning: Thumbnail availability mismatch, skipping thumbnails")
                    has_thumbnails = False

                if file_has_thumbnails and has_thumbnails:
                    for j in range(n_episodes):
                        thumb_data = f['thumbnails'][j]
                        if hasattr(thumb_data, 'tobytes'):
                            all_thumbnails.append(thumb_data.tobytes())
                        else:
                            all_thumbnails.append(bytes(thumb_data))

                # Read GIFs (variable-length byte arrays)
                file_has_gifs = 'gifs' in f
                if has_gifs is None:
                    has_gifs = file_has_gifs
                elif has_gifs != file_has_gifs:
                    print(f"    Warning: GIF availability mismatch, skipping GIFs")
                    has_gifs = False

                if file_has_gifs and has_gifs:
                    for j in range(n_episodes):
                        gif_data = f['gifs'][j]
                        if hasattr(gif_data, 'tobytes'):
                            all_gifs.append(gif_data.tobytes())
                        else:
                            all_gifs.append(bytes(gif_data))

                extras = []
                if file_has_thumbnails:
                    extras.append("thumbnails")
                if file_has_gifs:
                    extras.append("gifs")
                extras_str = f", {'+'.join(extras)}" if extras else ""
                print(f"    {n_episodes} episodes, dim={embeddings.shape[1]}{extras_str}")

        except Exception as e:
            print(f"    Error reading {file_path}: {e}")
            continue

    if len(all_embeddings) == 0:
        print("Error: No valid embeddings found")
        sys.exit(1)

    # Combine all embeddings
    combined_embeddings = np.vstack(all_embeddings).astype(np.float32)
    total_episodes = len(combined_embeddings)

    print(f"\nCombined: {total_episodes} episodes, dim={embedding_dim}")

    # Ensure metadata arrays match length
    for key in all_metadata:
        if len(all_metadata[key]) != total_episodes:
            print(f"  Warning: Metadata '{key}' has {len(all_metadata[key])} values, expected {total_episodes}")
            # Pad or truncate
            if len(all_metadata[key]) < total_episodes:
                # Pad with empty/default values
                if isinstance(all_metadata[key][0], bool):
                    all_metadata[key].extend([False] * (total_episodes - len(all_metadata[key])))
                elif isinstance(all_metadata[key][0], (int, float)):
                    all_metadata[key].extend([0] * (total_episodes - len(all_metadata[key])))
                else:
                    all_metadata[key].extend([''] * (total_episodes - len(all_metadata[key])))
            else:
                all_metadata[key] = all_metadata[key][:total_episodes]

    # Save combined file
    print(f"\nSaving to {output_path}...")

    with h5py.File(output_path, 'w') as f:
        f.create_dataset('embeddings', data=combined_embeddings)
        f.create_dataset('episode_ids', data=all_episode_ids)

        metadata = f.create_group('metadata')
        # Always include dataset as metadata for coloring
        metadata.create_dataset('dataset', data=all_datasets)

        # Add other metadata
        for key, values in all_metadata.items():
            if key != 'dataset':  # Don't duplicate
                try:
                    if isinstance(values[0], bool):
                        metadata.create_dataset(key, data=np.array(values, dtype=bool))
                    elif isinstance(values[0], (int, np.integer)):
                        metadata.create_dataset(key, data=np.array(values, dtype=np.int32))
                    elif isinstance(values[0], (float, np.floating)):
                        metadata.create_dataset(key, data=np.array(values, dtype=np.float32))
                    else:
                        metadata.create_dataset(key, data=values)
                except Exception as e:
                    print(f"  Warning: Could not save metadata '{key}': {e}")

        # Save thumbnails if all files had them
        if has_thumbnails and len(all_thumbnails) == total_episodes:
            dt = h5py.special_dtype(vlen=np.dtype('uint8'))
            thumbs_ds = f.create_dataset('thumbnails', (total_episodes,), dtype=dt)
            for j, thumb_bytes in enumerate(all_thumbnails):
                thumbs_ds[j] = np.frombuffer(thumb_bytes, dtype=np.uint8)
            print(f"  Thumbnails: {total_episodes} included")

        # Save GIFs if all files had them
        if has_gifs and len(all_gifs) == total_episodes:
            dt = h5py.special_dtype(vlen=np.dtype('uint8'))
            gifs_ds = f.create_dataset('gifs', (total_episodes,), dtype=dt)
            for j, gif_bytes in enumerate(all_gifs):
                gifs_ds[j] = np.frombuffer(gif_bytes, dtype=np.uint8)
            print(f"  GIFs: {total_episodes} included")

    print()
    print(f"Merged {len(input_files)} datasets:")
    for name in dataset_names:
        count = all_datasets.count(name)
        print(f"  {name}: {count} episodes")
    print()
    print(f"Output: {output_path}")
    print(f"Total: {total_episodes} episodes, {embedding_dim} dimensions")
    print()
    print("Upload to Tessera:")
    print(f"  tessera upload {output_path} --host http://localhost:8001")


def main():
    parser = argparse.ArgumentParser(
        description="Merge multiple embedding files for Tessera",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Merge files (uses filenames as dataset names)
  python merge_embeddings.py dataset1.h5 dataset2.h5 -o combined.h5

  # Merge with custom dataset names
  python merge_embeddings.py a.h5 b.h5 --names "Task A" "Task B" -o combined.h5

  # Merge all .h5 files in directory
  python merge_embeddings.py *.h5 -o combined.h5
"""
    )
    parser.add_argument(
        "files",
        nargs="+",
        help="Input .h5 embedding files to merge"
    )
    parser.add_argument(
        "-o", "--output",
        required=True,
        help="Output file path"
    )
    parser.add_argument(
        "--names",
        nargs="+",
        help="Dataset names (one per file, defaults to filenames)"
    )

    args = parser.parse_args()

    merge_embeddings(
        input_files=args.files,
        output_path=args.output,
        dataset_names=args.names
    )


if __name__ == "__main__":
    main()
