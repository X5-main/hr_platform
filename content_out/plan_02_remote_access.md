# Remote Access Technology - Implementation Plan

## Executive Summary

This document provides a comprehensive implementation plan for the browser-based remote desktop access component of the HR Candidate Screening Platform. The solution enables candidates to access isolated Docker containers with development environments (VS Code, terminal, Claude Code) for 30-60 minute technical assessment sessions without requiring any client installation.

---

## 1. Technology Comparison

### 1.1 Evaluated Solutions Overview

| Solution | Protocol | Latency | Audio | Complexity | Best For |
|----------|----------|---------|-------|------------|----------|
| **noVNC + Xvfb** | VNC/WebSocket | Medium | No | Low | Simple deployments, text-heavy workflows |
| **Apache Guacamole** | Multi-protocol | Medium | Limited | High | Enterprise multi-protocol needs |
| **WebRTC (Selkies)** | WebRTC | Low | Yes | Medium | GPU workloads, low-latency requirements |
| **Kasm Workspaces** | KasmVNC | Medium | Yes | Medium | Enterprise secure browsing, pre-built images |
| **KasmVNC standalone** | VNC/WebSocket | Medium | Yes | Low | Enhanced VNC with audio support |

### 1.2 Detailed Analysis

#### Option A: noVNC + Xvfb (Baseline Option)

**Architecture:**
```
Browser <--WebSocket--> noVNC <--RFB--> X11vnc <--X11--> Xvfb + Apps
```

**Pros:**
- Mature, widely adopted (OpenStack, OpenNebula, Proxmox)
- Pure JavaScript client - no browser plugins
- Simple deployment with minimal dependencies
- Good mobile/touch device support
- Well-documented with active community
- No server-side processing beyond VNC server

**Cons:**
- No native audio support (requires separate WebRTC or PulseAudio tunnel)
- Frame-based protocol causes lag for video/animations
- Limited to 1-2 FPS for passive viewing scenarios
- CPU-intensive on client (JavaScript binary processing)
- Requires WebSocket proxy (websockify) for VNC server

**Performance Characteristics:**
- Latency: 150-500ms depending on network
- Frame rate: 10-30 FPS for active use, 1-2 FPS idle
- Bandwidth: 500KB/s - 2MB/s typical
- CPU usage: High during window movements/resizing

**Use Case Fit:** Text-heavy development work, terminal usage, code editing - acceptable for the 30-60 minute assessment sessions.

---

#### Option B: Apache Guacamole

**Architecture:**
```
Browser <--HTTP/WS--> Guacamole Server <--VNC/RDP/SSH--> Target Host
```

**Pros:**
- Protocol agnostic (VNC, RDP, SSH, Telnet, Kubernetes)
- Server-side rendering reduces client CPU load
- PNG compression more efficient than raw VNC
- Enterprise features: LDAP, SAML, TOTP, history
- Shareable session links for collaboration
- File transfer support (RDP/VNC)
- Printing support (RDP)

**Cons:**
- Java-based (Tomcat) - heavier infrastructure
- Complex initial setup (database, guacd daemon, webapp)
- Three-layer architecture adds latency
- Audio support limited and complex
- Overkill for single-protocol use case
- Requires dedicated server resources

**Performance Characteristics:**
- Latency: 100-400ms (better than raw VNC)
- More efficient compression than standard VNC
- Better for multi-user scenarios
- Higher server resource requirements

**Use Case Fit:** Multi-protocol enterprise environments, shared infrastructure - overkill for our container-per-candidate model.

---

#### Option C: WebRTC (Selkies-GStreamer)

**Architecture:**
```
Browser <--WebRTC--> Signaling Server <--SDP--> GStreamer Pipeline <--X11--> Apps
```

**Pros:**
- **Ultra-low latency: 50-200ms** (sub-second guaranteed)
- Native audio support (Opus codec)
- Hardware acceleration (NVENC, VA-API)
- Adaptive bitrate based on network conditions
- Designed for cloud gaming and GPU workloads
- Container-native (Kubernetes/Docker)
- 30-60 FPS at 1080p with GPU, 30 FPS software

**Cons:**
- More complex setup than VNC solutions
- Requires TURN server for NAT traversal (additional cost)
- WebRTC can be blocked by corporate firewalls
- Higher initial development complexity
- Smaller community than VNC solutions

**Performance Characteristics:**
- Latency: 50-200ms (best in class)
- Frame rate: 30-60 FPS at 1080p
- Bandwidth: 2-8 Mbps adaptive
- Audio: <50ms latency with Opus

**Use Case Fit:** Best for interactive development with low-latency requirements, future-proof for video/animation content.

---

#### Option D: Kasm Workspaces

**Architecture:**
```
Browser <--WebSocket--> KasmVNC <--X11--> Containerized Desktop
```

**Pros:**
- Complete Containerized Desktop Infrastructure (CDI) platform
- Pre-built secure browser and desktop images
- Zero-trust security architecture
- Built-in session recording
- Enterprise scaling capabilities
- KasmVNC offers better performance than noVNC
- Audio support via WebRTC integration
- GPU sharing capabilities

**Cons:**
- Commercial product (licensing costs for enterprise)
- More complex than standalone solutions
- May be overkill for single-use assessment sessions
- Vendor lock-in considerations

**Performance Characteristics:**
- Latency: 100-300ms
- KasmVNC multithreaded encoding (improved 2024)
- Better than standard noVNC for video content
- Built-in audio streaming

**Use Case Fit:** Enterprise deployments requiring complete platform, security compliance, and management features.

---

### 1.3 Recommendation Matrix

| Criteria | noVNC | Guacamole | WebRTC/Selkies | Kasm |
|----------|-------|-----------|----------------|------|
| **Setup Complexity** | Low | High | Medium | Medium |
| **Latency** | Medium | Medium | **Excellent** | Medium |
| **Audio Support** | No | Limited | **Yes** | Yes |
| **Browser Only** | Yes | Yes | Yes | Yes |
| **Resource Usage** | Low | High | Medium | Medium |
| **Scalability** | Medium | High | High | High |
| **Maintenance** | Low | Medium | Medium | Low (managed) |
| **Cost** | Free | Free | Free | Commercial |
| **Security** | Good | Excellent | Good | Excellent |

### 1.4 Final Recommendation: Hybrid Approach

**Primary: noVNC + Xvfb for MVP**
- Fastest time to market
- Proven technology
- Sufficient for code editing and terminal work
- Lower infrastructure complexity

**Future Enhancement Path: KasmVNC or WebRTC**
- Upgrade to KasmVNC for audio support without full platform
- Migrate to WebRTC (Selkies) if latency becomes critical
- Both can be swapped in with minimal application changes

---

## 2. Architecture for Browser-to-Container Streaming

### 2.1 System Architecture

```
+-----------------------------------------------------------------------------+
|                           Candidate Browser                                  |
|  +-----------------+  +-----------------+  +-----------------------------+  |
|  |   noVNC Client  |  |  VS Code Web    |  |   Session Control UI        |  |
|  |   (Canvas/WebGL)|  |  (code-server)  |  |   (React Component)         |  |
|  +--------+--------+  +--------+--------+  +--------------+--------------+  |
+----------+--------------------+----------------------------+----------------+
           | WebSocket (WSS)    | HTTPS                    | HTTPS
           ▼                    ▼                          ▼
+-----------------------------------------------------------------------------+
|                         Session Gateway (Next.js API)                        |
|  +---------------------------------------------------------------------+    |
|  |  - JWT Authentication & Validation                                  |    |
|  |  - Session Token Generation (short-lived, IP-bound)                 |    |
|  |  - Rate Limiting (per-candidate, per-session)                       |    |
|  |  - WebSocket Proxy Routing                                          |    |
|  |  - Session Lifecycle Management                                     |    |
|  +---------------------------------------------------------------------+    |
+---------------------------------+-------------------------------------------+
                                  | Docker API + Internal Network
                                  ▼
+-----------------------------------------------------------------------------+
|                    Isolated Docker Network (per session)                     |
|  +---------------------------------------------------------------------+    |
|  |                    Candidate Container                              |    |
|  |  +-------------------------------------------------------------+   |    |
|  |  |  Ubuntu 22.04 LTS Base Image                                |   |    |
|  |  |  +-------------+  +-------------+  +---------------------+  |   |    |
|  |  |  |   Xvfb      |  |  X11vnc     |  |   noVNC Server      |  |   |    |
|  |  |  |  (Display)  |--|  (VNC srv)  |--|  (WebSocket bridge) |  |   |    |
|  |  |  +-------------+  +-------------+  +---------------------+  |   |    |
|  |  |  +-------------+  +-------------+  +---------------------+  |   |    |
|  |  |  | code-server |  |   Terminal  |  |   Claude Code CLI   |  |   |    |
|  |  |  |  (IDE:8080) |  |  (ttyd:7681)|  |   (pre-configured)  |  |   |    |
|  |  |  +-------------+  +-------------+  +---------------------+  |   |    |
|  |  |  +-------------+  +-------------+  +---------------------+  |   |    |
|  |  |  |  Firefox    |  |   Git       |  |   Dev Tools         |  |   |    |
|  |  |  |  (optional) |  |   (latest)  |  |   (Node, Python)    |  |   |    |
|  |  |  +-------------+  +-------------+  +---------------------+  |   |    |
|  |  +-------------------------------------------------------------+   |    |
|  |                                                                    |    |
|  |  Security Profile:                                                 |    |
|  |  - User: developer (uid:1000, non-root)                           |    |
|  |  - Read-only root filesystem                                       |    |
|  |  - No CAP_SYS_ADMIN (no docker-in-docker)                         |    |
|  |  - Network: isolated bridge (no egress to internal services)      |    |
|  |  - Resources: 2 CPU, 4GB RAM, 10GB disk                           |    |
|  |  - 60-minute hard kill timer                                       |    |
|  +---------------------------------------------------------------------+    |
+-----------------------------------------------------------------------------+
```

### 2.2 Component Details

#### 2.2.1 Display Stack

```
Xvfb (virtual framebuffer)
    ↓
Fluxbox/IceWM (lightweight window manager)
    ↓
X11vnc (VNC server with WebSocket support)
    ↓
noVNC (HTML5 VNC client served via nginx)
```

**Xvfb Configuration:**
- Resolution: 1920x1080x24 (configurable)
- Virtual display: :1
- No physical GPU required (software rendering)

**X11vnc Configuration:**
- WebSocket support enabled (-websocket option)
- Password authentication
- Shared mode (multiple viewers allowed for proctoring)
- NoVNC-compatible WebSocket path

#### 2.2.2 Development Tools Stack

| Tool | Port | Purpose | Access Method |
|------|------|---------|---------------|
| code-server | 8080 | VS Code in browser | Direct HTTPS proxy |
| ttyd | 7681 | Terminal in browser | Direct HTTPS proxy |
| noVNC | 5901 | Desktop access | WebSocket via gateway |
| nginx | 80 | Static files, routing | Internal only |

#### 2.2.3 Session Gateway Responsibilities

```typescript
// Session Gateway API Structure
interface SessionGateway {
  // Authentication
  validateSessionToken(token: string, ip: string): Promise<Session>

  // Container lifecycle
  spawnContainer(sessionId: string, config: ContainerConfig): Promise<Container>
  destroyContainer(sessionId: string): Promise<void>
  extendSession(sessionId: string, minutes: number): Promise<void>

  // WebSocket proxy
  proxyVNCWebSocket(sessionId: string, clientWs: WebSocket): void

  // Monitoring
  getSessionStatus(sessionId: string): SessionStatus
  recordSessionActivity(sessionId: string, event: ActivityEvent): void
}
```

### 2.3 Network Architecture

```
+-----------------------------------------------------------------------------+
|                              Host Network                                    |
|                                                                              |
|  +---------------------+         +--------------------------------------+   |
|  |   Public Internet   |         |         Internal Network              |   |
|  |                     |         |                                      |   |
|  |  Candidate Browser -|---------|-- HTTPS (443)                        |   |
|  |                     |         |    Session Gateway (Next.js)         |   |
|  |                     |         |         |                            |   |
|  |                     |         |         ▼                            |   |
|  |                     |         |    Docker API (unix socket)          |   |
|  |                     |         |         |                            |   |
|  |                     |         |         ▼                            |   |
|  |                     |         |    +-----------------------------+   |   |
|  |                     |         |    |  Session Network (bridge)   |   |   |
|  |                     |         |    |  172.20.x.x/24 (isolated)   |   |   |
|  |                     |         |    |                             |   |   |
|  |                     |         |    |  +---------------------+    |   |   |
|  |                     |         |    |  | Candidate Container |    |   |   |
|  |                     |         |    |  | - No internet egress|    |   |   |
|  |                     |         |    |  | - DNS to 8.8.8.8    |    |   |   |
|  |                     |         |    |  | - No host access    |    |   |   |
|  |                     |         |    |  +---------------------+    |   |   |
|  |                     |         |    +-----------------------------+   |   |
|  +---------------------+         +--------------------------------------+   |
+-----------------------------------------------------------------------------+
```

**Network Policies:**
- Each session gets isolated Docker bridge network
- No inter-container communication
- Outbound internet allowed (for package installation) but logged
- Internal services (database, Redis) not accessible from containers
- DNS restricted to public resolvers only

---

## 3. Security Considerations

### 3.1 Threat Model

| Threat | Risk Level | Mitigation |
|--------|------------|------------|
| Container escape | Critical | Non-root user, seccomp, AppArmor, no privileged mode |
| Host resource exhaustion | High | Resource quotas (CPU, memory, disk), session timeouts |
| Session hijacking | High | Short-lived tokens, IP binding, TLS everywhere |
| Data exfiltration | Medium | Network isolation, read-only root fs, no secrets in env |
| Cryptomining | Medium | Resource limits, monitoring, short session TTL |
| Lateral movement | High | Network segmentation, no internal service access |
| Privilege escalation | Critical | Drop all capabilities, no SETUID binaries |

### 3.2 Container Security Hardening

#### 3.2.1 Dockerfile Security Measures

```dockerfile
# Multi-stage build for minimal attack surface
FROM ubuntu:22.04 AS base

# Create non-root user
RUN groupadd -r developer -g 1000 && \
    useradd -r -g developer -u 1000 -m -s /bin/bash developer

# Install only required packages
RUN apt-get update && apt-get install -y --no-install-recommends \
    xvfb fluxbox x11vnc websockify \
    code-server ttyd \
    git curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Remove SETUID binaries
RUN find / -perm /6000 -type f -exec chmod a-s {} \; 2>/dev/null || true

# Set up workspace
WORKDIR /home/developer/workspace
RUN chown -R developer:developer /home/developer

# Switch to non-root
USER developer

# Read-only root filesystem support
VOLUME ["/tmp", "/home/developer/.config", "/home/developer/workspace"]

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8080/health || exit 1
```

#### 3.2.2 Runtime Security Configuration

```yaml
# Docker Compose security profile
services:
  candidate-sandbox:
    image: candidate-sandbox:latest

    # Security options
    security_opt:
      - no-new-privileges:true
      - seccomp:/path/to/seccomp-profile.json
      - apparmor:docker-default

    # Capabilities
    cap_drop:
      - ALL
    cap_add:
      - CHOWN
      - SETGID
      - SETUID

    # Resource limits
    deploy:
      resources:
        limits:
          cpus: '2.0'
          memory: 4G
        reservations:
          cpus: '0.5'
          memory: 512M

    # Storage
    read_only: true
    tmpfs:
      - /tmp:noexec,nosuid,size=100m
      - /home/developer/.cache:size=100m

    # Network
    networks:
      - isolated-session

    # No privilege escalation
    user: "1000:1000"

    # Environment (no secrets)
    environment:
      - DISPLAY=:1
      - HOME=/home/developer

    # Auto-kill after 60 minutes
    stop_grace_period: 30s
```

### 3.3 Session Security

#### 3.3.1 Token-Based Authentication

```typescript
// Session token structure
interface SessionToken {
  sessionId: string      // Unique session identifier
  candidateId: string    // Candidate user ID
  applicationId: string  // Job application reference
  ipHash: string        // SHA-256 of client IP (binding)
  expiresAt: number     // Unix timestamp (max 60 min from creation)
  nonce: string         // Cryptographic nonce for replay protection
}

// Token generation
function generateSessionToken(
  sessionId: string,
  candidateId: string,
  applicationId: string,
  clientIp: string
): string {
  const payload: SessionToken = {
    sessionId,
    candidateId,
    applicationId,
    ipHash: hashIp(clientIp),
    expiresAt: Date.now() + (60 * 60 * 1000), // 60 minutes
    nonce: crypto.randomUUID()
  }

  return jwt.sign(payload, JWT_SECRET, { algorithm: 'HS256' })
}

// Token validation
function validateSessionToken(token: string, clientIp: string): SessionToken {
  const payload = jwt.verify(token, JWT_SECRET) as SessionToken

  if (payload.expiresAt < Date.now()) {
    throw new Error('Session expired')
  }

  if (payload.ipHash !== hashIp(clientIp)) {
    throw new Error('IP mismatch - possible session hijacking')
  }

  return payload
}
```

### 3.4 Monitoring and Audit

```typescript
// Session audit logging
interface AuditEvent {
  timestamp: Date
  sessionId: string
  candidateId: string
  eventType: 'SESSION_START' | 'SESSION_END' | 'COMMAND_EXEC' |
             'FILE_ACCESS' | 'NETWORK_ACCESS' | 'SECURITY_VIOLATION'
  details: Record<string, unknown>
  severity: 'INFO' | 'WARN' | 'ERROR' | 'CRITICAL'
}

// Real-time monitoring
function monitorContainer(containerId: string): void {
  const stats = docker.getContainer(containerId).stats()

  stats.on('data', (data) => {
    const metrics = JSON.parse(data.toString())

    // Alert on resource exhaustion
    if (metrics.memory_stats.usage > 3.5 * 1024 * 1024 * 1024) { // 3.5GB
      alertHighMemoryUsage(containerId)
    }

    // Alert on suspicious CPU patterns (cryptomining)
    if (metrics.cpu_stats.cpu_usage.total_usage > 90) {
      alertHighCpuUsage(containerId)
    }
  })
}
```

---

## 4. Performance Optimization Strategies

### 4.1 Container Startup Optimization

#### 4.1.1 Pre-warmed Container Pool

```typescript
// Container pool manager
class ContainerPool {
  private available: Container[] = []
  private inUse: Map<string, Container> = new Map()
  private minPoolSize = 5
  private maxPoolSize = 20

  async initialize(): Promise<void> {
    // Pre-warm containers on startup
    for (let i = 0; i < this.minPoolSize; i++) {
      const container = await this.createPreconfiguredContainer()
      this.available.push(container)
    }
  }

  async acquire(sessionId: string): Promise<Container> {
    if (this.available.length === 0) {
      // Create on-demand if pool exhausted
      return this.createPreconfiguredContainer()
    }

    const container = this.available.pop()!
    this.inUse.set(sessionId, container)

    // Configure for specific session
    await this.configureForSession(container, sessionId)

    return container
  }

  private async createPreconfiguredContainer(): Promise<Container> {
    return docker.createContainer({
      Image: 'candidate-sandbox:prewarmed',
      // Pre-start Xvfb, window manager
      Cmd: ['/usr/local/bin/prewarm-entrypoint.sh'],
      // ... other config
    })
  }
}
```

### 4.2 VNC Performance Optimization

#### 4.2.1 X11vnc Tuning

```bash
#!/bin/bash
# /usr/local/bin/start-vnc.sh

# Optimized X11vnc settings for development workloads
exec x11vnc \
  -display :1 \
  -forever \
  -shared \
  -repeat \
  -xkb \
  -noxrecord \
  -noxfixes \
  -noxdamage \
  -wait 5 \
  -defer 5 \
  -ncache 10 \
  -ncache_cr \
  -rfbport 5901 \
  -rfbauth /home/developer/.vnc/passwd \
  -websocket \
  -websocket_port 5902
```

**Key Optimizations:**
- `-ncache 10`: Client-side caching for smoother scrolling
- `-defer 5`: Batch screen updates (5ms delay)
- `-wait 5`: Limit polling frequency
- `-noxrecord -noxfixes -noxdamage`: Disable unused extensions

### 4.3 Bandwidth Optimization

| Optimization | Implementation | Expected Savings |
|--------------|----------------|------------------|
| VNC compression | Tight encoding, quality level 6 | 40-60% |
| Client-side caching | ncache_cr option | 30-50% for scrolling |
| Delta updates | Only changed regions | 70-90% for static content |
| Adaptive quality | Lower quality on slow connections | 20-40% |
| WebSocket compression | Per-message-deflate for text | 60-80% for JSON |

---

## 5. Implementation Approach

### 5.1 Phase 1: MVP with noVNC (Week 1-2)

**Goal:** Working remote desktop with basic security

**Components:**
1. Base Docker image with Xvfb, X11vnc, noVNC
2. code-server for IDE access
3. Session gateway with JWT authentication
4. Basic container lifecycle management

**Pros:**
- Fastest time to market (1-2 weeks)
- Proven, stable technology
- Sufficient for code editing workflows
- Lower infrastructure cost

**Cons:**
- No audio support
- Higher latency than WebRTC
- Limited video/animation performance

### 5.2 Phase 2: Enhanced Security & Monitoring (Week 3)

**Goal:** Production-ready security hardening

**Components:**
1. Seccomp profiles
2. AppArmor/SELinux integration
3. Session recording and audit logging
4. Resource monitoring and alerting
5. Container pool pre-warming

### 5.3 Phase 3: Performance Optimization (Week 4)

**Goal:** Sub-second latency, smooth experience

**Components:**
1. Container pooling for instant startup
2. VNC parameter tuning
3. CDN for static assets
4. Adaptive quality based on connection

### 5.4 Phase 4: Future Enhancement - WebRTC (Optional)

**Goal:** Ultra-low latency, audio support

**Decision Point:** Implement only if noVNC latency proves unacceptable in production testing.

---

## 6. Pros and Cons Summary

### 6.1 Selected Approach (noVNC + Container Pool)

**Pros:**
1. **Mature ecosystem** - Extensive documentation, community support
2. **No client installation** - Pure browser-based access
3. **Fastest implementation** - 1-2 weeks to MVP
4. **Lower infrastructure cost** - No TURN servers, simpler architecture
5. **Sufficient for use case** - Code editing and terminal work don't require high FPS
6. **Easy to secure** - Well-understood attack surface
7. **Future upgrade path** - Can swap to KasmVNC or WebRTC later

**Cons:**
1. **No audio** - Cannot support audio-based assessments
2. **Higher latency** - 150-500ms vs 50-200ms for WebRTC
3. **Limited video performance** - Not suitable for video editing assessments
4. **CPU intensive** - Client-side JavaScript processing

### 6.2 Alternative: WebRTC-First Approach

**Pros:**
1. **Best performance** - Sub-200ms latency
2. **Audio support** - Native Opus codec
3. **Future-proof** - Modern standard, active development
4. **Better for video** - 30-60 FPS capability

**Cons:**
1. **Complex implementation** - 3-4 weeks to MVP
2. **TURN server costs** - Required for NAT traversal (~$50-200/month)
3. **Firewall issues** - WebRTC can be blocked by corporate firewalls
4. **Smaller community** - Fewer resources for troubleshooting
5. **Overkill for current use case** - Benefits not fully utilized

---

## 7. Infrastructure Requirements

### 7.1 Minimum Viable Infrastructure

| Component | Specification | Cost Estimate |
|-----------|---------------|---------------|
| Application Server | 4 vCPU, 8GB RAM | $50-100/month |
| Docker Host | 8 vCPU, 32GB RAM | $150-300/month |
| Database | PostgreSQL (managed) | $15-50/month |
| Redis | Cache instance | $15-30/month |
| Object Storage | S3/R2 for recordings | $5-20/month |
| **Total** | | **$235-500/month** |

### 7.2 Scaling Estimates

| Concurrent Sessions | Docker Host Spec | Monthly Cost |
|--------------------|------------------|--------------|
| 5 | 8 vCPU, 32GB RAM | $150-300 |
| 20 | 32 vCPU, 128GB RAM | $600-1200 |
| 100 | 5x 32 vCPU nodes + K8s | $3000-6000 |

---

## 8. Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Container startup time | <5 seconds | Time from request to ready state |
| VNC latency | <500ms | Round-trip frame update time |
| Session availability | 99.9% | Uptime excluding scheduled maintenance |
| Security incidents | 0 | Unauthorized access, container escapes |
| Candidate satisfaction | >4.0/5 | Post-session survey |
| Browser compatibility | 95%+ | Successful connections by browser type |

---

## 9. Critical Files for Implementation

Priority order for development:

1. **`/infrastructure/docker/candidate-sandbox/Dockerfile`** - Core container definition with Xvfb, X11vnc, noVNC, code-server
2. **`/infrastructure/docker/seccomp-profile.json`** - Restricted syscall profile for container hardening
3. **`/src/lib/container-service.ts`** - Docker API integration for container lifecycle management
4. **`/src/lib/session-gateway.ts`** - WebSocket proxy and session authentication
5. **`/src/components/remote-desktop/VncViewer.tsx`** - React component wrapping noVNC client
6. **`/src/lib/container-pool.ts`** - Pre-warmed container pool for instant session startup
7. **`/src/app/api/sessions/route.ts`** - REST API for session creation, status, termination
8. **`/infrastructure/nginx/remote-access.conf`** - Nginx reverse proxy configuration

---

### Critical Files for Implementation

- `/infrastructure/docker/candidate-sandbox/Dockerfile` - Core container definition with Xvfb, X11vnc, noVNC, and code-server
- `/infrastructure/docker/seccomp-profile.json` - Restricted syscall profile for container security hardening
- `/src/lib/container-service.ts` - Docker API integration for spawn/destroy session lifecycle management
- `/src/lib/session-gateway.ts` - WebSocket proxy and JWT authentication for secure session access
- `/src/components/remote-desktop/VncViewer.tsx` - React component wrapping noVNC client for browser-based access
