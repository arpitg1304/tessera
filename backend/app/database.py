"""
SQLite database connection and operations.
"""
import sqlite3
from datetime import datetime, timedelta
from typing import Optional
from contextlib import contextmanager
from pathlib import Path

from .config import config
from .models import ProjectCreate, ProjectResponse, SelectionInfo


def get_db_path() -> Path:
    """Get the database path, ensuring parent directory exists."""
    config.ensure_directories()
    return config.DATABASE_PATH


def init_db() -> None:
    """Initialize the database with required tables."""
    db_path = get_db_path()

    with sqlite3.connect(str(db_path)) as conn:
        cursor = conn.cursor()

        # Projects table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS projects (
                id TEXT PRIMARY KEY,
                created_at TIMESTAMP NOT NULL,
                expires_at TIMESTAMP NOT NULL,
                access_token TEXT NOT NULL,
                embeddings_path TEXT NOT NULL,
                n_episodes INTEGER NOT NULL,
                embedding_dim INTEGER NOT NULL,
                has_success_labels BOOLEAN DEFAULT FALSE,
                has_task_labels BOOLEAN DEFAULT FALSE,
                has_episode_length BOOLEAN DEFAULT FALSE,
                dataset_name TEXT,
                description TEXT
            )
        """)

        # Create index for cleanup queries
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_expires_at ON projects(expires_at)
        """)

        # Selections table (cached sampling results)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS selections (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id TEXT NOT NULL,
                selection_name TEXT NOT NULL,
                strategy TEXT NOT NULL,
                n_samples INTEGER NOT NULL,
                selected_indices TEXT NOT NULL,
                coverage_score REAL,
                created_at TIMESTAMP NOT NULL,
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
            )
        """)

        # Rate limits table (IP-based upload tracking)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS rate_limits (
                ip_address TEXT NOT NULL,
                upload_timestamp TIMESTAMP NOT NULL,
                PRIMARY KEY (ip_address, upload_timestamp)
            )
        """)

        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_rate_limits_ip ON rate_limits(ip_address)
        """)

        conn.commit()


@contextmanager
def get_connection():
    """Get a database connection with row factory."""
    conn = sqlite3.connect(str(get_db_path()))
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()


class Database:
    """Database operations for Tessera."""

    def __init__(self):
        init_db()

    def create_project(self, project: ProjectCreate) -> None:
        """Create a new project in the database."""
        with get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO projects (
                    id, created_at, expires_at, access_token, embeddings_path,
                    n_episodes, embedding_dim, has_success_labels, has_task_labels,
                    has_episode_length, dataset_name, description
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                project.id,
                datetime.now(),
                project.expires_at,
                project.access_token,
                project.embeddings_path,
                project.n_episodes,
                project.embedding_dim,
                project.has_success_labels,
                project.has_task_labels,
                project.has_episode_length,
                project.dataset_name,
                project.description
            ))
            conn.commit()

    def get_project(self, project_id: str) -> Optional[ProjectResponse]:
        """Get a project by ID."""
        with get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT id, n_episodes, embedding_dim, has_success_labels,
                       has_task_labels, has_episode_length, dataset_name,
                       description, created_at, expires_at
                FROM projects WHERE id = ?
            """, (project_id,))
            row = cursor.fetchone()

            if row is None:
                return None

            return ProjectResponse(
                id=row["id"],
                n_episodes=row["n_episodes"],
                embedding_dim=row["embedding_dim"],
                has_success_labels=bool(row["has_success_labels"]),
                has_task_labels=bool(row["has_task_labels"]),
                has_episode_length=bool(row["has_episode_length"]),
                dataset_name=row["dataset_name"],
                description=row["description"],
                created_at=datetime.fromisoformat(row["created_at"]),
                expires_at=datetime.fromisoformat(row["expires_at"])
            )

    def get_project_access_token(self, project_id: str) -> Optional[str]:
        """Get the access token for a project."""
        with get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT access_token FROM projects WHERE id = ?",
                (project_id,)
            )
            row = cursor.fetchone()
            return row["access_token"] if row else None

    def get_embeddings_path(self, project_id: str) -> Optional[str]:
        """Get the embeddings file path for a project."""
        with get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT embeddings_path FROM projects WHERE id = ?",
                (project_id,)
            )
            row = cursor.fetchone()
            return row["embeddings_path"] if row else None

    def delete_project(self, project_id: str) -> bool:
        """Delete a project from the database."""
        with get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM projects WHERE id = ?", (project_id,))
            conn.commit()
            return cursor.rowcount > 0

    def get_expired_projects(self) -> list[dict]:
        """Get all expired projects."""
        with get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT id, embeddings_path
                FROM projects
                WHERE expires_at < ?
            """, (datetime.now(),))
            return [dict(row) for row in cursor.fetchall()]

    def get_total_projects(self) -> int:
        """Get total number of projects."""
        with get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT COUNT(*) FROM projects")
            return cursor.fetchone()[0]

    def get_oldest_projects(self, n: int) -> list[dict]:
        """Get the oldest n projects."""
        with get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT id, embeddings_path
                FROM projects
                ORDER BY created_at ASC
                LIMIT ?
            """, (n,))
            return [dict(row) for row in cursor.fetchall()]

    # ============== Selection Operations ==============

    def save_selection(
        self,
        project_id: str,
        selection_name: str,
        strategy: str,
        n_samples: int,
        selected_indices: list[int],
        coverage_score: Optional[float] = None
    ) -> int:
        """Save a sampling selection."""
        import json
        with get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO selections (
                    project_id, selection_name, strategy, n_samples,
                    selected_indices, coverage_score, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (
                project_id,
                selection_name,
                strategy,
                n_samples,
                json.dumps(selected_indices),
                coverage_score,
                datetime.now()
            ))
            conn.commit()
            return cursor.lastrowid

    def get_selection(self, selection_id: int) -> Optional[dict]:
        """Get a selection by ID."""
        import json
        with get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT * FROM selections WHERE id = ?
            """, (selection_id,))
            row = cursor.fetchone()

            if row is None:
                return None

            result = dict(row)
            result["selected_indices"] = json.loads(result["selected_indices"])
            return result

    def get_project_selections(self, project_id: str) -> list[SelectionInfo]:
        """Get all selections for a project."""
        with get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT id, selection_name, strategy, n_samples, coverage_score, created_at
                FROM selections
                WHERE project_id = ?
                ORDER BY created_at DESC
            """, (project_id,))

            return [
                SelectionInfo(
                    id=row["id"],
                    selection_name=row["selection_name"],
                    strategy=row["strategy"],
                    n_samples=row["n_samples"],
                    coverage_score=row["coverage_score"],
                    created_at=datetime.fromisoformat(row["created_at"])
                )
                for row in cursor.fetchall()
            ]

    # ============== Rate Limiting Operations ==============

    def record_upload(self, ip_address: str) -> None:
        """Record an upload for rate limiting."""
        with get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO rate_limits (ip_address, upload_timestamp)
                VALUES (?, ?)
            """, (ip_address, datetime.now()))
            conn.commit()

    def get_upload_count(self, ip_address: str, hours: int = 24) -> int:
        """Get upload count for an IP in the last n hours."""
        cutoff = datetime.now() - timedelta(hours=hours)
        with get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT COUNT(*) FROM rate_limits
                WHERE ip_address = ? AND upload_timestamp > ?
            """, (ip_address, cutoff))
            return cursor.fetchone()[0]

    def cleanup_old_rate_limits(self, hours: int = 24) -> int:
        """Clean up rate limit entries older than n hours."""
        cutoff = datetime.now() - timedelta(hours=hours)
        with get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                DELETE FROM rate_limits WHERE upload_timestamp < ?
            """, (cutoff,))
            conn.commit()
            return cursor.rowcount


# Global database instance
db = Database()
