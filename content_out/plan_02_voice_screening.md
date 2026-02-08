# AI Voice Screening Interview Component - Implementation Plan

## 1. ElevenLabs Integration Architecture

### 1.1 Core Integration Components

**ElevenLabs Client (`/src/lib/elevenlabs.ts`)**

The ElevenLabs integration requires a robust client that handles both REST API calls and WebSocket streaming for real-time conversational AI.

```typescript
// Core client structure
interface ElevenLabsClient {
  // Agent Management
  createAgent(config: AgentConfig): Promise<Agent>
  updateAgent(agentId: string, config: Partial<AgentConfig>): Promise<Agent>
  deleteAgent(agentId: string): Promise<void>

  // WebSocket Streaming
  createConversationStream(agentId: string): WebSocketConnection

  // Conversation Management
  getConversation(conversationId: string): Promise<Conversation>
  endConversation(conversationId: string): Promise<void>
}

interface AgentConfig {
  name: string
  systemPrompt: string
  voiceId: string
  model: 'eleven_flash_v2_5' | 'eleven_multilingual_v2'
  temperature: number
  maxTokens: number
  language: string
  customQuestions?: string[]
}
```

**Key Integration Points:**

1. **Agent Configuration per Position**: Each job position will have a dedicated ElevenLabs agent with custom system prompts tailored to the role requirements
2. **Dynamic Question Injection**: Questions are injected into the conversation context based on the position's screening criteria
3. **Conversation State Management**: Track conversation state (started, in-progress, completed, error) in the database
4. **Fallback Handling**: Implement circuit breaker pattern for API failures with fallback to text-based interview

**WebSocket Architecture:**

```
┌─────────────────┐      WebSocket       ┌──────────────────┐
│   Next.js App   │ ◄──────────────────► │  ElevenLabs API  │
│   (Client)      │   (Media Streaming)  │                  │
└────────┬────────┘                      └──────────────────┘
         │
         │ WebSocket (Internal)
         ▼
┌─────────────────┐
│  Interview      │
│  Orchestrator   │
│  (Server)       │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Database       │
│  (Supabase)     │
└─────────────────┘
```

#### 1.2 Environment Configuration

Required environment variables:
```
ELEVENLABS_API_KEY=sk_xxxxxxxxxxxxxxxx
ELEVENLABS_AGENT_ID=optional_preconfigured_agent
ELEVENLABS_WEBSOCKET_URL=wss://api.elevenlabs.io/v1/convai/conversation
```

---

## 2. Interview Flow Orchestration

### 2.1 Interview State Machine

The interview follows a well-defined state machine:

```
┌─────────┐    Start     ┌──────────┐   First Question  ┌──────────┐
│ PENDING │ ───────────► │ STARTED  │ ────────────────► │ ACTIVE   │
└─────────┘              └──────────┘                   └────┬─────┘
                                                             │
    ┌────────────────────────────────────────────────────────┘
    │
    ▼
┌──────────┐   All Questions   ┌──────────┐   Processing   ┌──────────┐
│ COMPLETED│ ◄──────────────── │ ANSWERING│ ─────────────► │ SUBMITTED│
└────┬─────┘                   └──────────┘                └────┬─────┘
     │                                                          │
     │                    ┌──────────┐   Notification Sent    │
     └──────────────────► │ PROCESSED│ ◄───────────────────────┘
                          └────┬─────┘
                               │
          ┌────────────────────┼────────────────────┐
          ▼                    ▼                    ▼
    ┌──────────┐        ┌──────────┐        ┌──────────┐
    │ ACCEPTED │        │ REJECTED │        │  ERROR   │
    └──────────┘        └──────────┘        └──────────┘
```

### 2.2 Interview Session Management

**Interview Orchestrator Service (`/src/lib/interview-orchestrator.ts`)**

```typescript
interface InterviewOrchestrator {
  // Session Lifecycle
  initializeSession(applicationId: string): Promise<InterviewSession>
  startInterview(sessionId: string): Promise<void>
  endInterview(sessionId: string): Promise<void>

  // Question Management
  getNextQuestion(session: InterviewSession): Promise<Question>
  submitAnswer(sessionId: string, answer: Answer): Promise<void>

  // Real-time Events
  onTranscriptUpdate(callback: (transcript: Transcript) => void): void
  onAudioChunk(callback: (chunk: AudioChunk) => void): void
}

interface InterviewSession {
  id: string
  applicationId: string
  status: InterviewStatus
  currentQuestionIndex: number
  questions: Question[]
  answers: Answer[]
  startedAt: Date
  endedAt?: Date
  metadata: {
    totalDuration: number
    interruptions: number
    audioQuality: number
  }
}
```

**Question Flow Strategy:**

1. **Opening**: Welcome message and interview context setting
2. **Dynamic Questions**: 5-8 questions generated based on:
   - Position requirements (technical skills, experience level)
   - Candidate profile (extracted from LinkedIn/GitHub)
   - Previous answers (follow-up questions)
3. **Closing**: Thank you message and next steps explanation

**Question Types:**
- **Screening Questions**: Basic qualification (experience, availability)
- **Technical Questions**: Role-specific knowledge assessment
- **Behavioral Questions**: Soft skills and culture fit
- **Situational Questions**: Problem-solving approach

---

## 3. Audio Recording and Transcript Storage

### 3.1 Storage Architecture

**Dual Storage Strategy:**

| Data Type | Storage | Retention | Purpose |
|-----------|---------|-----------|---------|
| Audio Files | Cloudflare R2/S3 | 90 days | Compliance, review, ML training |
| Transcripts | PostgreSQL (Supabase) | Permanent | Searchable, classification input |
| Real-time Chunks | Redis | Session-only | Streaming buffer |

**Storage Flow:**

```
┌─────────────────┐
│  ElevenLabs     │
│  WebSocket      │
└────────┬────────┘
         │ Audio Stream
         ▼
┌─────────────────┐     ┌─────────────────┐
│  Stream         │────►│  R2/S3 Upload   │
│  Processor      │     │  (Audio File)   │
│                 │     └─────────────────┘
│  - Chunking     │
│  - Transcription│     ┌─────────────────┐
│  - Metadata     │────►│  Supabase       │
│    Extraction   │     │  (Transcript)   │
└─────────────────┘     └─────────────────┘
```

### 3.2 Audio Processing Pipeline

**Stream Processor (`/src/lib/audio-processor.ts`)**

```typescript
interface AudioProcessor {
  // Incoming audio from candidate
  processCandidateAudio(stream: ReadableStream): Promise<void>

  // Outgoing audio from AI agent
  processAgentAudio(audioBuffer: Buffer): Promise<void>

  // Transcription handling
  onTranscript(callback: (transcript: TranscriptSegment) => void): void

  // Finalization
  finalizeRecording(): Promise<RecordingResult>
}

interface RecordingResult {
  audioUrl: string
  transcript: Transcript
  duration: number
  fileSize: number
  format: 'mp3' | 'wav'
}
```

**Transcript Structure:**

```typescript
interface Transcript {
  interviewId: string
  segments: TranscriptSegment[]
  fullText: string
  metadata: {
    wordCount: number
    duration: number
    speakerChanges: number
  }
}

interface TranscriptSegment {
  id: string
  speaker: 'agent' | 'candidate'
  text: string
  timestamp: number
  duration: number
  confidence: number
}
```

### 3.3 Database Schema (Supabase)

```sql
-- Interview recordings table
create table interview_recordings (
  id uuid primary key default gen_random_uuid(),
  interview_id uuid references screening_interviews(id),
  audio_url text not null,
  transcript jsonb not null,
  duration_seconds integer,
  file_size_bytes integer,
  created_at timestamp with time zone default now(),

  -- RLS policies for security
  constraint valid_duration check (duration_seconds > 0)
);

-- Enable RLS
alter table interview_recordings enable row level security;

-- Candidates can only view their own recordings
create policy "Users can view own recordings"
  on interview_recordings for select
  using (
    exists (
      select 1 from screening_interviews si
      join applications a on si.application_id = a.id
      where si.id = interview_recordings.interview_id
      and a.user_id = auth.uid()
    )
  );
```

---

## 4. Classification Approaches

### 4.1 Hybrid Classification Architecture

Recommended approach: **Rule-based + LLM hybrid** for optimal balance of speed, cost, and accuracy.

```
┌─────────────────────────────────────────────────────────────┐
│                    Classification Pipeline                  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐      │
│  │  Input      │──►│  Preprocess │──►│  Rule-Based │      │
│  │  (Transcript│   │  & Extract  │   │  Scoring    │      │
│  │   + Metadata│   │             │   │  (Fast)     │      │
│  └─────────────┘   └─────────────┘   └──────┬──────┘      │
│                                             │               │
│                              ┌──────────────┘               │
│                              ▼                              │
│                    ┌─────────────────┐                      │
│                    │  Score < 0.3    │                      │
│                    │  or Score > 0.8 │                      │
│                    │  ?              │                      │
│                    └────────┬────────┘                      │
│                             │                               │
│                    ┌────────┴────────┐                      │
│                    ▼                 ▼                      │
│            ┌─────────────┐   ┌─────────────┐               │
│            │  Auto-Accept│   │  Auto-Reject│               │
│            │  (Score>0.8)│   │  (Score<0.3)│               │
│            └─────────────┘   └─────────────┘               │
│                    │                 │                      │
│                    └────────┬────────┘                      │
│                             │                               │
│                    ┌────────▼────────┐                      │
│                    │  Borderline     │                      │
│                    │  (0.3-0.8)      │                      │
│                    └────────┬────────┘                      │
│                             │                               │
│                             ▼                               │
│                    ┌─────────────────┐                      │
│                    │  LLM Deep       │                      │
│                    │  Analysis       │                      │
│                    │  (Nuanced)      │                      │
│                    └────────┬────────┘                      │
│                             │                               │
│                             ▼                               │
│                    ┌─────────────────┐                      │
│                    │  Final Score    │                      │
│                    │  (0-1)          │                      │
│                    └─────────────────┘                      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 Rule-Based Scoring Component

**Fast Classification (`/src/lib/classification/rules.ts`)**

```typescript
interface RuleBasedScorer {
  score(interview: InterviewData): RuleBasedScore
}

interface RuleBasedScore {
  overall: number // 0-1
  dimensions: {
    experienceMatch: number
    technicalFit: number
    communication: number
    cultureFit: number
  }
  flags: string[]
  processingTimeMs: number
}

// Scoring dimensions
const SCORING_DIMENSIONS = {
  experienceMatch: {
    weight: 0.30,
    indicators: ['years_experience', 'relevant_projects', 'seniority_level']
  },
  technicalFit: {
    weight: 0.35,
    indicators: ['tech_stack_match', 'problem_solving', 'code_quality_discussion']
  },
  communication: {
    weight: 0.20,
    indicators: ['clarity', 'conciseness', 'active_listening']
  },
  cultureFit: {
    weight: 0.15,
    indicators: ['values_alignment', 'collaboration', 'growth_mindset']
  }
}
```

**Keyword Extraction Strategy:**

```typescript
interface KeywordMatcher {
  // Required keywords for the position
  required: string[]
  // Nice-to-have keywords
  preferred: string[]
  // Negative indicators
  redFlags: string[]

  // Scoring
  match(transcript: string): KeywordMatchResult
}

// Example for Senior Frontend Engineer
const FRONTEND_KEYWORDS: KeywordMatcher = {
  required: ['react', 'typescript', 'javascript', 'frontend', 'ui'],
  preferred: ['next.js', 'testing', 'performance', 'accessibility', 'css'],
  redFlags: ['hate coding', 'don\'t learn', 'not collaborative']
}
```

### 4.3 LLM Deep Analysis Component

**LLM Classifier (`/src/lib/classification/llm.ts`)**

```typescript
interface LLMClassifier {
  analyze(interview: InterviewData, context: PositionContext): Promise<LLMScore>
}

interface LLMScore {
  score: number // 0-1
  confidence: number
  reasoning: string
  dimensionScores: {
    technicalCompetence: number
    problemSolving: number
    communication: number
    experienceDepth: number
    culturalAlignment: number
  }
  highlights: {
    strengths: string[]
    concerns: string[]
  }
}

// Prompt template for structured output
const CLASSIFICATION_PROMPT = `
You are an expert technical recruiter evaluating a candidate interview.

POSITION: {{positionTitle}}
REQUIREMENTS: {{positionRequirements}}

INTERVIEW TRANSCRIPT:
{{transcript}}

Evaluate the candidate on a scale of 0-1 for:
1. Technical competence (0-1)
2. Problem-solving ability (0-1)
3. Communication clarity (0-1)
4. Experience depth (0-1)
5. Cultural alignment (0-1)

Provide:
- Overall relevance score (0-1)
- Confidence level (0-1)
- Brief reasoning (2-3 sentences)
- Key strengths (bullet points)
- Potential concerns (bullet points)

Respond in valid JSON format matching the LLMScore interface.
`
```

### 4.4 Classification Service Integration

**Classification Service (`/src/lib/classification/index.ts`)**

```typescript
export class ClassificationService {
  constructor(
    private ruleScorer: RuleBasedScorer,
    private llmClassifier: LLMClassifier,
    private config: ClassificationConfig
  ) {}

  async classify(interviewId: string): Promise<ClassificationResult> {
    const interview = await this.fetchInterviewData(interviewId)

    // Phase 1: Fast rule-based scoring
    const ruleScore = this.ruleScorer.score(interview)

    // Phase 2: Determine if LLM analysis needed
    if (this.needsDeepAnalysis(ruleScore)) {
      const llmScore = await this.llmClassifier.analyze(
        interview,
        interview.positionContext
      )

      return this.combineScores(ruleScore, llmScore)
    }

    return this.ruleScoreToResult(ruleScore)
  }

  private needsDeepAnalysis(ruleScore: RuleBasedScore): boolean {
    const { threshold } = this.config
    // Borderline cases need deeper analysis
    return ruleScore.overall >= threshold.low &&
           ruleScore.overall <= threshold.high
  }

  private combineScores(
    rule: RuleBasedScore,
    llm: LLMScore
  ): ClassificationResult {
    // Weighted combination favoring LLM for borderline cases
    const weight = 0.6 // LLM weight for borderline
    const finalScore = (rule.overall * (1 - weight)) + (llm.score * weight)

    return {
      score: finalScore,
      passed: finalScore >= this.config.threshold.pass,
      method: 'hybrid',
      details: { rule, llm }
    }
  }
}
```

**Configuration:**

```typescript
interface ClassificationConfig {
  threshold: {
    pass: number      // 0.7 - minimum to pass
    low: number       // 0.3 - below this = auto-reject
    high: number      // 0.8 - above this = auto-accept
  }
  llm: {
    model: 'claude-3-sonnet' | 'gpt-4' | 'gpt-3.5-turbo'
    maxTokens: number
    temperature: number
  }
}
```

---

## 5. Async Job Queue for Delayed Processing

### 5.1 Queue Architecture

**BullMQ + Redis Implementation**

```
┌─────────────────────────────────────────────────────────────┐
│                    Async Processing Pipeline                │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐                                            │
│  │ Interview   │                                            │
│  │ Completed   │                                            │
│  └──────┬──────┘                                            │
│         │                                                   │
│         ▼                                                   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              BullMQ Job Queue (Redis)               │   │
│  │                                                     │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ │   │
│  │  │  Delayed    │  │  Active     │  │  Completed  │ │   │
│  │  │  (10 min)   │  │  Jobs       │  │  Jobs       │ │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘ │   │
│  │                                                     │   │
│  │  Job: {                                            │   │
│  │    id: interview_id,                               │   │
│  │    delay: 600000,  // 10 minutes                   │   │
│  │    priority: 1,                                    │   │
│  │    data: { transcript, metadata }                  │   │
│  │  }                                                 │   │
│  │                                                     │   │
│  └─────────────────────┬───────────────────────────────┘   │
│                        │                                    │
│                        ▼                                    │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Worker Processes                       │   │
│  │                                                     │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ │   │
│  │  │ Worker 1    │  │ Worker 2    │  │ Worker N    │ │   │
│  │  │ (Classification)│ (Classification)│ (Classification)│ │
│  │  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘ │   │
│  │         │                │                │        │   │
│  │         └────────────────┼────────────────┘        │   │
│  │                          ▼                         │   │
│  │                   ┌─────────────┐                  │   │
│  │                   │  Results    │                  │   │
│  │                   │  Processor  │                  │   │
│  │                   └──────┬──────┘                  │   │
│  │                          │                         │   │
│  │         ┌────────────────┼────────────────┐        │   │
│  │         ▼                ▼                ▼        │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ │   │
│  │  │  Email      │  │  Database   │  │  Webhook    │ │   │
│  │  │  Service    │  │  Update     │  │  (Optional) │ │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘ │   │
│  │                                                     │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 Job Queue Implementation

**Queue Configuration (`/src/lib/queue.ts`)**

```typescript
import { Queue, Worker, Job } from 'bullmq'
import Redis from 'ioredis'

const redis = new Redis(process.env.REDIS_URL!, { maxRetriesPerRequest: null })

// Classification queue with 10-minute delay
export const classificationQueue = new Queue('classification', {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: {
      age: 24 * 60 * 60,
      count: 1000,
    },
    removeOnFail: {
      age: 7 * 24 * 60 * 60,
      count: 5000,
    },
  },
})

// Job producer - called when interview ends
export async function enqueueClassification(
  interviewId: string,
  delayMs: number = 600000
): Promise<Job> {
  return classificationQueue.add(
    'classify-interview',
    { interviewId },
    { delay: delayMs }
  )
}
```

**Worker Implementation (`/src/lib/workers/classification-worker.ts`)**

```typescript
import { Worker } from 'bullmq'
import { ClassificationService } from '../classification'
import { EmailService } from '../email'
import { supabase } from '../supabase'

const classificationWorker = new Worker(
  'classification',
  async (job) => {
    const { interviewId } = job.data

    console.log(`Processing classification for interview: ${interviewId}`)

    try {
      // 1. Run classification
      const classificationService = new ClassificationService()
      const result = await classificationService.classify(interviewId)

      // 2. Update database
      await supabase
        .from('classification_results')
        .insert({
          interview_id: interviewId,
          score: result.score,
          passed: result.passed,
          details: result.details,
          processed_at: new Date().toISOString()
        })

      // 3. Update application status
      await supabase
        .from('applications')
        .update({
          status: result.passed ? 'screening_passed' : 'screening_rejected',
          classification_score: result.score
        })
        .eq('screening_interview_id', interviewId)

      // 4. Send notification email
      const emailService = new EmailService()
      await emailService.sendClassificationResult(interviewId, result)

      return { success: true, score: result.score }

    } catch (error) {
      console.error(`Classification failed for ${interviewId}:`, error)
      throw error
    }
  },
  {
    connection: redis,
    concurrency: 5
  }
)

// Graceful shutdown
process.on('SIGTERM', async () => {
  await classificationWorker.close()
})
```

### 5.3 Why 10-Minute Delay?

The 10-minute delay serves multiple purposes:

1. **Candidate Experience**: Prevents immediate rejection, reducing anxiety
2. **System Load**: Smooths out processing spikes during high-volume periods
3. **Data Consistency**: Ensures all audio chunks are uploaded and transcribed
4. **Manual Override**: Provides window for human review if needed
5. **Rate Limiting**: Prevents hitting LLM API rate limits

---

## 6. WebSocket Integration for Real-time Communication

### 6.1 WebSocket Architecture

**Socket.io Implementation for Interview Room**

```
┌─────────────────────────────────────────────────────────────┐
│                  WebSocket Communication Flow               │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Client (Next.js App)          Server (Socket.io)          │
│  ─────────────────────         ─────────────────           │
│                                                             │
│  ┌─────────────────┐          ┌─────────────────┐          │
│  │ Join Interview  │─────────►│  Authenticate   │          │
│  │ Room            │          │  & Validate     │          │
│  └─────────────────┘          └────────┬────────┘          │
│                                        │                    │
│                                        ▼                    │
│                               ┌─────────────────┐          │
│                               │ Create/Join     │          │
│                               │ Room: interview │          │
│                               │ _{id}           │          │
│                               └────────┬────────┘          │
│                                        │                    │
│  ┌─────────────────┐          ┌────────▼────────┐          │
│  │ Receive:        │◄─────────│  Broadcast:     │          │
│  │ question_audio  │          │  audio_chunk    │          │
│  └─────────────────┘          └─────────────────┘          │
│                                                             │
│  ┌─────────────────┐          ┌─────────────────┐          │
│  │ Send:           │─────────►│  Forward to     │          │
│  │ candidate_audio │          │  ElevenLabs     │          │
│  └─────────────────┘          └─────────────────┘          │
│                                                             │
│  ┌─────────────────┐          ┌─────────────────┐          │
│  │ Receive:        │◄─────────│  Broadcast:     │          │
│  │ transcript      │          │  transcript_update│        │
│  └─────────────────┘          └─────────────────┘          │
│                                                             │
│  ┌─────────────────┐          ┌─────────────────┐          │
│  │ Send:           │─────────►│  Record &       │          │
│  │ interview_end   │          │  Trigger Queue  │          │
│  └─────────────────┘          └─────────────────┘          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 6.2 Socket.io Server Implementation

**WebSocket Server (`/src/lib/websocket/interview-server.ts`)**

```typescript
import { Server } from 'socket.io'
import { createServer } from 'http'
import { verifyJWT } from '../auth'
import { ElevenLabsClient } from '../elevenlabs'
import { AudioProcessor } from '../audio-processor'

interface InterviewSocketEvents {
  // Client -> Server
  'join-interview': (data: { interviewId: string; token: string }) => void
  'candidate-audio': (data: { chunk: ArrayBuffer; timestamp: number }) => void
  'end-interview': () => void

  // Server -> Client
  'agent-audio': (data: { chunk: ArrayBuffer; timestamp: number }) => void
  'transcript-update': (data: TranscriptUpdate) => void
  'question-ready': (data: { questionId: string; text: string }) => void
  'interview-error': (data: { message: string }) => void
  'interview-completed': () => void
}

export function createInterviewServer(httpServer: ReturnType<typeof createServer>) {
  const io = new Server<InterviewSocketEvents>(httpServer, {
    path: '/api/interviews/socket',
    cors: { origin: process.env.NEXT_PUBLIC_APP_URL }
  })

  // Namespace for interviews
  const interviewNs = io.of('/interviews')

  interviewNs.use(async (socket, next) => {
    // JWT authentication middleware
    try {
      const token = socket.handshake.auth.token
      const user = await verifyJWT(token)
      socket.data.user = user
      next()
    } catch (err) {
      next(new Error('Authentication failed'))
    }
  })

  interviewNs.on('connection', (socket) => {
    console.log(`Client connected: ${socket.id}`)

    let elevenLabsConnection: ElevenLabsClient | null = null
    let audioProcessor: AudioProcessor | null = null
    let currentInterviewId: string | null = null

    socket.on('join-interview', async ({ interviewId, token }) => {
      try {
        // Validate interview access
        const hasAccess = await validateInterviewAccess(
          socket.data.user.id,
          interviewId
        )

        if (!hasAccess) {
          socket.emit('interview-error', { message: 'Access denied' })
          return
        }

        currentInterviewId = interviewId

        // Join room for this interview
        socket.join(`interview_${interviewId}`)

        // Initialize ElevenLabs connection
        elevenLabsConnection = new ElevenLabsClient({
          agentId: await getAgentForInterview(interviewId),
          onAudio: (chunk) => {
            socket.emit('agent-audio', { chunk, timestamp: Date.now() })
          },
          onTranscript: (update) => {
            socket.emit('transcript-update', update)
          }
        })

        // Initialize audio processor
        audioProcessor = new AudioProcessor(interviewId)

        socket.emit('question-ready', {
          questionId: 'welcome',
          text: 'Welcome to your screening interview...'
        })

      } catch (error) {
        socket.emit('interview-error', {
          message: 'Failed to initialize interview'
        })
      }
    })

    socket.on('candidate-audio', async ({ chunk }) => {
      if (!elevenLabsConnection || !audioProcessor) return

      // Process and forward to ElevenLabs
      await audioProcessor.processCandidateAudio(chunk)
      await elevenLabsConnection.sendAudio(chunk)
    })

    socket.on('end-interview', async () => {
      if (!currentInterviewId || !audioProcessor) return

      try {
        // Finalize recording
        const recording = await audioProcessor.finalizeRecording()

        // Save to database
        await saveRecording(currentInterviewId, recording)

        // Enqueue for classification (10-min delay)
        await enqueueClassification(currentInterviewId)

        // Notify client
        socket.emit('interview-completed')

        // Cleanup
        elevenLabsConnection?.close()
        socket.leave(`interview_${currentInterviewId}`)

      } catch (error) {
        socket.emit('interview-error', {
          message: 'Failed to complete interview'
        })
      }
    })

    socket.on('disconnect', () => {
      // Cleanup resources
      elevenLabsConnection?.close()
      console.log(`Client disconnected: ${socket.id}`)
    })
  })

  return io
}
```

### 6.3 Client-Side WebSocket Hook

**React Hook (`/src/hooks/useInterviewSocket.ts`)**

```typescript
import { useEffect, useRef, useCallback, useState } from 'react'
import { io, Socket } from 'socket.io-client'

interface UseInterviewSocketOptions {
  interviewId: string
  token: string
  onAgentAudio: (chunk: ArrayBuffer) => void
  onTranscriptUpdate: (update: TranscriptUpdate) => void
  onQuestionReady: (question: Question) => void
  onError: (error: Error) => void
  onCompleted: () => void
}

export function useInterviewSocket(options: UseInterviewSocketOptions) {
  const socketRef = useRef<Socket | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [isConnecting, setIsConnecting] = useState(true)

  useEffect(() => {
    const socket = io(`${process.env.NEXT_PUBLIC_API_URL}/interviews`, {
      auth: { token: options.token }
    })

    socketRef.current = socket

    socket.on('connect', () => {
      setIsConnected(true)
      setIsConnecting(false)
      socket.emit('join-interview', {
        interviewId: options.interviewId,
        token: options.token
      })
    })

    socket.on('disconnect', () => {
      setIsConnected(false)
    })

    socket.on('agent-audio', ({ chunk }) => {
      options.onAgentAudio(chunk)
    })

    socket.on('transcript-update', (update) => {
      options.onTranscriptUpdate(update)
    })

    socket.on('question-ready', (question) => {
      options.onQuestionReady(question)
    })

    socket.on('interview-error', ({ message }) => {
      options.onError(new Error(message))
    })

    socket.on('interview-completed', () => {
      options.onCompleted()
    })

    return () => {
      socket.disconnect()
    }
  }, [options.interviewId, options.token])

  const sendAudio = useCallback((chunk: ArrayBuffer) => {
    socketRef.current?.emit('candidate-audio', {
      chunk,
      timestamp: Date.now()
    })
  }, [])

  const endInterview = useCallback(() => {
    socketRef.current?.emit('end-interview')
  }, [])

  return {
    isConnected,
    isConnecting,
    sendAudio,
    endInterview
  }
}
```

---

## 7. API Routes Structure

**Interview API Routes (`/src/app/api/interviews/`)**

```
src/app/api/interviews/
├── route.ts                    # POST: Create new interview session
├── [id]/
│   ├── route.ts               # GET: Interview status, DELETE: Cancel
│   ├── start/
│   │   └── route.ts           # POST: Start interview (initialize ElevenLabs)
│   ├── complete/
│   │   └── route.ts           # POST: Mark interview complete
│   ├── classify/
│   │   └── route.ts           # POST: Trigger classification (admin only)
│   └── recording/
│       └── route.ts           # GET: Get recording URL
└── webhook/
    └── elevenlabs/
        └── route.ts           # POST: ElevenLabs webhook callbacks
```

**Key API Endpoints:**

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/interviews` | POST | Create new interview session for application |
| `/api/interviews/[id]` | GET | Get interview status and metadata |
| `/api/interviews/[id]/start` | POST | Start interview, initialize WebSocket |
| `/api/interviews/[id]/complete` | POST | End interview, trigger 10-min delay |
| `/api/interviews/[id]/recording` | GET | Get signed URL for audio playback |
| `/api/interviews/webhook/elevenlabs` | POST | Handle ElevenLabs async events |

---

## 8. Component Structure

**Interview UI Components (`/src/components/interview/`)**

```
src/components/interview/
├── VoiceInterface.tsx         # Main interview container
├── AudioVisualizer.tsx        # Real-time audio visualization
├── TranscriptPanel.tsx        # Live transcript display
├── QuestionDisplay.tsx        # Current question UI
├── InterviewControls.tsx      # Start/End/Pause buttons
├── ConnectionStatus.tsx       # WebSocket status indicator
└── CompletionScreen.tsx       # Post-interview summary
```

---

## 9. Error Handling & Recovery

**Error Scenarios:**

| Scenario | Handling Strategy |
|----------|-------------------|
| ElevenLabs API down | Fallback to text-based interview |
| WebSocket disconnect | Auto-reconnect with state recovery |
| Audio recording failure | Continue with transcript only |
| Classification service error | Retry 3x, then manual review queue |
| Queue worker crash | Jobs persist in Redis, restart workers |

---

## 10. Testing Strategy

**Test Coverage Requirements:**

| Component | Test Type | Coverage |
|-----------|-----------|----------|
| ElevenLabs Client | Unit + Integration | 90% |
| Interview Orchestrator | Unit + Integration | 85% |
| Classification Service | Unit + Integration | 90% |
| WebSocket Server | Integration | 80% |
| Queue Workers | Integration | 80% |
| API Routes | Integration + E2E | 85% |
| React Components | Unit + E2E | 80% |

---

### Critical Files for Implementation

1. **`/src/lib/elevenlabs.ts`** - Core ElevenLabs API client with WebSocket streaming for voice AI integration

2. **`/src/lib/interview-orchestrator.ts`** - Interview session lifecycle management and question flow orchestration

3. **`/src/lib/classification/index.ts`** - Hybrid classification service combining rule-based and LLM scoring approaches

4. **`/src/lib/queue.ts`** - BullMQ job queue configuration for 10-minute delayed processing

5. **`/src/lib/websocket/interview-server.ts`** - Socket.io server for real-time audio streaming and interview communication
