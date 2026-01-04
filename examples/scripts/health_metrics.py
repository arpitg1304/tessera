"""
Proprioceptive health metrics processor for robotics episode data.

Computes quality indicators from robot state data to flag potential
"garbage data" (sensor freezes, jerky teleoperation, empty episodes, etc.)
"""

import numpy as np
from pathlib import Path
from dataclasses import dataclass, field
from typing import Optional

try:
    import pyarrow.parquet as pq
except ImportError:
    pq = None


@dataclass
class HealthMetrics:
    """Health metrics for a single episode."""
    # Core scores (0-1, higher = healthier)
    physicality_score: float = 1.0
    smoothness_score: float = 1.0
    activity_score: float = 1.0

    # Binary flags
    is_frozen: bool = False
    is_empty: bool = False
    has_velocity_spike: bool = False

    # Raw measurements
    velocity_jitter: float = 0.0
    position_std: float = 0.0
    max_velocity: float = 0.0
    total_displacement: float = 0.0


@dataclass
class HealthThresholds:
    """Configurable thresholds for health detection."""
    # Freeze detection
    freeze_std: float = 0.001

    # Empty episode detection
    min_displacement: float = 0.1

    # Velocity spike detection
    max_velocity: float = 2.0

    # Smoothness (jerk threshold)
    max_jerk: float = 50.0

    # Activity threshold
    min_activity: float = 0.05


class HealthMetricsProcessor:
    """
    Processes proprioceptive data from LeRobot datasets to compute health metrics.

    Usage:
        processor = HealthMetricsProcessor(dataset_path)
        metrics = processor.compute_episode_metrics(episode_idx)

        # Or batch process
        all_metrics = processor.compute_all_metrics()
    """

    def __init__(
        self,
        dataset_path: Path,
        state_key: str = "observation.state",
        thresholds: Optional[HealthThresholds] = None
    ):
        """
        Initialize the health metrics processor.

        Args:
            dataset_path: Path to LeRobot dataset directory
            state_key: Key for proprioceptive state in parquet files
            thresholds: Custom thresholds for health detection
        """
        self.dataset_path = Path(dataset_path)
        self.state_key = state_key
        self.thresholds = thresholds or HealthThresholds()

        # Load episode index
        self.episode_index = self._load_episode_index()

    def _load_episode_index(self) -> Optional[dict]:
        """Load episode index from dataset metadata."""
        if pq is None:
            return None

        # Try to load episodes.parquet for episode boundaries
        episodes_path = self.dataset_path / "meta" / "episodes.parquet"
        if episodes_path.exists():
            table = pq.read_table(episodes_path)
            return {
                "episode_index": table["episode_index"].to_pylist(),
                "length": table["length"].to_pylist() if "length" in table.column_names else None
            }
        return None

    def _load_episode_state(self, episode_idx: int) -> Optional[np.ndarray]:
        """
        Load proprioceptive state data for a single episode.

        Args:
            episode_idx: Episode index

        Returns:
            State array of shape (T, n_joints) or None if unavailable
        """
        if pq is None:
            return None

        # LeRobot v2 format: data is in chunked parquet files
        # Try to find the right chunk
        data_dir = self.dataset_path / "data"
        if not data_dir.exists():
            # Try alternative: single parquet file
            parquet_path = self.dataset_path / "data.parquet"
            if parquet_path.exists():
                return self._extract_episode_from_parquet(parquet_path, episode_idx)
            return None

        # Find chunk containing this episode
        chunk_files = sorted(data_dir.glob("chunk-*.parquet"))
        if not chunk_files:
            # Try train.parquet or similar
            for name in ["train.parquet", "data.parquet"]:
                p = data_dir / name
                if p.exists():
                    return self._extract_episode_from_parquet(p, episode_idx)
            return None

        # Search chunks for episode
        for chunk_path in chunk_files:
            result = self._extract_episode_from_parquet(chunk_path, episode_idx)
            if result is not None:
                return result

        return None

    def _extract_episode_from_parquet(
        self,
        parquet_path: Path,
        episode_idx: int
    ) -> Optional[np.ndarray]:
        """Extract episode state data from a parquet file."""
        try:
            table = pq.read_table(parquet_path)

            # Check if state column exists
            if self.state_key not in table.column_names:
                # Try alternative names
                alt_keys = ["state", "observation_state", "robot_state", "qpos"]
                for key in alt_keys:
                    if key in table.column_names:
                        self.state_key = key
                        break
                else:
                    return None

            # Filter by episode index
            if "episode_index" in table.column_names:
                episode_col = table["episode_index"].to_numpy()
                mask = episode_col == episode_idx

                if not np.any(mask):
                    return None

                state_data = table[self.state_key].to_numpy()

                # Handle nested arrays
                if hasattr(state_data[0], '__len__'):
                    state_data = np.stack([np.array(s) for s in state_data])

                return state_data[mask]

            return None

        except Exception:
            return None

    def compute_episode_metrics(self, episode_idx: int) -> HealthMetrics:
        """
        Compute health metrics for a single episode.

        Args:
            episode_idx: Episode index

        Returns:
            HealthMetrics dataclass with computed values
        """
        metrics = HealthMetrics()

        # Load state data
        state = self._load_episode_state(episode_idx)
        if state is None or len(state) < 2:
            # No proprioceptive data available, return defaults
            return metrics

        # Compute velocities via finite differences
        velocities = np.diff(state, axis=0)

        # Compute accelerations
        accelerations = np.diff(velocities, axis=0) if len(velocities) > 1 else np.zeros_like(velocities)

        # Compute jerk (derivative of acceleration)
        jerk = np.diff(accelerations, axis=0) if len(accelerations) > 1 else np.zeros_like(accelerations)

        # --- Raw measurements ---
        metrics.position_std = float(np.std(state))
        metrics.velocity_jitter = float(np.var(velocities))
        metrics.max_velocity = float(np.max(np.abs(velocities)))
        metrics.total_displacement = float(np.sum(np.abs(velocities)))

        # --- Binary flags ---

        # Freeze detection: very low position variance
        metrics.is_frozen = metrics.position_std < self.thresholds.freeze_std

        # Empty episode: minimal total movement
        metrics.is_empty = metrics.total_displacement < self.thresholds.min_displacement

        # Velocity spike: sudden large movement
        metrics.has_velocity_spike = metrics.max_velocity > self.thresholds.max_velocity

        # --- Scores (0-1, higher = healthier) ---

        # Smoothness score: penalize high jerk
        if len(jerk) > 0:
            jerk_magnitude = float(np.mean(np.abs(jerk)))
            metrics.smoothness_score = float(np.clip(
                1.0 - (jerk_magnitude / self.thresholds.max_jerk),
                0.0, 1.0
            ))
        else:
            metrics.smoothness_score = 1.0

        # Activity score: reward movement
        metrics.activity_score = float(np.clip(
            metrics.total_displacement / 10.0,
            0.0, 1.0
        ))

        # Physicality score: composite of all factors
        penalties = []
        if metrics.is_frozen:
            penalties.append(0.5)
        if metrics.is_empty:
            penalties.append(0.3)
        if metrics.has_velocity_spike:
            penalties.append(0.2)

        base_score = (metrics.smoothness_score + metrics.activity_score) / 2
        penalty = sum(penalties)
        metrics.physicality_score = float(np.clip(base_score - penalty, 0.0, 1.0))

        return metrics

    def compute_all_metrics(self, num_episodes: int) -> dict[str, list]:
        """
        Compute health metrics for all episodes.

        Args:
            num_episodes: Total number of episodes

        Returns:
            Dictionary with arrays for each metric field
        """
        results = {
            "physicality_score": [],
            "smoothness_score": [],
            "activity_score": [],
            "is_frozen": [],
            "is_empty": [],
            "has_velocity_spike": [],
            "velocity_jitter": [],
        }

        for ep_idx in range(num_episodes):
            metrics = self.compute_episode_metrics(ep_idx)

            results["physicality_score"].append(metrics.physicality_score)
            results["smoothness_score"].append(metrics.smoothness_score)
            results["activity_score"].append(metrics.activity_score)
            results["is_frozen"].append(metrics.is_frozen)
            results["is_empty"].append(metrics.is_empty)
            results["has_velocity_spike"].append(metrics.has_velocity_spike)
            results["velocity_jitter"].append(metrics.velocity_jitter)

        return results

    def to_numpy_arrays(self, metrics_dict: dict[str, list]) -> dict[str, np.ndarray]:
        """Convert metrics dictionary to numpy arrays for HDF5 storage."""
        return {
            "physicality_score": np.array(metrics_dict["physicality_score"], dtype=np.float32),
            "smoothness_score": np.array(metrics_dict["smoothness_score"], dtype=np.float32),
            "activity_score": np.array(metrics_dict["activity_score"], dtype=np.float32),
            "is_frozen": np.array(metrics_dict["is_frozen"], dtype=bool),
            "is_empty": np.array(metrics_dict["is_empty"], dtype=bool),
            "has_velocity_spike": np.array(metrics_dict["has_velocity_spike"], dtype=bool),
            "velocity_jitter": np.array(metrics_dict["velocity_jitter"], dtype=np.float32),
        }


def compute_health_summary(metrics_dict: dict[str, list]) -> dict:
    """
    Compute summary statistics for health metrics.

    Returns a summary dict for logging/display.
    """
    n = len(metrics_dict["physicality_score"])

    frozen_count = sum(metrics_dict["is_frozen"])
    empty_count = sum(metrics_dict["is_empty"])
    spike_count = sum(metrics_dict["has_velocity_spike"])

    return {
        "total_episodes": n,
        "frozen_episodes": frozen_count,
        "empty_episodes": empty_count,
        "velocity_spike_episodes": spike_count,
        "healthy_episodes": n - frozen_count - empty_count,
        "mean_physicality_score": float(np.mean(metrics_dict["physicality_score"])),
        "mean_smoothness_score": float(np.mean(metrics_dict["smoothness_score"])),
        "mean_activity_score": float(np.mean(metrics_dict["activity_score"])),
    }
