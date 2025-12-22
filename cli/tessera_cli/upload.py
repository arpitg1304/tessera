"""
Upload functionality for CLI.
"""
import httpx
from pathlib import Path
from typing import TypedDict, Optional
import sys


class UploadResult(TypedDict):
    project_id: str
    view_url: str
    edit_url: str
    n_episodes: int
    embedding_dim: int
    expires_at: str


def upload_file(
    file_path: str,
    host: str = "http://localhost:8000",
    show_progress: bool = True
) -> UploadResult:
    """
    Upload an embeddings file to Tessera.

    Args:
        file_path: Path to the .h5 file
        host: Tessera server URL
        show_progress: Whether to show upload progress

    Returns:
        UploadResult with project info

    Raises:
        Exception: If upload fails
    """
    path = Path(file_path)

    if not path.exists():
        raise FileNotFoundError(f"File not found: {file_path}")

    file_size = path.stat().st_size
    uploaded = 0

    def progress_callback(chunk_size: int):
        nonlocal uploaded
        uploaded += chunk_size
        if show_progress and sys.stdout.isatty():
            percent = (uploaded / file_size) * 100
            bar_width = 40
            filled = int(bar_width * uploaded / file_size)
            bar = "=" * filled + "-" * (bar_width - filled)
            sys.stdout.write(f"\rUploading: [{bar}] {percent:.1f}%")
            sys.stdout.flush()

    # Create a custom file wrapper that reports progress
    class ProgressFile:
        def __init__(self, file_obj, callback):
            self._file = file_obj
            self._callback = callback

        def read(self, size=-1):
            data = self._file.read(size)
            if data:
                self._callback(len(data))
            return data

        def seek(self, *args):
            return self._file.seek(*args)

        def tell(self):
            return self._file.tell()

    with open(path, 'rb') as f:
        progress_file = ProgressFile(f, progress_callback)

        # Prepare multipart upload
        files = {'file': (path.name, progress_file, 'application/x-hdf5')}

        try:
            with httpx.Client(timeout=300.0) as client:
                response = client.post(
                    f"{host}/api/upload",
                    files=files
                )

            if show_progress:
                sys.stdout.write("\n")

            if response.status_code == 200:
                return response.json()
            else:
                error_detail = response.json().get('detail', response.text)
                raise Exception(f"Upload failed: {error_detail}")

        except httpx.RequestError as e:
            raise Exception(f"Connection error: {str(e)}")


def get_project_info(project_id: str, host: str = "http://localhost:8000") -> dict:
    """
    Get project information from Tessera.

    Args:
        project_id: The project ID
        host: Tessera server URL

    Returns:
        Project info dictionary
    """
    with httpx.Client(timeout=30.0) as client:
        response = client.get(f"{host}/api/project/{project_id}")

    if response.status_code == 200:
        return response.json()
    elif response.status_code == 404:
        raise Exception(f"Project not found: {project_id}")
    else:
        raise Exception(f"Failed to get project: {response.text}")
