# Embedding Research for Robotics Data Quality

This document outlines research directions for improving embeddings beyond simple frame-based CLIP representations. The goal is to better capture temporal dynamics, proprioceptive state, and data quality signals that enable detection of "garbage data" (sensor freezes, jerky teleoperation, collisions, failed episodes).

## Current Approach

Tessera currently supports **bring-your-own-embeddings** with example scripts for generating CLIP embeddings from LeRobot dataset videos:

| Mode | Description | Dimension | Captures |
|------|-------------|-----------|----------|
| `single` | Middle/start/end frame | 512 | Static scene appearance |
| `average` | N evenly-spaced frames averaged | 512 | Smoothed visual summary |
| `start_end` | Concatenated start+end embeddings | 1024 | Task progress (before/after) |

**Limitation:** These approaches are "blind" to temporal dynamics and robot internal state. Two-frame embeddings cannot detect:
- Jerky/erratic motion during execution
- Sensor freezes mid-episode
- Collisions or force spikes
- "Empty" episodes where the robot never meaningfully moves

---

## Research Direction 1: Temporal State Embeddings

### 1.1 Robotics-Focused Vision Encoders

Replace or augment CLIP with encoders trained specifically on robot manipulation data:

| Model | Description | Advantages |
|-------|-------------|------------|
| **R3M** | Pre-trained on Ego4D human videos | Understands manipulation, object interactions |
| **MVP** | Multi-task visual pretraining | Better generalization across tasks |
| **Voltron** | Language-conditioned visual representations | Task-aware embeddings |
| **VC-1** | Visual Cortex model from Meta | Trained on diverse embodied AI data |

**Implementation approach:**
```python
# R3M with temporal aggregation
from r3m import load_r3m

r3m = load_r3m("resnet50")

def get_temporal_embedding(video_frames, n_frames=8):
    """Extract R3M embeddings and aggregate temporally."""
    indices = np.linspace(0, len(video_frames)-1, n_frames, dtype=int)

    frame_embeddings = []
    for idx in indices:
        frame = preprocess(video_frames[idx])
        with torch.no_grad():
            emb = r3m(frame.unsqueeze(0))
        frame_embeddings.append(emb)

    # Temporal aggregation options:
    # 1. Max pooling (captures salient features)
    # 2. Attention pooling (learnable importance)
    # 3. LSTM/Transformer encoding (captures sequences)
    stacked = torch.stack(frame_embeddings)
    pooled = stacked.max(dim=0).values  # or attention mechanism

    return pooled.numpy()
```

### 1.2 Time-Series Pooling Strategies

Given N frame embeddings from an episode, aggregate into a single vector:

| Strategy | Formula | Best For |
|----------|---------|----------|
| **Max Pool** | `max(E_1, ..., E_N)` | Detecting unusual frames |
| **Mean Pool** | `mean(E_1, ..., E_N)` | Smooth task summary |
| **Attention Pool** | `sum(a_i * E_i)` where `a = softmax(W @ E)` | Learnable importance |
| **Transformer** | `CLS token from Transformer(E_1, ..., E_N)` | Complex temporal patterns |

### 1.3 Temporal Delta Features

Capture how the scene changes over time:

```python
def compute_temporal_deltas(frame_embeddings):
    """Compute frame-to-frame changes."""
    deltas = []
    for i in range(1, len(frame_embeddings)):
        delta = frame_embeddings[i] - frame_embeddings[i-1]
        deltas.append(delta)

    return {
        'mean_delta': np.mean(deltas, axis=0),
        'max_delta': np.max(np.abs(deltas), axis=0),
        'delta_variance': np.var(deltas, axis=0),  # High variance = jerky
    }
```

---

## Research Direction 2: Proprioceptive Embeddings

LeRobot datasets include rich proprioceptive data (joint angles, velocities, end-effector poses). This data directly reveals motion quality issues invisible to vision.

### 2.1 Proprioceptive Feature Engineering

Extract dynamic features that signal data quality problems:

| Feature | Computation | Flags |
|---------|-------------|-------|
| **Velocity Jitter** | `var(joint_velocities)` | Jerky teleoperation |
| **Acceleration Spikes** | `max(abs(diff(velocities)))` | Sudden movements, collisions |
| **Position Freeze** | `std(joint_angles) < threshold` | Sensor failure |
| **Limit Proximity** | `min(distance_to_joint_limits)` | Near-singularity |
| **Motion Range** | `max(angles) - min(angles)` | "Empty" episodes |

```python
def extract_proprio_features(episode_data):
    """Extract proprioceptive quality indicators."""
    joint_pos = episode_data['observation.state']  # (T, n_joints)

    # Velocity via finite differences
    velocities = np.diff(joint_pos, axis=0)

    features = {
        # Motion dynamics
        'velocity_jitter': np.var(velocities),
        'max_acceleration': np.max(np.abs(np.diff(velocities, axis=0))),
        'motion_range': np.max(joint_pos) - np.min(joint_pos),

        # Freeze detection
        'position_std': np.std(joint_pos),
        'is_frozen': np.std(joint_pos) < 0.001,

        # Safety indicators
        'max_velocity': np.max(np.abs(velocities)),
        'total_displacement': np.sum(np.abs(velocities)),
    }

    return features
```

### 2.2 Proprioceptive Autoencoder

Train a VAE on "good" proprioceptive trajectories. High reconstruction loss indicates anomalies:

```python
class ProprioVAE(nn.Module):
    """Variational autoencoder for proprioceptive trajectories."""

    def __init__(self, input_dim=7, hidden_dim=64, latent_dim=16, seq_len=100):
        super().__init__()
        self.encoder = nn.LSTM(input_dim, hidden_dim, batch_first=True)
        self.fc_mu = nn.Linear(hidden_dim, latent_dim)
        self.fc_var = nn.Linear(hidden_dim, latent_dim)
        self.decoder = nn.LSTM(latent_dim, hidden_dim, batch_first=True)
        self.output = nn.Linear(hidden_dim, input_dim)

    def encode(self, x):
        _, (h, _) = self.encoder(x)
        return self.fc_mu(h[-1]), self.fc_var(h[-1])

    def reparameterize(self, mu, logvar):
        std = torch.exp(0.5 * logvar)
        eps = torch.randn_like(std)
        return mu + eps * std

    def decode(self, z, seq_len):
        z_expanded = z.unsqueeze(1).repeat(1, seq_len, 1)
        output, _ = self.decoder(z_expanded)
        return self.output(output)

    def forward(self, x):
        mu, logvar = self.encode(x)
        z = self.reparameterize(mu, logvar)
        recon = self.decode(z, x.size(1))
        return recon, mu, logvar, z

# Usage: z becomes the proprioceptive embedding
# reconstruction_loss indicates anomaly score
```

### 2.3 Action-Based Features

If action data is available, detect "empty" or malformed episodes:

```python
def extract_action_features(episode_data):
    """Detect episodes with problematic actions."""
    actions = episode_data['action']  # (T, action_dim)

    return {
        'action_magnitude': np.mean(np.linalg.norm(actions, axis=1)),
        'action_variance': np.var(actions),
        'zero_action_ratio': np.mean(np.linalg.norm(actions, axis=1) < 0.01),
        'is_mostly_idle': np.mean(np.linalg.norm(actions, axis=1) < 0.01) > 0.9,
    }
```

---

## Research Direction 3: Multi-Modal Fusion

Combine vision and proprioception into unified embeddings that capture both appearance and dynamics.

### 3.1 Concatenation Fusion

Simple approach: project each modality to same dimension, concatenate:

```
E_fused = [MLP(E_vision) || MLP(E_proprio)]
```

```python
def create_fused_embedding(vision_emb, proprio_emb, vision_dim=256, proprio_dim=128):
    """Fuse vision and proprioceptive embeddings."""
    # Project to common dimensions
    vision_proj = vision_mlp(vision_emb)  # -> (vision_dim,)
    proprio_proj = proprio_mlp(proprio_emb)  # -> (proprio_dim,)

    # Concatenate
    fused = np.concatenate([vision_proj, proprio_proj])

    # Normalize
    fused = fused / np.linalg.norm(fused)

    return fused  # (vision_dim + proprio_dim,)
```

### 3.2 Cross-Attention Fusion

Learn to attend between modalities:

```python
class CrossModalFusion(nn.Module):
    """Cross-attention fusion of vision and proprioception."""

    def __init__(self, vision_dim=512, proprio_dim=64, hidden_dim=256):
        super().__init__()
        self.vision_proj = nn.Linear(vision_dim, hidden_dim)
        self.proprio_proj = nn.Linear(proprio_dim, hidden_dim)
        self.cross_attn = nn.MultiheadAttention(hidden_dim, num_heads=4)
        self.output_proj = nn.Linear(hidden_dim * 2, hidden_dim)

    def forward(self, vision_seq, proprio_seq):
        # vision_seq: (T, batch, vision_dim)
        # proprio_seq: (T, batch, proprio_dim)

        v = self.vision_proj(vision_seq)
        p = self.proprio_proj(proprio_seq)

        # Cross attention: vision attends to proprio
        v_attended, _ = self.cross_attn(v, p, p)

        # Pool and combine
        v_pooled = v_attended.mean(dim=0)
        p_pooled = p.mean(dim=0)

        fused = self.output_proj(torch.cat([v_pooled, p_pooled], dim=-1))
        return fused
```

### 3.3 Summary: Multi-Modal Feature Table

| Data Source | Embedding Method | What It Catches |
|-------------|-----------------|-----------------|
| Vision (Temporal) | R3M + Attention Pool | Background shifts, lighting glitches, object disappearing |
| Proprioception | VAE latent / Engineered features | Kinematic singularities, joint limits, frozen sensors |
| Actions | Statistics / Chunking | "Empty" episodes, no meaningful movement |
| Force/Torque | Spike detection | Collisions, unexpected contacts |

---

## Research Direction 4: Outlier Detection Strategies

Once embeddings capture richer information, apply anomaly detection to flag bad data.

### 4.1 Reconstruction-Based Anomaly Detection

Train an autoencoder on "good" data, flag high reconstruction loss:

```python
def compute_anomaly_score(embedding, autoencoder):
    """Compute reconstruction-based anomaly score."""
    with torch.no_grad():
        recon = autoencoder.decode(autoencoder.encode(embedding))
        loss = F.mse_loss(recon, embedding)
    return loss.item()

# In Tessera: color-code points by anomaly score
# High score = likely garbage data
```

### 4.2 Density-Based Outlier Detection

Use Local Outlier Factor (LOF) on UMAP clusters:

```python
from sklearn.neighbors import LocalOutlierFactor

def detect_outliers(embeddings, n_neighbors=20):
    """Detect outliers using Local Outlier Factor."""
    lof = LocalOutlierFactor(n_neighbors=n_neighbors, contamination=0.05)
    outlier_labels = lof.fit_predict(embeddings)
    outlier_scores = -lof.negative_outlier_factor_

    return {
        'is_outlier': outlier_labels == -1,
        'outlier_score': outlier_scores,
    }
```

### 4.3 Distance-Based Flagging

Flag episodes far from cluster centroids:

```python
def compute_cluster_distances(embeddings, labels):
    """Compute distance of each point to its cluster centroid."""
    unique_labels = np.unique(labels)
    distances = np.zeros(len(embeddings))

    for label in unique_labels:
        mask = labels == label
        centroid = embeddings[mask].mean(axis=0)
        distances[mask] = np.linalg.norm(embeddings[mask] - centroid, axis=1)

    return distances
```

### 4.4 Isolation Forest for High-Dimensional Anomalies

```python
from sklearn.ensemble import IsolationForest

def detect_anomalies_iforest(embeddings, contamination=0.05):
    """Detect anomalies using Isolation Forest."""
    clf = IsolationForest(contamination=contamination, random_state=42)
    predictions = clf.fit_predict(embeddings)
    scores = clf.decision_function(embeddings)

    return {
        'is_anomaly': predictions == -1,
        'anomaly_score': -scores,  # Higher = more anomalous
    }
```

---

## Research Direction 5: Proprioception Health Checks

Pre-compute quality scores from proprioceptive data to include in HDF5 metadata.

### 5.1 Physicality Score

A composite score indicating trajectory "health":

```python
def compute_physicality_score(episode_data, joint_limits=None):
    """Compute overall physicality/quality score for an episode."""
    joint_pos = episode_data['observation.state']
    velocities = np.diff(joint_pos, axis=0)
    accelerations = np.diff(velocities, axis=0)

    scores = {}

    # 1. Freeze detection (0 = frozen, 1 = normal motion)
    motion_std = np.std(joint_pos)
    scores['freeze_score'] = min(1.0, motion_std / 0.1)

    # 2. Smoothness score (penalize jerk)
    jerk = np.diff(accelerations, axis=0)
    jerk_magnitude = np.mean(np.abs(jerk))
    scores['smoothness_score'] = np.exp(-jerk_magnitude * 10)

    # 3. Safety score (distance from limits)
    if joint_limits is not None:
        lower, upper = joint_limits
        margin_lower = np.min(joint_pos - lower)
        margin_upper = np.min(upper - joint_pos)
        min_margin = min(margin_lower, margin_upper)
        scores['safety_score'] = min(1.0, min_margin / 0.1)
    else:
        scores['safety_score'] = 1.0

    # 4. Activity score (did the robot actually move?)
    total_motion = np.sum(np.abs(velocities))
    scores['activity_score'] = min(1.0, total_motion / 10.0)

    # Composite score
    scores['physicality_score'] = np.mean([
        scores['freeze_score'],
        scores['smoothness_score'],
        scores['safety_score'],
        scores['activity_score'],
    ])

    return scores
```

### 5.2 Health Check Flags

Binary flags for specific issues:

```python
def compute_health_flags(episode_data, thresholds=None):
    """Compute binary health flags for an episode."""
    if thresholds is None:
        thresholds = {
            'freeze_std': 0.001,
            'max_velocity': 2.0,
            'max_acceleration': 10.0,
            'min_motion': 0.1,
        }

    joint_pos = episode_data['observation.state']
    velocities = np.diff(joint_pos, axis=0)
    accelerations = np.diff(velocities, axis=0)

    flags = {
        # Sensor failures
        'has_freeze': np.std(joint_pos) < thresholds['freeze_std'],

        # Safety violations
        'has_velocity_spike': np.max(np.abs(velocities)) > thresholds['max_velocity'],
        'has_acceleration_spike': np.max(np.abs(accelerations)) > thresholds['max_acceleration'],

        # Quality issues
        'is_empty': np.sum(np.abs(velocities)) < thresholds['min_motion'],

        # NaN/Inf detection
        'has_invalid_values': np.any(~np.isfinite(joint_pos)),
    }

    flags['is_healthy'] = not any(flags.values())

    return flags
```

---

## Research Direction 6: Temporal Embedding Architectures

### 6.1 Action Chunking Transformer (ACT-style)

Embed sequences of actions as single vectors:

```python
class ActionChunkEncoder(nn.Module):
    """Encode action sequences into fixed-size embeddings."""

    def __init__(self, action_dim=7, hidden_dim=128, n_heads=4, n_layers=2):
        super().__init__()
        self.input_proj = nn.Linear(action_dim, hidden_dim)
        self.pos_encoding = nn.Parameter(torch.randn(1, 100, hidden_dim))
        encoder_layer = nn.TransformerEncoderLayer(hidden_dim, n_heads, batch_first=True)
        self.transformer = nn.TransformerEncoder(encoder_layer, n_layers)
        self.cls_token = nn.Parameter(torch.randn(1, 1, hidden_dim))

    def forward(self, actions):
        # actions: (batch, seq_len, action_dim)
        batch_size = actions.size(0)

        x = self.input_proj(actions)
        x = x + self.pos_encoding[:, :x.size(1), :]

        # Prepend CLS token
        cls = self.cls_token.expand(batch_size, -1, -1)
        x = torch.cat([cls, x], dim=1)

        x = self.transformer(x)

        return x[:, 0, :]  # Return CLS token as embedding
```

### 6.2 Trajectory Contrastive Learning

Learn embeddings where similar trajectories are close:

```python
class TrajectoryEncoder(nn.Module):
    """Contrastive trajectory encoder."""

    def __init__(self, obs_dim, action_dim, hidden_dim=256, output_dim=128):
        super().__init__()
        self.obs_encoder = nn.LSTM(obs_dim, hidden_dim, batch_first=True)
        self.action_encoder = nn.LSTM(action_dim, hidden_dim, batch_first=True)
        self.fusion = nn.Linear(hidden_dim * 2, output_dim)

    def forward(self, observations, actions):
        _, (obs_h, _) = self.obs_encoder(observations)
        _, (act_h, _) = self.action_encoder(actions)

        combined = torch.cat([obs_h[-1], act_h[-1]], dim=-1)
        embedding = self.fusion(combined)
        embedding = F.normalize(embedding, dim=-1)

        return embedding

# Train with InfoNCE loss: similar task trajectories should be close
```

---

## Implementation Roadmap

### Phase 1: Enhanced Metadata

Extend current scripts to compute and store quality metrics:

```python
# In generate_lerobot_embeddings.py
metadata.create_dataset('physicality_score', data=physicality_scores)
metadata.create_dataset('is_frozen', data=freeze_flags)
metadata.create_dataset('velocity_jitter', data=jitter_values)
```

### Phase 2: Alternative Encoders

Add support for R3M/MVP encoders alongside CLIP:

```bash
python generate_lerobot_embeddings.py /path/to/data \
    --encoder r3m \
    --temporal-pool attention \
    --num-frames 16
```

### Phase 3: Multi-Modal Fusion

Create fused embeddings combining vision + proprioception:

```bash
python generate_fused_embeddings.py /path/to/data \
    --vision-encoder clip \
    --proprio-encoder vae \
    --fusion-method concat
```

### Phase 4: Tessera UI Integration

- Color-code points by anomaly score
- Filter by health flags
- Show physicality score distribution
- Highlight potential garbage data

---

## References

### Models
- **R3M**: [A Universal Visual Representation for Robot Manipulation](https://arxiv.org/abs/2203.12601)
- **MVP**: [Real-World Robot Learning with Masked Visual Pre-training](https://arxiv.org/abs/2210.03109)
- **Voltron**: [Language-Driven Representation Learning for Robotics](https://arxiv.org/abs/2302.12766)
- **VC-1**: [Where are we in the search for an Artificial Visual Cortex for Embodied Intelligence?](https://arxiv.org/abs/2303.18240)

### Methods
- **ACT**: [Learning Fine-Grained Bimanual Manipulation with Low-Cost Hardware](https://arxiv.org/abs/2304.13705)
- **Diffusion Policy**: [Diffusion Policy: Visuomotor Policy Learning via Action Diffusion](https://arxiv.org/abs/2303.04137)

### Anomaly Detection
- **LOF**: [LOF: Identifying Density-Based Local Outliers](https://dl.acm.org/doi/10.1145/342009.335388)
- **Isolation Forest**: [Isolation Forest](https://ieeexplore.ieee.org/document/4781136)

---

## Notes

- All proposed methods maintain compatibility with Tessera's HDF5 format
- Embedding dimensions should stay within the 2048 limit
- Quality scores can be stored as metadata for filtering/coloring in UI
- Consider computational costs: some methods require GPU for reasonable speed
