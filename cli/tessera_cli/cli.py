"""
Tessera CLI - Main entry point
"""
import click
from pathlib import Path

from .validate import validate_file
from .upload import upload_file, get_project_info
from . import __version__


@click.group()
@click.version_option(version=__version__)
def cli():
    """Tessera CLI - Dataset diversity visualization tool"""
    pass


@cli.command()
@click.argument('filepath', type=click.Path(exists=True))
def validate(filepath: str):
    """Validate an embeddings.h5 file format."""
    click.echo(f"Validating {filepath}...")

    try:
        result = validate_file(filepath)

        click.echo()
        click.secho("✓ Valid format", fg='green', bold=True)
        click.echo(f"✓ {result['n_episodes']:,} episodes")
        click.echo(f"✓ Embedding dimension: {result['embedding_dim']}")

        if result['metadata_fields']:
            click.echo(f"✓ Metadata: {', '.join(result['metadata_fields'])}")

            if result['has_success']:
                click.echo("  • success (boolean)")
            if result['has_task']:
                click.echo("  • task (categorical)")
            if result['has_episode_length']:
                click.echo("  • episode_length (integer)")

        if result['warnings']:
            click.echo()
            for warning in result['warnings']:
                click.secho(f"⚠ Warning: {warning}", fg='yellow')

        click.echo()
        click.echo("File is ready for upload!")
        click.echo(f"  tessera upload {filepath}")

    except ValueError as e:
        click.echo()
        click.secho(f"✗ Validation failed: {str(e)}", fg='red', bold=True)
        raise click.Abort()


@cli.command()
@click.argument('filepath', type=click.Path(exists=True))
@click.option(
    '--host',
    default='http://localhost:8000',
    help='Tessera backend API URL',
    envvar='TESSERA_HOST'
)
@click.option(
    '--frontend',
    default=None,
    help='Tessera frontend URL (default: derived from host or http://localhost:3000)',
    envvar='TESSERA_FRONTEND'
)
@click.option(
    '--no-validate',
    is_flag=True,
    help='Skip validation before upload'
)
def upload(filepath: str, host: str, frontend: str, no_validate: bool):
    """Upload embeddings.h5 to Tessera."""
    filepath = Path(filepath)

    # Validate first (unless skipped)
    if not no_validate:
        click.echo("Validating file...")
        try:
            validate_file(str(filepath))
            click.secho("✓ Validation passed", fg='green')
        except ValueError as e:
            click.secho(f"✗ Validation failed: {str(e)}", fg='red')
            raise click.Abort()

    # Check file size
    file_size_mb = filepath.stat().st_size / (1024 * 1024)
    if file_size_mb > 100:
        click.secho(f"⚠ Warning: File is {file_size_mb:.1f}MB (max 100MB)", fg='yellow')
        if not click.confirm("Continue anyway?"):
            raise click.Abort()

    click.echo()
    click.echo(f"Uploading to {host}...")

    try:
        result = upload_file(str(filepath), host)

        # Determine frontend URL
        if frontend is None:
            # Try to derive frontend from host
            # Common pattern: backend on 8001 -> nginx on 8080
            # Or backend on 8000 -> nginx on 8080
            from urllib.parse import urlparse
            parsed = urlparse(host)
            if parsed.port in (8000, 8001):
                frontend = f"{parsed.scheme}://{parsed.hostname}:8080"
            else:
                # Default to same host without port (assumes nginx/proxy)
                frontend = f"{parsed.scheme}://{parsed.hostname}"

        click.echo()
        click.secho("✓ Upload successful!", fg='green', bold=True)
        click.echo()
        click.echo("View your project:")
        click.secho(f"  {frontend}{result['view_url']}", fg='blue')
        click.echo()
        click.echo("Edit link (keep private):")
        click.secho(f"  {frontend}{result['edit_url']}", fg='cyan')
        click.echo()
        click.secho(f"⚠ Expires: {result['expires_at']}", fg='yellow')

    except Exception as e:
        click.echo()
        click.secho(f"✗ Upload failed: {str(e)}", fg='red')
        raise click.Abort()


@cli.command()
@click.argument('project_id')
@click.option(
    '--host',
    default='http://localhost:8000',
    help='Tessera server URL',
    envvar='TESSERA_HOST'
)
def info(project_id: str, host: str):
    """Get information about a project."""
    try:
        project = get_project_info(project_id, host)

        click.echo()
        click.echo(f"Project: {project['id']}")
        click.echo(f"Episodes: {project['n_episodes']:,}")
        click.echo(f"Embedding dimension: {project['embedding_dim']}")
        click.echo(f"Created: {project['created_at']}")
        click.echo(f"Expires: {project['expires_at']}")

        if project.get('dataset_name'):
            click.echo(f"Dataset: {project['dataset_name']}")

        # Metadata info
        metadata = []
        if project.get('has_success_labels'):
            metadata.append('success')
        if project.get('has_task_labels'):
            metadata.append('task')
        if project.get('has_episode_length'):
            metadata.append('episode_length')

        if metadata:
            click.echo(f"Metadata: {', '.join(metadata)}")

    except Exception as e:
        click.secho(f"Error: {str(e)}", fg='red')
        raise click.Abort()


@cli.command()
@click.option(
    '--host',
    default='http://localhost:8000',
    help='Tessera server URL',
    envvar='TESSERA_HOST'
)
def health(host: str):
    """Check Tessera server health."""
    import httpx

    try:
        with httpx.Client(timeout=5.0) as client:
            response = client.get(f"{host}/health")

        if response.status_code == 200:
            data = response.json()
            click.secho("✓ Server is healthy", fg='green')
            click.echo(f"  Version: {data.get('version', 'unknown')}")
            click.echo(f"  Active projects: {data.get('active_projects', 'unknown')}")
            if data.get('storage_usage_percent'):
                click.echo(f"  Storage usage: {data['storage_usage_percent']:.1f}%")
        else:
            click.secho(f"✗ Server returned status {response.status_code}", fg='red')

    except httpx.RequestError as e:
        click.secho(f"✗ Cannot connect to {host}: {str(e)}", fg='red')
        raise click.Abort()


def main():
    """Main entry point."""
    cli()


if __name__ == '__main__':
    main()
