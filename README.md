# OPH-KI — Order Intelligence Platform

> Eine mandantenfähige SaaS-Plattform, die Dentalprodukt-Herstellern ermöglicht, eingehende Bestellungen aus E-Mails (PDF, Excel, CSV) automatisch per KI in strukturierte Daten zu überführen und als ERP-kompatible Dateien zu exportieren.

**Live:** [oph.ids.online](https://oph.ids.online)
**Repo:** [mycal2/oph-ki](https://github.com/mycal2/oph-ki)

---

## What This Project Does

Dental product manufacturers receive orders daily via email — often as PDF or Excel attachments from dealers like Henry Schein, Dental Depot, etc. Today these are processed manually into ERP systems (SAP, Dynamics 365, Sage). This platform automates that:

1. **Email ingestion** — Orders arrive via email forwarding to the platform
2. **AI extraction** — Claude API reads PDF/Excel attachments and extracts structured order data (article numbers, quantities, prices, customer info)
3. **Dealer recognition** — Global dealer profiles with extraction hints ensure consistent parsing across all tenants
4. **Human review** — Tenant users verify and correct extracted data before export
5. **ERP export** — Download structured CSV/XML/JSON files ready for ERP import

The key insight: dealer order formats are the same regardless of which manufacturer receives them. So extraction rules are maintained globally and reused across all tenants.

---

## Getting Started (New Developer)

### Prerequisites

- Node.js 20+
- A Supabase account (for database, auth, storage)
- Access to the Supabase project (ask Michael for an invite)
- A Postmark account (for email ingestion + sending)
- An Anthropic API key (for AI extraction)

### Setup

```bash
git clone https://github.com/mycal2/oph-ki.git
cd oph-ki
npm install
cp .env.local.example .env.local
# Fill in your environment variables (see .env.local.example for docs on each)
npm run dev
```

The dev server runs on `http://localhost:3003`.

### Environment Variables

All required env vars are documented in `.env.local.example`. The key ones:

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase admin key (server-side only) |
| `ANTHROPIC_API_KEY` | Claude API for AI extraction |
| `POSTMARK_SERVER_API_TOKEN` | Outbound email sending |
| `POSTMARK_INBOUND_WEBHOOK_TOKEN` | Inbound email webhook auth |
| `INBOUND_EMAIL_DOMAIN` | Domain for tenant-specific inbound addresses |

---

## Tech Stack

| Category | Tool |
|----------|------|
| **Framework** | Next.js 16 (App Router), TypeScript |
| **Styling** | Tailwind CSS + shadcn/ui |
| **Backend** | Supabase (PostgreSQL + Auth + Storage + RLS) |
| **AI** | Claude API (Anthropic) for order data extraction |
| **Email** | Postmark (inbound webhook + outbound transactional) |
| **Validation** | Zod + react-hook-form |
| **Deployment** | Vercel |

---

## Project Structure

```
oph-ki/
├── src/
│   ├── app/                         # Pages (Next.js App Router)
│   │   ├── (protected)/             # Auth-gated routes
│   │   │   ├── admin/               # Platform admin pages
│   │   │   ├── orders/              # Order upload, list, review
│   │   │   └── settings/            # Tenant settings
│   │   └── api/                     # API routes
│   │       ├── admin/               # Platform admin APIs
│   │       ├── inbound/email/       # Postmark webhook endpoint
│   │       ├── orders/              # Order CRUD + extraction
│   │       └── articles/            # Article catalog APIs
│   ├── components/
│   │   ├── ui/                      # shadcn/ui primitives (never recreate!)
│   │   ├── admin/                   # Platform admin components
│   │   ├── orders/                  # Order list, review, upload
│   │   ├── article-catalog/         # Artikelstamm management
│   │   └── customer-catalog/        # Kundenstamm management
│   ├── hooks/                       # Custom React hooks
│   └── lib/                         # Utilities (supabase, postmark, types, validations)
├── features/                        # Feature specifications (OPH-X-name.md)
│   └── INDEX.md                     # Feature status tracking
├── hints/                           # Dealer extraction hint documentation
├── docs/
│   └── PRD.md                       # Product Requirements Document
├── supabase/
│   └── migrations/                  # Database migrations
└── .claude/
    ├── skills/                      # AI-powered development workflows
    ├── rules/                       # Auto-applied coding rules
    └── agents/                      # Sub-agent configurations
```

---

## Development Workflow

We use [Claude Code](https://docs.anthropic.com/en/docs/claude-code) with specialized skills (slash commands) for the full development lifecycle:

```
1. Define    /requirements  →  Feature spec in features/OPH-X.md
2. Design    /architecture  →  Tech design added to feature spec
3. Build     /frontend      →  UI components implemented
             /backend       →  APIs + database + RLS policies
4. Test      /qa            →  Test results added to feature spec
5. Ship      /deploy        →  Deployed to Vercel
```

### Operational Skills

| Command | What It Does |
|---------|-------------|
| `/dealerrule` | Analyzes order documents and generates dealer extraction hints |
| `/help` | Context-aware guide: shows where you are and what to do next |

### Feature Tracking

All features are tracked in `features/INDEX.md` with status (Planned → In Progress → In Review → Deployed). Each feature has its own spec file: `features/OPH-X-feature-name.md`. The full product roadmap is in `docs/PRD.md`.

Every skill reads INDEX.md at start and updates it when done.

---

## Key Concepts

### Multi-Tenancy
Every tenant (= dental manufacturer) has isolated data via Supabase Row Level Security (RLS). Tenants see only their own orders, articles, and customers. Platform admins see everything.

### Roles
- **platform_admin** — manages all tenants, dealers, and platform settings
- **tenant_admin** — manages their own tenant: users, article/customer catalogs, settings
- **tenant_user** — uploads orders, reviews extractions, downloads exports

### Dealer Profiles (Global)
Dealers (Henry Schein, Dental Depot, etc.) are maintained globally — not per tenant. Each dealer can have:
- **Extraction hints** — text instructions that override default AI extraction behavior
- **Column mappings** — explicit field-to-column assignments for structured documents
- **Data transformations** — article number mappings, unit conversions

### Order Flow
```
Email arrives → Postmark webhook → Dealer recognition → AI extraction
→ Human review → ERP export (CSV/XML/JSON)
```

---

## Commands

```bash
npm run dev        # Dev server (localhost:3003)
npm run build      # Production build
npm run lint       # ESLint
npm run start      # Production server
```

---

## How the AI Workflow Works Under the Hood

### Skills (`.claude/skills/`)
Each skill is a structured workflow auto-discovered by Claude Code. Some run inline (interactive), others as forked sub-agents (heavy work in isolated context):

| Skill | Execution | Why |
|-------|-----------|-----|
| `/requirements` | Inline | Needs live user interaction |
| `/architecture` | Inline | Short output, real-time review |
| `/frontend` | Sub-agent | Heavy file editing |
| `/backend` | Sub-agent | SQL, APIs, migrations |
| `/qa` | Sub-agent | Systematic testing |
| `/deploy` | Inline | Needs user oversight |
| `/dealerrule` | Inline (Sonnet) | Interactive document analysis |

### Rules (`.claude/rules/`)
Coding standards auto-applied based on which files are being edited. Covers frontend (shadcn/ui first), backend (RLS, validation), security (secrets, headers), and general conventions.

### Context Engineering
- State lives in files (`features/INDEX.md`, feature specs), not in conversation memory
- Skills re-read files after context compaction — nothing is lost between sessions
- Heavy skills run as forked sub-agents to keep the main context clean
- Global rule: always read a file before modifying it, never guess at imports or paths
