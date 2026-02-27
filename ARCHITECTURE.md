# AI QA Automation Platform – Architecture

## Folder Structure

```
qa/
├── prisma/
│   └── schema.prisma           # DB schema, RBAC, encrypted fields
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── (auth)/             # Auth routes (login, callback)
│   │   ├── (dashboard)/        # Protected dashboard layout
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx        # Dashboard home
│   │   │   ├── projects/       # Project CRUD, list
│   │   │   ├── environments/   # Environment CRUD
│   │   │   ├── test-cases/     # Test case management
│   │   │   ├── executions/     # Execution history, detail
│   │   │   ├── schedules/      # Scheduler UI
│   │   │   ├── config/         # System config (admin)
│   │   │   └── users/          # User management (admin)
│   │   ├── api/                # API routes
│   │   │   ├── auth/
│   │   │   ├── projects/
│   │   │   ├── environments/
│   │   │   ├── test-cases/
│   │   │   ├── executions/
│   │   │   ├── schedules/
│   │   │   ├── config/
│   │   │   ├── users/
│   │   │   └── ai/             # AI test plan generation
│   │   ├── layout.tsx          # Root layout (dark theme)
│   │   └── globals.css
│   ├── components/
│   │   ├── ui/                 # shadcn components
│   │   ├── dashboard/          # Dashboard widgets, cards, charts
│   │   ├── projects/
│   │   ├── executions/
│   │   └── layout/             # Sidebar, header
│   └── lib/
│       ├── db/                 # Prisma client, helpers
│       ├── auth/               # JWT, RBAC, session
│       ├── queue/              # BullMQ queues, job types
│       ├── storage/            # S3 abstraction
│       ├── scheduler/          # Cron runner, project schedules
│       ├── ai/                 # OpenAI, structured plan generation
│       ├── encryption/         # Field encryption for credentials
│       └── validations/        # Zod schemas
├── worker/                     # QA Execution Worker (Node.js)
│   ├── index.ts                # Worker entry, job processor
│   ├── playwright-runner.ts    # Playwright execution
│   ├── ai-resolver.ts          # OpenAI step resolution
│   └── artifact-upload.ts      # S3 upload from worker
├── ARCHITECTURE.md
├── package.json
├── tsconfig.json
├── next.config.js
├── tailwind.config.ts
├── postcss.config.js
└── .env.example
```

## RBAC

- **admin**: manage users, manage schedule, manage global config
- **manager**: trigger execution, view reports, create test cases
- **qa**: create/edit test cases, view execution results

## Data Flow

1. **Enqueue**: API receives run request → validates → enqueues job to Redis (BullMQ).
2. **Worker**: Picks job → runs Playwright → calls OpenAI for step resolution → uploads artifacts to S3 → updates Execution in DB.
3. **Scheduler**: Cron runner evaluates project schedules → enqueues execution jobs per schedule.

## API route structure

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | /api/auth/login | - | Login (email/password), sets cookie |
| POST | /api/auth/logout | - | Clear session cookie |
| GET | /api/auth/me | ✓ | Current user |
| GET | /api/health | - | DB + Redis status |
| GET/POST | /api/projects | manager+ | List, create |
| GET/PATCH | /api/projects/[id] | ✓ | Get, update |
| GET/POST | /api/environments | manager+ | List (by projectId), create |
| GET/PATCH | /api/environments/[id] | ✓ | Get (decrypt creds), update |
| GET/POST | /api/test-cases | manager+ | List (by projectId), create |
| GET/PATCH | /api/test-cases/[id] | ✓ | Get, update |
| GET/POST | /api/executions | trigger/ view | List, trigger run (enqueue) |
| GET | /api/executions/[id] | ✓ | Execution detail |
| GET/POST | /api/schedules | schedule/ view | List, create (sets nextRunAt) |
| GET/PATCH/DELETE | /api/schedules/[id] | ✓ | Get, update, delete |
| GET/PATCH | /api/config | admin | System config keys |
| GET/POST | /api/users | admin | List, create user |
| POST | /api/ai/generate-plan | manager+ | AC → structured plan (Zod), optional save |

## Stack

- **Frontend**: Next.js (App Router), TypeScript, Tailwind, shadcn/ui, Recharts, dark theme only.
- **Backend**: PostgreSQL, Prisma, Redis/BullMQ, S3-compatible storage, JWT, Zod.
- **Worker**: Node.js, Playwright, OpenAI SDK, S3 client.
