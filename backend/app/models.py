"""
Pydantic models for API request/response validation.
"""
from datetime import datetime
from typing import Optional, Any
from pydantic import BaseModel, Field


# ============== Project Models ==============

class ProjectCreate(BaseModel):
    """Model for creating a new project (internal use)."""
    id: str
    embeddings_path: str
    n_episodes: int
    embedding_dim: int
    access_token: str
    expires_at: datetime
    has_success_labels: bool = False
    has_task_labels: bool = False
    has_episode_length: bool = False
    dataset_name: Optional[str] = None
    description: Optional[str] = None


class ProjectResponse(BaseModel):
    """Response model for project information."""
    id: str
    n_episodes: int
    embedding_dim: int
    has_success_labels: bool
    has_task_labels: bool
    has_episode_length: bool
    dataset_name: Optional[str]
    description: Optional[str]
    created_at: datetime
    expires_at: datetime


class UploadResponse(BaseModel):
    """Response model for upload endpoint."""
    project_id: str
    view_url: str
    edit_url: str
    n_episodes: int
    embedding_dim: int
    expires_at: str
    message: str = "Upload successful"


# ============== Visualization Models ==============

class VisualizationResponse(BaseModel):
    """Response model for visualization data."""
    coordinates: list[list[float]]
    episode_ids: list[str]
    metadata: dict[str, list[Any]]
    n_episodes: int
    umap_cached: bool = False


class VisualizationStatus(BaseModel):
    """Status of UMAP computation."""
    status: str  # "ready", "computing", "error"
    progress: Optional[float] = None
    message: Optional[str] = None


# ============== Sampling Models ==============

class SamplingRequest(BaseModel):
    """Request model for sampling endpoint."""
    strategy: str = Field(..., pattern="^(kmeans|stratified|random)$")
    n_samples: int = Field(..., ge=1)
    stratify_by: Optional[str] = None  # Required for stratified sampling
    random_seed: int = 42
    selection_name: Optional[str] = None


class SamplingResponse(BaseModel):
    """Response model for sampling results."""
    selected_indices: list[int]
    selected_episode_ids: list[str]
    n_samples: int
    strategy: str
    coverage_score: float
    selection_id: Optional[int] = None


class SelectionInfo(BaseModel):
    """Information about a saved selection."""
    id: int
    selection_name: str
    strategy: str
    n_samples: int
    coverage_score: Optional[float]
    created_at: datetime


# ============== Export Models ==============

class ExportRequest(BaseModel):
    """Request model for export endpoint."""
    format: str = Field(default="json", pattern="^(json|csv)$")
    selected_indices: Optional[list[int]] = None
    selection_id: Optional[int] = None
    include_metadata: bool = True


class ExportResponse(BaseModel):
    """Response model for export (metadata about the export)."""
    n_episodes: int
    format: str
    strategy: Optional[str]
    coverage_score: Optional[float]
    timestamp: str


# ============== Validation Models ==============

class ValidationResult(BaseModel):
    """Result of embedding file validation."""
    valid: bool
    n_episodes: int
    embedding_dim: int
    has_success: bool = False
    has_task: bool = False
    has_episode_length: bool = False
    has_dataset: bool = False
    metadata_fields: list[str] = []
    errors: list[str] = []
    warnings: list[str] = []


class ValidationError(BaseModel):
    """Validation error details."""
    field: str
    message: str
    details: Optional[str] = None


# ============== Health Check Models ==============

class HealthResponse(BaseModel):
    """Health check response."""
    status: str = "healthy"
    version: str = "1.0.0"
    storage_usage_percent: Optional[float] = None
    active_projects: Optional[int] = None
