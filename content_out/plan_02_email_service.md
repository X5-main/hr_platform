# Email Service Implementation Plan

## 1. Email Provider Comparison and Recommendation

### 1.1 Provider Analysis

| Provider | Best For | Starting Price | Free Tier | Developer Experience | SMTP |
|----------|----------|---------------|-----------|---------------------|------|
| **Resend** | Modern SaaS, React/Next.js | $20/mo (50K) | 3,000/mo | Excellent | No |
| **SendGrid** | Enterprise, marketing + transactional | $19.95/mo (50K) | 100/day | Good | Yes |
| **AWS SES** | High-volume, cost-conscious | $0.10/1K emails | 3,000/mo (1yr) | Complex | Yes |
| **Postmark** | Critical transactional | $15/mo (10K) | 100/mo | Excellent | Yes |

### 1.2 Recommendation: Resend

**Rationale for HR Screening Platform:**
1. **React Email Integration**: Seamless integration with React components for type-safe templates
2. **Developer Velocity**: Minimal setup time, excellent TypeScript support
3. **Cost-Effective**: $20/month for 50K emails fits expected volume
4. **Modern Stack Alignment**: Matches Next.js 14 + TypeScript architecture
5. **Immediate Start**: No lengthy approval process for sandbox exit

---

## 2. Email Template System Design

### 2.1 Architecture Overview

```
src/
├── emails/                    # Email templates directory
│   ├── components/            # Reusable email components
│   │   ├── Layout.tsx         # Base layout wrapper
│   │   ├── Header.tsx         # Company header
│   │   ├── Footer.tsx         # Company footer
│   │   └── Button.tsx         # CTA button component
│   ├── templates/             # Specific email templates
│   │   ├── screening-pass.tsx
│   │   ├── screening-fail.tsx
│   │   ├── welcome.tsx
│   │   └── magic-link.tsx
│   └── index.ts               # Template exports
├── lib/
│   ├── email/
│   │   ├── client.ts          # Resend client configuration
│   │   ├── sender.ts          # Email sending logic
│   │   └── renderer.tsx       # Template rendering
│   └── queue/
│       └── email-queue.ts     # BullMQ queue setup
```

### 2.2 Template Implementation with React Email

**Base Layout Component** (`src/emails/components/Layout.tsx`):

```tsx
import { Html, Head, Body, Container, Section, Text } from '@react-email/components'

interface LayoutProps {
  children: React.ReactNode
  previewText: string
}

export function Layout({ children, previewText }: LayoutProps) {
  return (
    <Html>
      <Head />
      <Body style={main}>
        <Container style={container}>
          <Section style={header}>
            <Text style={brand}>HR Screening Platform</Text>
          </Section>
          {children}
          <Section style={footer}>
            <Text style={footerText}>
              This is an automated message from the HR Screening Platform.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}
```

**Screening Pass Template** (`src/emails/templates/screening-pass.tsx`):

```tsx
import { Section, Text, Button } from '@react-email/components'
import { Layout } from '../components/Layout'

interface ScreeningPassEmailProps {
  candidateName: string
  positionTitle: string
  nextStepsUrl: string
  companyName: string
}

export function ScreeningPassEmail({
  candidateName,
  positionTitle,
  nextStepsUrl,
  companyName,
}: ScreeningPassEmailProps) {
  return (
    <Layout previewText={`Congratulations! You've advanced to the next round for ${positionTitle}`}>
      <Section>
        <Text style={greeting}>Hi {candidateName},</Text>
        <Text style={paragraph}>
          Congratulations! We are pleased to inform you that you have successfully
          passed the initial screening for the <strong>{positionTitle}</strong> position
          at {companyName}.
        </Text>
        <Section style={ctaSection}>
          <Button href={nextStepsUrl} style={button}>
            Schedule Your Technical Interview
          </Button>
        </Section>
      </Section>
    </Layout>
  )
}
```

---

## 3. BullMQ/Redis Queue Integration

### 3.1 Queue Configuration

```typescript
// src/lib/queue/email-queue.ts
import { Queue, Worker, Job } from 'bullmq'
import { Redis } from 'ioredis'

const redisConnection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
})

// Email job data interface
export interface EmailJobData {
  to: string
  subject: string
  templateName: 'screening-pass' | 'screening-fail' | 'welcome' | 'magic-link'
  templateProps: Record<string, unknown>
  metadata?: {
    applicationId?: string
    userId?: string
    trackingId?: string
  }
}

// Email queue with 10-minute delay support
export const emailQueue = new Queue<EmailJobData>('email-queue', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
    removeOnComplete: {
      age: 24 * 60 * 60,
      count: 1000,
    },
    removeOnFail: {
      age: 7 * 24 * 60 * 60,
      count: 5000,
    },
    timeout: 30000,
  },
})

// Add email with 10-minute delay (for screening results)
export async function queueScreeningResultEmail(
  data: EmailJobData,
  delayMinutes: number = 10
): Promise<Job<EmailJobData>> {
  const delayMs = delayMinutes * 60 * 1000

  return emailQueue.add('send-email', data, {
    delay: delayMs,
    jobId: `screening-${data.metadata?.applicationId}-${Date.now()}`,
    priority: 1,
  })
}
```

### 3.2 Worker Implementation

```typescript
// src/lib/queue/email-worker.ts
import { Worker, Job } from 'bullmq'
import { emailQueue, EmailJobData } from './email-queue'
import { sendEmail } from '../email/sender'
import { prisma } from '../db'

const emailWorker = new Worker<EmailJobData>(
  'email-queue',
  async (job: Job<EmailJobData>) => {
    const { to, subject, templateName, templateProps, metadata } = job.data

    await job.updateProgress(10)

    console.log(`[Email Worker] Processing job ${job.id} - Attempt ${job.attemptsMade + 1}`)

    const result = await sendEmail({
      to,
      subject,
      templateName,
      templateProps,
    })

    await job.updateProgress(50)

    if (metadata?.applicationId) {
      await prisma.emailLog.create({
        data: {
          applicationId: metadata.applicationId,
          templateName,
          status: 'sent',
          sentAt: new Date(),
          messageId: result.id,
          attempts: job.attemptsMade + 1,
        },
      })
    }

    await job.updateProgress(100)

    return {
      success: true,
      messageId: result.id,
      timestamp: new Date().toISOString(),
    }
  },
  {
    connection: redisConnection,
    concurrency: 5,
    limiter: {
      max: 100,
      duration: 60000,
    },
  }
)

// Graceful shutdown
process.on('SIGTERM', async () => {
  await emailWorker.close()
  await emailQueue.close()
})
```

---

## 4. Delivery Tracking and Retry Mechanisms

### 4.1 Database Schema for Email Tracking

```prisma
// prisma/schema.prisma additions
model EmailLog {
  id            String        @id @default(cuid())
  applicationId String?
  userId        String?
  templateName  String
  status        EmailStatus   @default(pending)
  to            String
  subject       String
  messageId     String?
  sentAt        DateTime?
  deliveredAt   DateTime?
  openedAt      DateTime?
  clickedAt     DateTime?
  bouncedAt     DateTime?
  bounceReason  String?
  attempts      Int           @default(0)
  errorMessage  String?
  createdAt     DateTime      @default(now())
  updatedAt     DateTime      @updatedAt

  @@index([applicationId])
  @@index([status])
  @@index([createdAt])
  @@index([messageId])
}

enum EmailStatus {
  pending
  queued
  sent
  delivered
  opened
  clicked
  bounced
  failed
  retrying
}
```

### 4.2 Webhook Handler for Delivery Events

```typescript
// src/app/api/webhooks/email/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyWebhookSignature } from '@/lib/email/webhook-verify'

interface ResendWebhookPayload {
  type: 'email.sent' | 'email.delivered' | 'email.opened' | 'email.clicked' | 'email.bounced' | 'email.complained'
  data: {
    email_id: string
    to: string[]
    subject: string
    created_at: string
    bounce_type?: 'hard' | 'soft'
    bounce_message?: string
  }
}

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json() as ResendWebhookPayload
    const signature = request.headers.get('resend-signature')

    if (!verifyWebhookSignature(payload, signature, process.env.RESEND_WEBHOOK_SECRET)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }

    const { type, data } = payload

    switch (type) {
      case 'email.sent':
        await handleSent(data)
        break
      case 'email.delivered':
        await handleDelivered(data)
        break
      case 'email.opened':
        await handleOpened(data)
        break
      case 'email.clicked':
        await handleClicked(data)
        break
      case 'email.bounced':
        await handleBounced(data)
        break
      case 'email.complained':
        await handleComplained(data)
        break
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Email Webhook] Error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

async function handleDelivered(data: ResendWebhookPayload['data']) {
  await prisma.emailLog.updateMany({
    where: { messageId: data.email_id },
    data: {
      status: 'delivered',
      deliveredAt: new Date(),
    },
  })
}

async function handleBounced(data: ResendWebhookPayload['data']) {
  const emailLog = await prisma.emailLog.findFirst({
    where: { messageId: data.email_id },
  })

  if (!emailLog) return

  if (data.bounce_type === 'hard') {
    await prisma.emailLog.update({
      where: { id: emailLog.id },
      data: {
        status: 'bounced',
        bouncedAt: new Date(),
        bounceReason: data.bounce_message,
      },
    })
  } else {
    await prisma.emailLog.update({
      where: { id: emailLog.id },
      data: {
        status: 'retrying',
        bounceReason: data.bounce_message,
      },
    })
  }
}
```

---

## 5. SPF/DKIM/DMARC Setup for Deliverability

### 5.1 DNS Record Configuration

**SPF Record** (TXT record for `yourdomain.com`):

```
v=spf1 include:_spf.resend.com -all
```

**DKIM Record** (provided by Resend after domain verification):

```
resend._domainkey.yourdomain.com TXT "v=DKIM1; k=rsa; p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC1TaNgLlSyQMNWVLNLvyY/neDgaL2oqQE8T5illKqCgDtFHc8eHVAU+nlcaGmrKmDMw9dbgiGk1ocgZ56NR4ycfUHwQhvQPMUZw0cveel/8EAGoi/UyPmqfcPibytH81NFtTMAxUeM4Op8A6iHkvAMj5qLf4YRNsTkKAKW3OkwPQIDAQAB"
```

**DMARC Record** (progressive rollout):

Phase 1 - Monitoring (2 weeks):
```
_dmarc.yourdomain.com TXT "v=DMARC1; p=none; rua=mailto:dmarc@yourdomain.com; ruf=mailto:dmarc@yourdomain.com; fo=1"
```

Phase 2 - Quarantine (2 weeks):
```
_dmarc.yourdomain.com TXT "v=DMARC1; p=quarantine; pct=25; rua=mailto:dmarc@yourdomain.com"
```

Phase 3 - Full enforcement:
```
_dmarc.yourdomain.com TXT "v=DMARC1; p=reject; rua=mailto:dmarc@yourdomain.com; aspf=r; adkim=r"
```

---

## 6. Environment Variables

```bash
# Email Service Configuration
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxxxxxxxxx
RESEND_FROM_EMAIL=noreply@yourdomain.com
RESEND_FROM_NAME="HR Screening Platform"
RESEND_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxx

# Queue Configuration
REDIS_URL=redis://localhost:6379

# Application URLs
APP_URL=https://app.yourdomain.com
```

---

## 7. Implementation Checklist

### Phase 1: Foundation
- [ ] Install dependencies (`resend`, `@react-email/components`, `bullmq`)
- [ ] Set up Resend account and verify domain
- [ ] Configure SPF/DKIM/DMARC DNS records
- [ ] Create base email templates (Layout, Header, Footer)
- [ ] Implement email rendering service

### Phase 2: Queue Integration
- [ ] Set up BullMQ email queue with Redis
- [ ] Implement email worker with retry logic
- [ ] Create queue monitoring dashboard
- [ ] Add 10-minute delay functionality for screening results

### Phase 3: Templates
- [ ] Screening pass email template
- [ ] Screening fail email template
- [ ] Welcome email template
- [ ] Magic link authentication email

### Phase 4: Tracking & Reliability
- [ ] Implement webhook handler for delivery events
- [ ] Create EmailLog database schema
- [ ] Set up dead letter queue for failed emails
- [ ] Add delivery analytics dashboard

### Phase 5: Deliverability
- [ ] Complete domain warmup
- [ ] Monitor Postmaster Tools and SNDS
- [ ] Set up alerting for delivery issues
- [ ] Document runbook for common issues

---

### Critical Files for Implementation

- `/src/lib/queue/email-queue.ts` - BullMQ queue configuration with 10-minute delay support
- `/src/lib/queue/email-worker.ts` - Worker implementation with retry logic and delivery tracking
- `/src/lib/email/sender.ts` - Resend API client and email sending logic
- `/src/emails/templates/screening-pass.tsx` - Pass notification template
- `/src/emails/templates/screening-fail.tsx` - Fail notification template
- `/src/app/api/webhooks/email/route.ts` - Delivery event webhook handler
- `/prisma/schema.prisma` - EmailLog model for tracking delivery status
