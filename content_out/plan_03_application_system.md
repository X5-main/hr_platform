# Agent-Based Architecture: Application System

## Overview

This document defines a multi-agent architecture for implementing the Application System component. Each agent operates as a **black-box** with defined inputs, outputs, and self-validation capabilities. Agents communicate via message passing and can be developed, tested, and deployed independently.

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                           Application System Agent Architecture                          │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                          │
│  ┌─────────────────────────────────────────────────────────────────────────────────┐    │
│  │                           ORCHESTRATION LAYER                                    │    │
│  │                                                                                  │    │
│  │  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────────────────┐  │    │
│  │  │  Workflow       │    │  State          │    │  Event                      │  │    │
│  │  │  Orchestrator   │◄──►│  Manager        │◄──►│  Bus                        │  │    │
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
│  │  │  Form Schema    │  │  Application       │  │  File Processing            │  │    │
│  │  │  Agent          │  │  Lifecycle         │  │  Agent                      │  │    │
│  │  │                 │  │  Agent             │  │                             │  │    │
│  │  │ Input: Position │  │                    │  │ Input: File Upload Request  │  │    │
│  │  │        Template │  │ Input: Commands    │  │        Resume/Portfolio     │  │    │
│  │  │        Question │  │        (submit,    │  │                             │  │    │
│  │  │        Config   │  │         withdraw,  │  │ Output: Validated File      │  │    │
│  │  │                 │  │         update)    │  │         Scan Result         │  │    │
│  │  │ Output:         │  │                    │  │         Storage URL         │  │    │
│  │  │  Validated      │  │ Output: State      │  │                             │  │    │
│  │  │  Form Schema    │  │  Transitions       │  │ Self-Validate: Virus scan   │  │    │
│  │  │  Conditional    │  │  Events            │  │  complete, metadata stored  │  │    │
│  │  │  Logic Graph    │  │                    │  │                             │  │    │
│  │  │                 │  │ Self-Validate:     │  │                             │  │    │
│  │  │ Self-Validate:  │  │  State machine     │  │                             │  │    │
│  │  │  Schema valid,  │  │  consistency,      │  │                             │  │    │
│  │  │  no cycles,     │  │  idempotency       │  │                             │  │    │
│  │  │  all refs exist │  │                    │  │                             │  │    │
│  │  └─────────────────┘  └────────────────────┘  └─────────────────────────────┘  │    │
│  │                                                                                  │    │
│  │  ┌─────────────────┐  ┌────────────────────┐  ┌─────────────────────────────┐  │    │
│  │  │  Draft Manager  │  │  Validation        │  │  Pipeline                   │  │    │
│  │  │  Agent          │  │  Engine Agent      │  │  Integration Agent          │  │    │
│  │  │                 │  │                    │  │                             │  │    │
│  │  │ Input: Auto-save│  │ Input: Form Data   │  │ Input: Application          │  │    │
│  │  │        Retrieve │  │        Schema      │  │        Submitted Event      │  │    │
│  │  │        Purge    │  │        Rules       │  │                             │  │    │
│  │  │                 │  │                    │  │ Output: Queue Job           │  │    │
│  │  │ Output: Draft   │  │ Output:            │  │         Email Trigger       │  │    │
│  │  │  Snapshot       │  │  Validation Report │  │         Interview Scheduled │  │    │
│  │  │  Version ID     │  │  Errors/Warnings   │  │                             │  │    │
│  │  │                 │  │                    │  │ Self-Validate: Job queued   │  │    │
│  │  │ Self-Validate:  │  │ Self-Validate:     │  │  email sent, DB updated     │  │    │
│  │  │  Version chain  │  │  All rules tested, │  │                             │  │    │
│  │  │  integrity,     │  │  edge cases pass   │  │                             │  │    │
│  │  │  no orphans     │  │                    │  │                             │  │    │
│  │  └─────────────────┘  └────────────────────┘  └─────────────────────────────┘  │    │
│  └────────────────────────────────────────────────────────────────────────────────┘    │
│                                                                                          │
│  ═══════════════════════════════════════════════════════════════════════════════════   │
│                                                                                          │
│  ┌────────────────────────────────────────────────────────────────────────────────┐    │
│  │                      INFRASTRUCTURE AGENTS                                      │    │
│  │                                                                                  │    │
│  │  ┌─────────────────┐  ┌────────────────────┐  ┌─────────────────────────────┐   │    │
│  │  │  Storage        │  │  Security          │  │  Audit                      │   │    │
│  │  │  Manager Agent  │  │  Scanner Agent     │  │  Logger Agent               │   │    │
│  │  │                 │  │  (ClamAV)          │  │                             │   │    │
│  │  │ Input: Upload   │  │                    │  │ Input: Any Agent Event      │   │    │
│  │  │        Download │  │ Input: File Buffer │  │                             │   │    │
│  │  │        Delete   │  │        File ID     │  │ Output: Structured Logs     │   │    │
│  │  │                 │  │                    │  │         Audit Trail         │   │    │
│  │  │ Output: Signed  │  │ Output: Scan       │  │         Compliance Report   │   │    │
│  │  │  URL            │  │  Result            │  │                             │   │    │
│  │  │  Metadata       │  │  Quarantine Action │  │ Self-Validate: Logs         │   │    │
│  │  │                 │  │                    │  │  written, indexed,          │   │    │
│  │  │ Self-Validate:  │  │ Self-Validate:     │  │  searchable                 │   │    │
│  │  │  URL expiry,    │  │  Signature DB      │  │                             │   │    │
│  │  │  bucket exists, │  │  updated,          │  │                             │   │    │
│  │  │  ACL correct    │  │  quarantine works  │  │                             │   │    │
│  │  └─────────────────┘  └────────────────────┘  └─────────────────────────────┘   │    │
│  └────────────────────────────────────────────────────────────────────────────────┘    │
│                                                                                          │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Agent Specifications

### 1. Workflow Orchestrator Agent

**Purpose**: Coordinates cross-agent workflows and handles sagas for distributed transactions.

**Input Interface**:
```typescript
interface OrchestratorCommand {
  workflowId: string;
  type: 'SUBMIT_APPLICATION' | 'WITHDRAW_APPLICATION' | 'UPDATE_FORM_SCHEMA';
  payload: Record<string, unknown>;
  correlationId: string;
  timestamp: string;
}
```

**Output Interface**:
```typescript
interface OrchestratorResult {
  workflowId: string;
  status: 'COMPLETED' | 'FAILED' | 'COMPENSATING';
  steps: WorkflowStep[];
  error?: WorkflowError;
  correlationId: string;
}

interface WorkflowStep {
  agent: string;
  action: string;
  status: 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'COMPENSATED';
  input: unknown;
  output: unknown;
  startedAt: string;
  completedAt?: string;
}
```

**Self-Validation**:
- All steps complete or proper compensation executed
- No orphaned workflows in "RUNNING" state > timeout
- Correlation IDs preserved end-to-end
- Idempotency: duplicate workflow IDs return cached result

**State Machine**:
```
RECEIVED → VALIDATING → DISPATCHING → RUNNING → COMPLETING → COMPLETED
                                              ↓
                                         COMPENSATING → COMPENSATED
                                              ↓
                                             FAILED
```

---

### 2. State Manager Agent

**Purpose**: Single source of truth for application state. Handles state transitions with validation.

**Input Interface**:
```typescript
interface StateCommand {
  entityType: 'APPLICATION' | 'FORM_SCHEMA' | 'DRAFT' | 'FILE';
  entityId: string;
  operation: 'CREATE' | 'UPDATE' | 'DELETE' | 'TRANSITION';
  payload: unknown;
  expectedVersion?: number; // Optimistic locking
  requestedBy: string;
}

interface StateTransition {
  entityType: 'APPLICATION';
  entityId: string;
  fromStatus: ApplicationStatus;
  toStatus: ApplicationStatus;
  reason?: string;
}
```

**Output Interface**:
```typescript
interface StateResult {
  entityType: string;
  entityId: string;
  operation: string;
  success: boolean;
  previousState?: unknown;
  currentState: unknown;
  version: number;
  timestamp: string;
  events: DomainEvent[];
}

interface DomainEvent {
  eventId: string;
  eventType: string;
  aggregateId: string;
  aggregateType: string;
  version: number;
  payload: unknown;
  timestamp: string;
  correlationId: string;
}
```

**State Transition Rules (Application)**:
```
draft ─────────► submitted ─────────► screening_pending
  │                    │                      │
  │                    │                      ▼
  │                    │              screening_in_progress
  │                    │                      │
  │                    │            ┌─────────┴─────────┐
  │                    │            ▼                   ▼
  │                    │    screening_passed    screening_failed
  │                    │            │                   │
  │                    │            ▼                   ▼
  │                    │    technical_invited      [END]
  │                    │            │
  │                    │            ▼
  │                    │    technical_in_progress
  │                    │            │
  │                    │            ▼
  │                    │    technical_completed
  │                    │            │
  │                    │            ▼
  │                    │           review
  │                    │            │
  │                    │    ┌───────┴───────┐
  │                    │    ▼               ▼
  │                    │  accepted       rejected
  │                    │    │               │
  │                    │   [END]           [END]
  │                    │
  └────────────────────┘
         withdrawn (from almost any state)
```

**Self-Validation**:
- All state transitions valid per rules above
- Optimistic locking prevents lost updates
- Events emitted match state changes
- Version numbers monotonically increasing

---

### 3. Form Schema Agent

**Purpose**: Manages form schema definitions, validation rules, and conditional logic.

**Input Interface**:
```typescript
interface FormSchemaCommand {
  type: 'CREATE_SCHEMA' | 'UPDATE_SCHEMA' | 'VALIDATE_SCHEMA' | 'GET_SCHEMA' | 'GET_RENDER_CONFIG';
  positionId: string;
  schema?: FormSchema;
  answers?: Record<string, unknown>; // For validation
}

interface FormSchema {
  version: string;
  sections: FormSection[];
  questions: PositionQuestion[];
  conditions: FormCondition[];
  validationRules: GlobalValidationRule[];
}
```

**Output Interface**:
```typescript
interface FormSchemaResult {
  positionId: string;
  schema?: FormSchema;
  isValid: boolean;
  validationErrors?: SchemaValidationError[];
  renderConfig?: RenderConfiguration; // Questions visible for given answers
  dependencyGraph?: DependencyGraph;  // For detecting cycles
}

interface RenderConfiguration {
  visibleQuestions: string[]; // Question IDs
  requiredQuestions: string[];
  validationSchema: JSONSchema;
  uiHints: UiHint[];
}

interface DependencyGraph {
  nodes: string[]; // Question IDs
  edges: Array<{ from: string; to: string; condition: string }>;
  hasCycles: boolean;
  topologicalOrder?: string[];
}
```

**Self-Validation**:
```typescript
interface SchemaSelfValidation {
  // 1. All question references in conditions exist
  danglingReferences: string[];

  // 2. No circular dependencies in conditional logic
  cycles: string[][];

  // 3. All validation rules are valid
  invalidRules: Array<{ questionId: string; rule: string; error: string }>;

  // 4. Schema is renderable (can determine question order)
  isRenderable: boolean;
  renderOrder?: string[];

  // 5. No duplicate question IDs
  duplicateIds: string[];

  // 6. All options for select/multiselect are valid
  invalidOptions: Array<{ questionId: string; error: string }>;
}
```

**Internal Implementation**:
```
┌────────────────────────────────────────────────────────────┐
│                   Form Schema Agent                         │
├────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐ │
│  │ Schema       │───►│ Dependency   │───►│ Render       │ │
│  │ Validator    │    │ Analyzer     │    │ Optimizer    │ │
│  └──────────────┘    └──────────────┘    └──────────────┘ │
│         │                   │                   │          │
│         ▼                   ▼                   ▼          │
│  ┌──────────────────────────────────────────────────────┐ │
│  │           Condition Evaluation Engine                 │ │
│  │                                                       │ │
│  │  Input: answers + conditions + all questions         │ │
│  │  Output: visible question set                        │ │
│  │                                                       │ │
│  │  Algorithm:                                          │ │
│  │  1. Build DAG from conditions                        │ │
│  │  2. Topological sort for evaluation order            │ │
│  │  3. Evaluate conditions in order                     │ │
│  │  4. Return visibility map                            │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                             │
└────────────────────────────────────────────────────────────┘
```

---

### 4. Application Lifecycle Agent

**Purpose**: Manages the complete lifecycle of job applications with state machine enforcement.

**Input Interface**:
```typescript
interface LifecycleCommand {
  type: 'CREATE' | 'SUBMIT' | 'UPDATE' | 'WITHDRAW' | 'GET_STATUS' | 'GET_HISTORY';
  applicationId?: string;
  profileId?: string;
  positionId?: string;
  payload?: {
    answers?: Record<string, unknown>;
    resumeFileId?: string;
    links?: ApplicationLinks;
    withdrawalReason?: string;
  };
}
```

**Output Interface**:
```typescript
interface LifecycleResult {
  application?: Application;
  history?: ApplicationHistoryEntry[];
  operation: string;
  success: boolean;
  error?: LifecycleError;
  allowedTransitions?: ApplicationStatus[]; // For GET_STATUS
}

interface Application {
  id: string;
  profileId: string;
  positionId: string;
  status: ApplicationStatus;
  answers: Record<string, unknown>;
  resumeFileId?: string;
  links: ApplicationLinks;
  version: number;
  createdAt: string;
  updatedAt: string;
  submittedAt?: string;
  withdrawnAt?: string;
  withdrawalReason?: string;
}

interface ApplicationHistoryEntry {
  timestamp: string;
  fromStatus: ApplicationStatus;
  toStatus: ApplicationStatus;
  triggeredBy: string;
  reason?: string;
  snapshot?: Application; // Full state at this point
}
```

**State Machine Implementation**:
```typescript
const stateMachine: StateMachineDefinition = {
  initial: 'draft',
  states: {
    draft: {
      transitions: ['submitted', 'withdrawn'],
      actions: {
        onEnter: [],
        onExit: ['SAVE_VERSION_SNAPSHOT']
      }
    },
    submitted: {
      transitions: ['screening_pending', 'withdrawn'],
      actions: {
        onEnter: ['VALIDATE_ALL_REQUIRED_FIELDS', 'VALIDATE_FILES_SCANNED', 'TRIGGER_SCREENING_PIPELINE'],
        onExit: []
      }
    },
    // ... other states
  }
};
```

**Self-Validation**:
- All state transitions go through State Manager for consistency
- Version snapshots created before significant transitions
- Withdrawal only allowed from non-terminal states
- Duplicate submissions prevented via idempotency key

---

### 5. File Processing Agent

**Purpose**: Handles all file operations including upload, validation, scanning, and storage.

**Input Interface**:
```typescript
interface FileCommand {
  type: 'GET_UPLOAD_URL' | 'CONFIRM_UPLOAD' | 'SCAN' | 'GET_DOWNLOAD_URL' | 'DELETE' | 'GET_STATUS';
  applicationId: string;
  fileId?: string;
  fileMetadata?: {
    filename: string;
    contentType: string;
    sizeBytes: number;
  };
}

interface FileUploadConfirmation {
  fileId: string;
  storagePath: string;
  etag: string;
}
```

**Output Interface**:
```typescript
interface FileResult {
  file?: ProcessedFile;
  uploadUrl?: SignedUploadUrl;
  downloadUrl?: SignedDownloadUrl;
  success: boolean;
  error?: FileError;
}

interface ProcessedFile {
  id: string;
  applicationId: string;
  filename: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  status: 'uploading' | 'pending_scan' | 'scanning' | 'clean' | 'infected' | 'error';
  scanResult?: {
    scanner: string;
    threatsFound: string[];
    scannedAt: string;
  };
  storage: {
    bucket: string;
    path: string;
    region: string;
  };
  createdAt: string;
}

interface SignedUploadUrl {
  url: string;
  method: 'PUT' | 'POST';
  headers: Record<string, string>;
  expiresAt: string;
}
```

**Internal Pipeline**:
```
┌─────────────────────────────────────────────────────────────────────┐
│                     File Processing Agent                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  UPLOAD REQUEST                                                      │
│       │                                                              │
│       ▼                                                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐          │
│  │  Validate    │───►│  Generate    │───►│  Store       │          │
│  │  Metadata    │    │  Signed URL  │    │  Metadata    │          │
│  └──────────────┘    └──────────────┘    └──────────────┘          │
│       │                                                              │
│       │  (Client uploads directly to storage)                        │
│       ▼                                                              │
│  UPLOAD COMPLETE (webhook/callback)                                  │
│       │                                                              │
│       ▼                                                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐          │
│  │  Verify      │───►│  Queue       │───►│  Update      │          │
│  │  Storage     │    │  Scan Job    │    │  Status      │          │
│  └──────────────┘    └──────────────┘    └──────────────┘          │
│                            │                                         │
│                            ▼                                         │
│                     ┌──────────────┐                                │
│                     │  Security    │                                │
│                     │  Scanner     │                                │
│                     │  Agent       │                                │
│                     └──────────────┘                                │
│                            │                                         │
│                            ▼                                         │
│                     SCAN COMPLETE                                    │
│                            │                                         │
│       ┌────────────────────┼────────────────────┐                   │
│       ▼                    ▼                    ▼                   │
│     CLEAN               INFECTED              ERROR                 │
│       │                    │                    │                   │
│       ▼                    ▼                    ▼                   │
│  Available for         Quarantined         Retry logic              │
│  submission            Alert admins        Max retries              │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

**Self-Validation**:
- File size matches metadata after upload
- MIME type validation against whitelist
- Virus scan completed before marking "clean"
- Storage ACLs verified (private, no public access)
- Signed URLs have expiration < 1 hour

---

### 6. Draft Manager Agent

**Purpose**: Manages auto-save drafts with versioning and conflict resolution.

**Input Interface**:
```typescript
interface DraftCommand {
  type: 'SAVE' | 'GET' | 'DELETE' | 'LIST' | 'RESTORE';
  applicationId?: string;
  draftId?: string;
  profileId: string;
  payload?: {
    answers?: Record<string, unknown>;
    resumeFileId?: string;
    links?: ApplicationLinks;
    currentStep?: number;
  };
}
```

**Output Interface**:
```typescript
interface DraftResult {
  draft?: ApplicationDraft;
  drafts?: ApplicationDraftSummary[];
  restored?: boolean;
  success: boolean;
  conflict?: DraftConflict; // For concurrent edits
}

interface ApplicationDraft {
  id: string;
  applicationId: string;
  profileId: string;
  positionId: string;
  data: {
    answers: Record<string, unknown>;
    resumeFileId?: string;
    links: ApplicationLinks;
    currentStep: number;
  };
  version: number;
  validationErrors: Record<string, string[]>;
  savedAt: string;
  expiresAt: string; // TTL for cleanup
}

interface DraftConflict {
  serverVersion: number;
  clientVersion: number;
  serverData: ApplicationDraft;
  clientData: ApplicationDraft;
  resolutionStrategy: 'SERVER_WINS' | 'CLIENT_WINS' | 'MERGE';
}
```

**Auto-Save Strategy**:
```
┌──────────────────────────────────────────────────────────────┐
│                    Draft Manager Agent                        │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  Client Input (form change)                                   │
│       │                                                       │
│       ▼                                                       │
│  ┌──────────────────────────────────────┐                    │
│  │  Debounce (500ms)                    │                    │
│  │  - Wait for typing pause             │                    │
│  │  - Batch rapid changes               │                    │
│  └──────────────────────────────────────┘                    │
│       │                                                       │
│       ▼                                                       │
│  ┌──────────────────────────────────────┐                    │
│  │  Optimistic Validation               │                    │
│  │  - Check required fields             │                    │
│  │  - Validate field types              │                    │
│  │  - Don't block save on errors        │                    │
│  └──────────────────────────────────────┘                    │
│       │                                                       │
│       ▼                                                       │
│  ┌──────────────────────────────────────┐                    │
│  │  Conditional Persistence             │                    │
│  │  - Only save if changed              │                    │
│  │  - Compare hash of last saved        │                    │
│  └──────────────────────────────────────┘                    │
│       │                                                       │
│       ▼                                                       │
│  ┌──────────────────────────────────────┐                    │
│  │  Version Increment                   │                    │
│  │  - Optimistic locking                │                    │
│  │  - Detect concurrent edits           │                    │
│  └──────────────────────────────────────┘                    │
│       │                                                       │
│       ▼                                                       │
│  Store with 30-day TTL                                        │
│                                                               │
└──────────────────────────────────────────────────────────────┘
```

**Self-Validation**:
- Version numbers strictly increasing
- No orphaned drafts (all linked to valid applications)
- Expired drafts cleaned up (TTL enforcement)
- Conflict detection for concurrent edits

---

### 7. Validation Engine Agent

**Purpose**: Centralized validation service for all form data against schemas.

**Input Interface**:
```typescript
interface ValidationCommand {
  type: 'VALIDATE_ANSWERS' | 'VALIDATE_SCHEMA' | 'GET_VALIDATION_RULES';
  schema: FormSchema;
  answers?: Record<string, unknown>;
  options?: {
    strict: boolean; // Fail on unknown fields
    partial: boolean; // Allow partial validation (for drafts)
    stopOnFirstError: boolean;
  };
}
```

**Output Interface**:
```typescript
interface ValidationResult {
  isValid: boolean;
  fieldErrors: FieldError[];
  globalErrors: GlobalError[];
  warnings: ValidationWarning[];
  validatedData?: Record<string, unknown>; // Coerced types
}

interface FieldError {
  field: string;
  code: string;
  message: string;
  value: unknown;
  constraints: Record<string, unknown>;
}

interface GlobalError {
  code: string;
  message: string;
  affectedFields: string[];
}

interface ValidationWarning {
  field: string;
  code: string;
  message: string;
  severity: 'INFO' | 'WARNING';
}
```

**Validation Pipeline**:
```
┌────────────────────────────────────────────────────────────────────┐
│                     Validation Engine Agent                         │
├────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Input: Schema + Answers                                            │
│       │                                                             │
│       ▼                                                             │
│  ┌────────────────────────────────────────────────────────────┐   │
│  │  Phase 1: Schema Validation                                │   │
│  │  - Check schema is valid                                   │   │
│  │  - Resolve conditional visibility                          │   │
│  │  - Build field dependency graph                            │   │
│  └────────────────────────────────────────────────────────────┘   │
│       │                                                             │
│       ▼                                                             │
│  ┌────────────────────────────────────────────────────────────┐   │
│  │  Phase 2: Field-Level Validation                           │   │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐          │   │
│  │  │ Type Check  │►│ Constraint  │►│ Custom      │          │   │
│  │  │ (string,    │ │ Check       │ │ Validator   │          │   │
│  │  │  number)    │ │ (min, max)  │ │ (regex)     │          │   │
│  │  └─────────────┘ └─────────────┘ └─────────────┘          │   │
│  └────────────────────────────────────────────────────────────┘   │
│       │                                                             │
│       ▼                                                             │
│  ┌────────────────────────────────────────────────────────────┐   │
│  │  Phase 3: Cross-Field Validation                           │   │
│  │  - Conditional requirements                                │   │
│  │  - Field dependencies                                      │   │
│  │  - Calculated fields                                       │   │
│  └────────────────────────────────────────────────────────────┘   │
│       │                                                             │
│       ▼                                                             │
│  ┌────────────────────────────────────────────────────────────┐   │
│  │  Phase 4: Business Rule Validation                         │   │
│  │  - Application deadline                                    │   │
│  │  - Duplicate application check                             │   │
│  │  - Position still active                                   │   │
│  └────────────────────────────────────────────────────────────┘   │
│       │                                                             │
│       ▼                                                             │
│  Output: ValidationResult                                           │
│                                                                     │
└────────────────────────────────────────────────────────────────────┘
```

**Self-Validation**:
- All validation rules have corresponding test cases
- Rule execution order deterministic
- No infinite loops in cross-field validation
- Error messages internationalized

---

### 8. Pipeline Integration Agent

**Purpose**: Integrates with external systems (screening, email, analytics).

**Input Interface**:
```typescript
interface PipelineCommand {
  type: 'TRIGGER_SCREENING' | 'SEND_NOTIFICATION' | 'UPDATE_ANALYTICS' | 'WEBHOOK';
  applicationId: string;
  eventType: ApplicationEventType;
  payload: Record<string, unknown>;
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL';
}

type ApplicationEventType =
  | 'APPLICATION_SUBMITTED'
  | 'APPLICATION_WITHDRAWN'
  | 'SCREENING_INVITATION_SENT'
  | 'SCREENING_COMPLETED'
  | 'STATUS_CHANGED';
```

**Output Interface**:
```typescript
interface PipelineResult {
  eventId: string;
  status: 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'RETRYING';
  actions: PipelineActionResult[];
  retryCount: number;
  nextRetryAt?: string;
}

interface PipelineActionResult {
  action: string;
  target: string;
  status: 'SUCCESS' | 'FAILED' | 'SKIPPED';
  response?: unknown;
  error?: string;
  durationMs: number;
}
```

**Event Routing**:
```
┌─────────────────────────────────────────────────────────────────────┐
│                    Pipeline Integration Agent                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Event Received                                                      │
│       │                                                              │
│       ▼                                                              │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  Event Router                                                 │   │
│  │                                                               │   │
│  │  APPLICATION_SUBMITTED ─────► ┌─────────────────────┐        │   │
│  │                               │ 1. Queue screening  │        │   │
│  │                               │    job (10min delay)│        │   │
│  │                               │ 2. Send confirmation│        │   │
│  │                               │ 3. Update analytics │        │   │
│  │                               └─────────────────────┘        │   │
│  │                                                               │   │
│  │  SCREENING_COMPLETED ───────► ┌─────────────────────┐        │   │
│  │                               │ 1. Update status    │        │   │
│  │                               │ 2. Send results     │        │   │
│  │                               │ 3. Invite to tech   │        │   │
│  │                               │    (if passed)      │        │   │
│  │                               └─────────────────────┘        │   │
│  │                                                               │   │
│  │  APPLICATION_WITHDRAWN ─────► ┌─────────────────────┐        │   │
│  │                               │ 1. Cancel pending   │        │   │
│  │                               │    interviews       │        │   │
│  │                               │ 2. Send confirmation│        │   │
│  │                               │ 3. Archive data     │        │   │
│  │                               └─────────────────────┘        │   │
│  │                                                               │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

**Self-Validation**:
- All events queued successfully before marking complete
- At-least-once delivery guarantee
- Dead letter queue for failed events
- Idempotency keys prevent duplicate processing

---

### 9. Storage Manager Agent

**Purpose**: Abstracts storage operations (S3/R2/Local) with unified interface.

**Input Interface**:
```typescript
interface StorageCommand {
  type: 'GET_UPLOAD_URL' | 'GET_DOWNLOAD_URL' | 'DELETE' | 'COPY' | 'GET_METADATA' | 'VERIFY_EXISTS';
  bucket: string;
  key: string;
  options?: {
    expiresIn?: number;
    contentType?: string;
    contentLength?: number;
    metadata?: Record<string, string>;
    acl?: 'private' | 'public-read';
  };
}
```

**Output Interface**:
```typescript
interface StorageResult {
  success: boolean;
  url?: string;
  metadata?: StorageMetadata;
  exists?: boolean;
  error?: StorageError;
}

interface StorageMetadata {
  key: string;
  bucket: string;
  size: number;
  etag: string;
  contentType: string;
  lastModified: string;
  metadata: Record<string, string>;
}
```

**Self-Validation**:
- Bucket exists and is accessible
- Signed URLs have valid expiration
- Object ACLs verified after upload
- Delete operations confirmed with HEAD request

---

### 10. Security Scanner Agent

**Purpose**: Virus/malware scanning using ClamAV with quarantine capabilities.

**Input Interface**:
```typescript
interface ScanCommand {
  type: 'SCAN_FILE' | 'GET_SIGNATURE_VERSION' | 'UPDATE_DEFINITIONS' | 'QUARANTINE' | 'RESTORE';
  fileId?: string;
  fileBuffer?: Buffer;
  storagePath?: string;
}
```

**Output Interface**:
```typescript
interface ScanResult {
  fileId: string;
  status: 'CLEAN' | 'INFECTED' | 'ERROR' | 'PENDING';
  scanner: string;
  scannerVersion: string;
  signatureVersion: string;
  threats: Threat[];
  scanDurationMs: number;
  scannedAt: string;
}

interface Threat {
  name: string;
  type: string;
  location: string;
}
```

**Self-Validation**:
- Signature database updated within 24 hours
- Scan engine responding to ping
- Quarantine directory writable
- Test file (EICAR) properly detected

---

### 11. Audit Logger Agent

**Purpose**: Comprehensive audit logging for compliance and debugging.

**Input Interface**:
```typescript
interface AuditCommand {
  type: 'LOG_EVENT' | 'QUERY_EVENTS' | 'EXPORT_LOGS';
  event?: AuditEvent;
  query?: AuditQuery;
}

interface AuditEvent {
  eventType: string;
  severity: 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';
  actor: {
    type: 'USER' | 'SYSTEM' | 'AGENT';
    id: string;
    ip?: string;
    userAgent?: string;
  };
  resource: {
    type: string;
    id: string;
  };
  action: string;
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown>;
  correlationId: string;
}
```

**Output Interface**:
```typescript
interface AuditResult {
  eventId?: string;
  events?: AuditEvent[];
  success: boolean;
  exportUrl?: string;
}
```

**Self-Validation**:
- All events written to persistent storage
- Log rotation working
- Query response time < 1s for recent data
- Encryption at rest verified

---

## Inter-Agent Communication

### Event Bus (Redis Pub/Sub)

```typescript
// Event Schema
interface AgentEvent {
  eventId: string;
  eventType: string;
  sourceAgent: string;
  targetAgent?: string; // Broadcast if undefined
  payload: unknown;
  timestamp: string;
  correlationId: string;
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL';
}

// Event Types
const EVENTS = {
  // Form Schema Events
  'FORM_SCHEMA_CREATED': 'form.schema.created',
  'FORM_SCHEMA_UPDATED': 'form.schema.updated',

  // Application Lifecycle Events
  'APPLICATION_CREATED': 'application.created',
  'APPLICATION_SUBMITTED': 'application.submitted',
  'APPLICATION_WITHDRAWN': 'application.withdrawn',
  'STATUS_CHANGED': 'application.status.changed',

  // File Events
  'FILE_UPLOADED': 'file.uploaded',
  'FILE_SCANNED': 'file.scanned',
  'FILE_INFECTED': 'file.infected',

  // Draft Events
  'DRAFT_SAVED': 'draft.saved',
  'DRAFT_RESTORED': 'draft.restored',

  // Validation Events
  'VALIDATION_FAILED': 'validation.failed',

  // Pipeline Events
  'SCREENING_TRIGGERED': 'pipeline.screening.triggered',
  'EMAIL_QUEUED': 'pipeline.email.queued',
} as const;
```

### Message Flow Examples

#### Application Submission Flow

```
┌──────────────────────────────────────────────────────────────────────────┐
│                    Application Submission Saga                            │
└──────────────────────────────────────────────────────────────────────────┘

User submits application
        │
        ▼
┌───────────────┐
│  Validation   │────► Validation Engine Agent
│  Engine       │      VALIDATE_ANSWERS
└───────────────┘
        │ isValid
        ▼
┌───────────────┐
│ File          │────► File Processing Agent
│ Processing    │      VERIFY_ALL_SCANNED
└───────────────┘
        │ allClean
        ▼
┌───────────────┐
│ Application   │────► Application Lifecycle Agent
│ Lifecycle     │      SUBMIT (with state validation)
└───────────────┘
        │ success
        ▼
┌───────────────┐
│ State         │────► State Manager Agent
│ Manager       │      TRANSITION: draft -> submitted
└───────────────┘
        │
        ├──► Event: APPLICATION_SUBMITTED ──► Pipeline Integration Agent
        │                                           │
        │                                           ▼
        │                                   ┌───────────────┐
        │                                   │ Queue         │────► BullMQ
        │                                   │ Screening     │      (10min delay)
        │                                   └───────────────┘
        │                                           │
        │                                   ┌───────────────┐
        │                                   │ Email         │────► Email Queue
        │                                   │ Service       │      (confirmation)
        │                                   └───────────────┘
        ▼
   Return Success
   to User
```

#### Form Schema Update Flow

```
HR Admin updates form schema
        │
        ▼
┌───────────────┐
│ Form Schema   │────► Form Schema Agent
│ Agent         │      UPDATE_SCHEMA
└───────────────┘
        │
        ▼
┌───────────────┐
│ Self-Validate │
│ Schema        │
└───────────────┘
        │
        ├──► Check: No cycles in conditions? ✓
        ├──► Check: All references valid? ✓
        ├──► Check: Schema renderable? ✓
        ▼
┌───────────────┐
│ State         │────► State Manager
│ Manager       │      Store new schema version
└───────────────┘
        │
        ├──► Event: FORM_SCHEMA_UPDATED
        ▼
   Notify affected
   applications?
```

---

## Agent Development Workflow

Each agent follows this development pattern:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Agent Development Cycle                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  1. INTERFACE DEFINITION                                                 │
│     ├── Define input types (commands/queries)                            │
│     ├── Define output types (results/events)                             │
│     ├── Define error types                                               │
│     └── Document contracts                                               │
│                                                                          │
│  2. CORE LOGIC IMPLEMENTATION                                            │
│     ├── Implement primary functions                                      │
│     ├── No external dependencies (mock interfaces)                       │
│     └── Pure functions where possible                                    │
│                                                                          │
│  3. SELF-VALIDATION IMPLEMENTATION                                       │
│     ├── Health checks                                                    │
│     ├── Output validation                                                │
│     ├── State consistency checks                                         │
│     └── Test scenarios                                                   │
│                                                                          │
│  4. INFRASTRUCTURE ADAPTERS                                              │
│     ├── Database repository                                              │
│     ├── Event publisher                                                  │
│     ├── External service clients                                         │
│     └── Caching layer                                                    │
│                                                                          │
│  5. INTEGRATION TESTING                                                  │
│     ├── Test with other agents (mocks → real)                            │
│     ├── Saga/choreography tests                                          │
│     ├── Failure scenario tests                                           │
│     └── Performance tests                                                │
│                                                                          │
│  6. DEPLOYMENT                                                           │
│     ├── Docker container                                                 │
│     ├── Health check endpoint                                            │
│     ├── Metrics export                                                   │
│     └── Graceful shutdown                                                │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Deployment Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Kubernetes Deployment                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                         Ingress                                  │    │
│  │                    (API Gateway / Traefik)                       │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                    │                                     │
│       ┌────────────────────────────┼────────────────────────────┐       │
│       ▼                            ▼                            ▼       │
│  ┌─────────┐                 ┌─────────┐                  ┌─────────┐  │
│  │ Web App │                 │ API     │                  │ Webhook │  │
│  │ (Next.js)│                │ Gateway │                  │ Handler │  │
│  └────┬────┘                 └────┬────┘                  └────┬────┘  │
│       │                           │                            │       │
│       └───────────────────────────┼────────────────────────────┘       │
│                                   │                                     │
│                                   ▼                                     │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                     Message Queue (Redis/BullMQ)                 │    │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐           │    │
│  │  │ Draft    │ │ File     │ │ Screening│ │ Email    │           │    │
│  │  │ Queue    │ │ Queue    │ │ Queue    │ │ Queue    │           │    │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘           │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                   │                                     │
│       ┌───────────────────────────┼────────────────────────────┐       │
│       ▼                           ▼                            ▼       │
│  ┌─────────────┐           ┌─────────────┐            ┌─────────────┐  │
│  │ Draft       │           │ File        │            │ Screening   │  │
│  │ Worker      │           │ Worker      │            │ Worker      │  │
│  │ (3 replicas)│           │ (5 replicas)│            │ (2 replicas)│  │
│  └─────────────┘           └─────────────┘            └─────────────┘  │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                     Stateful Services                            │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │    │
│  │  │ PostgreSQL   │  │ Redis        │  │ ClamAV               │   │    │
│  │  │ (Primary +   │  │ (Cluster)    │  │ (StatefulSet)        │   │    │
│  │  │  Replica)    │  │              │  │                      │   │    │
│  │  └──────────────┘  └──────────────┘  └──────────────────────┘   │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Critical Integration Points

| From Agent | To Agent | Purpose | Failure Mode |
|------------|----------|---------|--------------|
| Workflow Orchestrator | State Manager | Persist workflow state | Retry with exponential backoff |
| Workflow Orchestrator | Event Bus | Publish events | Store in outbox, retry later |
| Form Schema | Validation Engine | Get render config for answers | Return error, use cached schema |
| Application Lifecycle | State Manager | Persist state transitions | Queue for retry, notify admin |
| Application Lifecycle | File Processing | Verify files before submit | Block submission, notify user |
| File Processing | Storage Manager | Store/retrieve files | Queue for retry, return error |
| File Processing | Security Scanner | Virus scan files | Quarantine file, alert admin |
| Draft Manager | State Manager | Persist draft versions | Store locally, retry later |
| Pipeline Integration | BullMQ | Queue external jobs | Store in DLQ, alert ops |
| All Agents | Audit Logger | Log all actions | Buffer locally, flush later |

---

## Implementation Priority

### Phase 1: Core Foundation (Week 1)
1. **State Manager Agent** - All other agents depend on this
2. **Audit Logger Agent** - Needed from day 1 for compliance
3. **Storage Manager Agent** - Infrastructure for file operations

### Phase 2: Form System (Week 2)
4. **Form Schema Agent** - Define the form structure
5. **Validation Engine Agent** - Validate form data

### Phase 3: Application Core (Week 3)
6. **Application Lifecycle Agent** - Core business logic
7. **Draft Manager Agent** - User experience enhancement

### Phase 4: File & Security (Week 4)
8. **File Processing Agent** - File operations
9. **Security Scanner Agent** - Virus scanning

### Phase 5: Integration (Week 5)
10. **Pipeline Integration Agent** - External system integration
11. **Workflow Orchestrator Agent** - Complex workflow coordination

---

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Agent Response Time | < 100ms p99 | Prometheus histogram |
| Event Processing Lag | < 1s | Queue depth metrics |
| State Transition Consistency | 100% | Audit log validation |
| File Scan Throughput | > 10/min | Scanner metrics |
| Draft Auto-save Success | > 99.9% | Success rate metric |
| Cross-agent Error Rate | < 0.1% | Error tracking |

---

## Conclusion

This architecture decomposes the Application System into 11 autonomous agents, each with:

- **Clear boundaries**: Defined inputs/outputs, no shared state
- **Self-validation**: Health checks, output verification, consistency checks
- **Independent deployability**: Each agent can be developed, tested, deployed separately
- **Fault isolation**: Failure in one agent doesn't cascade
- **Scalability**: Agents can be replicated independently based on load

The event-driven communication enables loose coupling while the orchestration layer handles complex sagas that require coordination across multiple agents.
