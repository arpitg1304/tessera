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
                has_embeddings BOOLEAN DEFAULT TRUE,
                has_thumbnails BOOLEAN DEFAULT FALSE,
                dataset_name TEXT,
                description TEXT,
                is_example BOOLEAN DEFAULT FALSE,
                example_order INTEGER DEFAULT 0
            )
        """)

        # Add columns if they don't exist (migration for existing DBs)
        cursor.execute("PRAGMA table_info(projects)")
        columns = [col[1] for col in cursor.fetchall()]
        if 'is_example' not in columns:
            cursor.execute("ALTER TABLE projects ADD COLUMN is_example BOOLEAN DEFAULT FALSE")
        if 'example_order' not in columns:
            cursor.execute("ALTER TABLE projects ADD COLUMN example_order INTEGER DEFAULT 0")
        if 'has_embeddings' not in columns:
            cursor.execute("ALTER TABLE projects ADD COLUMN has_embeddings BOOLEAN DEFAULT TRUE")
        if 'has_thumbnails' not in columns:
            cursor.execute("ALTER TABLE projects ADD COLUMN has_thumbnails BOOLEAN DEFAULT FALSE")
        if 'has_gifs' not in columns:
            cursor.execute("ALTER TABLE projects ADD COLUMN has_gifs BOOLEAN DEFAULT FALSE")

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

        # Visitors table (unique visitor tracking)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS visitors (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ip_hash TEXT NOT NULL,
                first_visit TIMESTAMP NOT NULL,
                last_visit TIMESTAMP NOT NULL,
                visit_count INTEGER DEFAULT 1,
                user_agent TEXT,
                UNIQUE(ip_hash)
            )
        """)

        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_visitors_last_visit ON visitors(last_visit)
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
                    has_episode_length, has_embeddings, has_thumbnails, has_gifs, dataset_name, description
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                project.has_embeddings,
                project.has_thumbnails,
                project.has_gifs,
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
                       has_task_labels, has_episode_length, has_embeddings, has_thumbnails, has_gifs,
                       dataset_name, description, created_at, expires_at, is_example
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
                has_embeddings=bool(row["has_embeddings"]) if row["has_embeddings"] is not None else True,
                has_thumbnails=bool(row["has_thumbnails"]) if row["has_thumbnails"] is not None else False,
                has_gifs=bool(row["has_gifs"]) if row["has_gifs"] is not None else False,
                dataset_name=row["dataset_name"],
                description=row["description"],
                created_at=datetime.fromisoformat(row["created_at"]),
                expires_at=datetime.fromisoformat(row["expires_at"]),
                is_example=bool(row["is_example"]) if row["is_example"] is not None else False
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
        """Get all expired projects (excluding examples)."""
        with get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT id, embeddings_path
                FROM projects
                WHERE expires_at < ? AND (is_example = FALSE OR is_example IS NULL)
            """, (datetime.now(),))
            return [dict(row) for row in cursor.fetchall()]

    def get_example_projects(self) -> list[ProjectResponse]:
        """Get all example projects ordered by example_order."""
        with get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT id, n_episodes, embedding_dim, has_success_labels,
                       has_task_labels, has_episode_length, has_embeddings, has_thumbnails, has_gifs,
                       dataset_name, description, created_at, expires_at, is_example
                FROM projects
                WHERE is_example = TRUE
                ORDER BY example_order ASC
            """)
            return [
                ProjectResponse(
                    id=row["id"],
                    n_episodes=row["n_episodes"],
                    embedding_dim=row["embedding_dim"],
                    has_success_labels=bool(row["has_success_labels"]),
                    has_task_labels=bool(row["has_task_labels"]),
                    has_episode_length=bool(row["has_episode_length"]),
                    has_embeddings=bool(row["has_embeddings"]) if row["has_embeddings"] is not None else True,
                    has_thumbnails=bool(row["has_thumbnails"]) if row["has_thumbnails"] is not None else False,
                    has_gifs=bool(row["has_gifs"]) if row["has_gifs"] is not None else False,
                    dataset_name=row["dataset_name"],
                    description=row["description"],
                    created_at=datetime.fromisoformat(row["created_at"]),
                    expires_at=datetime.fromisoformat(row["expires_at"]),
                    is_example=True
                )
                for row in cursor.fetchall()
            ]

    def set_project_as_example(self, project_id: str, order: int = 0) -> bool:
        """Mark a project as an example."""
        with get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                UPDATE projects
                SET is_example = TRUE, example_order = ?,
                    expires_at = datetime('9999-12-31')
                WHERE id = ?
            """, (order, project_id))
            conn.commit()
            return cursor.rowcount > 0

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

    # ============== Visitor Tracking Operations ==============

    def record_visitor(self, ip_address: str, user_agent: str = None) -> None:
        """Record a visitor (tracks unique visitors by hashed IP)."""
        import hashlib
        # Hash IP for privacy
        ip_hash = hashlib.sha256(ip_address.encode()).hexdigest()[:16]

        with get_connection() as conn:
            cursor = conn.cursor()
            now = datetime.now()

            # Try to update existing visitor
            cursor.execute("""
                UPDATE visitors
                SET last_visit = ?, visit_count = visit_count + 1
                WHERE ip_hash = ?
            """, (now, ip_hash))

            # If no existing visitor, insert new one
            if cursor.rowcount == 0:
                cursor.execute("""
                    INSERT INTO visitors (ip_hash, first_visit, last_visit, visit_count, user_agent)
                    VALUES (?, ?, ?, 1, ?)
                """, (ip_hash, now, now, user_agent))

            conn.commit()

    def get_visitor_stats(self) -> dict:
        """Get visitor statistics."""
        with get_connection() as conn:
            cursor = conn.cursor()

            # Total unique visitors
            cursor.execute("SELECT COUNT(*) FROM visitors")
            total_unique = cursor.fetchone()[0]

            # Total page views
            cursor.execute("SELECT SUM(visit_count) FROM visitors")
            total_views = cursor.fetchone()[0] or 0

            # Visitors in last 24 hours
            cursor.execute("""
                SELECT COUNT(*) FROM visitors
                WHERE last_visit > datetime('now', '-24 hours')
            """)
            visitors_24h = cursor.fetchone()[0]

            # Visitors in last 7 days
            cursor.execute("""
                SELECT COUNT(*) FROM visitors
                WHERE last_visit > datetime('now', '-7 days')
            """)
            visitors_7d = cursor.fetchone()[0]

            # Visitors in last 30 days
            cursor.execute("""
                SELECT COUNT(*) FROM visitors
                WHERE last_visit > datetime('now', '-30 days')
            """)
            visitors_30d = cursor.fetchone()[0]

            # New visitors today
            cursor.execute("""
                SELECT COUNT(*) FROM visitors
                WHERE first_visit > datetime('now', '-24 hours')
            """)
            new_today = cursor.fetchone()[0]

            return {
                "total_unique_visitors": total_unique,
                "total_page_views": total_views,
                "visitors_24h": visitors_24h,
                "visitors_7d": visitors_7d,
                "visitors_30d": visitors_30d,
                "new_visitors_today": new_today
            }


# Global database instance
db = Database()
