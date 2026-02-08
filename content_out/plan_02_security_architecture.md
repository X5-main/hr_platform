# Implementation Plan: Security Architecture

## Overview

This plan details a comprehensive security architecture for the HR Candidate Screening Platform, covering authentication, authorization, container security, data protection, and compliance across all components.

---

## 1. Security Layers Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         SECURITY ARCHITECTURE                           │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  LAYER 7: Application Security                                  │   │
│  │  ├─ Input validation (Zod)                                      │   │
│  │  ├─ CSRF protection                                             │   │
│  │  ├─ Security headers (CSP, HSTS)                                │   │
│  │  └─ Rate limiting                                               │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  LAYER 6: API Security                                          │   │
│  │  ├─ JWT token management                                        │   │
│  │  ├─ API key rotation                                            │   │
│  │  ├─ Webhook signature verification                              │   │
│  │  └─ Request signing                                             │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  LAYER 5: Database Security                                     │   │
│  │  ├─ Row Level Security (RLS)                                    │   │
│  │  ├─ Connection encryption (TLS)                                 │   │
│  │  ├─ Query parameterization                                      │   │
│  │  └─ Audit logging                                               │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  LAYER 4: Container Security                                    │   │
│  │  ├─ Seccomp profiles                                            │   │
│  │  ├─ AppArmor/SELinux                                            │   │
│  │  ├─ Read-only root filesystem                                   │   │
│  │  ├─ Non-root execution                                          │   │
│  │  └─ Network isolation                                            │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  LAYER 3: Network Security                                      │   │
│  │  ├─ TLS 1.3 for all traffic                                     │   │
│  │  ├─ VPC/network segmentation                                    │   │
│  │  ├─ DDoS protection                                             │   │
│  │  └─ WAF rules                                                   │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  LAYER 2: Secrets Management                                    │   │
│  │  ├─ Environment variables                                       │   │
│  │  ├─ Secret rotation                                             │   │
│  │  ├─ No secrets in code/images                                   │   │
│  │  └─ Development/production separation                           │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  LAYER 1: Infrastructure Security                               │   │
│  │  ├─ OS hardening                                                │   │
│  │  ├─ Automated security updates                                  │   │
│  │  ├─ Log aggregation                                             │   │
│  │  └─ Backup encryption                                           │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Row Level Security (RLS) Policies

### 2.1 Profiles Table

```sql
-- Enable RLS
alter table profiles enable row level security;

-- Users can view their own profile
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  TO authenticated
  USING (id = auth.uid());

-- Users can update their own profile
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (id = auth.uid());

-- Company staff can view candidate profiles for their applications
CREATE POLICY "Staff can view applicant profiles"
  ON profiles FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM applications a
      JOIN positions p ON a.position_id = p.id
      JOIN company_staff cs ON p.company_id = cs.company_id
      WHERE a.profile_id = profiles.id
      AND cs.profile_id = auth.uid()
    )
  );
```

### 2.2 Applications Table

```sql
-- Enable RLS
alter table applications enable row level security;

-- Users can view their own applications
CREATE POLICY "Users can view own applications"
  ON applications FOR SELECT
  TO authenticated
  USING (profile_id = auth.uid());

-- Users can create applications
CREATE POLICY "Users can create applications"
  ON applications FOR INSERT
  TO authenticated
  WITH CHECK (profile_id = auth.uid());

-- Users can update their draft applications only
CREATE POLICY "Users can update draft applications"
  ON applications FOR UPDATE
  TO authenticated
  USING (profile_id = auth.uid() AND status = 'started');

-- Company staff can view applications for their positions
CREATE POLICY "Staff can view position applications"
  ON applications FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM positions p
      JOIN company_staff cs ON p.company_id = cs.company_id
      WHERE p.id = applications.position_id
      AND cs.profile_id = auth.uid()
    )
  );

-- Company staff can update application status
CREATE POLICY "Staff can update application status"
  ON applications FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM positions p
      JOIN company_staff cs ON p.company_id = cs.company_id
      WHERE p.id = applications.position_id
      AND cs.profile_id = auth.uid()
      AND cs.role IN ('admin', 'recruiter')
    )
  );
```

### 2.3 Screening Interviews Table

```sql
-- Enable RLS
alter table screening_interviews enable row level security;

-- Users can view their own interviews
CREATE POLICY "Users can view own interviews"
  ON screening_interviews FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM applications a
      WHERE a.id = screening_interviews.application_id
      AND a.profile_id = auth.uid()
    )
  );

-- Users can update their pending interviews
CREATE POLICY "Users can update pending interviews"
  ON screening_interviews FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM applications a
      WHERE a.id = screening_interviews.application_id
      AND a.profile_id = auth.uid()
      AND screening_interviews.status = 'pending'
    )
  );

-- Company staff can view interviews for their applications
CREATE POLICY "Staff can view interviews"
  ON screening_interviews FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM applications a
      JOIN positions p ON a.position_id = p.id
      JOIN company_staff cs ON p.company_id = cs.company_id
      WHERE a.id = screening_interviews.application_id
      AND cs.profile_id = auth.uid()
    )
  );
```

### 2.4 Technical Sessions Table

```sql
-- Enable RLS
alter table technical_sessions enable row level security;

-- Users can view their own technical sessions
CREATE POLICY "Users can view own technical sessions"
  ON technical_sessions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM applications a
      WHERE a.id = technical_sessions.application_id
      AND a.profile_id = auth.uid()
    )
  );

-- Users can only update sessions they own that are pending
CREATE POLICY "Users can update pending sessions"
  ON technical_sessions FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM applications a
      WHERE a.id = technical_sessions.application_id
      AND a.profile_id = auth.uid()
      AND technical_sessions.status = 'pending'
    )
  );
```

---

## 3. Container Hardening Checklist

### 3.1 Dockerfile Security

```dockerfile
# Multi-stage build for minimal attack surface
FROM node:20-alpine AS builder

# Install dependencies
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

# Production image
FROM node:20-alpine

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -u 1001

# Set working directory
WORKDIR /app

# Copy dependencies from builder
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules

# Copy application code
COPY --chown=nextjs:nodejs . .

# Build application
RUN npm run build

# Remove dev dependencies and unnecessary files
RUN rm -rf src tests *.md .git

# Set read-only root filesystem
RUN chmod -R 555 /app && \
    mkdir -p /tmp && chmod 777 /tmp

# Switch to non-root user
USER nextjs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node healthcheck.js

# Run application
CMD ["npm", "start"]
```

### 3.2 Docker Compose Security

```yaml
version: '3.8'

services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
    read_only: true
    user: "1001:1001"
    security_opt:
      - no-new-privileges:true
      - seccomp:./seccomp-profile.json
      - apparmor:docker-default
    cap_drop:
      - ALL
    cap_add:
      - CHOWN
      - SETGID
      - SETUID
    tmpfs:
      - /tmp:noexec,nosuid,size=100m
    networks:
      - app-network
    environment:
      - NODE_ENV=production
    deploy:
      resources:
        limits:
          cpus: '1.0'
          memory: 512M
        reservations:
          cpus: '0.25'
          memory: 128M

  candidate-sandbox:
    image: candidate-sandbox:latest
    read_only: true
    user: "1000:1000"
    security_opt:
      - no-new-privileges:true
      - seccomp:./seccomp-sandbox.json
      - apparmor:candidate-sandbox
    cap_drop:
      - ALL
    networks:
      - isolated-network
    deploy:
      resources:
        limits:
          cpus: '2.0'
          memory: 4G
          pids: 100
```

### 3.3 Seccomp Profile

```json
{
  "defaultAction": "SCMP_ACT_ERRNO",
  "syscalls": [
    {
      "names": [
        "accept", "accept4", "access", "adjtimex", "alarm", "bind",
        "brk", "capget", "capset", "chdir", "chmod", "chown", "chown32",
        "clock_adjtime", "clock_adjtime64", "clock_getres", "clock_gettime",
        "clock_gettime64", "clock_nanosleep", "clone", "clone3", "close",
        "close_range", "connect", "copy_file_range", "creat", "dup", "dup2",
        "dup3", "epoll_create", "epoll_create1", "epoll_ctl", "epoll_ctl_old",
        "epoll_pwait", "epoll_pwait2", "epoll_wait", "epoll_wait_old",
        "eventfd", "eventfd2", "execve", "execveat", "exit", "exit_group",
        "faccessat", "faccessat2", "fadvise64", "fadvise64_64", "fallocate",
        "fanotify_mark", "fchdir", "fchmod", "fchmodat", "fchown", "fchown32",
        "fchownat", "fcntl", "fcntl64", "fdatasync", "fgetxattr", "flistxattr",
        "flock", "fork", "fremovexattr", "fsetxattr", "fstat", "fstat64",
        "fstatat64", "fstatfs", "fstatfs64", "fsync", "ftruncate",
        "ftruncate64", "futex", "futex_time64", "getcpu", "getcwd", "getdents",
        "getdents64", "getegid", "getegid32", "geteuid", "geteuid32",
        "getgid", "getgid32", "getgroups", "getgroups32", "getitimer",
        "getpeername", "getpgid", "getpgrp", "getpid", "getppid",
        "getpriority", "getrandom", "getresgid", "getresgid32", "getresuid",
        "getresuid32", "getrlimit", "get_robust_list", "getrusage", "getsid",
        "getsockname", "getsockopt", "get_thread_area", "gettid", "gettimeofday",
        "getuid", "getuid32", "getxattr", "inotify_add_watch", "inotify_init",
        "inotify_init1", "inotify_rm_watch", "io_cancel", "ioctl", "io_destroy",
        "io_getevents", "io_getevents_time64", "io_pgetevents",
        "io_pgetevents_time64", "ioprio_get", "ioprio_set", "io_setup",
        "io_submit", "io_uring_enter", "io_uring_register", "io_uring_setup",
        "ipc", "kill", "lchown", "lchown32", "lgetxattr", "link", "linkat",
        "listen", "listxattr", "llistxattr", "lremovexattr", "lseek", "lsetxattr",
        "lstat", "lstat64", "madvise", "membarrier", "memfd_create",
        "mincore", "mkdir", "mkdirat", "mknod", "mknodat", "mlock",
        "mlock2", "mlockall", "mmap", "mmap2", "mprotect", "mq_getsetattr",
        "mq_notify", "mq_open", "mq_timedreceive", "mq_timedreceive_time64",
        "mq_timedsend", "mq_timedsend_time64", "mq_unlink", "mremap", "msgctl",
        "msgget", "msgrcv", "msgsnd", "msync", "munlock", "munlockall",
        "munmap", "nanosleep", "newfstatat", "open", "openat", "openat2",
        "pause", "pidfd_open", "pidfd_send_signal", "pipe", "pipe2", "pivot_root",
        "poll", "ppoll", "ppoll_time64", "prctl", "pread64", "preadv",
        "preadv2", "prlimit64", "pselect6", "pselect6_time64", "pwrite64",
        "pwritev", "pwritev2", "read", "readahead", "readdir", "readlink",
        "readlinkat", "readv", "recv", "recvfrom", "recvmmsg", "recvmmsg_time64",
        "recvmsg", "remap_file_pages", "removexattr", "rename", "renameat",
        "renameat2", "restart_syscall", "rmdir", "rseq", "rt_sigaction",
        "rt_sigpending", "rt_sigprocmask", "rt_sigqueueinfo", "rt_sigreturn",
        "rt_sigsuspend", "rt_sigtimedwait", "rt_sigtimedwait_time64",
        "rt_tgsigqueueinfo", "sched_getaffinity", "sched_getattr",
        "sched_getparam", "sched_get_priority_max", "sched_get_priority_min",
        "sched_getscheduler", "sched_rr_get_interval", "sched_rr_get_interval_time64",
        "sched_setaffinity", "sched_setattr", "sched_setparam", "sched_setscheduler",
        "sched_yield", "seccomp", "select", "semctl", "semget", "semop",
        "semtimedop", "semtimedop_time64", "send", "sendfile", "sendfile64",
        "sendmmsg", "sendmsg", "sendto", "setfsgid", "setfsgid32", "setfsuid",
        "setfsuid32", "setgid", "setgid32", "setgroups", "setgroups32",
        "setitimer", "setpgid", "setpriority", "setregid", "setregid32",
        "setresgid", "setresgid32", "setresuid", "setresuid32", "setreuid",
        "setreuid32", "setrlimit", "set_robust_list", "setsid", "setsockopt",
        "set_thread_area", "set_tid_address", "setuid", "setuid32", "setxattr",
        "shmat", "shmctl", "shmdt", "shmget", "shutdown", "sigaltstack",
        "signalfd", "signalfd4", "sigpending", "sigprocmask", "sigreturn",
        "socket", "socketcall", "socketpair", "splice", "stat", "stat64",
        "statfs", "statfs64", "statx", "symlink", "symlinkat", "sync",
        "sync_file_range", "syncfs", "sysinfo", "tee", "tgkill", "time",
        "timer_create", "timer_delete", "timer_getoverrun", "timer_gettime",
        "timer_gettime64", "timer_settime", "timer_settime64", "timerfd_create",
        "timerfd_gettime", "timerfd_gettime64", "timerfd_settime",
        "timerfd_settime64", "times", "tkill", "truncate", "truncate64",
        "ugetrlimit", "umask", "uname", "unlink", "unlinkat", "utime",
        "utimensat", "utimensat_time64", "utimes", "vfork", "wait4", "waitid",
        "waitpid", "write", "writev"
      ],
      "action": "SCMP_ACT_ALLOW"
    }
  ]
}
```

### 3.4 AppArmor Profile

```
#include <tunables/global>

profile candidate-sandbox flags=(attach_disconnected,mediate_deleted) {
  #include <abstractions/base>

  # Deny all capabilities
  deny capability,

  # Allow basic networking
  network inet stream,
  network inet6 stream,

  # Allow specific binaries
  /usr/bin/node ix,
  /usr/bin/code-server ix,
  /usr/bin/tini ix,

  # Allow working directory
  /workspace/** rwk,

  # Allow temp files
  /tmp/** rw,

  # Deny sensitive system files
  deny /etc/shadow r,
  deny /etc/passwd r,
  deny /proc/** w,
  deny /sys/** w,
  deny /dev/** w,
}
```

---

## 4. Rate Limiting Strategy

### 4.1 Redis-Based Rate Limiter

```typescript
// src/lib/rate-limiter.ts

import { Redis } from 'ioredis';

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

const RATE_LIMITS: Record<string, RateLimitConfig> = {
  'auth.login': { windowMs: 15 * 60 * 1000, maxRequests: 5 },
  'auth.magic-link': { windowMs: 60 * 60 * 1000, maxRequests: 3 },
  'application.submit': { windowMs: 24 * 60 * 60 * 1000, maxRequests: 10 },
  'interview.start': { windowMs: 60 * 60 * 1000, maxRequests: 3 },
  'api.general': { windowMs: 60 * 1000, maxRequests: 100 },
  'api.admin': { windowMs: 60 * 1000, maxRequests: 200 },
};

export class RateLimiter {
  private redis: Redis;

  constructor(redisUrl: string) {
    this.redis = new Redis(redisUrl);
  }

  async checkLimit(
    key: string,
    category: keyof typeof RATE_LIMITS
  ): Promise<{ allowed: boolean; remaining: number; resetTime: number }> {
    const config = RATE_LIMITS[category];
    const now = Date.now();
    const windowStart = Math.floor(now / config.windowMs) * config.windowMs;
    const redisKey = `ratelimit:${category}:${key}:${windowStart}`;

    const current = await this.redis.incr(redisKey);
    if (current === 1) {
      await this.redis.pexpire(redisKey, config.windowMs);
    }

    const remaining = Math.max(0, config.maxRequests - current);
    const resetTime = windowStart + config.windowMs;

    return {
      allowed: current <= config.maxRequests,
      remaining,
      resetTime,
    };
  }

  async close(): Promise<void> {
    await this.redis.quit();
  }
}
```

### 4.2 Middleware Implementation

```typescript
// src/middleware/rate-limit.ts

import { NextRequest, NextResponse } from 'next/server';
import { RateLimiter } from '@/lib/rate-limiter';

const limiter = new RateLimiter(process.env.REDIS_URL!);

export async function rateLimitMiddleware(
  request: NextRequest,
  category: string
): Promise<NextResponse | null> {
  const ip = request.ip ?? 'anonymous';
  const result = await limiter.checkLimit(ip, category as any);

  if (!result.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      {
        status: 429,
        headers: {
          'X-RateLimit-Limit': String(RATE_LIMITS[category].maxRequests),
          'X-RateLimit-Remaining': String(result.remaining),
          'X-RateLimit-Reset': String(result.resetTime),
          'Retry-After': String(Math.ceil((result.resetTime - Date.now()) / 1000)),
        },
      }
    );
  }

  return null;
}
```

---

## 5. Secrets Management

### 5.1 Environment Variables

```bash
# .env.example - Template for required secrets

# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
SUPABASE_JWT_SECRET=your-jwt-secret

# Database
DATABASE_URL=postgresql://user:password@host:5432/db

# Redis
REDIS_URL=redis://localhost:6379

# External APIs
ELEVENLABS_API_KEY=sk_...
RESEND_API_KEY=re_...

# Webhook Secrets
RESEND_WEBHOOK_SECRET=whsec_...
ELEVENLABS_WEBHOOK_SECRET=whsec_...

# Encryption
ENCRYPTION_KEY=base64-encoded-32-byte-key

# Session
SESSION_SECRET=random-string-min-32-chars
```

### 5.2 Secret Rotation Strategy

| Secret Type | Rotation Frequency | Procedure |
|-------------|-------------------|-----------|
| API Keys | Quarterly | Generate new, update in Doppler, restart services, revoke old |
| JWT Secrets | Every 6 months | Gradual rotation with dual verification window |
| Database Credentials | Annually | Create new user, migrate connections, revoke old |
| Webhook Secrets | After any incident | Immediate rotation with service restart |
| Encryption Keys | Every 2 years | Re-encrypt data with new key, maintain key history |

---

## 6. Security Headers and CSP

### 6.1 Next.js Security Headers

```typescript
// next.config.js

const securityHeaders = [
  {
    key: 'X-DNS-Prefetch-Control',
    value: 'on',
  },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  {
    key: 'X-Frame-Options',
    value: 'SAMEORIGIN',
  },
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff',
  },
  {
    key: 'Referrer-Policy',
    value: 'origin-when-cross-origin',
  },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=()',
  },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' blob: data:",
      "font-src 'self'",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.elevenlabs.io https://api.resend.com",
      "frame-src 'self'",
      "media-src 'self' blob:",
      "worker-src 'self' blob:",
    ].join('; '),
  },
];

module.exports = {
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
};
```

---

## 7. Incident Response

### 7.1 Severity Levels

| Level | Criteria | Response Time | Examples |
|-------|----------|---------------|----------|
| P1 - Critical | Complete service outage, data breach | 15 minutes | Database compromised, all containers crashing |
| P2 - High | Major functionality impaired | 1 hour | Email delivery failing, interview system down |
| P3 - Medium | Partial functionality issues | 4 hours | Classification delays, minor UI issues |
| P4 - Low | Cosmetic issues, monitoring alerts | 24 hours | Dashboard glitches, log warnings |

### 7.2 Incident Response Checklist

**Container Escape Detected:**
- [ ] Immediately terminate all active candidate sessions
- [ ] Isolate affected container host
- [ ] Capture forensic logs and container state
- [ ] Assess scope of potential data access
- [ ] Notify security team and legal if PII accessed
- [ ] Review seccomp/AppArmor logs for attack vector
- [ ] Patch and redeploy with hardened configuration

**Data Breach Suspected:**
- [ ] Immediately revoke all active sessions
- [ ] Enable enhanced audit logging
- [ ] Identify scope of affected data
- [ ] Preserve logs for forensic analysis
- [ ] Notify affected users within 72 hours (GDPR)
- [ ] Engage legal counsel
- [ ] Prepare public disclosure if required

---

## 8. Compliance Considerations

### 8.1 GDPR Requirements

| Requirement | Implementation |
|-------------|----------------|
| Lawful basis | Consent via terms of service |
| Data minimization | Only collect job-relevant data |
| Right to access | Export profile and applications |
| Right to erasure | Delete account and all data |
| Data portability | JSON export of profile |
| Breach notification | 72-hour internal process |

### 8.2 CCPA Requirements

- **Notice**: Privacy policy at collection point
- **Access**: User dashboard with all collected data
- **Deletion**: Account deletion within 45 days
- **Opt-out**: No sale of personal information (certified)
- **Non-discrimination**: Equal service regardless of privacy choices

---

## 9. Critical Files for Implementation

- `/src/lib/rate-limiter.ts` - Redis-based rate limiting
- `/src/middleware/rate-limit.ts` - Rate limiting middleware
- `/supabase/migrations/*_rls_policies.sql` - Database RLS policies
- `/infrastructure/docker/seccomp-*.json` - Seccomp security profiles
- `/infrastructure/docker/apparmor-*.profile` - AppArmor profiles
- `/infrastructure/docker-compose.security.yml` - Hardened container config
- `/next.config.js` - Security headers configuration
