"""
Upload endpoint for embedding files.
"""
import os
import shutil
from datetime import datetime, timedelta
from pathlib import Path
from uuid import uuid4
import aiofiles

from fastapi import APIRouter, UploadFile, File, HTTPException, Request

from ..config import config
from ..database import db
from ..models import UploadResponse, ProjectCreate, ValidationResult
from ..utils.validators import validate_embeddings_file
from ..utils.limits import check_rate_limit_exceeded, record_upload, check_storage_available
from ..utils.id_generator import generate_project_id, generate_access_token
from ..services.storage import move_to_permanent_storage, cleanup_temp_file

router = APIRouter()


@router.post("/upload", response_model=UploadResponse)
async def upload_embeddings(
    file: UploadFile = File(...),
    request: Request = None
):
    """
    Upload an embeddings.h5 file.

    The file will be validated and stored, generating a unique project ID
    for access.
    """
    # Get client IP
    client_ip = "unknown"
    if request:
        client_ip = request.client.host if request.client else "unknown"
        # Check for forwarded IP (behind proxy)
        forwarded = request.headers.get("X-Forwarded-For")
        if forwarded:
            client_ip = forwarded.split(",")[0].strip()

    # 1. Check rate limit
    exceeded, message = check_rate_limit_exceeded(client_ip)
    if exceeded:
        raise HTTPException(status_code=429, detail=message)

    # 2. Check storage availability
    available, storage_msg = check_storage_available()
    if not available:
        raise HTTPException(status_code=507, detail=storage_msg)

    # 3. Validate file size BEFORE reading entire file
    # Read file into memory in chunks to check size
    file.file.seek(0, 2)  # Seek to end
    file_size = file.file.tell()
    file.file.seek(0)  # Reset to beginning

    max_size_bytes = config.MAX_FILE_SIZE_MB * 1024 * 1024
    if file_size > max_size_bytes:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Maximum size is {config.MAX_FILE_SIZE_MB}MB, got {file_size / (1024*1024):.1f}MB"
        )

    # 4. Check file extension
    filename = file.filename or "upload.h5"
    if not filename.lower().endswith(('.h5', '.hdf5')):
        raise HTTPException(
            status_code=400,
            detail="Invalid file type. Please upload an .h5 or .hdf5 file."
        )

    # 5. Stream to temp file
    temp_path = Path(f"/tmp/tessera_{uuid4()}.h5")
    try:
        async with aiofiles.open(temp_path, 'wb') as f:
            while chunk := await file.read(8192):
                await f.write(chunk)
    except Exception as e:
        cleanup_temp_file(temp_path)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to save uploaded file: {str(e)}"
        )

    # 6. Validate .h5 structure
    try:
        validation_result = validate_embeddings_file(temp_path)
    except Exception as e:
        cleanup_temp_file(temp_path)
        raise HTTPException(
            status_code=400,
            detail=f"Failed to validate file: {str(e)}"
        )

    if not validation_result.valid:
        cleanup_temp_file(temp_path)
        error_msg = "; ".join(validation_result.errors)
        raise HTTPException(
            status_code=400,
            detail=f"Invalid embeddings file: {error_msg}"
        )

    # 7. Generate project ID and access token
    project_id = generate_project_id()
    access_token = generate_access_token()

    # 8. Move to permanent storage
    try:
        permanent_path = move_to_permanent_storage(temp_path, project_id)
    except Exception as e:
        cleanup_temp_file(temp_path)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to store file: {str(e)}"
        )

    # 9. Save project to database
    expires_at = datetime.now() + timedelta(days=config.PROJECT_RETENTION_DAYS)

    project = ProjectCreate(
        id=project_id,
        embeddings_path=str(permanent_path),
        n_episodes=validation_result.n_episodes,
        embedding_dim=validation_result.embedding_dim,
        access_token=access_token,
        expires_at=expires_at,
        has_success_labels=validation_result.has_success,
        has_task_labels=validation_result.has_task,
        has_episode_length=validation_result.has_episode_length
    )

    try:
        db.create_project(project)
    except Exception as e:
        # Clean up files if database save fails
        from ..services.storage import delete_project_files
        delete_project_files(project_id)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to create project: {str(e)}"
        )

    # 10. Record upload for rate limiting
    record_upload(client_ip)

    # 11. Return response (no heavy processing yet - UMAP computed lazily)
    return UploadResponse(
        project_id=project_id,
        view_url=f"/project/{project_id}",
        edit_url=f"/project/{project_id}?token={access_token}",
        n_episodes=validation_result.n_episodes,
        embedding_dim=validation_result.embedding_dim,
        expires_at=expires_at.isoformat(),
        message="Upload successful! UMAP visualization will be computed on first view."
    )


@router.post("/validate")
async def validate_file(file: UploadFile = File(...)):
    """
    Validate an embeddings file without uploading.

    Useful for checking file format before actual upload.
    """
    # Check file extension
    filename = file.filename or "upload.h5"
    if not filename.lower().endswith(('.h5', '.hdf5')):
        return ValidationResult(
            valid=False,
            n_episodes=0,
            embedding_dim=0,
            errors=["Invalid file type. Please upload an .h5 or .hdf5 file."]
        )

    # Save to temp file
    temp_path = Path(f"/tmp/tessera_validate_{uuid4()}.h5")
    try:
        async with aiofiles.open(temp_path, 'wb') as f:
            while chunk := await file.read(8192):
                await f.write(chunk)

        result = validate_embeddings_file(temp_path)
        return result

    except Exception as e:
        return ValidationResult(
            valid=False,
            n_episodes=0,
            embedding_dim=0,
            errors=[f"Validation failed: {str(e)}"]
        )
    finally:
        cleanup_temp_file(temp_path)
