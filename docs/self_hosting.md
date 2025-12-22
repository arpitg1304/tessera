# Self-Hosting Guide

This guide explains how to deploy Tessera on your own infrastructure.

## Prerequisites

- Docker and Docker Compose
- A server with at least 4GB RAM
- 50GB+ storage space
- A domain name (optional, for HTTPS)

## Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/yourusername/tessera.git
cd tessera
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env if needed
```

### 3. Start Services

```bash
docker-compose up -d
```

### 4. Access Tessera

Open `http://localhost` in your browser.

## Production Deployment

### Using Docker Compose

For production, you'll want to:

1. **Set up a domain** and update nginx.conf
2. **Add SSL certificates** (see below)
3. **Configure persistent storage**

```yaml
# docker-compose.prod.yml
version: '3.8'

services:
  backend:
    build: ./backend
    volumes:
      - /var/tessera:/var/tessera
    environment:
      - DATABASE_PATH=/var/tessera/tessera.db
      - STORAGE_PATH=/var/tessera/storage
    restart: always

  frontend:
    build: ./frontend
    restart: always

  nginx:
    image: nginx:alpine
    volumes:
      - ./nginx.prod.conf:/etc/nginx/nginx.conf:ro
      - /etc/letsencrypt:/etc/letsencrypt:ro
    ports:
      - "80:80"
      - "443:443"
    depends_on:
      - backend
      - frontend
    restart: always

volumes:
  tessera_data:
```

### SSL with Let's Encrypt

1. Install Certbot:
```bash
apt-get update
apt-get install certbot
```

2. Get certificate:
```bash
certbot certonly --standalone -d tessera.yourdomain.com
```

3. Update nginx.conf:
```nginx
server {
    listen 443 ssl http2;
    server_name tessera.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/tessera.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/tessera.yourdomain.com/privkey.pem;

    # ... rest of config
}

server {
    listen 80;
    server_name tessera.yourdomain.com;
    return 301 https://$server_name$request_uri;
}
```

4. Auto-renewal:
```bash
crontab -e
# Add: 0 12 * * * /usr/bin/certbot renew --quiet
```

## Cleanup Cron Job

Set up automatic cleanup of expired projects:

```bash
# Add to crontab
crontab -e
```

```cron
# Run cleanup daily at 3 AM
0 3 * * * docker exec tessera_backend_1 python -m app.tasks.cleanup
```

## Monitoring

### Health Check

Tessera exposes a health endpoint:

```bash
curl http://localhost/health
```

Response:
```json
{
  "status": "healthy",
  "version": "1.0.0",
  "storage_usage_percent": 23.5,
  "active_projects": 42
}
```

### Logs

View logs:
```bash
docker-compose logs -f backend
docker-compose logs -f nginx
```

### Storage Monitoring

Monitor disk usage:
```bash
df -h /var/tessera
du -sh /var/tessera/storage/*
```

## Configuration Options

### Backend Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `STORAGE_PATH` | `/var/tessera/storage` | Where uploaded files are stored |
| `DATABASE_PATH` | `/var/tessera/tessera.db` | SQLite database location |
| `MAX_FILE_SIZE_MB` | `100` | Maximum upload size |
| `PROJECT_RETENTION_DAYS` | `7` | Days before project deletion |

### Resource Limits

Default limits (configurable in `app/config.py`):

- Max file size: 100MB
- Max episodes: 200,000
- Max embedding dimension: 2,048
- Daily uploads per IP: 5
- Hourly uploads per IP: 2

## Scaling Considerations

### Storage

For high-volume deployments:

1. Use SSD storage for better UMAP performance
2. Consider external block storage (AWS EBS, GCP Persistent Disk)
3. Monitor `/var/tessera/storage` usage

### Memory

UMAP computation is memory-intensive:

- 10K episodes: ~500MB RAM
- 50K episodes: ~2GB RAM
- 100K episodes: ~4GB RAM

Consider limiting concurrent UMAP computations.

### CPU

UMAP is CPU-intensive. For faster computation:

- Use a CPU with good single-thread performance
- Consider running on a dedicated compute instance

## Backup

### Database

```bash
# Backup
cp /var/tessera/tessera.db /backup/tessera-$(date +%Y%m%d).db

# Or with SQLite's backup command
sqlite3 /var/tessera/tessera.db ".backup /backup/tessera.db"
```

### Uploaded Files

```bash
# Backup storage
tar -czf /backup/tessera-storage-$(date +%Y%m%d).tar.gz /var/tessera/storage/
```

## Troubleshooting

### UMAP Computation Slow

- Check available memory
- Reduce `MAX_CONCURRENT_UMAP` in config
- Consider pre-computing UMAP for large datasets

### Upload Failures

- Check nginx `client_max_body_size`
- Verify storage has sufficient space
- Check rate limits

### Container Not Starting

```bash
# Check logs
docker-compose logs backend

# Verify permissions
ls -la /var/tessera/
```

### Database Locked

SQLite can lock during heavy writes:

```bash
# Restart backend
docker-compose restart backend
```

## Security Considerations

1. **Keep containers updated**
2. **Use HTTPS in production**
3. **Limit upload size** to prevent abuse
4. **Monitor rate limits** in access logs
5. **Regular backups** of database and storage
