# Docker Sandbox Environment - Detailed Implementation Plan

## Overview

This plan details the implementation of the per-candidate isolated Docker environment for Phase 2 technical interviews. The sandbox provides engineers with a secure, ephemeral development environment pre-configured with VS Code Server, terminal, and Claude Code for 30-60 minute project-based assessments.

---

## 1. Docker Container Architecture and Base Image

### 1.1 Base Image Selection

**Recommended Base**: `ubuntu:24.04` LTS

Rationale:
- Long-term support and security updates
- Wide package availability
- Familiar environment for candidates
- Smaller attack surface than full desktop distributions

**Alternative Consideration**: `debian:bookworm-slim` for smaller image size (~30% reduction)

### 1.2 Multi-Stage Dockerfile Structure

```
Stage 1: Base System
  - Ubuntu 24.04 base
  - Essential packages (curl, git, ca-certificates)
  - Non-root user creation (candidate:candidate, UID 1000)

Stage 2: Development Tools
  - Node.js 20 LTS (via NodeSource)
  - Python 3.12 + pip
  - Docker CLI (for docker-outside-of-docker pattern)
  - Common build tools (build-essential, pkg-config)

Stage 3: IDE and Applications
  - VS Code Server (code-server) v4.x
  - Claude Code CLI (latest stable)
  - noVNC + Xvfb + fluxbox (lightweight window manager)
  - Terminal emulator (xterm)

Stage 4: Security Hardening
  - Remove unnecessary packages
  - Set proper file permissions
  - Configure read-only mounts
```

### 1.3 Container Filesystem Layout

```
/workspace          - RW: Candidate project files (volume mount)
/tmp                - RW: Temporary files (tmpfs)
/home/candidate     - RW: User home directory
/etc                - RO: System configuration (read-only)
/usr                - RO: System binaries (read-only)
/var                - RO: Variable data (read-only, except /var/tmp)
```

### 1.4 Pre-configured Tools Stack

| Tool | Purpose | Configuration |
|------|---------|---------------|
| code-server | Web-based VS Code | Port 8080, auth disabled (handled by gateway) |
| Claude Code | AI coding assistant | Pre-authenticated with limited scope |
| noVNC | Browser VNC client | Port 5901, self-contained |
| Xvfb | Virtual framebuffer | 1920x1080x24, no GPU acceleration |
| fluxbox | Window manager | Minimal config, no menus |
| xterm | Terminal emulator | Default terminal for Claude Code |

### 1.5 Dockerfile Location and Naming

**Path**: `/infrastructure/docker/candidate-sandbox/Dockerfile`

**Image Tagging Strategy**:
- `candidate-sandbox:latest` - Production
- `candidate-sandbox:v{version}` - Versioned releases
- `candidate-sandbox:dev` - Development builds

---

## 2. Security Hardening

### 2.1 Seccomp Profile

**Default Docker seccomp** blocks ~44 dangerous syscalls. We need a **custom profile** that additionally blocks:

```json
{
  "syscalls": [
    {
      "names": [
        "mount",
        "umount2",
        "pivot_root",
        "swapon",
        "swapoff",
        "reboot",
        "sethostname",
        "setdomainname",
        "iopl",
        "ioperm",
        "create_module",
        "init_module",
        "delete_module",
        "get_kernel_syms",
        "query_module",
        "quotactl",
        "nfsservctl",
        "getpmsg",
        "putpmsg",
        "afs_syscall",
        "tuxcall",
        "security",
        "perf_event_open",
        "kexec_load",
        "kexec_file_load",
        "bpf",
        "ptrace",
        "personality",
        "userfaultfd",
        "open_by_handle_at"
      ],
      "action": "SCMP_ACT_ERRNO"
    }
  ]
}
```

**Profile Location**: `/infrastructure/docker/candidate-sandbox/seccomp-profile.json`

### 2.2 AppArmor Profile

Create a restrictive AppArmor profile for the container:

```
#include <tunables/global>

profile candidate-sandbox flags=(attach_disconnected,mediate_deleted) {
  #include <abstractions/base>

  # Deny dangerous capabilities
  deny capability sys_admin,
  deny capability sys_module,
  deny capability sys_rawio,
  deny capability sys_ptrace,
  deny capability sys_pacct,
  deny capability sys_nice,
  deny capability sys_resource,
  deny capability sys_time,
  deny capability sys_tty_config,
  deny capability audit_control,
  deny capability audit_write,
  deny capability setuid,
  deny capability setgid,
  deny capability net_admin,
  deny capability net_raw,

  # Filesystem restrictions
  / r,
  /** r,
  deny /proc/sys/** w,
  deny /proc/sysrq-trigger rw,
  deny /proc/kcore rw,
  deny /proc/kmem rw,
  deny /sys/** w,

  # Allow workspace writes
  /workspace/** rwk,
  /home/candidate/** rwk,
  /tmp/** rwk,
}
```

**Profile Location**: `/infrastructure/docker/candidate-sandbox/apparmor-profile`

### 2.3 Linux Capabilities

**Drop ALL capabilities**, then selectively add only required ones:

```bash
# Drop all
--cap-drop=ALL

# Add minimal required
--cap-add=CHOWN          # For file ownership in workspace
--cap-add=SETGID         # For group operations
--cap-add=SETUID         # For user operations
--cap-add=DAC_OVERRIDE   # For workspace file operations
```

**Explicitly DENY** (even though dropped):
- `CAP_SYS_ADMIN` - Prevents container escape, mount operations
- `CAP_SYS_PTRACE` - Prevents process debugging
- `CAP_NET_ADMIN` - Prevents network configuration changes
- `CAP_NET_RAW` - Prevents raw socket access
- `CAP_SYS_MODULE` - Prevents kernel module loading

### 2.4 Network Isolation

**Container Network Configuration**:

```yaml
# Docker Compose network definition
networks:
  candidate-sandbox:
    driver: bridge
    internal: true          # No external access by default
    ipam:
      config:
        - subnet: 172.20.0.0/16

  # Optional: Controlled egress network
  sandbox-egress:
    driver: bridge
    # Enable for package managers, but restrict with firewall rules
```

**Firewall Rules** (via iptables/nftables on host):

```bash
# Allow: DNS resolution
iptables -A DOCKER-ISOLATION -p udp --dport 53 -j ACCEPT

# Allow: HTTPS for package managers (npm, pip, apt)
iptables -A DOCKER-ISOLATION -p tcp --dport 443 -j ACCEPT

# Deny: All internal service IPs
iptables -A DOCKER-ISOLATION -d 10.0.0.0/8 -j DROP
iptables -A DOCKER-ISOLATION -d 172.16.0.0/12 -j DROP
iptables -A DOCKER-ISOLATION -d 192.168.0.0/16 -j DROP

# Deny: Metadata services (cloud provider)
iptables -A DOCKER-ISOLATION -d 169.254.169.254 -j DROP
```

### 2.5 Read-Only Filesystem

**Implementation Strategy**:

```bash
# Read-only root filesystem
--read-only

# Writable tmpfs mounts for required paths
--tmpfs /tmp:noexec,nosuid,size=100m
--tmpfs /var/tmp:noexec,nosuid,size=50m
--tmpfs /run:noexec,nosuid,size=10m

# Writable volume for workspace (bind mount from host)
--volume /var/sessions/{session-id}/workspace:/workspace:rw
--volume /var/sessions/{session-id}/home:/home/candidate:rw
```

### 2.6 Additional Security Measures

| Measure | Implementation | Purpose |
|---------|---------------|---------|
| No New Privileges | `--security-opt=no-new-privileges:true` | Prevent privilege escalation |
| User Namespacing | Enable in daemon.json | UID/GID isolation |
| Device Restrictions | `--device-cgroup-rule='c *:* rm'` + explicit denies | Prevent device access |
| PID Limit | `--pids-limit=100` | Prevent fork bombs |
| No Docker Socket | Never mount `/var/run/docker.sock` | Prevent container escape |

---

## 3. Container Lifecycle Management

### 3.1 Session State Machine

```
┌─────────┐    spawn     ┌──────────┐   health check   ┌────────┐
│ PENDING │ ───────────► │ SPAWNING │ ───────────────► │ ACTIVE │
└─────────┘              └──────────┘                  └────┬───┘
                                                            │
    ┌───────────────────────────────────────────────────────┘
    │
    ▼ timeout (60min)    ┌─────────┐    cleanup      ┌─────────┐
┌─────────┐             │ EXPIRED │ ──────────────► │ CLEANED │
│ STOPPED │ ◄────────── └─────────┘                 └─────────┘
└────┬────┘      stop
     │
     ▼ error
┌─────────┐
│  ERROR  │
└─────────┘
```

### 3.2 Spawn Process

**Steps**:
1. **Validate Request**: Check candidate eligibility, concurrent session limits
2. **Generate Session ID**: UUID v4 for unique identification
3. **Create Workspace**: Prepare host directories for bind mounts
4. **Pull Image**: Ensure latest sandbox image is available
5. **Create Network**: Isolated bridge network for session
6. **Start Container**: Docker run with all security options
7. **Health Check**: Verify services (VS Code, noVNC) are responding
8. **Register Session**: Store session metadata in database
9. **Return Access URL**: WebSocket endpoint for noVNC + VS Code port

**Container Service Implementation** (`/src/lib/container-service.ts`):

```typescript
interface SpawnOptions {
  candidateId: string
  applicationId: string
  sessionDurationMinutes: number  // 30-60
  projectTemplate?: string        // Optional starter template
}

interface SessionInfo {
  sessionId: string
  containerId: string
  networkId: string
  vncUrl: string
  codeServerUrl: string
  startedAt: Date
  expiresAt: Date
  status: 'spawning' | 'active' | 'expired' | 'stopped' | 'error'
}
```

### 3.3 Monitoring

**Health Checks**:
- **Container**: Docker healthcheck every 10s
- **Services**: HTTP probes on VS Code (8080) and noVNC (5901)
- **Resources**: CPU/memory polling every 30s

**Metrics Collected**:
- CPU usage percentage
- Memory usage (MB)
- Disk I/O (read/write MB/s)
- Network I/O (optional, if egress enabled)
- Process count
- Uptime

**Alert Conditions**:
- Container unhealthy for >30s
- CPU >90% for >5min (possible crypto mining)
- Memory >95% (OOM risk)
- Unexpected container exit

### 3.4 Destroy Process

**Automatic Triggers**:
- Session duration exceeded (60-minute hard limit)
- Candidate explicitly ends session
- Admin force-terminate
- Health check failure (unrecoverable)

**Cleanup Steps**:
1. **Stop Container**: `docker stop` with 10s grace period
2. **Archive Workspace**: Tar.gz project files to S3/R2 storage
3. **Stop Recording**: Finalize session recording
4. **Remove Container**: `docker rm -f`
5. **Remove Network**: `docker network rm`
6. **Clean Host Directories**: Remove bind mount directories
7. **Update Database**: Mark session as completed
8. **Send Webhook**: Notify classification service for evaluation

### 3.5 Session Recovery

**Failure Scenarios**:
- Container crash during session
- Host node failure
- Network partition

**Recovery Strategy**:
- Workspace files persisted on host (survives container restart)
- Session state in database (can reconstruct session info)
- Automatic retry for transient failures (max 3 attempts)
- Graceful degradation to error state if unrecoverable

---

## 4. Resource Limits and Quotas

### 4.1 Per-Container Limits

| Resource | Limit | Rationale |
|----------|-------|-----------|
| CPU | 2 cores | Sufficient for development, prevents host starvation |
| Memory | 4 GB | Supports VS Code + Claude Code + build tools |
| Swap | 512 MB | Prevents OOM for temporary spikes |
| Disk (workspace) | 5 GB | Project files only, no large binaries |
| Disk (temp) | 150 MB | /tmp, /var/tmp, /run tmpfs |
| PIDs | 100 | Prevents fork bombs |
| File descriptors | 1024 | Standard limit |
| Network bandwidth | 10 Mbps | Package downloads only |

### 4.2 Docker Resource Configuration

```bash
docker run \
  --cpus="2.0" \
  --memory="4g" \
  --memory-swap="4.5g" \
  --memory-reservation="2g" \
  --pids-limit=100 \
  --storage-opt size=5G \
  ...
```

### 4.3 Host-Level Resource Management

**Global Limits** (per host):
- Max concurrent sessions: 20 (based on 64GB RAM host)
- Max containers per candidate: 1 (strict)
- Max session duration: 60 minutes (hard limit)

**Resource Pooling Strategy**:
- Pre-warm 5 container images for faster spawn times
- Queue-based allocation when at capacity
- Auto-scaling group for hosts (if using cloud)

### 4.4 Quota Enforcement

**Disk Quotas** (XFS project quotas or ZFS):
```bash
# Set 5GB quota on workspace volume
xfs_quota -x -c 'project -s session-123' /var/sessions
xfs_quota -x -c 'limit -p bhard=5g session-123' /var/sessions
```

**Network Quotas** (tc for traffic shaping):
```bash
# Limit egress to 10Mbps
tc qdisc add dev eth0 root tbf rate 10mbit burst 32kbit latency 400ms
```

---

## 5. Session Recording and Auditing

### 5.1 Recording Types

| Type | Method | Storage | Retention |
|------|--------|---------|-----------|
| Terminal | `script` + `asciinema` | S3/R2 | 90 days |
| Screen | noVNC built-in recording | S3/R2 | 30 days |
| Commands | Shell history + auditd | Database | 1 year |
| Filesystem | Workspace snapshots | S3/R2 | 90 days |
| Network | Flow logs (optional) | CloudWatch/SIEM | 30 days |

### 5.2 Terminal Recording

**Implementation**:
- Wrap shell with `asciinema rec` on startup
- Stream to file in workspace
- Upload to S3 on session end
- Convert to web-playable format

**Privacy Considerations**:
- Notify candidate that session is recorded
- Record only terminal/IDE activity (not personal browsing)
- Secure storage with encryption at rest

### 5.3 Screen Recording

**noVNC Recording**:
- Enable noVNC recording feature
- Capture framebuffer changes
- Encode as MP4 or WebM
- Store with session metadata

**Performance Impact**:
- ~5-10% CPU overhead
- ~50MB storage per 10 minutes (compressed)

### 5.4 Audit Logging

**Events Logged**:
```
SESSION_START    - Candidate, timestamp, IP address, user agent
COMMAND_EXEC     - Command, working directory, timestamp
FILE_ACCESS      - File path, operation (read/write), timestamp
NETWORK_ACCESS   - Destination IP, port, protocol (if egress enabled)
SESSION_END      - Reason (timeout/complete/error), final stats
SECURITY_EVENT   - Policy violation, blocked action
```

**Log Format** (structured JSON):
```json
{
  "timestamp": "2024-01-15T10:30:00Z",
  "sessionId": "sess-abc123",
  "candidateId": "user-xyz789",
  "eventType": "COMMAND_EXEC",
  "details": {
    "command": "npm install",
    "cwd": "/workspace/project",
    "exitCode": 0
  },
  "sourceIp": "203.0.113.42"
}
```

### 5.5 Compliance and Retention

**Data Retention Policy**:
- Session recordings: 30-90 days (configurable)
- Audit logs: 1 year
- Workspace archives: 90 days
- Anonymized metrics: Indefinite

**Access Controls**:
- Recordings accessible only to authorized reviewers
- Audit logs immutable (append-only)
- Encryption at rest (AES-256)
- Encryption in transit (TLS 1.3)

---

## 6. Implementation Phases

### Phase 1: Core Infrastructure (Week 1)

| Task | Files | Priority |
|------|-------|----------|
| Create base Dockerfile | `/infrastructure/docker/candidate-sandbox/Dockerfile` | High |
| Implement container service | `/src/lib/container-service.ts` | High |
| Add security profiles | `/infrastructure/docker/candidate-sandbox/seccomp-profile.json` | High |
| Create spawn/destroy API | `/src/app/api/sessions/route.ts` | High |
| Basic monitoring | `/src/lib/session-monitor.ts` | Medium |

### Phase 2: Security Hardening (Week 2)

| Task | Files | Priority |
|------|-------|----------|
| AppArmor profile | `/infrastructure/docker/candidate-sandbox/apparmor-profile` | High |
| Network isolation | `/infrastructure/docker/candidate-sandbox/network-policy.sh` | High |
| Resource limits | Update `container-service.ts` | High |
| Read-only filesystem | Update Dockerfile | High |
| Security testing | `/tests/security/container-security.test.ts` | Critical |

### Phase 3: Session Management (Week 3)

| Task | Files | Priority |
|------|-------|----------|
| Session state machine | `/src/lib/session-state.ts` | High |
| Health monitoring | `/src/lib/health-checker.ts` | High |
| Auto-cleanup | `/src/lib/session-cleanup.ts` | High |
| Queue management | `/src/lib/session-queue.ts` | Medium |
| Recovery logic | Update `container-service.ts` | Medium |

### Phase 4: Recording and Auditing (Week 4)

| Task | Files | Priority |
|------|-------|----------|
| Terminal recording | `/src/lib/recording/terminal-recorder.ts` | High |
| Screen recording | `/src/lib/recording/screen-recorder.ts` | Medium |
| Audit logging | `/src/lib/audit-logger.ts` | High |
| Storage integration | `/src/lib/recording/storage.ts` | High |
| Playback interface | `/src/components/admin/SessionPlayback.tsx` | Medium |

---

## 7. Testing Strategy

### 7.1 Security Testing

```typescript
// /tests/security/container-security.test.ts
describe('Container Security', () => {
  it('should not allow privilege escalation', async () => {
    // Attempt sudo, check for failure
  })

  it('should block dangerous syscalls', async () => {
    // Attempt mount, ptrace, etc.
  })

  it('should isolate network from internal services', async () => {
    // Attempt to connect to internal IPs
  })

  it('should enforce resource limits', async () => {
    // Fork bomb, memory exhaustion tests
  })
})
```

### 7.2 Integration Testing

- Spawn/destroy lifecycle
- Session timeout enforcement
- Concurrent session limits
- Recovery from failures

### 7.3 Performance Testing

- Container spawn time (target: <10s)
- Resource overhead (target: <5% host CPU)
- Concurrent session capacity

---

## 8. Deployment Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Load Balancer                            │
└───────────────────────────┬─────────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        ▼                   ▼                   ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│  App Server 1 │   │  App Server 2 │   │  App Server N │
│  (Next.js)    │   │  (Next.js)    │   │  (Next.js)    │
└───────┬───────┘   └───────┬───────┘   └───────┬───────┘
        │                   │                   │
        └───────────────────┼───────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Docker Host Pool                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │  Host 1     │  │  Host 2     │  │  Host N     │             │
│  │  (20 max)   │  │  (20 max)   │  │  (20 max)   │             │
│  │ ┌─────────┐ │  │ ┌─────────┐ │  │ ┌─────────┐ │             │
│  │ │Sandbox 1│ │  │ │Sandbox 1│ │  │ │Sandbox 1│ │             │
│  │ │Sandbox 2│ │  │ │Sandbox 2│ │  │ │Sandbox 2│ │             │
│  │ │  ...    │ │  │ │  ...    │ │  │ │  ...    │ │             │
│  │ └─────────┘ │  │ └─────────┘ │  │ └─────────┘ │             │
│  └─────────────┘  └─────────────┘  └─────────────┘             │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│              Shared Storage (S3/R2 + EFS/NFS)                    │
│  - Session recordings                                            │
│  - Workspace archives                                            │
│  - Container images                                              │
└─────────────────────────────────────────────────────────────────┘
```

---

## 9. Configuration

### 9.1 Environment Variables

```bash
# Container Service
DOCKER_HOST=unix:///var/run/docker.sock
SANDBOX_IMAGE=candidate-sandbox:latest
MAX_CONCURRENT_SESSIONS=20
SESSION_TIMEOUT_MINUTES=60

# Resource Limits
SANDBOX_CPU_LIMIT=2
SANDBOX_MEMORY_LIMIT=4g
SANDBOX_DISK_LIMIT=5g

# Security
ENABLE_SECCOMP=true
ENABLE_APPARMOR=true
NETWORK_ISOLATION=true

# Recording
RECORDING_ENABLED=true
RECORDING_STORAGE_BUCKET=s3://session-recordings
RECORDING_RETENTION_DAYS=30

# Monitoring
HEALTH_CHECK_INTERVAL_MS=10000
METRICS_ENABLED=true
```

### 9.2 Database Schema Addition

```prisma
// Add to /prisma/schema.prisma

model TechnicalSession {
  id              String            @id @default(cuid())
  applicationId   String            @unique
  application     Application       @relation(fields: [applicationId], references: [id])
  candidateId     String
  containerId     String?
  networkId       String?
  status          SessionStatus     @default(PENDING)
  startedAt       DateTime?
  endedAt         DateTime?
  expiresAt       DateTime?
  vncUrl          String?
  codeServerUrl   String?
  workspacePath   String?
  recordingUrl    String?
  auditLog        Json?
  createdAt       DateTime          @default(now())
  updatedAt       DateTime          @updatedAt
}

enum SessionStatus {
  PENDING
  SPAWNING
  ACTIVE
  EXPIRED
  STOPPED
  ERROR
}
```

---

## 10. Risk Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Container escape | Low | Critical | Seccomp, AppArmor, no root, read-only fs |
| Crypto mining | Medium | High | Resource limits, CPU monitoring, short sessions |
| Data exfiltration | Low | High | Network isolation, no sensitive data in env |
| Session hijacking | Low | High | Short-lived tokens, IP binding, WSS only |
| Resource exhaustion | Medium | Medium | Quotas, queue-based allocation, auto-scaling |
| Recording failure | Medium | Low | Redundant recording, health checks |

---

### Critical Files for Implementation

- `/infrastructure/docker/candidate-sandbox/Dockerfile` - Core container definition with multi-stage build and security hardening
- `/src/lib/container-service.ts` - Docker API integration for spawn/destroy/monitor lifecycle management
- `/infrastructure/docker/candidate-sandbox/seccomp-profile.json` - Custom seccomp profile blocking dangerous syscalls
- `/src/lib/session-monitor.ts` - Health checks, resource monitoring, and automatic cleanup
- `/src/lib/recording/terminal-recorder.ts` - Session recording implementation for audit and review
