# Implementation Plan: Monitoring & Observability

## Overview

This plan details a comprehensive monitoring and observability strategy for the HR Candidate Screening Platform, balancing production-ready reliability with cost-effectiveness for a startup budget.

---

## 1. Architecture Overview

### 1.1 Monitoring Stack

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         MONITORING ARCHITECTURE                         │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                              │
│  │ Next.js  │  │  BullMQ  │  │  Docker  │                              │
│  │   App    │  │ Workers  │  │ Sandbox  │                              │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘                              │
│       │             │             │                                    │
│       └─────────────┼─────────────┘                                    │
│                     ▼                                                  │
│       ┌─────────────────────────┐                                      │
│       │  OpenTelemetry Collector │                                      │
│       └────────────┬────────────┘                                      │
│                    │                                                   │
│       ┌────────────┼────────────┐                                      │
│       ▼            ▼            ▼                                      │
│  ┌────────┐  ┌────────┐  ┌──────────┐                                 │
│  │ Grafana│  │  Loki  │  │Prometheus│                                 │
│  │Dashboards│  │ Logs  │  │ Metrics  │                                 │
│  └────────┘  └────────┘  └──────────┘                                 │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    EXTERNAL MONITORING                          │   │
│  │  ┌────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐          │   │
│  │  │ Sentry │  │UptimeKuma│  │  Checkly │  │ Better   │          │   │
│  │  │(Errors)│  │(Uptime)  │  │   (E2E)  │  │  Stack   │          │   │
│  │  └────────┘  └──────────┘  └──────────┘  └──────────┘          │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Technology Selection

| Component | Tool | Cost/Month |
|-----------|------|------------|
| Error Tracking | Sentry | $0 (free tier) |
| Log Aggregation | Self-hosted Loki | $0 |
| Metrics | Self-hosted Prometheus + Grafana | $0 |
| Tracing | Self-hosted Tempo | $0 |
| Uptime Monitoring | Uptime Kuma | $0 |
| E2E Monitoring | Checkly | $29 |
| **Total** | | **~$29** |

---

## 2. Application Logging

### 2.1 Structured Logger

```typescript
// src/lib/logger.ts

import { createLogger, format, transports } from 'winston';
import { v4 as uuidv4 } from 'uuid';
import { AsyncLocalStorage } from 'async_hooks';

const asyncLocalStorage = new AsyncLocalStorage<Map<string, string>>();

const sensitiveFields = [
  'password', 'token', 'apiKey', 'api_key', 'secret', 'authorization',
  'cookie', 'session', 'creditCard', 'ssn', 'email', 'phone',
];

export const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  defaultMeta: {
    service: 'hr-screening-platform',
    environment: process.env.NODE_ENV || 'development',
    version: process.env.APP_VERSION || 'unknown',
  },
  format: format.combine(
    format.timestamp({ format: 'ISO8601' }),
    format.errors({ stack: true }),
    format.json()
  ),
  transports: [
    new transports.Console({
      stderrLevels: ['error', 'fatal'],
    }),
  ],
});

export function getContextualLogger(context: Record<string, unknown> = {}) {
  const store = asyncLocalStorage.getStore();
  return logger.child({
    correlationId: context.correlationId || store?.get('correlationId') || uuidv4(),
    ...context,
  });
}

export { asyncLocalStorage };
```

### 2.2 Request Logging Middleware

```typescript
// src/middleware/request-logger.ts

import { NextRequest, NextResponse } from 'next/server';
import { getContextualLogger } from '@/lib/logger';

export function requestLoggerMiddleware(request: NextRequest) {
  const startTime = Date.now();
  const correlationId = request.headers.get('x-correlation-id') || crypto.randomUUID();

  const logger = getContextualLogger({
    correlationId,
    path: request.nextUrl.pathname,
    method: request.method,
  });

  logger.info('Incoming request', {
    query: Object.fromEntries(request.nextUrl.searchParams),
  });

  return { correlationId, startTime, logger };
}
```

---

## 3. Metrics Collection

### 3.1 Application Metrics

```typescript
// src/lib/metrics.ts

import { Counter, Histogram, Gauge, Registry } from 'prom-client';

export const appRegistry = new Registry();

export const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [appRegistry],
});

export const httpRequestDurationSeconds = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [appRegistry],
});

// Business metrics
export const applicationsSubmittedTotal = new Counter({
  name: 'applications_submitted_total',
  help: 'Total job applications submitted',
  labelNames: ['position_id'],
  registers: [appRegistry],
});

export const screeningScores = new Histogram({
  name: 'screening_scores',
  help: 'Distribution of screening scores',
  labelNames: ['position_id'],
  buckets: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0],
  registers: [appRegistry],
});

export const activeContainers = new Gauge({
  name: 'active_containers',
  help: 'Number of active Docker containers',
  registers: [appRegistry],
});
```

### 3.2 Metrics Endpoint

```typescript
// src/app/api/metrics/route.ts

import { NextResponse } from 'next/server';
import { appRegistry } from '@/lib/metrics';
import { register } from 'prom-client';

export async function GET() {
  const metrics = await register.metrics();
  return new NextResponse(metrics, {
    headers: { 'Content-Type': register.contentType },
  });
}
```

---

## 4. Alerting Configuration

### 4.1 Prometheus Alert Rules

```yaml
# /infrastructure/config/alert-rules.yml

groups:
  - name: application
    interval: 30s
    rules:
      - alert: HighErrorRate
        expr: |
          (
            sum(rate(http_requests_total{status_code=~"5.."}[5m]))
            /
            sum(rate(http_requests_total[5m]))
          ) > 0.05
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "High error rate detected"
          description: "Error rate is {{ $value | humanizePercentage }}"

      - alert: HighLatency
        expr: |
          histogram_quantile(0.95,
            sum(rate(http_request_duration_seconds_bucket[5m])) by (le, route)
          ) > 2
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High latency on {{ $labels.route }}"

      - alert: ServiceDown
        expr: up == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Service {{ $labels.job }} is down"

  - name: queue
    interval: 30s
    rules:
      - alert: QueueDepthHigh
        expr: queue_depth{status="waiting"} > 1000
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Queue {{ $labels.queue }} has high depth"

      - alert: QueueProcessingStalled
        expr: |
          rate(queue_jobs_total{status="completed"}[10m]) == 0
          and queue_depth{status="waiting"} > 0
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "Queue processing appears stalled"
```

### 4.2 Alertmanager Configuration

```yaml
# /infrastructure/config/alertmanager.yml

global:
  smtp_from: 'alerts@your-domain.com'
  slack_api_url: '${SLACK_WEBHOOK_URL}'

route:
  receiver: 'default'
  group_by: ['alertname', 'severity']
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 4h
  routes:
    - match:
        severity: critical
      receiver: 'critical'
      group_wait: 0s

receivers:
  - name: 'default'
    slack_configs:
      - channel: '#alerts'
        send_resolved: true

  - name: 'critical'
    slack_configs:
      - channel: '#critical-alerts'
        title: 'CRITICAL: {{ .GroupLabels.alertname }}'
        text: '{{ range .Alerts }}{{ .Annotations.description }}{{ end }}'
        send_resolved: true
```

---

## 5. Health Checks

### 5.1 Health Check Endpoint

```typescript
// src/app/api/health/route.ts

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { Redis } from 'ioredis';

interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  checks: {
    database: { status: string; responseTimeMs: number };
    redis: { status: string; responseTimeMs: number };
  };
}

export async function GET(request: Request) {
  const checks = {
    database: await checkDatabase(),
    redis: await checkRedis(),
  };

  const statuses = Object.values(checks).map(c => c.status);
  let status: HealthCheckResult['status'] = 'healthy';
  if (statuses.includes('down')) status = 'unhealthy';
  else if (statuses.includes('degraded')) status = 'degraded';

  const result: HealthCheckResult = {
    status,
    timestamp: new Date().toISOString(),
    checks,
  };

  return NextResponse.json(result, {
    status: status === 'healthy' ? 200 : status === 'degraded' ? 200 : 503,
  });
}

async function checkDatabase() {
  const start = Date.now();
  try {
    const supabase = createClient();
    await supabase.from('profiles').select('id').limit(1);
    return { status: 'up', responseTimeMs: Date.now() - start };
  } catch (error) {
    return { status: 'down', responseTimeMs: Date.now() - start };
  }
}

async function checkRedis() {
  const start = Date.now();
  const redis = new Redis(process.env.REDIS_URL!, { connectTimeout: 5000 });
  try {
    await redis.ping();
    return { status: 'up', responseTimeMs: Date.now() - start };
  } catch {
    return { status: 'down', responseTimeMs: Date.now() - start };
  } finally {
    redis.disconnect();
  }
}
```

---

## 6. Distributed Tracing

### 6.1 OpenTelemetry Configuration

```typescript
// src/lib/tracing.ts

import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { FetchInstrumentation } from '@opentelemetry/instrumentation-fetch';

const sdk = new NodeSDK({
  resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: 'hr-screening-platform',
    [SemanticResourceAttributes.SERVICE_VERSION]: process.env.APP_VERSION || 'unknown',
  }),
  traceExporter: new OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4317',
  }),
  instrumentations: [
    new HttpInstrumentation(),
    new FetchInstrumentation(),
  ],
});

sdk.start();

process.on('SIGTERM', () => {
  sdk.shutdown().then(() => process.exit(0));
});
```

---

## 7. Dashboard Specifications

### 7.1 Platform Overview Dashboard

| Panel | Query | Type |
|-------|-------|------|
| Request Rate | `sum(rate(http_requests_total[5m]))` | Graph |
| Error Rate | `sum(rate(http_requests_total{status_code=~"5.."}[5m])) / sum(rate(http_requests_total[5m]))` | Stat |
| P95 Latency | `histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le))` | Graph |
| Applications Today | `sum(increase(applications_submitted_total[24h]))` | Stat |
| Screenings Completed | `sum(increase(screening_interviews_total{status="completed"}[24h]))` | Stat |

### 7.2 Candidate Funnel Dashboard

| Panel | Description |
|-------|-------------|
| Funnel View | Applications started → submitted → screened → passed → technical |
| Conversion Rates | Percentage at each stage |
| Drop-off Points | Where candidates abandon |
| Time to Complete | Average time between stages |
| Score Distribution | Heatmap of screening scores |

### 7.3 System Health Dashboard

| Panel | Data Source |
|-------|-------------|
| Service Status | Health check endpoint |
| Database Connections | `pg_stat_activity_count` |
| Redis Memory | `redis_used_memory_bytes` |
| Queue Depth | `queue_depth` |
| Container Resources | cAdvisor metrics |

---

## 8. Docker Compose Monitoring Stack

```yaml
# /infrastructure/docker-compose.monitoring.yml

version: '3.8'

services:
  loki:
    image: grafana/loki:2.9.0
    ports:
      - "3100:3100"
    volumes:
      - ./config/loki-config.yml:/etc/loki/local-config.yaml
      - loki-data:/loki

  grafana:
    image: grafana/grafana:10.2.0
    ports:
      - "3000:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=${GRAFANA_ADMIN_PASSWORD:-admin}
    volumes:
      - grafana-data:/var/lib/grafana

  prometheus:
    image: prom/prometheus:v2.47.0
    ports:
      - "9090:9090"
    volumes:
      - ./config/prometheus.yml:/etc/prometheus/prometheus.yml
      - prometheus-data:/prometheus

  tempo:
    image: grafana/tempo:2.3.0
    ports:
      - "3200:3200"
      - "4317"

  alertmanager:
    image: prom/alertmanager:v0.26.0
    ports:
      - "9093:9093"
    volumes:
      - ./config/alertmanager.yml:/etc/alertmanager/alertmanager.yml

  uptime-kuma:
    image: louislam/uptime-kuma:1.23.0
    ports:
      - "3001:3001"
    volumes:
      - uptime-kuma-data:/app/data

volumes:
  loki-data:
  grafana-data:
  prometheus-data:
  uptime-kuma-data:
```

---

## 9. Implementation Phases

### Phase 1: Foundation (Week 1)

| Task | Effort |
|------|--------|
| Set up Sentry project | 2h |
| Implement structured logging | 4h |
| Create health endpoints | 4h |
| Deploy Uptime Kuma | 2h |

### Phase 2: Metrics & Dashboards (Week 2)

| Task | Effort |
|------|--------|
| Deploy Prometheus + Grafana | 4h |
| Implement application metrics | 6h |
| Create business metrics | 4h |
| Build core dashboards | 6h |

### Phase 3: Advanced Observability (Week 3)

| Task | Effort |
|------|--------|
| Deploy OpenTelemetry + Tempo | 4h |
| Implement tracing | 8h |
| Set up queue monitoring | 4h |
| Configure Alertmanager | 4h |

### Phase 4: Refinement (Week 4)

| Task | Effort |
|------|--------|
| Set up Checkly synthetic monitoring | 4h |
| Fine-tune alert thresholds | 4h |
| Create on-call rotation | 2h |
| Document runbooks | 4h |

---

## 10. Critical Files for Implementation

- `/src/lib/logger.ts` - Structured logging with correlation IDs
- `/src/lib/metrics.ts` - Prometheus metrics definitions
- `/src/app/api/health/route.ts` - Health check endpoint
- `/infrastructure/docker-compose.monitoring.yml` - Monitoring stack
- `/infrastructure/config/alert-rules.yml` - Prometheus alert rules
