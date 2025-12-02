# Docker Deployment Guide

This guide covers deploying ChessBeast services using Docker.

## Architecture Overview

ChessBeast uses a builder pattern for Stockfish binaries:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Docker Compose                                   │
├─────────────────────────────────────────────────────────────────────────┤
│  BUILDERS (run once, exit)              SERVICES (long-running)          │
│  ┌─────────────────────┐               ┌─────────────────────┐          │
│  │ stockfish-builder   │──builds──────▶│ stockfish (50051)   │          │
│  │ (git clone master)  │               │ NNUE analysis       │          │
│  └─────────────────────┘               └─────────────────────┘          │
│           │                                     │                        │
│           ▼                                     ▼                        │
│  ┌─────────────────────┐               ┌─────────────────────┐          │
│  │ stockfish-bin       │◀──mounts ro───│                     │          │
│  │ (volume)            │               │                     │          │
│  └─────────────────────┘               └─────────────────────┘          │
│                                                                          │
│  ┌─────────────────────┐               ┌─────────────────────┐          │
│  │ stockfish16-builder │──builds──────▶│ stockfish16 (50053) │          │
│  │ (git clone sf_16)   │               │ Classical eval      │          │
│  └─────────────────────┘               └─────────────────────┘          │
│           │                                     │                        │
│           ▼                                     ▼                        │
│  ┌─────────────────────┐               ┌─────────────────────┐          │
│  │ stockfish16-bin     │◀──mounts ro───│                     │          │
│  │ (volume)            │               │                     │          │
│  └─────────────────────┘               └─────────────────────┘          │
│                                                                          │
│                                        ┌─────────────────────┐          │
│                                        │ maia (50052)        │          │
│                                        │ Human prediction    │          │
│                                        └─────────────────────┘          │
│                                                 │                        │
│                                                 ▼                        │
│                                        ┌─────────────────────┐          │
│                                        │ maia-models         │          │
│                                        │ (volume)            │          │
│                                        └─────────────────────┘          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Key Features

- **Build from source**: Stockfish binaries are compiled from the official repository
- **SHA-based caching**: Binaries include the git commit SHA to avoid unnecessary rebuilds
- **Multi-architecture**: Automatically detects CPU architecture (x86-64-bmi2, x86-64-modern, armv8)
- **Volume persistence**: Built binaries and models persist across container restarts

## Quick Start

```bash
# Start all services (first run will build binaries)
make docker-up

# Check service status
make docker-ps

# View logs
make docker-logs

# Stop services
make docker-down
```

## Services

### Stockfish (Port 50051)

High-performance chess engine analysis using the latest Stockfish from master.

| Variable | Default | Description |
|----------|---------|-------------|
| `STOCKFISH_THREADS` | 8 | CPU threads per engine instance |
| `STOCKFISH_HASH` | 2048 | Hash table size in MB |
| `STOCKFISH_POOL_SIZE` | 2 | Number of engine instances |
| `STOCKFISH_PORT` | 50051 | gRPC port |

Resource defaults: 8 CPUs, 4GB RAM

### Stockfish 16 (Port 50053)

Stockfish 16 for classical evaluation (the `eval` command was removed in later versions).

| Variable | Default | Description |
|----------|---------|-------------|
| `STOCKFISH16_THREADS` | 1 | CPU threads (eval doesn't need more) |
| `STOCKFISH16_HASH` | 128 | Hash table size in MB |
| `STOCKFISH16_POOL_SIZE` | 1 | Number of engine instances |
| `STOCKFISH16_PORT` | 50053 | gRPC port |

Resource defaults: 2 CPUs, 512MB RAM

### Maia (Port 50052)

Human-likeness prediction using the Maia2 neural network.

| Variable | Default | Description |
|----------|---------|-------------|
| `MAIA_MODEL_TYPE` | rapid | Model type (rapid, blitz, bullet) |
| `MAIA_DEVICE` | cpu | PyTorch device (cpu only in Docker) |
| `MAIA_OMP_THREADS` | 2 | OpenMP threads |
| `MAIA_MKL_THREADS` | 2 | MKL threads |
| `MAIA_TORCH_THREADS` | 2 | PyTorch threads |
| `MAIA_PORT` | 50052 | gRPC port |

Resource defaults: 4 CPUs, 6GB RAM

## Makefile Commands

### Build Commands

```bash
make docker-build              # Build all images
make docker-build-stockfish    # Build Stockfish only
make docker-build-stockfish16  # Build Stockfish16 only
make docker-build-maia         # Build Maia only
```

### Service Management

```bash
make docker-up       # Start all services
make docker-down     # Stop all services
make docker-restart  # Restart all services
make docker-ps       # Show service status
make docker-health   # Check service health
```

### Logs

```bash
make docker-logs             # All service logs
make docker-logs-stockfish   # Stockfish logs only
make docker-logs-stockfish16 # Stockfish16 logs only
make docker-logs-maia        # Maia logs only
```

### Debugging

```bash
make docker-shell-stockfish   # Shell into Stockfish container
make docker-shell-stockfish16 # Shell into Stockfish16 container
make docker-shell-maia        # Shell into Maia container
```

### Cleanup

```bash
make docker-clean  # Remove containers, images, and volumes
make docker-prune  # Remove ALL unused Docker resources (use with caution)
```

## Updating Stockfish

### Update to Latest Master

The Stockfish builder automatically checks if the current binary matches the latest master commit. To force an update:

```bash
# Force rebuild from latest master
make docker-rebuild-stockfish
```

This will:
1. Pull the latest master branch
2. Rebuild the binary (even if SHA matches)
3. Restart the Stockfish service

### How SHA Caching Works

Binaries are named `stockfish-{SHORT_SHA}-{ARCH}`, for example:
- `stockfish-a1b2c3d-x86-64-bmi2`
- `stockfish-a1b2c3d-armv8`

When the builder runs:
1. Fetches latest master
2. Gets current commit SHA
3. Checks if binary with that SHA exists in volume
4. If exists → skips build, updates symlink
5. If not → builds new binary, removes old ones

## Environment Configuration

Copy the example environment file:

```bash
cp docker/.env.example docker/.env
```

Edit `docker/.env` to customize settings. Key variables:

```bash
# Stockfish performance tuning
STOCKFISH_THREADS=8
STOCKFISH_HASH=2048
STOCKFISH_POOL_SIZE=2

# Resource limits
STOCKFISH_CPU_LIMIT=8
STOCKFISH_MEMORY_LIMIT=4G

# Force rebuild
FORCE_REBUILD=0  # Set to 1 to bypass SHA cache
```

## Resource Requirements

### Minimum Requirements

| Service | CPU | Memory | Storage |
|---------|-----|--------|---------|
| Stockfish | 4 cores | 2GB | 100MB (binary) |
| Stockfish16 | 1 core | 256MB | 100MB (binary) |
| Maia | 2 cores | 4GB | 500MB (models) |
| **Total** | **7 cores** | **6.25GB** | **700MB** |

### Recommended Production

| Service | CPU | Memory | Storage |
|---------|-----|--------|---------|
| Stockfish | 8 cores | 4GB | 100MB |
| Stockfish16 | 2 cores | 512MB | 100MB |
| Maia | 4 cores | 6GB | 500MB |
| **Total** | **14 cores** | **10.5GB** | **700MB** |

## Troubleshooting

### Service Won't Start

Check builder completed successfully:
```bash
docker logs chessbeast-stockfish-builder
docker logs chessbeast-stockfish16-builder
```

### Binary Not Found

Verify volume has the binary:
```bash
docker run --rm -v chessbeast-stockfish-bin:/data alpine ls -la /data
```

### Health Check Failing

Check service logs:
```bash
make docker-logs-stockfish
```

Test gRPC manually:
```bash
docker exec chessbeast-stockfish python -c \
  "import grpc; ch = grpc.insecure_channel('localhost:50051'); print(grpc.channel_ready_future(ch).result(timeout=5))"
```

### Build Fails

Common causes:
- Network issues (can't clone GitHub)
- Insufficient memory for compilation
- Disk space issues

Check builder output:
```bash
docker compose -f docker/docker-compose.yml logs stockfish-builder
```

### Force Complete Rebuild

Remove volumes and rebuild:
```bash
make docker-clean
make docker-up
```

## Network Configuration

Services communicate via the `chessbeast-network` bridge network.

Internal hostnames:
- `stockfish:50051`
- `stockfish16:50053`
- `maia:50052`

From host machine:
- `localhost:50051`
- `localhost:50053`
- `localhost:50052`

## Volume Management

### List Volumes

```bash
docker volume ls | grep chessbeast
```

### Inspect Volume

```bash
docker volume inspect chessbeast-stockfish-bin
```

### Backup Volumes

```bash
# Backup Stockfish binary
docker run --rm -v chessbeast-stockfish-bin:/data -v $(pwd):/backup alpine \
  tar czf /backup/stockfish-bin-backup.tar.gz /data

# Backup Maia models
docker run --rm -v chessbeast-maia-models:/data -v $(pwd):/backup alpine \
  tar czf /backup/maia-models-backup.tar.gz /data
```

### Restore Volumes

```bash
docker run --rm -v chessbeast-stockfish-bin:/data -v $(pwd):/backup alpine \
  tar xzf /backup/stockfish-bin-backup.tar.gz -C /
```
