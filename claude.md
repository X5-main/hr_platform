# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

HR Candidate Screening Platform - An AI-powered platform for screening job candidates:

- **Phase 1 (Screening)**: Candidates login via email, provide social profiles (LinkedIn, GitHub, Scholar), browse positions, and complete an AI voice interview using ElevenLabs. Answers are classified (0-1 relevance score) with async processing (10-min delay) and email notifications.
- **Phase 2 (Technical)**: Engineers access an isolated Docker environment (30-60 min session) with remote desktop, VS Code, and pre-configured Claude Code to build a project while being evaluated on AI-native development skills.

## Architecture

### Core Components

1. **Web Application** (Next.js 14, App Router, TypeScript)
   - Candidate portal: auth, profile, position browsing, application submission
   - Interview interface: ElevenLabs WebSocket integration for voice AI
   - Admin dashboard: review candidates, manage positions, view results

2. **Classification Service**
   - Async job queue (BullMQ + Redis) for 10-minute delayed processing
   - NLP-based scoring (0-1 relevance) with configurable threshold
   - Email service integration for pass/fail notifications

3. **Container Orchestration** (Docker)
   - Per-candidate isolated environments spawned on-demand
   - noVNC + Xvfb for browser-based remote desktop
   - Pre-installed: VS Code Server, terminal, Claude Code
   - Security: non-root user, read-only root fs, network isolation, 60-min hard kill

4. **Database** (PostgreSQL via Prisma)
   - Core entities: User, Position, Application, ScreeningInterview, TechnicalSession
   - Interview responses stored with audio URLs (S3/R2)
   - Classification results linked to applications

### Key Integration Points

- **ElevenLabs API**: Voice AI agent for screening interviews (WebSocket streaming)
- **LinkedIn/GitHub APIs**: Profile verification and data fetching
- **Email Service**: Transactional emails (Resend/SendGrid)
- **Docker API**: Container lifecycle management (spawn/destroy/monitor)
- **Object Storage**: Audio recordings and session recordings

## Development Commands

Since this is a greenfield project, these commands will be available after setup:

```bash
# Install dependencies
npm install

# Development server
npm run dev

# Build
npm run build

# Testing
npm test                    # Run all tests
npm test -- path/to/test    # Run single test file
npm run test:watch          # Watch mode
npm run test:coverage       # Coverage report

# Linting
npm run lint
npm run lint:fix

# Database
npx prisma migrate dev      # Run migrations
npx prisma generate         # Generate client
npx prisma studio           # Open Prisma Studio

# Docker (for sandbox environment)
docker build -f infrastructure/docker/candidate-sandbox/Dockerfile -t candidate-sandbox .
docker-compose -f infrastructure/docker-compose.yml up
```

## Code Organization

- **200-400 lines typical, 800 max per file**
- Organize by feature/domain, not by type
- High cohesion, low coupling

```
src/
|-- app/                    # Next.js app router
|   |-- (auth)/             # Auth routes (login, callback)
|   |-- (portal)/           # Candidate portal
|   |-- api/                # API routes
|   |-- admin/              # Admin dashboard
|-- components/             # Reusable UI components
|-- hooks/                  # Custom React hooks
|-- lib/                    # Utility libraries
|   |-- elevenlabs.ts       # ElevenLabs API client
|   |-- container-service.ts # Docker container management
|   |-- classification.ts   # Scoring algorithm
|-- types/                  # TypeScript definitions
infrastructure/
|-- docker/
|   |-- candidate-sandbox/  # Dockerfile for isolated env
|-- docker-compose.yml
prisma/
|-- schema.prisma
```

## Key Patterns

### API Response Format

```typescript
interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
}
```

### Error Handling

```typescript
try {
  const result = await operation()
  return { success: true, data: result }
} catch (error) {
  console.error('Operation failed:', error)
  return { success: false, error: 'User-friendly message' }
}
```

### Database Schema (Prisma)

```prisma
model User {
  id            String    @id @default(cuid())
  email         String    @unique
  profile       Json?
  applications  Application[]
}

model Application {
  id                  String              @id @default(cuid())
  userId              String
  positionId          String
  status              ApplicationStatus
  screeningInterview  ScreeningInterview?
  technicalSession    TechnicalSession?
}
```

## Code Style

- No emojis in code, comments, or documentation
- Immutability always - never mutate objects or arrays
- No console.log in production code
- Input validation with Zod

## Testing Requirements

- **TDD: Write tests first**
- **80% minimum coverage**
- Unit tests for utilities
- Integration tests for API routes
- E2E tests for critical flows (Playwright)

## Security Considerations

- Environment variables for all secrets (ElevenLabs API, DB URL, etc.)
- Container security: no CAP_SYS_ADMIN, read-only root fs, network isolation
- Session tokens: short-lived JWT with IP binding
- Input validation on all user inputs
- No sensitive data in Docker images

## Git Workflow

- Conventional commits: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`
- Branch from main, PR required for merge
- All tests must pass before merge

## Folder Conventions

- `content_in/` - Input materials and planning documents (source context)
- `content_out/` - AI-generated output (separate from input)
- `media/` - Raw video/audio files (large binaries, do not process unless instructed)

## Available Skills

This project uses the `everything-claude-code` plugin. Available commands:

- `/plan` - Create implementation plan before coding
- `/tdd` - Test-driven development workflow
- `/code-review` - Review code quality
- `/build-fix` - Fix build errors

## Environment Variables

```bash
# Required
DATABASE_URL=
ELEVENLABS_API_KEY=
REDIS_URL=
EMAIL_API_KEY=

# Optional
DEBUG=false
CLASSIFICATION_THRESHOLD=0.7
SESSION_TIMEOUT_MINUTES=60
```
