# Tessera API Documentation

This document describes the Tessera REST API endpoints.

## Base URL

```
http://localhost:8000/api
```

## Authentication

No authentication is required for MVP. Projects are accessed via random project IDs.

Edit operations require an access token (provided at upload time).

## Endpoints

### Upload

#### POST /api/upload

Upload an embeddings file.

**Request:**
- Content-Type: `multipart/form-data`
- Body: `file` - The .h5 file

**Response:**
```json
{
  "project_id": "abc123xy",
  "view_url": "/project/abc123xy",
  "edit_url": "/project/abc123xy?token=...",
  "n_episodes": 5000,
  "embedding_dim": 512,
  "expires_at": "2024-01-28T10:30:00",
  "message": "Upload successful!"
}
```

**Error Responses:**
- `400`: Invalid file format
- `413`: File too large
- `429`: Rate limit exceeded
- `507`: Storage full

#### POST /api/validate

Validate a file without uploading.

**Request:**
- Content-Type: `multipart/form-data`
- Body: `file` - The .h5 file

**Response:**
```json
{
  "valid": true,
  "n_episodes": 5000,
  "embedding_dim": 512,
  "has_success": true,
  "has_task": true,
  "has_episode_length": true,
  "has_dataset": false,
  "metadata_fields": ["success", "task", "episode_length"],
  "errors": [],
  "warnings": []
}
```

---

### Projects

#### GET /api/project/{project_id}

Get project information.

**Response:**
```json
{
  "id": "abc123xy",
  "n_episodes": 5000,
  "embedding_dim": 512,
  "has_success_labels": true,
  "has_task_labels": true,
  "has_episode_length": true,
  "dataset_name": null,
  "description": null,
  "created_at": "2024-01-21T10:30:00",
  "expires_at": "2024-01-28T10:30:00"
}
```

**Error Responses:**
- `404`: Project not found

#### GET /api/project/{project_id}/info

Get detailed project info including metadata summary.

**Response:**
```json
{
  "project": { ... },
  "metadata_summary": {
    "success": {
      "type": "boolean",
      "true_count": 3500,
      "false_count": 1500
    },
    "task": {
      "type": "categorical",
      "unique_count": 5,
      "categories": ["pick", "place", "stack", "push", "reach"]
    }
  },
  "files": [
    {"name": "embeddings.h5", "size_mb": 10.5},
    {"name": "umap_2d.npy", "size_mb": 0.04}
  ],
  "total_size_mb": 10.54
}
```

#### DELETE /api/project/{project_id}?token={access_token}

Delete a project.

**Query Parameters:**
- `token`: Access token (required)

**Response:**
```json
{
  "message": "Project deleted successfully"
}
```

---

### Visualization

#### GET /api/project/{project_id}/visualization

Get visualization data (computes UMAP on first request).

**Response:**
```json
{
  "coordinates": [[0.5, -0.3], [0.2, 0.8], ...],
  "episode_ids": ["ep_00001", "ep_00002", ...],
  "metadata": {
    "success": [true, false, true, ...],
    "task": ["pick", "place", "pick", ...],
    "episode_length": [100, 150, 80, ...]
  },
  "n_episodes": 5000,
  "umap_cached": false
}
```

**Note:** First request may take 10-60 seconds for UMAP computation.

#### GET /api/project/{project_id}/visualization/status

Check UMAP computation status.

**Response:**
```json
{
  "status": "ready",  // or "pending", "computing", "error"
  "message": "Visualization is ready"
}
```

#### POST /api/project/{project_id}/visualization/compute

Trigger UMAP computation in background.

**Response:**
```json
{
  "status": "computing",
  "message": "UMAP computation started. Estimated time: 30 seconds"
}
```

---

### Sampling

#### POST /api/project/{project_id}/sample

Sample episodes using specified strategy.

**Request:**
```json
{
  "strategy": "kmeans",  // "kmeans", "stratified", "random"
  "n_samples": 1000,
  "stratify_by": "task",  // Required for stratified
  "random_seed": 42,
  "selection_name": "diverse_1k"  // Optional: save selection
}
```

**Response:**
```json
{
  "selected_indices": [0, 5, 12, 23, ...],
  "selected_episode_ids": ["ep_00000", "ep_00005", ...],
  "n_samples": 1000,
  "strategy": "kmeans",
  "coverage_score": 0.85,
  "selection_id": 1  // If saved
}
```

#### GET /api/project/{project_id}/selections

Get all saved selections for a project.

**Response:**
```json
[
  {
    "id": 1,
    "selection_name": "diverse_1k",
    "strategy": "kmeans",
    "n_samples": 1000,
    "coverage_score": 0.85,
    "created_at": "2024-01-21T11:00:00"
  }
]
```

#### GET /api/project/{project_id}/selection/{selection_id}

Get a specific saved selection.

**Response:**
```json
{
  "id": 1,
  "selection_name": "diverse_1k",
  "strategy": "kmeans",
  "n_samples": 1000,
  "selected_indices": [0, 5, 12, ...],
  "selected_episode_ids": ["ep_00000", ...],
  "coverage_score": 0.85,
  "created_at": "2024-01-21T11:00:00"
}
```

#### GET /api/project/{project_id}/coverage?indices=0,5,12,23

Compute coverage score for custom selection.

**Query Parameters:**
- `indices`: Comma-separated list of indices

**Response:**
```json
{
  "n_selected": 4,
  "n_total": 5000,
  "coverage_score": 0.02
}
```

---

### Export

#### POST /api/project/{project_id}/export

Export selected episodes.

**Request:**
```json
{
  "format": "json",  // "json" or "csv"
  "selected_indices": [0, 5, 12, ...],  // OR
  "selection_id": 1,  // Use saved selection
  "include_metadata": true
}
```

**Response:** File download (JSON or CSV)

**JSON Format:**
```json
{
  "project_id": "abc123xy",
  "export_timestamp": "2024-01-21T12:00:00",
  "n_episodes": 1000,
  "strategy": "kmeans",
  "coverage_score": 0.85,
  "episode_ids": ["ep_00000", "ep_00005", ...],
  "indices": [0, 5, 12, ...],
  "metadata": {
    "success": [true, false, ...],
    "task": ["pick", "place", ...]
  },
  "code_snippet": "# Python code..."
}
```

**CSV Format:**
```csv
index,episode_id,success,task,episode_length
0,ep_00000,true,pick,100
5,ep_00005,false,place,150
```

---

### Health

#### GET /health

Health check endpoint.

**Response:**
```json
{
  "status": "healthy",
  "version": "1.0.0",
  "storage_usage_percent": 23.5,
  "active_projects": 42
}
```

---

## Rate Limits

| Endpoint | Limit |
|----------|-------|
| POST /api/upload | 2/hour, 5/day per IP |
| Other endpoints | 30/second per IP |

## Error Format

All errors return:
```json
{
  "detail": "Error message here"
}
```

## Example: Complete Workflow

```bash
# 1. Upload file
curl -X POST http://localhost:8000/api/upload \
  -F "file=@embeddings.h5"

# Response: {"project_id": "abc123xy", ...}

# 2. Get visualization
curl http://localhost:8000/api/project/abc123xy/visualization

# 3. Sample episodes
curl -X POST http://localhost:8000/api/project/abc123xy/sample \
  -H "Content-Type: application/json" \
  -d '{"strategy": "kmeans", "n_samples": 1000}'

# 4. Export selection
curl -X POST http://localhost:8000/api/project/abc123xy/export \
  -H "Content-Type: application/json" \
  -d '{"format": "json", "selected_indices": [0,5,12]}' \
  -o export.json
```
