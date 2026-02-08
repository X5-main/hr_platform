# HR Candidate Screening Platform - Implementation Plan

## 1. Restated Requirements

### Phase 1: Initial Screening
- **Authentication**: Email-based magic link authentication for candidates
- **Profile Management**: Candidates provide LinkedIn, GitHub, Google Scholar, and other professional social accounts
- **Company Portal**: Display company information, culture, and available positions
- **Application System**: Candidates browse and apply to specific positions
- **AI Voice Screening Interview**:
  - ElevenLabs API integration for conversational AI agent
  - Dynamic question generation based on position requirements
  - Real-time answer collection and classification
  - 0-1 relevance scoring algorithm with configurable threshold
  - Async processing with 10-minute delayed result calculation
  - Automated email notifications (pass/fail to next round)

### Phase 2: Technical Interview (Engineers Only)
- **Isolated Development Environment**: Docker-based per-candidate sandbox
- **Remote Access**: Browser-based screen sharing + collaborative text editor
- **Project-Based Assessment**: 30-60 minute build session on candidate's chosen idea
- **AI-Native Evaluation**: Assess candidate's proficiency with AI-assisted development
- **Pre-configured Tooling**: Claude Code instance, IDE, terminal, common dev tools
- **Security Architecture**:
  - Complete container isolation (no host access)
  - No API keys or sensitive data in environment
  - Network isolation (no outbound connections to sensitive services)
  - Session ephemerality (no persistence between sessions)
  - One-time use (no session continuation)

---

## 2. Implementation Phases

### Phase 1: Foundation (Weeks 1-2)
**Goal**: Core platform infrastructure and authentication

| Component | Description | Priority |
|-----------|-------------|----------|
| Database Schema | Users, Positions, Applications, Interviews tables | High |
| Auth System | Email magic link authentication | High |
| Candidate Profile | Social account linking (LinkedIn, GitHub, Scholar) | High |
| Company Portal | Static company info, position listings | High |
| Application API | CRUD for job applications | High |
| Email Service | Transactional email infrastructure | High |

### Phase 2: AI Screening (Weeks 3-4)
**Goal**: Voice-based interview system with classification

| Component | Description | Priority |
|-----------|-------------|----------|
| ElevenLabs Integration | Voice AI agent for interviews | High |
| Interview Orchestration | Question flow management | High |
| Answer Storage | Transcript and audio recording persistence | High |
| Classification Engine | NLP-based relevance scoring (0-1) | High |
| Async Job Queue | 10-minute delayed processing | High |
| Result Notification | Pass/fail email dispatch | High |

### Phase 3: Virtual Environment (Weeks 5-7)
**Goal**: Secure, isolated development sandbox

| Component | Description | Priority |
|-----------|-------------|----------|
| Container Orchestration | Docker/Docker Compose per session | High |
| Session Manager | Spawn/destroy isolated environments | High |
| Remote Desktop | Browser-based access (noVNC or similar) | High |
| IDE Integration | Web-based code editor (Theia/VS Code Server) | High |
| Claude Code Pre-install | Pre-configured AI assistant | High |
| Security Hardening | Network isolation, resource limits, secrets management | Critical |

### Phase 4: Integration & Polish (Week 8)
**Goal**: End-to-end testing and deployment

| Component | Description | Priority |
|-----------|-------------|----------|
| End-to-End Testing | Full candidate journey validation | High |
| Monitoring & Logging | Session tracking, error alerting | Medium |
| Admin Dashboard | Review candidate results, manage positions | Medium |
| Documentation | API docs, deployment guides | Medium |

---

## 3. Technical Dependencies

### Core Stack Recommendation

```
Frontend: Next.js 14 (App Router) + TypeScript + Tailwind CSS
Backend: Next.js API Routes + tRPC or REST
Database: PostgreSQL (via Supabase or self-hosted)
ORM: Prisma
Auth: NextAuth.js with email provider
Queue: BullMQ (Redis-based) for async processing
Storage: AWS S3 or Cloudflare R2 for audio files
Email: Resend or SendGrid
```

### External API Dependencies

| Service | Purpose | Integration Complexity |
|---------|---------|----------------------|
| ElevenLabs | Voice AI agent | Medium - REST API, WebSocket for streaming |
| LinkedIn API | Profile verification | Medium - OAuth 2.0, limited API access |
| GitHub API | Repository/activity fetch | Low - Well-documented REST API |
| Google Scholar | Academic credentials | High - No official API, scraping required |

### Infrastructure Dependencies

| Component | Purpose | Complexity |
|-----------|---------|------------|
| Docker Engine | Container runtime | Medium |
| Kubernetes (optional) | Container orchestration at scale | High |
| Redis | Job queue, session state | Low |
| WebSocket Server | Real-time interview communication | Medium |
| TURN/STUN Servers | WebRTC for screen sharing (if needed) | Medium |

---

## 4. Risk Assessment

### HIGH RISK

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Virtual Environment Security** | Data breach, unauthorized access, crypto mining | Run containers in isolated VPC, strict resource limits, no outbound internet, audit logging, short session TTL (60 min max) |
| **ElevenLabs API Reliability** | Interview flow interruption | Implement fallback to text-based chat, circuit breaker pattern, retry logic |
| **Classification Accuracy** | False positives/negatives in screening | Human review pipeline for borderline cases, continuous model improvement, threshold tuning |
| **Session Hijacking** | Unauthorized environment access | Short-lived JWT tokens, IP binding, session fingerprinting |

### MEDIUM RISK

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Container Spawn Time** | Poor candidate experience | Pre-warm container pool, optimize image size |
| **Concurrent Session Limits** | Platform unavailability | Auto-scaling, queue-based session allocation, capacity planning |
| **Audio Storage Costs** | High AWS bills | Compression, retention policies, selective storage |
| **LinkedIn API Changes** | Profile verification breaks | Graceful degradation, manual verification fallback |

### LOW RISK

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Email Deliverability** | Candidates don't receive results | Use transactional email services, SPF/DKIM setup |
| **Browser Compatibility** | Some candidates can't access | Test on major browsers, fallback options |

---

## 5. Complexity Estimation

### Overall Complexity: **HIGH**

| Phase | Complexity | Effort Estimate | Key Challenges |
|-------|-----------|-----------------|----------------|
| Phase 1: Foundation | Medium | 2 weeks | Auth flow, database design |
| Phase 2: AI Screening | High | 2 weeks | ElevenLabs integration, async processing, classification algorithm |
| Phase 3: Virtual Environment | **Very High** | 3 weeks | Container security, remote desktop performance, Claude Code integration |
| Phase 4: Integration | Medium | 1 week | End-to-end testing, edge cases |

### Most Complex Components (in order)

1. **Secure Container Isolation** - Requires deep Docker security knowledge, seccomp profiles, AppArmor/SELinux
2. **Real-time Voice Interview** - WebSocket management, ElevenLabs streaming, interruption handling
3. **Classification Engine** - NLP model selection, training data, threshold optimization
4. **Remote Desktop Performance** - Low-latency screen sharing, bandwidth optimization

---

## 6. Architecture Decisions

### Decision 1: Container Orchestration

**Option A: Docker Compose per session (Recommended for MVP)**
- Pros: Simpler to implement, faster development, lower cost
- Cons: Limited scalability, manual resource management
- **Choose for**: Initial launch, <100 concurrent sessions

**Option B: Kubernetes with custom operator**
- Pros: Auto-scaling, self-healing, enterprise-grade
- Cons: High complexity, steep learning curve, expensive
- **Choose for**: Scale >100 concurrent sessions, enterprise requirements

### Decision 2: Remote Desktop Technology

**Option A: noVNC + Xvfb (Recommended)**
- Pros: Browser-native (WebSocket), no client install, well-documented
- Cons: Performance overhead, limited to Linux environments
- **Implementation**: Docker container with Xvfb, x11vnc, noVNC client

**Option B: Apache Guacamole**
- Pros: Protocol agnostic (RDP, VNC, SSH), enterprise features
- Cons: Java-based, heavier infrastructure

**Option C: Custom WebRTC solution**
- Pros: Best performance, peer-to-peer options
- Cons: Complex implementation, TURN server costs

### Decision 3: Classification Approach

**Option A: Rule-based scoring (Recommended for MVP)**
- Pros: Explainable, fast to implement, no training data needed
- Cons: Less nuanced, requires manual tuning
- **Implementation**: Keyword matching, experience level scoring, answer completeness

**Option B: LLM-based evaluation**
- Pros: More nuanced understanding, can handle open-ended answers
- Cons: Higher latency, API costs, potential inconsistency
- **Implementation**: GPT-4/Claude API calls with structured output

**Option C: Fine-tuned model**
- Pros: Best accuracy, optimized for domain
- Cons: Requires training data, expensive to develop
- **Choose for**: Post-MVP when you have labeled data

### Decision 4: Database Strategy

**Schema Overview:**

```typescript
// Core entities
User { id, email, profile, socialAccounts, createdAt }
Position { id, title, description, requirements, isActive }
Application { id, userId, positionId, status, createdAt }

// Interview entities
ScreeningInterview { id, applicationId, status, startedAt, completedAt }
InterviewResponse { id, interviewId, question, answer, audioUrl, score }
ClassificationResult { id, interviewId, overallScore, passed, processedAt }

// Technical interview entities
TechnicalSession { id, applicationId, containerId, status, startedAt, endedAt }
SessionRecording { id, sessionId, recordingUrl, events }
```

---

## 7. Security Architecture for Virtual Environment

This is the most critical and complex component. Here is the recommended security model:

```
┌─────────────────────────────────────────────────────────────┐
│                    Candidate Browser                        │
└───────────────────────┬─────────────────────────────────────┘
                        │ WebSocket (WSS)
┌───────────────────────▼─────────────────────────────────────┐
│                 Session Gateway (Auth)                      │
│  - JWT validation                                           │
│  - Rate limiting                                            │
│  - Session routing                                          │
└───────────────────────┬─────────────────────────────────────┘
                        │
┌───────────────────────▼─────────────────────────────────────┐
│              Isolated Docker Network (per session)          │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Candidate Container                                │    │
│  │  ┌─────────────────────────────────────────────┐    │    │
│  │  │  Ubuntu Base + Dev Tools                    │    │    │
│  │  │  ┌─────────┐  ┌─────────┐  ┌────────────┐  │    │    │
│  │  │  │  VS Code│  │Terminal │  │Claude Code │  │    │    │
│  │  │  │  Server │  │         │  │            │  │    │    │
│  │  │  └─────────┘  └─────────┘  └────────────┘  │    │    │
│  │  │  ┌─────────┐                               │    │    │
│  │  │  │  noVNC  │ ← Browser access point        │    │    │
│  │  │  └─────────┘                               │    │    │
│  │  └─────────────────────────────────────────────┘    │    │
│  │                                                     │    │
│  │  Security Controls:                                 │    │
│  │  - No CAP_SYS_ADMIN (no docker-in-docker)          │    │
│  │  - Read-only root filesystem                       │    │
│  │  - No network egress to internal services          │    │
│  │  - Resource limits (CPU: 2 cores, RAM: 4GB)        │    │
│  │  - 60-minute hard kill                             │    │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

### Security Checklist

- [ ] Containers run as non-root user
- [ ] Seccomp profile restricting dangerous syscalls
- [ ] AppArmor/SELinux profiles
- [ ] No access to Docker socket
- [ ] Network policies blocking internal service access
- [ ] Resource quotas enforced
- [ ] Read-only root filesystem
- [ ] Dropped Linux capabilities
- [ ] No sensitive env vars passed to container
- [ ] Session recordings encrypted at rest
- [ ] Automatic container cleanup after session

---

## 8. Integration Points

```
┌──────────────────────────────────────────────────────────────┐
│                     Frontend (Next.js)                       │
└──────────────┬───────────────────────────────┬───────────────┘
               │                               │
    ┌──────────▼──────────┐         ┌──────────▼──────────┐
    │   REST API Layer    │         │   WebSocket Layer   │
    └──────────┬──────────┘         └──────────┬──────────┘
               │                               │
    ┌──────────▼──────────┐         ┌──────────▼──────────┐
    │   Business Logic    │         │  Real-time Services │
    │   - Auth            │         │  - Interview Chat   │
    │   - Applications    │         │  - Screen Share     │
    │   - Classifications │         │                     │
    └──────────┬──────────┘         └──────────┬──────────┘
               │                               │
    ┌──────────▼──────────┐         ┌──────────▼──────────┐
    │   External APIs     │         │   Container Service │
    │   - ElevenLabs      │         │   - Docker API      │
    │   - Email Service   │         │   - Session Mgmt    │
    │   - LinkedIn/GitHub │         │   - Recording       │
    └─────────────────────┘         └─────────────────────┘
```

---

## 9. Open Questions for User Confirmation

**Before proceeding with implementation:**

1. **Architecture Approval**: Does this architecture meet your requirements?
2. **Technology Preferences**:
   - Hosting preference (AWS/GCP/Vercel/self-hosted)?
   - Database preference (Supabase/neon/self-hosted PostgreSQL)?
   - Email service preference (Resend/SendGrid/AWS SES)?
3. **Scale Requirements**: What is your expected concurrent user load for the virtual environment?
4. **Existing Infrastructure**: Do you have existing infrastructure (VPC, Kubernetes cluster) to leverage?
5. **Budget Constraints**: Any budget limitations for third-party APIs (ElevenLabs, LLM classification)?
6. **Compliance Requirements**: Any data privacy regulations (GDPR, CCPA) to consider for candidate data?

---

## 10. Critical Files for Implementation

Priority order for file creation:

1. `/infrastructure/docker/candidate-sandbox/Dockerfile` - Core container definition for isolated dev environment with security hardening
2. `/src/lib/container-service.ts` - Docker API integration for spawn/destroy session lifecycle management
3. `/src/app/api/interviews/[id]/classify/route.ts` - Classification endpoint that processes interview answers and returns 0-1 relevance score
4. `/src/lib/elevenlabs.ts` - ElevenLabs API client with WebSocket streaming for voice interviews
5. `/prisma/schema.prisma` - Database schema defining User, Position, Application, Interview, and TechnicalSession entities
6. `/src/app/api/sessions/route.ts` - API endpoints for technical session management (create, destroy, status)
7. `/src/components/interview/VoiceInterface.tsx` - React component for ElevenLabs voice interview UI
8. `/src/lib/classification.ts` - Classification algorithm implementation (rule-based or LLM-based)
9. `/src/lib/email.ts` - Email service integration for notifications
10. `/infrastructure/docker-compose.yml` - Local development orchestration

---

*Generated by Claude Code - Everything Claude Code Plugin*
*Plan Status: Awaiting user confirmation before implementation*
