# Candidate Sandbox Environment

Isolated Docker environment for HR Candidate Screening Platform technical assessments.

## Overview

This Docker image provides a secure, ephemeral development environment for candidates to complete technical assessments. It includes:

- **VS Code Server** (code-server) - Browser-based IDE on port 8080
- **noVNC** - Browser-based VNC client on port 6080
- **X11vnc** - VNC server on port 5901
- **Claude Code CLI** - AI coding assistant (requires API key)
- **Development tools** - Node.js 20, Python 3.12, Git, and common utilities

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Candidate Container                       │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │   Xvfb      │  │  X11vnc     │  │   noVNC Server      │  │
│  │  (Display)  │──│  (VNC srv)  │──│  (WebSocket :6080)  │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ code-server │  │   Terminal  │  │   Claude Code CLI   │  │
│  │  (:8080)    │  │  (xterm)    │  │   (pre-configured)  │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Quick Start

### Build the Image

```bash
cd infrastructure/docker/candidate-sandbox
docker build -t candidate-sandbox:latest .
```

### Run Locally

```bash
docker-compose -f infrastructure/docker-compose.sandbox.yml up
```

Access the services:
- VS Code Server: http://localhost:8080
- noVNC: http://localhost:6080/vnc.html
- VNC client: localhost:5901

### Run with Security Profiles

```bash
docker run -d \
  --name candidate-sandbox \
  --security-opt no-new-privileges:true \
  --security-opt seccomp=seccomp-profile.json \
  --security-opt apparmor=candidate-sandbox \
  --cap-drop ALL \
  --cap-add CHOWN,SETGID,SETUID,DAC_OVERRIDE \
  --cpus="2.0" \
  --memory="4g" \
  --pids-limit=100 \
  --read-only \
  --tmpfs /tmp:rw,noexec,nosuid,size=100m \
  -p 8080:8080 \
  -p 5901:5901 \
  -p 6080:6080 \
  candidate-sandbox:latest
```

## Security Features

### 1. Seccomp Profile
Blocks dangerous syscalls:
- `mount`, `umount2`, `pivot_root` - Filesystem isolation
- `ptrace` - Process tracing
- `bpf`, `perf_event_open` - Kernel attack surface
- `open_by_handle_at` - Container escape (CVE-2014-9356)

### 2. AppArmor Profile
Mandatory Access Control:
- Denies write to system directories
- Restricts kernel interface access
- Limits network capabilities
- Prevents execution from writable directories

### 3. Linux Capabilities
Minimal privileges:
- Drop ALL capabilities
- Add only: CHOWN, SETGID, SETUID, DAC_OVERRIDE

### 4. Resource Limits
Prevents resource exhaustion:
- CPU: 2 cores
- Memory: 4GB
- PIDs: 100
- Disk: 5GB (via volume)

### 5. Read-Only Root Filesystem
- Root filesystem is read-only
- Writable tmpfs mounts for /tmp, /var/tmp
- Writable volume for /workspace and /home/candidate

## File Structure

```
candidate-sandbox/
├── Dockerfile                 # Multi-stage container definition
├── seccomp-profile.json       # Syscall restrictions
├── apparmor-profile           # MAC restrictions
├── config/
│   ├── supervisord.conf       # Process management
│   └── code-server-config.yaml # VS Code Server config
└── scripts/
    ├── start-vnc.sh           # VNC startup script
    └── start-code-server.sh   # Code-server startup script
```

## Multi-Stage Build

The Dockerfile uses multi-stage builds for optimization:

1. **base** - Ubuntu 24.04 with essential packages and non-root user
2. **dev-tools** - Node.js 20, Python 3.12, build tools
3. **ide-desktop** - Xvfb, noVNC, code-server, fluxbox
4. **final** - Claude Code CLI, workspace setup
5. **hardened** - Security hardening, cleanup

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DISPLAY` | X11 display | `:1` |
| `VNC_PORT` | VNC server port | `5901` |
| `NOVNC_PORT` | noVNC web port | `6080` |
| `CODE_SERVER_PORT` | VS Code port | `8080` |
| `SESSION_ID` | Session identifier | - |
| `APPLICATION_ID` | Application reference | - |
| `CANDIDATE_ID` | Candidate identifier | - |
| `ANTHROPIC_API_KEY` | Claude Code API key | - |

## Health Checks

The container includes a health check that verifies:
- code-server is responding on port 8080
- Returns unhealthy if services fail

## Troubleshooting

### Container won't start
Check Docker logs:
```bash
docker logs candidate-sandbox
```

### VNC connection issues
Verify Xvfb is running:
```bash
docker exec candidate-sandbox ps aux | grep Xvfb
```

### Permission denied errors
Ensure volumes have correct ownership:
```bash
docker exec candidate-sandbox chown -R candidate:candidate /workspace
```

## Development

### Rebuild after changes
```bash
docker-compose -f infrastructure/docker-compose.sandbox.yml up --build
```

### Test security profiles
```bash
# Try to mount (should fail)
docker exec candidate-sandbox mount /dev/null /mnt

# Try to access /proc/sys (should fail)
docker exec candidate-sandbox cat /proc/sys/kernel/hostname
```

## License

This Dockerfile and configuration is part of the HR Candidate Screening Platform.
