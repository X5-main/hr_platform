# Implementation Plan: Application System Component

## Overview

This plan details the implementation of the Application System for the HR Candidate Screening Platform. The Application System enables candidates to apply to job positions with dynamic forms, supports auto-save functionality, and allows HR to create custom question templates.

---

## 1. Database Schema Design

### 1.1 Core Tables

#### question_templates

Reusable templates for position questions.

```sql
create table question_templates (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  description text,
  created_by uuid references auth.users(id),
  is_public boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table question_templates enable row level security;

create policy "HR can manage templates"
  on question_templates for all
  to authenticated
  using (created_by = auth.uid());
```

#### position_questions

Questions associated with positions.

```sql
create type question_type as enum (
  'text', 'textarea', 'select', 'multiselect', 'number', 'date', 'file'
);

create table position_questions (
  id uuid default gen_random_uuid() primary key,
  position_id uuid references positions(id) on delete cascade not null,
  type question_type not null,
  label text not null,
  placeholder text,
  description text,
  required boolean default false,
  options jsonb default '[]',
  validation_rules jsonb default '{}',
  sort_order integer default 0,
  template_id uuid references question_templates(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table position_questions enable row level security;

create policy "Position questions are viewable by everyone"
  on position_questions for select
  to anon, authenticated
  using (true);

create policy "Only admins can manage position questions"
  on position_questions for all
  to authenticated
  using (
    exists (
      select 1 from user_roles where user_id = auth.uid() and role = 'admin'
    )
  );
```

#### application_drafts

Separate table for draft storage.

```sql
create table application_drafts (
  id uuid default gen_random_uuid() primary key,
  application_id uuid references applications(id) on delete cascade not null,
  answers jsonb default '{}',
  resume_url text,
  linkedin_url text,
  github_url text,
  scholar_url text,
  portfolio_url text,
  website_url text,
  validation_errors jsonb default '{}',
  version integer default 1,
  saved_at timestamptz default now(),
  unique(application_id)
);

alter table application_drafts enable row level security;

create policy "Users can manage own drafts"
  on application_drafts for all
  to authenticated
  using (
    application_id in (
      select id from applications where profile_id = auth.uid()
    )
  );
```

#### application_files

Track uploaded files with metadata.

```sql
create table application_files (
  id uuid default gen_random_uuid() primary key,
  application_id uuid references applications(id) on delete cascade not null,
  filename text not null,
  original_name text not null,
  mime_type text not null,
  size_bytes integer not null,
  storage_path text not null,
  file_type text not null,
  scanned boolean default false,
  scan_status text default 'pending',
  created_at timestamptz default now()
);

alter table application_files enable row level security;

create policy "Users can manage own files"
  on application_files for all
  to authenticated
  using (
    application_id in (
      select id from applications where profile_id = auth.uid()
    )
  );
```

### 1.2 Indexes

```sql
create index idx_position_questions_position_id on position_questions(position_id);
create index idx_position_questions_sort_order on position_questions(sort_order);
create index idx_application_drafts_application_id on application_drafts(application_id);
create index idx_applications_answers on applications using gin(answers);
```

---

## 2. TypeScript Type Definitions

### 2.1 Core Types

```typescript
// src/types/application.ts

export type QuestionType = 'text' | 'textarea' | 'select' | 'multiselect' | 'number' | 'date' | 'file';

export interface ValidationRules {
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  patternMessage?: string;
  allowedFileTypes?: string[];
  maxFileSize?: number;
}

export interface SelectOption {
  value: string;
  label: string;
}

export interface PositionQuestion {
  id: string;
  positionId: string;
  type: QuestionType;
  label: string;
  placeholder?: string;
  description?: string;
  required: boolean;
  options: SelectOption[];
  validationRules: ValidationRules;
  sortOrder: number;
  templateId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ApplicationAnswer {
  questionId: string;
  value: string | string[] | number | Date | null;
  fileUrl?: string;
}
```

### 2.2 Form Schemas (Zod)

```typescript
// src/lib/validations/application.ts

import { z } from 'zod';

export const positionQuestionSchema = z.object({
  id: z.string().uuid().optional(),
  type: z.enum(['text', 'textarea', 'select', 'multiselect', 'number', 'date', 'file']),
  label: z.string().min(1).max(200),
  placeholder: z.string().max(200).optional(),
  description: z.string().max(500).optional(),
  required: z.boolean().default(false),
  options: z.array(z.object({ value: z.string(), label: z.string() })).default([]),
  validationRules: z.object({}).default({}),
  sortOrder: z.number().default(0),
});

export function createQuestionValidator(question: PositionQuestion) {
  let validator: z.ZodTypeAny;

  switch (question.type) {
    case 'text':
      validator = z.string();
      if (question.validationRules.minLength) {
        validator = validator.min(question.validationRules.minLength);
      }
      if (question.validationRules.maxLength) {
        validator = validator.max(question.validationRules.maxLength);
      }
      break;

    case 'textarea':
      validator = z.string();
      if (question.validationRules.minLength) {
        validator = validator.min(question.validationRules.minLength);
      }
      if (question.validationRules.maxLength) {
        validator = validator.max(question.validationRules.maxLength);
      }
      break;

    case 'number':
      validator = z.number();
      if (question.validationRules.min !== undefined) {
        validator = validator.min(question.validationRules.min);
      }
      if (question.validationRules.max !== undefined) {
        validator = validator.max(question.validationRules.max);
      }
      break;

    case 'select':
      validator = z.string();
      break;

    case 'multiselect':
      validator = z.array(z.string());
      break;

    default:
      validator = z.any();
  }

  if (!question.required) {
    validator = validator.optional().or(z.literal('')).or(z.literal(null));
  }

  return validator;
}
```

---

## 3. Form Builder UI Architecture

### 3.1 Component Structure

```
src/
├── app/
│   └── admin/
│       └── positions/
│           └── [id]/
│               └── questions/
│                   ├── page.tsx
│                   └── actions.ts
├── components/
│   └── form-builder/
│       ├── FormBuilder.tsx
│       ├── QuestionList.tsx
│       ├── QuestionCard.tsx
│       ├── QuestionEditor.tsx
│       ├── QuestionTypeSelector.tsx
│       ├── OptionsEditor.tsx
│       ├── ValidationEditor.tsx
│       └── TemplateSelector.tsx
└── hooks/
    └── useFormBuilder.ts
```

### 3.2 Key Components

#### FormBuilder.tsx

```typescript
'use client';

import { useState, useCallback } from 'react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { PositionQuestion } from '@/types/application';

interface FormBuilderProps {
  positionId: string;
  initialQuestions: PositionQuestion[];
  onSave: (questions: PositionQuestion[]) => Promise<void>;
}

export function FormBuilder({ positionId, initialQuestions, onSave }: FormBuilderProps) {
  const [questions, setQuestions] = useState<PositionQuestion[]>(initialQuestions);
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (active.id !== over?.id) {
      setQuestions((items) => {
        const oldIndex = items.findIndex((q) => q.id === active.id);
        const newIndex = items.findIndex((q) => q.id === over.id);
        return arrayMove(items, oldIndex, newIndex).map((q, idx) => ({
          ...q,
          sortOrder: idx,
        }));
      });
    }
  }, []);

  const handleAddQuestion = useCallback((type: QuestionType) => {
    const newQuestion: PositionQuestion = {
      id: `temp-${Date.now()}`,
      positionId,
      type,
      label: 'New Question',
      required: false,
      options: type === 'select' || type === 'multiselect' ? [] : undefined,
      validationRules: {},
      sortOrder: questions.length,
    };
    setQuestions([...questions, newQuestion]);
    setSelectedQuestionId(newQuestion.id);
  }, [positionId, questions]);

  return (
    <div className="flex h-full">
      <div className="flex-1 p-4">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={questions.map((q) => q.id)} strategy={verticalListSortingStrategy}>
            <QuestionList
              questions={questions}
              selectedId={selectedQuestionId}
              onSelect={setSelectedQuestionId}
            />
          </SortableContext>
        </DndContext>
        <QuestionTypeSelector onSelect={handleAddQuestion} />
      </div>
      {selectedQuestionId && (
        <div className="w-96 border-l p-4">
          <QuestionEditor question={questions.find((q) => q.id === selectedQuestionId)!} />
        </div>
      )}
    </div>
  );
}
```

---

## 4. Candidate Application Flow

### 4.1 ApplicationForm.tsx

```typescript
'use client';

import { useState, useCallback } from 'react';
import { useForm, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { PositionQuestion } from '@/types/application';
import { QuestionRenderer } from './QuestionRenderer';
import { ResumeUpload } from './ResumeUpload';
import { useAutoSave } from '@/hooks/useAutoSave';

interface ApplicationFormProps {
  positionId: string;
  positionTitle: string;
  questions: PositionQuestion[];
  existingApplication?: {
    id: string;
    answers: Record<string, unknown>;
    links: ApplicationLinks;
    resumeUrl?: string;
    status: string;
  };
}

export function ApplicationForm({
  positionId,
  positionTitle,
  questions,
  existingApplication,
}: ApplicationFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const buildValidationSchema = useCallback(() => {
    const shape: Record<string, z.ZodTypeAny> = {
      resumeFileId: z.string().uuid().optional(),
      links: z.object({
        linkedinUrl: z.string().url().optional().or(z.literal('')),
        githubUrl: z.string().url().optional().or(z.literal('')),
        scholarUrl: z.string().url().optional().or(z.literal('')),
        portfolioUrl: z.string().url().optional().or(z.literal('')),
        websiteUrl: z.string().url().optional().or(z.literal('')),
      }),
    };

    questions.forEach((question) => {
      shape[`question_${question.id}`] = createQuestionValidator(question);
    });

    return z.object(shape);
  }, [questions]);

  const methods = useForm({
    resolver: zodResolver(buildValidationSchema()),
    defaultValues: {
      resumeFileId: existingApplication?.resumeUrl || '',
      links: existingApplication?.links || {},
      ...Object.fromEntries(
        questions.map((q) => [
          `question_${q.id}`,
          existingApplication?.answers?.[q.id]?.value || '',
        ])
      ),
    },
    mode: 'onBlur',
  });

  const { watch, handleSubmit, formState: { isDirty } } = methods;

  const { lastSaved, isSaving, saveNow } = useAutoSave({
    applicationId: existingApplication?.id,
    watch,
    isDirty,
    onSave: async (data) => {
      const result = await saveDraft({
        applicationId: existingApplication?.id,
        positionId,
        data: transformFormData(data, questions),
      });
      return result.success;
    },
    debounceMs: 30000,
  });

  const onSubmit = async (data: Record<string, unknown>) => {
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const result = await submitApplication({
        applicationId: existingApplication?.id,
        positionId,
        data: transformFormData(data, questions),
      });

      if (result.success) {
        window.location.href = `/applications/${result.data.id}/confirmation`;
      } else {
        setSubmitError(result.error || 'Failed to submit application');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <FormProvider {...methods}>
      <form onSubmit={handleSubmit(onSubmit)} className="max-w-3xl mx-auto space-y-8">
        <h1>Apply for {positionTitle}</h1>

        <section>
          <h2>Resume / CV</h2>
          <ResumeUpload
            existingFileUrl={existingApplication?.resumeUrl}
            onUploadComplete={(fileId) => methods.setValue('resumeFileId', fileId)}
          />
        </section>

        <section>
          <h2>Application Questions</h2>
          {questions
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((question) => (
              <QuestionRenderer
                key={question.id}
                question={question}
                name={`question_${question.id}`}
              />
            ))}
        </section>

        {submitError && <div className="text-red-600">{submitError}</div>}

        <div className="flex justify-between">
          <button type="button" onClick={saveNow} disabled={isSaving || !isDirty}>
            {isSaving ? 'Saving...' : 'Save Draft'}
          </button>
          <button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Submitting...' : 'Submit Application'}
          </button>
        </div>
      </form>
    </FormProvider>
  );
}
```

---

## 5. Auto-Save Implementation

### 5.1 useAutoSave Hook

```typescript
// src/hooks/useAutoSave.ts

import { useEffect, useRef, useCallback, useState } from 'react';
import { UseFormWatch } from 'react-hook-form';

interface UseAutoSaveOptions<T> {
  applicationId?: string;
  watch: UseFormWatch<T>;
  isDirty: boolean;
  onSave: (data: T) => Promise<boolean>;
  debounceMs?: number;
}

export function useAutoSave<T extends Record<string, unknown>>({
  applicationId,
  watch,
  isDirty,
  onSave,
  debounceMs = 30000,
}: UseAutoSaveOptions<T>) {
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastDataRef = useRef<T | null>(null);

  const save = useCallback(async (data: T) => {
    if (isSaving) return;
    if (JSON.stringify(data) === JSON.stringify(lastDataRef.current)) return;

    setIsSaving(true);
    try {
      const success = await onSave(data);
      if (success) {
        setLastSaved(new Date());
        lastDataRef.current = data;
      }
    } finally {
      setIsSaving(false);
    }
  }, [isSaving, onSave]);

  const saveNow = useCallback(async () => {
    const data = watch();
    await save(data);
  }, [watch, save]);

  useEffect(() => {
    if (!applicationId || !isDirty) return;

    const subscription = watch((data) => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => save(data as T), debounceMs);
    });

    return () => {
      subscription.unsubscribe();
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [watch, isDirty, applicationId, debounceMs, save]);

  return { lastSaved, isSaving, saveNow };
}
```

### 5.2 Server Actions

```typescript
// src/app/(portal)/positions/[slug]/apply/actions.ts

'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';

const saveDraftSchema = z.object({
  applicationId: z.string().uuid().optional(),
  positionId: z.string().uuid(),
  data: z.object({
    resumeFileId: z.string().uuid().optional(),
    links: z.object({}),
    answers: z.record(z.string(), z.any()),
  }),
});

export async function saveDraft(input: unknown) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Not authenticated' };

  const parsed = saveDraftSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: 'Invalid input' };

  const { applicationId, positionId, data } = parsed.data;

  try {
    let appId = applicationId;

    if (!appId) {
      const { data: application, error: createError } = await supabase
        .from('applications')
        .insert({
          profile_id: user.id,
          position_id: positionId,
          status: 'started',
          started_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (createError) throw createError;
      appId = application.id;
    }

    const { error: draftError } = await supabase
      .from('application_drafts')
      .upsert({
        application_id: appId,
        answers: data.answers,
        resume_url: data.resumeFileId,
        saved_at: new Date().toISOString(),
      }, { onConflict: 'application_id' });

    if (draftError) throw draftError;

    return { success: true, data: { id: appId } };
  } catch (error) {
    console.error('Save draft error:', error);
    return { success: false, error: 'Failed to save draft' };
  }
}

export async function submitApplication(input: unknown) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Not authenticated' };

  // Validate all required questions are answered
  // Update application to submitted status
  // Delete draft after successful submission

  revalidatePath('/applications');
  return { success: true, data: application };
}
```

---

## 6. File Upload Handling

### 6.1 Resume Upload Component

```typescript
// src/components/application/ResumeUpload.tsx

'use client';

import { useState, useCallback } from 'react';
import { useFormContext } from 'react-hook-form';
import { createClient } from '@/lib/supabase/client';

interface ResumeUploadProps {
  existingFileUrl?: string;
  onUploadComplete: (fileId: string) => void;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

export function ResumeUpload({ existingFileUrl, onUploadComplete }: ResumeUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [currentFile, setCurrentFile] = useState<string | null>(existingFileUrl || null);

  const validateFile = (file: File): string | null => {
    if (!ALLOWED_TYPES.includes(file.type)) return 'Please upload a PDF or Word document';
    if (file.size > MAX_FILE_SIZE) return 'File size must be less than 10MB';
    return null;
  };

  const handleFileSelect = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const validationError = validateFile(file);
    if (validationError) return;

    setIsUploading(true);
    setUploadProgress(0);

    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}/${Date.now()}.${fileExt}`;
      const filePath = `resumes/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('application-files')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false,
        });

      if (uploadError) throw uploadError;

      const { data: fileRecord, error: dbError } = await supabase
        .from('application_files')
        .insert({
          filename: fileName,
          original_name: file.name,
          mime_type: file.type,
          size_bytes: file.size,
          storage_path: filePath,
          file_type: 'resume',
        })
        .select()
        .single();

      if (dbError) throw dbError;

      setCurrentFile(file.name);
      onUploadComplete(fileRecord.id);
    } catch (error) {
      console.error('Upload error:', error);
    } finally {
      setIsUploading(false);
    }
  }, [onUploadComplete]);

  return (
    <div className="border rounded-lg p-4">
      {currentFile ? (
        <div className="flex items-center justify-between">
          <span>{currentFile}</span>
          <button onClick={() => setCurrentFile(null)}>Remove</button>
        </div>
      ) : (
        <div>
          <input type="file" accept=".pdf,.doc,.docx" onChange={handleFileSelect} disabled={isUploading} />
          {isUploading && <p>Uploading... {uploadProgress}%</p>}
        </div>
      )}
    </div>
  );
}
```

---

## 7. Implementation Phases

### Phase 1: Database Setup (Day 1)
1. Create migration files for all tables
2. Set up RLS policies
3. Create indexes and triggers
4. Set up Supabase Storage bucket

### Phase 2: Form Builder (Days 2-3)
1. Implement question type definitions and schemas
2. Build FormBuilder container component
3. Implement QuestionList with drag-and-drop
4. Build QuestionEditor for each question type
5. Create template management

### Phase 3: Candidate Application Form (Days 4-5)
1. Build ApplicationForm container
2. Implement QuestionRenderer with all question types
3. Create individual question components
4. Build LinksSection
5. Implement ResumeUpload component

### Phase 4: Auto-Save & Drafts (Day 6)
1. Implement useAutoSave hook
2. Create draft storage endpoints
3. Build DraftSavedIndicator UI
4. Add "In Progress" applications list

### Phase 5: File Upload & Storage (Day 7)
1. Configure Supabase Storage
2. Implement file upload with progress
3. Add file validation
4. Create file metadata tracking

### Phase 6: Testing & Polish (Day 8)
1. Write unit tests for validation logic
2. Add integration tests
3. Test auto-save functionality
4. Verify RLS policies

---

## 8. Critical Files for Implementation

- `/src/types/application.ts` - Core TypeScript interfaces
- `/src/lib/validations/application.ts` - Zod schemas
- `/src/components/form-builder/FormBuilder.tsx` - HR form builder UI
- `/src/components/application/ApplicationForm.tsx` - Candidate application form
- `/src/hooks/useAutoSave.ts` - Auto-save functionality
