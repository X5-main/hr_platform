# Agent-Based Architecture: Remote Access System

## Overview

This document defines a multi-agent architecture for the Remote Access System component of the HR Candidate Screening Platform. This system provides browser-based remote desktop access to isolated Docker containers using noVNC/Xvfb for technical interviews. Each agent operates as an autonomous black-box with defined inputs, outputs, and self-validation capabilities.

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                        Remote Access System Agent Architecture                           │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                          │
│  ┌─────────────────────────────────────────────────────────────────────────────────┐    │
│  │                           ORCHESTRATION LAYER                                    │    │
│  │                                                                                  │    │
│  │  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────────────────┐  │    │
│  │  │  Session        │    │  Access         │    │  Event                      │  │    │
│  │  │  Orchestrator   │◄──►│  Control        │◄──►│  Bus                        │  │    │
│  │  │  Agent          │    │  Agent          │    │  (Redis Pub/Sub)            │  │    │
│  │  └────────┬────────┘    └────────┬────────┘    └─────────────────────────────┘  │    │
│  │           │                      │                                              │    │
│  │           └──────────────────────┘                                              │    │
│  └──────────────────────────────────┼──────────────────────────────────────────────┘    │
│                                     │                                                    │
│  ═══════════════════════════════════╪════════════════════════════════════════════════    │
│                                     │                                                    │
│  ┌──────────────────────────────────┼──────────────────────────────────────────────┐    │
│  │                      CORE DOMAIN AGENTS                                         │    │
│  │                                  │                                              │    │
│  │  ┌─────────────────┐  ┌─────────┴──────────┐  ┌─────────────────────────────┐  │    │
│  │  │  Display        │  │  WebSocket         │  │  Session                    │  │    │
│  │  │  Manager        │  │  Proxy             │  │  Monitor                    │  │    │
│  │  │  Agent          │  │  Agent             │  │  Agent                      │  │    │
│  │  │                 │  │                    │  │                             │  │    │
│  │  │ Input: Display  │  │ Input: WS Connect  │  │ Input: Session ID           │  │    │
│  │  │        Config   │  │        Auth Token  │  │        Metrics Request      │  │    │
│  │  │        Commands │  │        Data Frame  │  │                             │  │    │
│  │  │                 │  │                    │  │ Output: Health Status       │  │    │
│  │  │ Output:         │  │ Output: Proxied    │  │         Resource Usage      │  │    │
│  │  │  Display Ready  │  │  VNC Frame         │  │         Performance Stats   │  │    │
│  │  │  Resolution Set │  │  Clipboard Data    │  │                             │  │    │
│  │  │                 │  │                    │  │ Self-Validate: Metrics      │  │    │
│  │  │ Self-Validate:  │  │ Self-Validate:     │  │  accurate, alerts fire      │  │    │
│  │  │  Xvfb running,  │  │  No data loss,     │  │                             │  │    │
│  │  │  VNC accessible │  │  Latency < 100ms   │  │                             │  │    │
│  │  └─────────────────┘  └────────────────────┘  └─────────────────────────────┘  │    │
│  │                                                                                  │    │
│  │  ┌─────────────────┐  ┌────────────────────┐  ┌─────────────────────────────┐  │    │
│  │  │  Clipboard      │  │  File Transfer     │  │  Recording                  │  │    │
│  │  │  Controller     │  │  Gatekeeper        │  │  Manager                    │  │    │
│  │  │  Agent          │  │  Agent             │  │  Agent                      │  │    │
│  │  │                 │  │                    │  │                             │  │    │
│  │  │ Input: Copy/    │  │ Input: File Op     │  │ Input: Record Start/Stop    │  │    │
│  │  │        Paste    │  │        Request     │  │        Config               │  │    │
│  │  │                 │  │                    │  │                             │  │    │
│  │  │ Output:         │  │ Output:            │  │ Output: Recording URL       │  │    │
│  │  │  Sanitized      │  │  Allowed/Denied    │  │         Storage Path        │  │    │
│  │  │  Clipboard      │  │  Quarantine Info   │  │                             │  │    │
│  │  │                 │  │                    │  │ Self-Validate: Files        │  │    │
│  │  │ Self-Validate:  │  │ Self-Validate:     │  │  complete, storage OK       │  │    │
│  │  │  Size limits,   │  │  Policy enforced,  │  │                             │  │    │
│  │  │  No malware     │  │  Audit logged      │  │                             │  │    │
│  │  └─────────────────┘  └────────────────────┘  └─────────────────────────────┘  │    │
│  └────────────────────────────────────────────────────────────────────────────────┘    │
│                                                                                          │
│  ═══════════════════════════════════════════════════════════════════════════════════   │
│                                                                                          │
│  ┌────────────────────────────────────────────────────────────────────────────────┐    │
│  │                      INFRASTRUCTURE AGENTS                                      │    │
│  │                                                                                  │    │
│  │  ┌─────────────────┐  ┌────────────────────┐  ┌─────────────────────────────┐   │    │
│  │  │  Container      │  │  Quality           │  │  Security                   │   │    │
│  │  │  Lifecycle      │  │  Monitor           │  │  Auditor                    │   │    │
│  │  │  Agent          │  │  Agent             │  │  Agent                      │   │    │
│  │  │                 │  │                    │  │                             │   │    │
│  │  │ Input: Spawn/   │  │ Input: Connection  │  │ Input: Security Event       │   │    │
│  │  │        Destroy  │  │        Stats       │  │        Audit Query          │   │    │
│  │  │        Health   │  │                    │  │                             │   │    │
│  │  │                 │  │ Output: Quality    │  │ Output: Audit Log           │   │    │
│  │  │ Output:         │  │  Score             │  │         Threat Report       │   │    │
│  │  │  Container ID   │  │  Bandwidth Report  │  │                             │   │    │
│  │  │  Status         │  │  Adaptation Cmd    │  │ Self-Validate: Logs         │   │    │
│  │  │                 │  │                    │  │  immutable, indexed         │   │    │
│  │  │ Self-Validate:  │  │ Self-Validate:     │  │                             │   │    │
│  │  │  Docker API OK  │  │  Measurements      │  │                             │   │    │
│  │  │  Resources OK   │  │  accurate          │  │                             │   │    │
│  │  └─────────────────┘  └────────────────────┘  └─────────────────────────────┘   │    │
│  └────────────────────────────────────────────────────────────────────────────────┘    │
│                                                                                          │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Agent Specifications

### 1. Session Orchestrator Agent

**Purpose**: Coordinates the complete lifecycle of remote access sessions from initialization to termination.

**Input Interface**:
```typescript
interface SessionOrchestratorCommand {
  type: 'INITIATE_SESSION' | 'EXTEND_SESSION' | 'TERMINATE_SESSION' | 'GET_SESSION_STATUS';
  sessionId: string;
  payload: {
    applicationId?: string;
    candidateId?: string;
    sessionDurationMinutes?: number;
    displayConfig?: DisplayConfiguration;
    reason?: string; // For termination
  };
  correlationId: string;
  timestamp: string;
}

interface DisplayConfiguration {
  resolution: '1920x1080' | '1600x900' | '1366x768';
  colorDepth: 16 | 24 | 32;
  refreshRate: 30 | 60;
}
```

**Output Interface**:
```typescript
interface SessionOrchestratorResult {
  sessionId: string;
  status: 'PENDING' | 'PROVISIONING' | 'ACTIVE' | 'EXPIRING' | 'TERMINATED' | 'ERROR';
  endpoints: {
    vncUrl: string;
    codeServerUrl: string;
    websocketUrl: string;
  };
  credentials: {
    sessionToken: string;
    expiresAt: string;
  };
  metadata: {
    containerId: string;
    networkId: string;
    startedAt: string;
    expiresAt: string;
  };
  error?: SessionError;
  correlationId: string;
}

interface SessionError {
  code: 'CONTAINER_FAILED' | 'NETWORK_ERROR' | 'TIMEOUT' | 'QUOTA_EXCEEDED' | 'UNAUTHORIZED';
  message: string;
  recoverable: boolean;
  retryAfter?: number;
}
```

**Self-Validation**:
- All sessions have valid expiration timestamps
- No orphaned containers (container cleanup verified)
- Session tokens expire correctly
- Concurrent session limits enforced per candidate
- State transitions follow valid lifecycle

**State Machine**:
```
PENDING ───────► PROVISIONING ───────► ACTIVE ───────► EXPIRING ───────► TERMINATED
    │                   │                  │                │
    │                   │                  │                ▼
    │                   │                  │           (grace period)
    │                   │                  │                │
    │                   ▼                  ▼                ▼
    │              ERROR (recoverable)  ERROR (fatal)  FORCE_TERMINATED
    │                   │                  │
    └───────────────────┴──────────────────┘
         (retry logic for recoverable errors)
```

---

### 2. Display Manager Agent

**Purpose**: Manages Xvfb virtual display, VNC server, and display configuration for remote sessions.

**Input Interface**:
```typescript
interface DisplayCommand {
  type: 'START_DISPLAY' | 'STOP_DISPLAY' | 'SET_RESOLUTION' | 'GET_DISPLAY_INFO' | 'RESTART_VNC';
  sessionId: string;
  config?: {
    resolution?: { width: number; height: number; depth: number };
    vncPort?: number;
    websocketPort?: number;
    password?: string;
  };
}
```

**Output Interface**:
```typescript
interface DisplayResult {
  sessionId: string;
  status: 'DISPLAY_READY' | 'DISPLAY_ERROR' | 'RESOLUTION_CHANGED' | 'VNC_RESTARTED';
  displayInfo: {
    displayNumber: number; // :1, :2, etc.
    resolution: { width: number; height: number; depth: number };
    vncEndpoint: { host: string; port: number };
    websocketEndpoint: { host: string; port: number };
  };
  processes: {
    xvfbPid?: number;
    x11vncPid?: number;
    fluxboxPid?: number;
  };
  error?: DisplayError;
}

interface DisplayError {
  code: 'XVFB_FAILED' | 'VNC_FAILED' | 'RESOLUTION_UNSUPPORTED' | 'PORT_CONFLICT';
  message: string;
  logs: string[];
}
```

**Self-Validation**:
```typescript
interface DisplaySelfValidation {
  // 1. Xvfb process is running and responsive
  xvfbHealth: {
    processRunning: boolean;
    displayAccessible: boolean;
    lastHeartbeat: string;
  };

  // 2. VNC server is accepting connections
  vncHealth: {
    listening: boolean;
    websocketListening: boolean;
    connectionTest: boolean;
  };

  // 3. Display resolution matches configuration
  resolutionCheck: {
    configured: { width: number; height: number };
    actual: { width: number; height: number };
    match: boolean;
  };

  // 4. Window manager is functional
  wmHealth: {
    processRunning: boolean;
    responsive: boolean;
  };

  // 5. Resource usage within limits
  resourceUsage: {
    memoryMb: number;
    cpuPercent: number;
    withinLimits: boolean;
  };
}
```

**Internal Implementation**:
```
┌────────────────────────────────────────────────────────────┐
│                   Display Manager Agent                     │
├────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐ │
│  │ Xvfb         │───►│ X11vnc       │───►│ noVNC        │ │
│  │ Controller   │    │ Controller   │    │ Controller   │ │
│  └──────────────┘    └──────────────┘    └──────────────┘ │
│         │                   │                   │          │
│         ▼                   ▼                   ▼          │
│  ┌──────────────────────────────────────────────────────┐ │
│  │           Health Monitor & Auto-Recovery              │ │
│  │                                                       │ │
│  │  - Process liveness checks (every 5s)                │ │
│  │  - Auto-restart on failure (max 3 attempts)          │ │
│  │  - Resolution validation                             │ │
│  │  - Resource monitoring                               │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                             │
└────────────────────────────────────────────────────────────┘
```

---

### 3. WebSocket Proxy Agent

**Purpose**: Proxies WebSocket connections between browser clients and VNC servers with authentication and rate limiting.

**Input Interface**:
```typescript
interface WebSocketProxyCommand {
  type: 'REGISTER_SESSION' | 'UNREGISTER_SESSION' | 'PROXY_CONNECTION' | 'GET_CONNECTION_STATS';
  sessionId: string;
  payload: {
    targetHost?: string;
    targetPort?: number;
    clientIp?: string;
    authToken?: string;
  };
}

interface WebSocketFrame {
  sessionId: string;
  direction: 'CLIENT_TO_SERVER' | 'SERVER_TO_CLIENT';
  data: Buffer;
  timestamp: string;
  opcode: number;
}
```

**Output Interface**:
```typescript
interface WebSocketProxyResult {
  sessionId: string;
  status: 'REGISTERED' | 'PROXYING' | 'CLOSED' | 'ERROR';
  connectionStats: {
    clientIp: string;
    connectedAt: string;
    bytesTransferred: { sent: number; received: number };
    framesTransferred: { sent: number; received: number };
    latencyMs: number;
    lastActivity: string;
  };
  error?: ProxyError;
}

interface ProxyError {
  code: 'AUTH_FAILED' | 'RATE_LIMITED' | 'TARGET_UNREACHABLE' | 'PROTOCOL_ERROR' | 'TIMEOUT';
  message: string;
  clientIp: string;
  retryAllowed: boolean;
}
```

**Self-Validation**:
- Connection latency stays below 100ms p99
- No frame drops during normal operation
- Authentication rejects invalid tokens 100% of the time
- Rate limiting enforced (max 100 frames/sec per connection)
- Clean disconnection handling (no orphaned connections)

**Rate Limiting Configuration**:
```typescript
interface RateLimitConfig {
  // Per-connection limits
  framesPerSecond: number;
  bytesPerSecond: number;
  
  // Per-session limits (all connections aggregate)
  maxConcurrentConnections: number;
  sessionBytesPerMinute: number;
  
  // Burst allowance
  burstFrames: number;
  burstWindowMs: number;
}
```

---

### 4. Session Monitor Agent

**Purpose**: Monitors session health, resource usage, and performance metrics with alerting capabilities.

**Input Interface**:
```typescript
interface MonitorCommand {
  type: 'START_MONITORING' | 'STOP_MONITORING' | 'GET_METRICS' | 'SET_ALERTS' | 'CHECK_HEALTH';
  sessionId: string;
  payload?: {
    alertThresholds?: AlertThresholds;
    metricTypes?: MetricType[];
    samplingIntervalMs?: number;
  };
}

type MetricType = 'CPU' | 'MEMORY' | 'DISK' | 'NETWORK' | 'PROCESS' | 'DISPLAY_LATENCY';

interface AlertThresholds {
  cpuPercent: number;      // Alert if CPU > threshold for 60s
  memoryPercent: number;   // Alert if memory > threshold
  diskPercent: number;     // Alert if disk > threshold
  latencyMs: number;       // Alert if VNC latency > threshold
  processCount: number;    // Alert if processes > threshold
}
```

**Output Interface**:
```typescript
interface MonitorResult {
  sessionId: string;
  timestamp: string;
  metrics: SessionMetrics;
  alerts: Alert[];
  health: 'HEALTHY' | 'DEGRADED' | 'CRITICAL' | 'UNKNOWN';
}

interface SessionMetrics {
  cpu: {
    usagePercent: number;
    loadAverage: [number, number, number];
    throttled: boolean;
  };
  memory: {
    usedBytes: number;
    totalBytes: number;
    usagePercent: number;
    swapUsedBytes: number;
  };
  disk: {
    usedBytes: number;
    totalBytes: number;
    usagePercent: number;
    ioReadBytes: number;
    ioWriteBytes: number;
  };
  network: {
    bytesIn: number;
    bytesOut: number;
    packetsIn: number;
    packetsOut: number;
  };
  display: {
    latencyMs: number;
    frameRate: number;
    droppedFrames: number;
  };
  processes: {
    totalCount: number;
    zombieCount: number;
    topProcesses: ProcessInfo[];
  };
}

interface Alert {
  id: string;
  severity: 'WARNING' | 'CRITICAL';
  metric: string;
  threshold: number;
  actualValue: number;
  timestamp: string;
  acknowledged: boolean;
}
```

**Self-Validation**:
- Metrics collection interval consistent (within 10% of configured)
- Alert firing latency < 5 seconds from threshold breach
- No false positives (verified against manual checks)
- Metric storage retention policy enforced
- Health check endpoint responds < 100ms

---

### 5. Clipboard Controller Agent

**Purpose**: Manages clipboard sharing between client and remote session with sanitization and size limits.

**Input Interface**:
```typescript
interface ClipboardCommand {
  type: 'COPY' | 'PASTE' | 'CLEAR' | 'GET_HISTORY' | 'SET_POLICY';
  sessionId: string;
  payload: {
    direction?: 'CLIENT_TO_SERVER' | 'SERVER_TO_CLIENT';
    content?: string;
    mimeType?: string;
    policy?: ClipboardPolicy;
  };
}

interface ClipboardPolicy {
  maxSizeBytes: number;
  allowedMimeTypes: string[];
  blockedPatterns: RegExp[]; // For PII detection
  enableHistory: boolean;
  historySize: number;
  auditEnabled: boolean;
}
```

**Output Interface**:
```typescript
interface ClipboardResult {
  sessionId: string;
  operation: string;
  success: boolean;
  content?: string;
  mimeType?: string;
  metadata: {
    sizeBytes: number;
    sanitized: boolean;
    truncated: boolean;
    timestamp: string;
  };
  history?: ClipboardEntry[];
  error?: ClipboardError;
}

interface ClipboardEntry {
  id: string;
  direction: 'CLIENT_TO_SERVER' | 'SERVER_TO_CLIENT';
  sizeBytes: number;
  mimeType: string;
  timestamp: string;
  hash: string; // For audit, not full content
}

interface ClipboardError {
  code: 'SIZE_EXCEEDED' | 'MIME_TYPE_BLOCKED' | 'PATTERN_MATCHED' | 'SANITIZATION_FAILED';
  message: string;
  blockedReason?: string;
}
```

**Self-Validation**:
- Clipboard size limits enforced (max 1MB)
- MIME type filtering blocks unauthorized types
- PII patterns detected and blocked (credit cards, SSNs)
- Sanitization removes executable content
- Audit log captures all clipboard operations
- History retention policy enforced

---

### 6. File Transfer Gatekeeper Agent

**Purpose**: Controls and audits file transfers between client and remote session with quarantine capabilities.

**Input Interface**:
```typescript
interface FileTransferCommand {
  type: 'UPLOAD_REQUEST' | 'DOWNLOAD_REQUEST' | 'SCAN_FILE' | 'GET_QUARANTINE_STATUS' | 'APPLY_POLICY';
  sessionId: string;
  payload: {
    fileId?: string;
    fileMetadata?: {
      filename: string;
      sizeBytes: number;
      mimeType: string;
      checksum: string;
    };
    policy?: FileTransferPolicy;
  };
}

interface FileTransferPolicy {
  maxFileSizeBytes: number;
  allowedExtensions: string[];
  blockedExtensions: string[];
  scanUploads: boolean;
  scanDownloads: boolean;
  quarantineSuspicious: boolean;
  maxTransferRateBytesPerSecond: number;
}
```

**Output Interface**:
```typescript
interface FileTransferResult {
  sessionId: string;
  operation: string;
  decision: 'ALLOWED' | 'DENIED' | 'QUARANTINED' | 'SCANNING';
  fileId?: string;
  metadata?: {
    originalName: string;
    storedName: string;
    sizeBytes: number;
    mimeType: string;
    checksum: string;
  };
  scanResult?: {
    scanner: string;
    status: 'CLEAN' | 'INFECTED' | 'SUSPICIOUS' | 'ERROR';
    threats?: string[];
    scannedAt: string;
  };
  quarantineInfo?: {
    quarantineId: string;
    reason: string;
    expiresAt: string;
  };
  error?: FileTransferError;
}

interface FileTransferError {
  code: 'SIZE_EXCEEDED' | 'EXTENSION_BLOCKED' | 'SCAN_FAILED' | 'QUOTA_EXCEEDED' | 'RATE_LIMITED';
  message: string;
  details?: Record<string, unknown>;
}
```

**Self-Validation**:
- File size limits enforced before transfer begins
- Extension blocking uses whitelist approach
- Virus scan completes before file release
- Quarantine system isolates suspicious files
- Transfer rate limiting prevents DoS
- All transfers logged with checksums

---

### 7. Recording Manager Agent

**Purpose**: Manages session recording (screen, terminal, commands) with configurable retention and storage.

**Input Interface**:
```typescript
interface RecordingCommand {
  type: 'START_RECORDING' | 'STOP_RECORDING' | 'PAUSE_RECORDING' | 'RESUME_RECORDING' | 'GET_RECORDING_STATUS';
  sessionId: string;
  payload?: {
    recordingTypes?: RecordingType[];
    storageConfig?: StorageConfiguration;
    quality?: RecordingQuality;
  };
}

type RecordingType = 'SCREEN' | 'TERMINAL' | 'COMMANDS' | 'KEYSTROKES';
type RecordingQuality = 'LOW' | 'MEDIUM' | 'HIGH';

interface StorageConfiguration {
  backend: 'S3' | 'R2' | 'LOCAL';
  bucket?: string;
  path: string;
  encryption: 'AES256' | 'aws:kms';
  retentionDays: number;
}
```

**Output Interface**:
```typescript
interface RecordingResult {
  sessionId: string;
  status: 'RECORDING' | 'PAUSED' | 'STOPPED' | 'ERROR';
  recordings: RecordingInfo[];
  storage: {
    totalBytes: number;
    storagePath: string;
    expiresAt: string;
  };
  error?: RecordingError;
}

interface RecordingInfo {
  type: RecordingType;
  status: 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'ERROR';
  startedAt: string;
  stoppedAt?: string;
  filePath?: string;
  fileSizeBytes?: number;
  durationSeconds?: number;
  metadata: {
    resolution?: { width: number; height: number };
    frameRate?: number;
    codec?: string;
  };
}

interface RecordingError {
  code: 'STORAGE_FULL' | 'ENCODING_ERROR' | 'PERMISSION_DENIED' | 'RESOURCE_EXHAUSTED';
  message: string;
  recoverable: boolean;
}
```

**Self-Validation**:
- Recording files are complete and playable
- Storage backend accessible and writable
- Retention policy automatically enforced
- Encryption applied to all recordings
- Disk usage stays below 80% of quota
- No gaps in recording timeline

---

### 8. Container Lifecycle Agent

**Purpose**: Manages Docker container operations (spawn, destroy, health check) for remote sessions.

**Input Interface**:
```typescript
interface ContainerLifecycleCommand {
  type: 'SPAWN' | 'DESTROY' | 'HEALTH_CHECK' | 'GET_STATS' | 'EXEC_COMMAND' | 'SIGNAL';
  sessionId: string;
  payload: {
    config?: ContainerSpawnConfig;
    command?: string[];
    signal?: 'SIGTERM' | 'SIGKILL';
    timeout?: number;
  };
}

interface ContainerSpawnConfig {
  image: string;
  resources: {
    cpuCount: number;
    memoryBytes: number;
    pidsLimit: number;
    diskBytes: number;
  };
  security: {
    readonlyRootfs: boolean;
    seccompProfile: string;
    apparmorProfile: string;
    capabilities: { drop: string[]; add: string[] };
  };
  network: {
    isolated: boolean;
    allowEgress: boolean;
    dnsServers: string[];
  };
  volumes: Array<{
    hostPath: string;
    containerPath: string;
    readOnly: boolean;
  }>;
}
```

**Output Interface**:
```typescript
interface ContainerLifecycleResult {
  sessionId: string;
  operation: string;
  success: boolean;
  containerInfo?: {
    containerId: string;
    networkId: string;
    ipAddress: string;
    ports: Record<string, number>;
    status: 'CREATED' | 'RUNNING' | 'PAUSED' | 'RESTARTING' | 'REMOVING' | 'EXITED' | 'DEAD';
    startedAt: string;
    health: 'STARTING' | 'HEALTHY' | 'UNHEALTHY' | 'NONE';
  };
  stats?: ContainerStats;
  execResult?: {
    exitCode: number;
    stdout: string;
    stderr: string;
  };
  error?: ContainerError;
}

interface ContainerStats {
  cpu: {
    usagePercent: number;
    systemUsage: number;
    onlineCpus: number;
  };
  memory: {
    usageBytes: number;
    limitBytes: number;
    usagePercent: number;
  };
  network: {
    rxBytes: number;
    txBytes: number;
    rxPackets: number;
    txPackets: number;
  };
  pids: {
    current: number;
    limit: number;
  };
}

interface ContainerError {
  code: 'IMAGE_NOT_FOUND' | 'RESOURCE_EXHAUSTED' | 'PERMISSION_DENIED' | 'NETWORK_ERROR' | 'TIMEOUT';
  message: string;
  dockerMessage?: string;
}
```

**Self-Validation**:
- Container spawn time < 10 seconds
- Health check passes within 30 seconds of spawn
- Resource limits enforced (CPU, memory, PIDs)
- Security profiles applied correctly
- Network isolation verified
- Clean shutdown on destroy (no orphaned containers)

---

### 9. Quality Monitor Agent

**Purpose**: Monitors connection quality and adapts display parameters for optimal user experience.

**Input Interface**:
```typescript
interface QualityCommand {
  type: 'START_MONITORING' | 'ANALYZE_CONNECTION' | 'ADAPT_QUALITY' | 'GET_QUALITY_REPORT';
  sessionId: string;
  payload?: {
    connectionStats?: ConnectionStats;
    adaptationPolicy?: AdaptationPolicy;
  };
}

interface ConnectionStats {
  latencyMs: number;
  jitterMs: number;
  packetLossPercent: number;
  bandwidthMbps: number;
  clientCapabilities: {
    maxResolution: { width: number; height: number };
    supportsWebGL: boolean;
    supportsWebCodecs: boolean;
  };
}

interface AdaptationPolicy {
  latencyThresholds: { low: number; high: number };
  packetLossThresholds: { low: number; high: number };
  bandwidthFloorMbps: number;
  adaptationSteps: QualityLevel[];
}
```

**Output Interface**:
```typescript
interface QualityResult {
  sessionId: string;
  qualityScore: number; // 0-100
  qualityLevel: QualityLevel;
  recommendations: AdaptationRecommendation[];
  appliedChanges?: DisplayConfigurationChange[];
  report?: QualityReport;
}

type QualityLevel = 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR' | 'CRITICAL';

interface AdaptationRecommendation {
  priority: number;
  action: 'REDUCE_RESOLUTION' | 'REDUCE_COLOR_DEPTH' | 'REDUCE_FRAME_RATE' | 'INCREASE_COMPRESSION' | 'ENABLE_DELTA_ONLY';
  reason: string;
  expectedImprovement: string;
}

interface DisplayConfigurationChange {
  parameter: string;
  previousValue: unknown;
  newValue: unknown;
  reason: string;
  timestamp: string;
}

interface QualityReport {
  periodStart: string;
  periodEnd: string;
  averageLatencyMs: number;
  maxLatencyMs: number;
  packetLossPercent: number;
  adaptationEvents: number;
  qualityDistribution: Record<QualityLevel, number>;
}
```

**Self-Validation**:
- Quality score calculation consistent with user experience
- Adaptations improve measured metrics
- No oscillation between quality levels (hysteresis)
- Bandwidth estimation accurate within 20%
- Client capability detection correct

---

### 10. Security Auditor Agent

**Purpose**: Comprehensive security auditing for all remote access activities with threat detection.

**Input Interface**:
```typescript
interface SecurityAuditCommand {
  type: 'LOG_EVENT' | 'ANALYZE_SESSION' | 'DETECT_ANOMALIES' | 'GENERATE_REPORT' | 'QUARANTINE_CHECK';
  sessionId?: string;
  payload: {
    event?: SecurityEvent;
    timeRange?: { start: string; end: string };
    reportType?: 'SESSION' | 'CANDIDATE' | 'SYSTEM';
  };
}

interface SecurityEvent {
  timestamp: string;
  sessionId: string;
  candidateId: string;
  eventType: SecurityEventType;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  details: Record<string, unknown>;
  sourceIp: string;
  userAgent: string;
}

type SecurityEventType =
  | 'SESSION_STARTED'
  | 'SESSION_ENDED'
  | 'AUTH_SUCCESS'
  | 'AUTH_FAILURE'
  | 'CLIPBOARD_OPERATION'
  | 'FILE_TRANSFER'
  | 'COMMAND_EXECUTED'
  | 'NETWORK_ACCESS'
  | 'PRIVILEGE_ESCALATION_ATTEMPT'
  | 'SUSPICIOUS_ACTIVITY'
  | 'POLICY_VIOLATION';
```

**Output Interface**:
```typescript
interface SecurityAuditResult {
  success: boolean;
  eventId?: string;
  analysis?: SecurityAnalysis;
  report?: SecurityReport;
  anomalies?: Anomaly[];
}

interface SecurityAnalysis {
  sessionId: string;
  riskScore: number; // 0-100
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  findings: SecurityFinding[];
  recommendations: string[];
}

interface SecurityFinding {
  type: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  description: string;
  evidence: Record<string, unknown>;
  timestamp: string;
}

interface Anomaly {
  id: string;
  type: string;
  confidence: number;
  description: string;
  relatedEvents: string[];
  detectedAt: string;
}

interface SecurityReport {
  period: { start: string; end: string };
  summary: {
    totalSessions: number;
    totalEvents: number;
    criticalEvents: number;
    anomaliesDetected: number;
    averageRiskScore: number;
  };
  topFindings: SecurityFinding[];
  trends: Array<{
    metric: string;
    change: number;
    direction: 'IMPROVING' | 'WORSENING' | 'STABLE';
  }>;
}
```

**Self-Validation**:
- All security events logged with tamper-proof signatures
- Anomaly detection has < 1% false positive rate
- Audit log retention policy enforced
- Report generation completes within 30 seconds
- Log integrity verified on each read

---

## Inter-Agent Communication

### Event Bus (Redis Pub/Sub)

```typescript
// Event Schema
interface RemoteAccessEvent {
  eventId: string;
  eventType: RemoteAccessEventType;
  sourceAgent: string;
  targetAgent?: string; // Broadcast if undefined
  sessionId: string;
  payload: unknown;
  timestamp: string;
  correlationId: string;
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL';
}

// Event Types
const REMOTE_ACCESS_EVENTS = {
  // Session Lifecycle Events
  'SESSION_INITIATED': 'session.initiated',
  'SESSION_PROVISIONED': 'session.provisioned',
  'SESSION_ACTIVATED': 'session.activated',
  'SESSION_EXPIRING': 'session.expiring',
  'SESSION_TERMINATED': 'session.terminated',
  
  // Display Events
  'DISPLAY_READY': 'display.ready',
  'DISPLAY_ERROR': 'display.error',
  'RESOLUTION_CHANGED': 'display.resolution.changed',
  
  // WebSocket Events
  'WS_CLIENT_CONNECTED': 'websocket.client.connected',
  'WS_CLIENT_DISCONNECTED': 'websocket.client.disconnected',
  'WS_FRAME_PROXIED': 'websocket.frame.proxied',
  'WS_RATE_LIMITED': 'websocket.rate.limited',
  
  // Monitoring Events
  'METRICS_COLLECTED': 'monitor.metrics.collected',
  'ALERT_TRIGGERED': 'monitor.alert.triggered',
  'HEALTH_CHECK_FAILED': 'monitor.health.failed',
  
  // Clipboard Events
  'CLIPBOARD_OPERATION': 'clipboard.operation',
  'CLIPBOARD_BLOCKED': 'clipboard.blocked',
  
  // File Transfer Events
  'FILE_UPLOAD_STARTED': 'file.upload.started',
  'FILE_UPLOAD_COMPLETED': 'file.upload.completed',
  'FILE_BLOCKED': 'file.blocked',
  'FILE_QUARANTINED': 'file.quarantined',
  
  // Recording Events
  'RECORDING_STARTED': 'recording.started',
  'RECORDING_STOPPED': 'recording.stopped',
  'RECORDING_ERROR': 'recording.error',
  
  // Container Events
  'CONTAINER_SPAWNED': 'container.spawned',
  'CONTAINER_HEALTHY': 'container.healthy',
  'CONTAINER_UNHEALTHY': 'container.unhealthy',
  'CONTAINER_DESTROYED': 'container.destroyed',
  
  // Quality Events
  'QUALITY_ADAPTED': 'quality.adapted',
  'QUALITY_DEGRADED': 'quality.degraded',
  
  // Security Events
  'SECURITY_VIOLATION': 'security.violation',
  'ANOMALY_DETECTED': 'security.anomaly.detected',
} as const;
```

### Message Flow Examples

#### Session Initialization Flow

```
┌──────────────────────────────────────────────────────────────────────────┐
│                    Session Initialization Saga                            │
└──────────────────────────────────────────────────────────────────────────┘

Candidate requests session
        │
        ▼
┌───────────────┐
│  Session      │────► Session Orchestrator Agent
│  Orchestrator │      INITIATE_SESSION
└───────────────┘
        │
        ▼
┌───────────────┐
│  Container    │────► Container Lifecycle Agent
│  Lifecycle    │      SPAWN
└───────────────┘
        │ containerId
        ▼
┌───────────────┐
│  Display      │────► Display Manager Agent
│  Manager      │      START_DISPLAY
└───────────────┘
        │ displayReady
        ▼
┌───────────────┐
│  WebSocket    │────► WebSocket Proxy Agent
│  Proxy        │      REGISTER_SESSION
└───────────────┘
        │ registered
        ▼
┌───────────────┐
│  Session      │────► Session Orchestrator Agent
│  Monitor      │      START_MONITORING
└───────────────┘
        │ monitoring
        ▼
┌───────────────┐
│  Recording    │────► Recording Manager Agent (optional)
│  Manager      │      START_RECORDING
└───────────────┘
        │
        ▼
   Return session
   info to candidate
```

#### Real-Time Quality Adaptation Flow

```
┌──────────────────────────────────────────────────────────────────────────┐
│                    Quality Adaptation Flow                                │
└──────────────────────────────────────────────────────────────────────────┘

Continuous monitoring
        │
        ▼
┌───────────────┐     high latency detected
│  Quality      │─────────────────────────────┐
│  Monitor      │                             │
└───────────────┘                             ▼
        │                           ┌───────────────┐
        │                           │  Quality      │
        │                           │  Monitor      │
        │                           │  Agent        │
        │                           └───────────────┘
        │                                   │
        │ analyze                           ▼
        │                           ┌───────────────┐
        │                           │  Analyze      │
        │                           │  Connection   │
        │                           └───────────────┘
        │                                   │
        │ recommendation                    ▼
        │                           ┌───────────────┐
        │                           │  Recommend    │
        │                           │  Adaptation   │
        │                           │  (reduce res) │
        │                           └───────────────┘
        │                                   │
        └───────────────────────────────────┘
        │
        ▼
┌───────────────┐
│  Display      │────► Display Manager Agent
│  Manager      │      SET_RESOLUTION
└───────────────┘
        │
        ▼
┌───────────────┐
│  Event Bus    │────► QUALITY_ADAPTED event
└───────────────┘
```

#### Security Violation Response Flow

```
┌──────────────────────────────────────────────────────────────────────────┐
│                    Security Violation Response                            │
└──────────────────────────────────────────────────────────────────────────┘

Suspicious activity detected
        │
        ▼
┌───────────────┐
│  Security     │────► Security Auditor Agent
│  Auditor      │      LOG_EVENT (SUSPICIOUS_ACTIVITY)
└───────────────┘
        │
        ▼
┌───────────────┐
│  Analyze      │
│  Risk Score   │
└───────────────┘
        │
        ├──► Risk Score < 50: Log only
        │
        ├──► Risk Score 50-80: Alert admin
        │
        └──► Risk Score > 80: Trigger response
                    │
                    ▼
            ┌───────────────┐
            │  Session      │────► Session Orchestrator Agent
            │  Orchestrator │      TERMINATE_SESSION (security)
            └───────────────┘
                    │
                    ▼
            ┌───────────────┐
            │  Container    │────► Container Lifecycle Agent
            │  Lifecycle    │      DESTROY
            └───────────────┘
                    │
                    ▼
            ┌───────────────┐
            │  Event Bus    │────► SECURITY_VIOLATION event
            └───────────────┘
                    │
                    ▼
            Notify security team
```

---

## Self-Validation Criteria

### Per-Agent Validation

| Agent | Validation Check | Frequency | Failure Action |
|-------|-----------------|-----------|----------------|
| Session Orchestrator | Session state consistency | Every transition | Rollback + alert |
| Session Orchestrator | Container cleanup verification | Every destroy | Retry + manual alert |
| Display Manager | Xvfb process liveness | Every 5s | Auto-restart |
| Display Manager | VNC connectivity | Every 10s | Restart VNC |
| WebSocket Proxy | Connection leak detection | Every 60s | Force close stale |
| WebSocket Proxy | Latency p99 < 100ms | Continuous | Alert + adapt |
| Session Monitor | Metric collection interval | Every sample | Backfill + alert |
| Session Monitor | Alert firing latency < 5s | Every alert | Escalate if missed |
| Clipboard Controller | Size limit enforcement | Every operation | Block + log |
| Clipboard Controller | PII pattern detection | Every operation | Block + alert |
| File Transfer Gatekeeper | Scan completion before release | Every file | Quarantine |
| File Transfer Gatekeeper | Transfer rate limiting | Continuous | Throttle |
| Recording Manager | File completeness check | Every stop | Retry + alert |
| Recording Manager | Storage quota monitoring | Every minute | Pause recording |
| Container Lifecycle | Spawn time < 10s | Every spawn | Retry + alert |
| Container Lifecycle | Health check pass < 30s | Every spawn | Destroy + retry |
| Quality Monitor | Quality score accuracy | Hourly | Recalibrate |
| Quality Monitor | Adaptation effectiveness | After each change | Rollback if worse |
| Security Auditor | Log tamper detection | Every read | Alert + investigate |
| Security Auditor | Anomaly false positive rate | Daily | Retrain model |

### Cross-Agent Validation

```typescript
interface CrossAgentValidation {
  // 1. Session state consistency across agents
  sessionStateConsistency: {
    orchestratorState: SessionStatus;
    containerState: ContainerStatus;
    displayState: DisplayStatus;
    allMatch: boolean;
  };

  // 2. Resource accounting accuracy
  resourceAccounting: {
    monitorReported: ResourceUsage;
    containerStats: ResourceUsage;
    variancePercent: number;
    acceptable: boolean;
  };

  // 3. Event ordering consistency
  eventOrdering: {
    events: RemoteAccessEvent[];
    timestampsMonotonic: boolean;
    causalityPreserved: boolean;
  };

  // 4. Security policy enforcement
  securityPolicyEnforcement: {
    clipboardViolationsBlocked: boolean;
    fileTransfersScanned: boolean;
    suspiciousActivityLogged: boolean;
  };
}
```

---

## Implementation Phases

### Phase 1: Core Infrastructure (Week 1)

| Priority | Agent | Dependencies | Files |
|----------|-------|--------------|-------|
| 1 | Container Lifecycle Agent | None | `/src/lib/agents/container-lifecycle.ts` |
| 2 | Display Manager Agent | Container Lifecycle | `/src/lib/agents/display-manager.ts` |
| 3 | Session Orchestrator Agent | Container, Display | `/src/lib/agents/session-orchestrator.ts` |
| 4 | Event Bus | None | `/src/lib/agents/event-bus.ts` |

### Phase 2: Connectivity (Week 2)

| Priority | Agent | Dependencies | Files |
|----------|-------|--------------|-------|
| 5 | WebSocket Proxy Agent | Session Orchestrator | `/src/lib/agents/websocket-proxy.ts` |
| 6 | Session Monitor Agent | All core agents | `/src/lib/agents/session-monitor.ts` |
| 7 | Access Control Agent | Session Orchestrator | `/src/lib/agents/access-control.ts` |

### Phase 3: Features (Week 3)

| Priority | Agent | Dependencies | Files |
|----------|-------|--------------|-------|
| 8 | Clipboard Controller Agent | WebSocket Proxy | `/src/lib/agents/clipboard-controller.ts` |
| 9 | File Transfer Gatekeeper Agent | Session Monitor | `/src/lib/agents/file-transfer-gatekeeper.ts` |
| 10 | Quality Monitor Agent | Session Monitor | `/src/lib/agents/quality-monitor.ts` |

### Phase 4: Compliance (Week 4)

| Priority | Agent | Dependencies | Files |
|----------|-------|--------------|-------|
| 11 | Recording Manager Agent | Session Orchestrator | `/src/lib/agents/recording-manager.ts` |
| 12 | Security Auditor Agent | All agents | `/src/lib/agents/security-auditor.ts` |

---

## Critical Integration Points

| From Agent | To Agent | Purpose | Failure Mode |
|------------|----------|---------|--------------|
| Session Orchestrator | Container Lifecycle | Spawn/destroy containers | Retry with different host |
| Session Orchestrator | Display Manager | Start/stop displays | Mark session failed |
| Session Orchestrator | WebSocket Proxy | Register/unregister sessions | Manual cleanup required |
| WebSocket Proxy | Display Manager | VNC connection info | Use cached config |
| Session Monitor | Session Orchestrator | Alert on issues | Direct notification |
| Session Monitor | Quality Monitor | Resource metrics | Degrade gracefully |
| Clipboard Controller | Security Auditor | Audit all operations | Buffer locally |
| File Transfer Gatekeeper | Security Auditor | Scan results | Quarantine file |
| Quality Monitor | Display Manager | Adaptation commands | Log only |
| All Agents | Security Auditor | Security events | Buffer locally, retry |

---

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Session spawn time | < 10s | Time from request to ready |
| VNC latency p99 | < 500ms | Round-trip frame update |
| WebSocket proxy latency | < 100ms | Frame forwarding time |
| Session availability | 99.9% | Uptime excluding maintenance |
| Container spawn success | > 99% | Successful spawns / total |
| Clipboard operation latency | < 50ms | Copy/paste response time |
| File scan throughput | > 10/min | Files scanned per minute |
| Recording completeness | 100% | No gaps in recordings |
| Security event detection | < 5s | Time from event to log |
| Quality adaptation time | < 30s | Time to adapt to network changes |
| Cross-agent error rate | < 0.1% | Failed inter-agent calls |

---

## Critical Files for Implementation

- `/src/lib/agents/session-orchestrator.ts` - Core session lifecycle coordination and state management
- `/src/lib/agents/display-manager.ts` - Xvfb and VNC server management with health monitoring
- `/src/lib/agents/websocket-proxy.ts` - WebSocket proxy with authentication and rate limiting
- `/src/lib/agents/container-lifecycle.ts` - Docker container spawn/destroy/health operations
- `/src/lib/agents/session-monitor.ts` - Resource and performance monitoring with alerting
