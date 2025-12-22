"""
Export endpoints for downloading selected episode IDs.
"""
import json
import csv
import io
from datetime import datetime
from fastapi import APIRouter, HTTPException, Response
from fastapi.responses import StreamingResponse

from ..database import db
from ..models import ExportRequest
from ..services.embedding_processor import load_episode_ids, load_metadata

router = APIRouter()


@router.post("/{project_id}/export")
async def export_selection(
    project_id: str,
    request: ExportRequest
):
    """
    Export selected episode IDs in the specified format.

    Can export from:
    - A saved selection (by selection_id)
    - Custom indices (by selected_indices list)
    """
    project = db.get_project(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")

    embeddings_path = db.get_embeddings_path(project_id)

    # Determine which indices to export
    selected_indices = None
    strategy = None
    coverage_score = None

    if request.selection_id is not None:
        # Load from saved selection
        selection = db.get_selection(request.selection_id)
        if selection is None:
            raise HTTPException(status_code=404, detail="Selection not found")
        if selection["project_id"] != project_id:
            raise HTTPException(status_code=403, detail="Selection belongs to different project")

        selected_indices = selection["selected_indices"]
        strategy = selection["strategy"]
        coverage_score = selection["coverage_score"]

    elif request.selected_indices is not None:
        selected_indices = request.selected_indices
        # Validate indices
        if any(i < 0 or i >= project.n_episodes for i in selected_indices):
            raise HTTPException(
                status_code=400,
                detail=f"Indices must be between 0 and {project.n_episodes - 1}"
            )
    else:
        raise HTTPException(
            status_code=400,
            detail="Either selection_id or selected_indices must be provided"
        )

    # Load episode IDs
    try:
        all_episode_ids = load_episode_ids(embeddings_path)
        selected_episode_ids = [all_episode_ids[i] for i in selected_indices]
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to load episode IDs: {str(e)}"
        )

    # Load metadata if requested
    metadata_for_export = {}
    if request.include_metadata:
        try:
            all_metadata = load_metadata(embeddings_path)
            for key, values in all_metadata.items():
                metadata_for_export[key] = [values[i] for i in selected_indices]
        except Exception:
            pass  # Continue without metadata if loading fails

    timestamp = datetime.now().isoformat()

    # Generate export based on format
    if request.format == "json":
        export_data = {
            "project_id": project_id,
            "export_timestamp": timestamp,
            "n_episodes": len(selected_indices),
            "strategy": strategy,
            "coverage_score": coverage_score,
            "episode_ids": selected_episode_ids,
            "indices": selected_indices
        }

        if request.include_metadata and metadata_for_export:
            export_data["metadata"] = metadata_for_export

        # Also include a Python code snippet for convenience
        export_data["code_snippet"] = generate_python_snippet(selected_episode_ids)

        content = json.dumps(export_data, indent=2)
        filename = f"tessera_export_{project_id}_{len(selected_indices)}.json"

        return Response(
            content=content,
            media_type="application/json",
            headers={
                "Content-Disposition": f"attachment; filename={filename}"
            }
        )

    elif request.format == "csv":
        output = io.StringIO()
        writer = csv.writer(output)

        # Header
        header = ["index", "episode_id"]
        if request.include_metadata:
            header.extend(metadata_for_export.keys())
        writer.writerow(header)

        # Data rows
        for i, (idx, ep_id) in enumerate(zip(selected_indices, selected_episode_ids)):
            row = [idx, ep_id]
            if request.include_metadata:
                for key in metadata_for_export.keys():
                    row.append(metadata_for_export[key][i])
            writer.writerow(row)

        content = output.getvalue()
        filename = f"tessera_export_{project_id}_{len(selected_indices)}.csv"

        return Response(
            content=content,
            media_type="text/csv",
            headers={
                "Content-Disposition": f"attachment; filename={filename}"
            }
        )


def generate_python_snippet(episode_ids: list[str]) -> str:
    """Generate a Python code snippet for using the selected episodes."""
    return f'''# Load selected episodes
selected_episode_ids = {json.dumps(episode_ids[:5])}{"  # ... and {} more".format(len(episode_ids) - 5) if len(episode_ids) > 5 else ""}

# Example: Filter your dataset
# selected_data = [ep for ep in dataset if ep["id"] in selected_episode_ids]

# Example: Create a subset dataloader
# from torch.utils.data import Subset
# indices = [i for i, ep in enumerate(dataset) if ep["id"] in selected_episode_ids]
# subset = Subset(dataset, indices)
'''


@router.get("/{project_id}/export/quick")
async def quick_export(
    project_id: str,
    selection_id: int,
    format: str = "json"
):
    """
    Quick export endpoint that returns episode IDs directly.
    """
    if format not in ["json", "csv"]:
        raise HTTPException(status_code=400, detail="Format must be 'json' or 'csv'")

    request = ExportRequest(
        format=format,
        selection_id=selection_id,
        include_metadata=False
    )

    return await export_selection(project_id, request)
