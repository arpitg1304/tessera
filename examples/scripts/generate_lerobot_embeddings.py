#!/usr/bin/env python3
"""
Generate CLIP embeddings from local LeRobot dataset cache.

This script reads video files from a LeRobot dataset cached locally
and generates CLIP embeddings for each episode.

Supports single or multiple datasets in one run.

Embedding modes:
- single: Use one frame (start, middle, or end)
- average: Average embeddings from N evenly-spaced frames
- start_end: Concatenate start and end frame embeddings (2x dimension)

Health metrics (optional, --health flag):
- Computes proprioceptive quality indicators from robot state data
- Flags frozen sensors, empty episodes, velocity spikes
- Stores physicality_score, smoothness_score, etc. in metadata
"""

import os
import sys
import json
import argparse
from pathlib import Path

import numpy as np
import h5py

# Check for required packages
try:
    import torch
    import clip
    from PIL import Image
    import av
except ImportError as e:
    print(f"Missing dependency: {e}")
    print("\nInstall with:")
    print("  pip install torch git+https://github.com/openai/CLIP.git pillow av")
    sys.exit(1)


def get_video_info(video_path: str) -> int:
    """Get total frame count from video."""
    container = av.open(video_path)
    stream = container.streams.video[0]
    total_frames = stream.frames
    if total_frames == 0:
        total_frames = sum(1 for _ in container.decode(stream))
    container.close()
    return total_frames


def extract_frame_from_video(video_path: str, position: str = "middle") -> np.ndarray:
    """Extract a single frame from a video file using PyAV."""
    container = av.open(video_path)
    stream = container.streams.video[0]

    # Get total frames
    total_frames = stream.frames
    if total_frames == 0:
        # Fallback: count frames manually
        total_frames = sum(1 for _ in container.decode(stream))
        container.seek(0)

    if position == "start":
        target_idx = 0
    elif position == "end":
        target_idx = max(0, total_frames - 1)
    else:  # middle
        target_idx = total_frames // 2

    # Decode frames until we reach target
    frame = None
    for i, video_frame in enumerate(container.decode(stream)):
        frame = video_frame
        if i >= target_idx:
            break

    container.close()

    if frame is None:
        raise ValueError(f"Cannot read any frame from {video_path}")

    # Convert to numpy RGB array
    return frame.to_ndarray(format='rgb24')


def extract_frames_from_video(video_path: str, frame_indices: list) -> list:
    """Extract multiple frames from a video file using PyAV.

    Args:
        video_path: Path to video file
        frame_indices: List of frame indices to extract (sorted)

    Returns:
        List of numpy arrays (RGB frames)
    """
    container = av.open(video_path)
    stream = container.streams.video[0]

    frames = []
    target_set = set(frame_indices)

    for i, video_frame in enumerate(container.decode(stream)):
        if i in target_set:
            frames.append(video_frame.to_ndarray(format='rgb24'))
        if i >= max(frame_indices):
            break

    container.close()
    return frames


def process_single_dataset(
    dataset_path: Path,
    model,
    preprocess,
    mode: str,
    frame_position: str,
    num_frames: int,
    video_key: str,
    device: str,
    dataset_name: str = None,
    compute_health: bool = False,
    state_key: str = "observation.state"
) -> tuple:
    """
    Process a single dataset and return embeddings and metadata.

    Returns:
        Tuple of (embeddings, episode_ids, episode_lengths, success_labels, dataset_labels, health_metrics)
        health_metrics is None if compute_health=False
    """
    # Load dataset info
    info_path = dataset_path / "meta" / "info.json"
    if not info_path.exists():
        print(f"Error: Cannot find {info_path}")
        return None

    with open(info_path) as f:
        info = json.load(f)

    num_episodes = info["total_episodes"]
    video_path_template = info.get("video_path", "videos/chunk-{episode_chunk:03d}/{video_key}/episode_{episode_index:06d}.mp4")
    chunks_size = info.get("chunks_size", 1000)

    # Use provided name or folder name
    if dataset_name is None:
        dataset_name = dataset_path.name

    print(f"\nDataset: {dataset_name} ({dataset_path})")
    print(f"  Episodes: {num_episodes}")

    # Initialize health metrics processor if requested
    health_processor = None
    if compute_health:
        try:
            from health_metrics import HealthMetricsProcessor
            health_processor = HealthMetricsProcessor(
                dataset_path=dataset_path,
                state_key=state_key
            )
            print(f"  Health metrics: enabled (state_key={state_key})")
        except ImportError:
            print("  Warning: health_metrics.py not found, skipping health computation")
        except Exception as e:
            print(f"  Warning: Could not initialize health processor: {e}")

    # Load episodes metadata if available
    episodes_path = dataset_path / "meta" / "episodes.jsonl"
    episode_metadata = []
    if episodes_path.exists():
        with open(episodes_path) as f:
            for line in f:
                episode_metadata.append(json.loads(line))

    embeddings = []
    episode_ids = []
    episode_lengths = []
    success_labels = []
    health_metrics_list = []
    processed_indices = []  # Track which episodes were successfully processed

    # Detect format version based on video_path_template placeholders
    is_v3_format = "{chunk_index" in video_path_template or "{file_index" in video_path_template

    for ep_idx in range(num_episodes):
        # Calculate chunk index and file index
        chunk_idx = ep_idx // chunks_size
        file_idx = ep_idx % chunks_size  # file_index is episode index within chunk

        # Build video path based on format version
        if is_v3_format:
            # v3.0 format: videos/{video_key}/chunk-{chunk_index:03d}/file-{file_index:03d}.mp4
            video_path = dataset_path / video_path_template.format(
                chunk_index=chunk_idx,
                file_index=file_idx,
                video_key=video_key
            )
        else:
            # v2.0 format: videos/chunk-{episode_chunk:03d}/{video_key}/episode_{episode_index:06d}.mp4
            video_path = dataset_path / video_path_template.format(
                episode_chunk=chunk_idx,
                video_key=video_key,
                episode_index=ep_idx
            )

        if not video_path.exists():
            # Try alternative video key format (dots to underscores)
            alt_video_key = video_key.replace(".", "_")
            if is_v3_format:
                video_path = dataset_path / video_path_template.format(
                    chunk_index=chunk_idx,
                    file_index=file_idx,
                    video_key=alt_video_key
                )
            else:
                video_path = dataset_path / video_path_template.format(
                    episode_chunk=chunk_idx,
                    video_key=alt_video_key,
                    episode_index=ep_idx
                )

        if not video_path.exists():
            print(f"    Warning: Video not found for episode {ep_idx}: {video_path}, skipping")
            continue

        try:
            # Get total frames for this video
            total_frames = get_video_info(str(video_path))

            if mode == "single":
                # Extract single frame
                frame = extract_frame_from_video(str(video_path), frame_position)
                image = Image.fromarray(frame)
                image_input = preprocess(image).unsqueeze(0).to(device)

                with torch.no_grad():
                    embedding = model.encode_image(image_input)
                    embedding = embedding.cpu().numpy()[0]
                    embedding = embedding / np.linalg.norm(embedding)

            elif mode == "average":
                # Extract N evenly-spaced frames and average embeddings
                if total_frames < num_frames:
                    frame_indices = list(range(total_frames))
                else:
                    frame_indices = [int(i * (total_frames - 1) / (num_frames - 1)) for i in range(num_frames)]

                frames = extract_frames_from_video(str(video_path), frame_indices)

                frame_embeddings = []
                for frame in frames:
                    image = Image.fromarray(frame)
                    image_input = preprocess(image).unsqueeze(0).to(device)
                    with torch.no_grad():
                        emb = model.encode_image(image_input)
                        emb = emb.cpu().numpy()[0]
                        frame_embeddings.append(emb)

                # Average and normalize
                embedding = np.mean(frame_embeddings, axis=0)
                embedding = embedding / np.linalg.norm(embedding)

            elif mode == "start_end":
                # Extract start and end frames, concatenate embeddings
                frame_indices = [0, max(0, total_frames - 1)]
                frames = extract_frames_from_video(str(video_path), frame_indices)

                frame_embeddings = []
                for frame in frames:
                    image = Image.fromarray(frame)
                    image_input = preprocess(image).unsqueeze(0).to(device)
                    with torch.no_grad():
                        emb = model.encode_image(image_input)
                        emb = emb.cpu().numpy()[0]
                        emb = emb / np.linalg.norm(emb)  # Normalize each before concat
                        frame_embeddings.append(emb)

                # Concatenate start and end embeddings
                embedding = np.concatenate(frame_embeddings)
                # Normalize the concatenated embedding
                embedding = embedding / np.linalg.norm(embedding)

            else:
                raise ValueError(f"Unknown mode: {mode}")

            embeddings.append(embedding)
            episode_ids.append(f"{dataset_name}/ep_{ep_idx:05d}")
            processed_indices.append(ep_idx)

            # Get episode length from metadata or use frame count
            if ep_idx < len(episode_metadata):
                ep_len = episode_metadata[ep_idx].get("length", 0)
                episode_lengths.append(ep_len)
            else:
                episode_lengths.append(total_frames)

            success_labels.append(True)

            # Compute health metrics if enabled
            if health_processor is not None:
                try:
                    metrics = health_processor.compute_episode_metrics(ep_idx)
                    health_metrics_list.append(metrics)
                except Exception as e:
                    # Append default metrics on error
                    from health_metrics import HealthMetrics
                    health_metrics_list.append(HealthMetrics())

            if (ep_idx + 1) % 10 == 0 or ep_idx == num_episodes - 1:
                print(f"    Processed {ep_idx + 1}/{num_episodes} episodes")

        except Exception as e:
            print(f"    Error processing episode {ep_idx}: {e}")
            continue

    dataset_labels = [dataset_name] * len(embeddings)

    # Convert health metrics list to dict format
    health_metrics_dict = None
    if health_metrics_list:
        health_metrics_dict = {
            "physicality_score": [m.physicality_score for m in health_metrics_list],
            "smoothness_score": [m.smoothness_score for m in health_metrics_list],
            "activity_score": [m.activity_score for m in health_metrics_list],
            "is_frozen": [m.is_frozen for m in health_metrics_list],
            "is_empty": [m.is_empty for m in health_metrics_list],
            "has_velocity_spike": [m.has_velocity_spike for m in health_metrics_list],
            "velocity_jitter": [m.velocity_jitter for m in health_metrics_list],
        }

    return embeddings, episode_ids, episode_lengths, success_labels, dataset_labels, health_metrics_dict


def generate_embeddings(
    dataset_paths: list,
    output_path: str = None,
    mode: str = "single",
    frame_position: str = "middle",
    num_frames: int = 5,
    video_key: str = "observation.images.front",
    device: str = None,
    dataset_names: list = None,
    compute_health: bool = False,
    state_key: str = "observation.state"
):
    """
    Generate CLIP embeddings from one or more local LeRobot datasets.

    Args:
        dataset_paths: List of paths to LeRobot dataset directories
        output_path: Output .h5 file path
        mode: Embedding mode ('single', 'average', 'start_end')
        frame_position: Which frame to use for 'single' mode ('start', 'middle', 'end')
        num_frames: Number of frames to average for 'average' mode
        video_key: Which camera view to use
        device: torch device
        dataset_names: Optional list of names for each dataset
        compute_health: Whether to compute proprioceptive health metrics
        state_key: Key for proprioceptive state in parquet files
    """
    # Convert to list if single path
    if isinstance(dataset_paths, (str, Path)):
        dataset_paths = [dataset_paths]
    dataset_paths = [Path(p) for p in dataset_paths]

    # Validate dataset names
    if dataset_names is None:
        dataset_names = [None] * len(dataset_paths)
    elif len(dataset_names) != len(dataset_paths):
        print(f"Error: {len(dataset_names)} names for {len(dataset_paths)} datasets")
        sys.exit(1)

    print(f"Processing {len(dataset_paths)} dataset(s)")
    print(f"Mode: {mode}", end="")
    if mode == "single":
        print(f" (frame: {frame_position})")
    elif mode == "average":
        print(f" ({num_frames} frames)")
    elif mode == "start_end":
        print(" (concatenate start+end)")
    else:
        print()
    print(f"Video key: {video_key}")

    # Auto-detect device
    if device is None:
        device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"Device: {device}")

    # Load CLIP model once
    print("Loading CLIP model (ViT-B/32)...")
    model, preprocess = clip.load("ViT-B/32", device=device)
    model.eval()

    # Process all datasets
    all_embeddings = []
    all_episode_ids = []
    all_episode_lengths = []
    all_success_labels = []
    all_dataset_labels = []
    all_health_metrics = None

    for dataset_path, dataset_name in zip(dataset_paths, dataset_names):
        result = process_single_dataset(
            dataset_path=dataset_path,
            model=model,
            preprocess=preprocess,
            mode=mode,
            frame_position=frame_position,
            num_frames=num_frames,
            video_key=video_key,
            device=device,
            dataset_name=dataset_name,
            compute_health=compute_health,
            state_key=state_key
        )

        if result is None:
            print(f"  Skipping {dataset_path}")
            continue

        embeddings, episode_ids, episode_lengths, success_labels, dataset_labels, health_metrics = result
        all_embeddings.extend(embeddings)
        all_episode_ids.extend(episode_ids)
        all_episode_lengths.extend(episode_lengths)
        all_success_labels.extend(success_labels)
        all_dataset_labels.extend(dataset_labels)

        # Merge health metrics
        if health_metrics is not None:
            if all_health_metrics is None:
                all_health_metrics = {k: [] for k in health_metrics.keys()}
            for key, values in health_metrics.items():
                all_health_metrics[key].extend(values)

    if len(all_embeddings) == 0:
        print("Error: No embeddings generated!")
        sys.exit(1)

    # Convert to numpy arrays
    all_embeddings = np.array(all_embeddings, dtype=np.float32)
    all_episode_lengths = np.array(all_episode_lengths, dtype=np.int32)
    all_success_labels = np.array(all_success_labels, dtype=bool)

    # Set output path
    if output_path is None:
        if len(dataset_paths) == 1:
            output_path = f"{dataset_paths[0].name}_embeddings.h5"
        else:
            output_path = "combined_embeddings.h5"

    # Save to HDF5
    print(f"\nSaving to {output_path}...")

    with h5py.File(output_path, 'w') as f:
        f.create_dataset('embeddings', data=all_embeddings)
        f.create_dataset('episode_ids', data=all_episode_ids)

        metadata = f.create_group('metadata')
        metadata.create_dataset('episode_length', data=all_episode_lengths)
        metadata.create_dataset('success', data=all_success_labels)
        metadata.create_dataset('dataset', data=all_dataset_labels)

        # Save health metrics if computed
        if all_health_metrics is not None:
            # Float metrics
            metadata.create_dataset(
                'physicality_score',
                data=np.array(all_health_metrics['physicality_score'], dtype=np.float32)
            )
            metadata.create_dataset(
                'smoothness_score',
                data=np.array(all_health_metrics['smoothness_score'], dtype=np.float32)
            )
            metadata.create_dataset(
                'activity_score',
                data=np.array(all_health_metrics['activity_score'], dtype=np.float32)
            )
            metadata.create_dataset(
                'velocity_jitter',
                data=np.array(all_health_metrics['velocity_jitter'], dtype=np.float32)
            )
            # Boolean flags
            metadata.create_dataset(
                'is_frozen',
                data=np.array(all_health_metrics['is_frozen'], dtype=bool)
            )
            metadata.create_dataset(
                'is_empty',
                data=np.array(all_health_metrics['is_empty'], dtype=bool)
            )
            metadata.create_dataset(
                'has_velocity_spike',
                data=np.array(all_health_metrics['has_velocity_spike'], dtype=bool)
            )

    # Print summary
    print()
    print(f"Generated embeddings for {len(all_embeddings)} episodes")
    print(f"Embedding dimension: {all_embeddings.shape[1]}")

    # Show per-dataset counts
    unique_datasets = sorted(set(all_dataset_labels))
    if len(unique_datasets) > 1:
        print("\nPer-dataset counts:")
        for ds in unique_datasets:
            count = all_dataset_labels.count(ds)
            print(f"  {ds}: {count} episodes")

    # Show health metrics summary if computed
    if all_health_metrics is not None:
        from health_metrics import compute_health_summary
        summary = compute_health_summary(all_health_metrics)
        print("\nHealth metrics summary:")
        print(f"  Frozen episodes: {summary['frozen_episodes']}/{summary['total_episodes']}")
        print(f"  Empty episodes: {summary['empty_episodes']}/{summary['total_episodes']}")
        print(f"  Velocity spikes: {summary['velocity_spike_episodes']}/{summary['total_episodes']}")
        print(f"  Mean physicality score: {summary['mean_physicality_score']:.3f}")

    print(f"\nOutput file: {output_path}")
    print()
    print("Upload to Tessera:")
    print(f"  curl -X POST http://localhost:8001/api/upload -F 'file=@{output_path}'")
    print()
    print("Or use the CLI:")
    print(f"  tessera upload {output_path} --host http://localhost:8001")


def main():
    parser = argparse.ArgumentParser(
        description="Generate CLIP embeddings from local LeRobot dataset(s)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Embedding modes:
  single     Use one frame per episode (default)
  average    Average embeddings from N evenly-spaced frames
  start_end  Concatenate start and end frame embeddings (1024-dim output)

Health metrics (--health flag):
  Computes quality indicators from proprioceptive data:
  - physicality_score: Overall quality score (0-1)
  - smoothness_score: Motion smoothness (0-1)
  - activity_score: Amount of movement (0-1)
  - is_frozen: Sensor freeze detected
  - is_empty: No meaningful movement
  - has_velocity_spike: Sudden jerky motion

Examples:
  # Single dataset, middle frame (default)
  python generate_lerobot_embeddings.py /path/to/dataset

  # Single dataset with start_end mode
  python generate_lerobot_embeddings.py /path/to/dataset --mode start_end

  # Multiple datasets in one file
  python generate_lerobot_embeddings.py /path/to/dataset1 /path/to/dataset2 -o combined.h5

  # Multiple datasets with custom names
  python generate_lerobot_embeddings.py /path/to/d1 /path/to/d2 --names "Task A" "Task B" -o combined.h5

  # Average 5 frames per episode
  python generate_lerobot_embeddings.py /path/to/dataset --mode average --num-frames 5

  # With health metrics
  python generate_lerobot_embeddings.py /path/to/dataset --health

  # With health metrics and custom state key
  python generate_lerobot_embeddings.py /path/to/dataset --health --state-key qpos
"""
    )
    parser.add_argument(
        "dataset_paths",
        nargs="+",
        help="Path(s) to LeRobot dataset directory(s)"
    )
    parser.add_argument(
        "-o", "--output",
        help="Output file path (default: {dataset_name}_embeddings.h5 or combined_embeddings.h5)"
    )
    parser.add_argument(
        "--names",
        nargs="+",
        help="Dataset names (one per dataset path, defaults to folder names)"
    )
    parser.add_argument(
        "--mode",
        choices=["single", "average", "start_end"],
        default="single",
        help="Embedding mode (default: single)"
    )
    parser.add_argument(
        "--frame",
        choices=["start", "middle", "end"],
        default="middle",
        help="Which frame to use for 'single' mode (default: middle)"
    )
    parser.add_argument(
        "--num-frames",
        type=int,
        default=5,
        help="Number of frames to average for 'average' mode (default: 5)"
    )
    parser.add_argument(
        "--video-key",
        default="observation.images.front",
        help="Video key to use (default: observation.images.front)"
    )
    parser.add_argument(
        "--device",
        choices=["cuda", "cpu"],
        help="Device to use (default: auto-detect)"
    )
    parser.add_argument(
        "--health",
        action="store_true",
        help="Compute proprioceptive health metrics (requires parquet state data)"
    )
    parser.add_argument(
        "--state-key",
        default="observation.state",
        help="Key for proprioceptive state in parquet files (default: observation.state)"
    )

    args = parser.parse_args()

    generate_embeddings(
        dataset_paths=args.dataset_paths,
        output_path=args.output,
        mode=args.mode,
        frame_position=args.frame,
        num_frames=args.num_frames,
        video_key=args.video_key,
        device=args.device,
        dataset_names=args.names,
        compute_health=args.health,
        state_key=args.state_key
    )


if __name__ == "__main__":
    main()
