"""
Random project ID generation utilities.
"""
import secrets
import string

from ..config import config


def generate_project_id(length: int = None) -> str:
    """
    Generate a random project ID.

    Args:
        length: Length of the ID (default from config)

    Returns:
        A random alphanumeric string (lowercase letters and digits)
    """
    if length is None:
        length = config.PROJECT_ID_LENGTH

    # Use lowercase letters and digits for URL-friendly IDs
    alphabet = string.ascii_lowercase + string.digits
    return ''.join(secrets.choice(alphabet) for _ in range(length))


def generate_access_token() -> str:
    """
    Generate a secure access token for project editing.

    Returns:
        A URL-safe random token (32 bytes)
    """
    return secrets.token_urlsafe(32)
