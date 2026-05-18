# OPH-KI Agentic workflow

> A Next.js template with an AI-powered development workflow using specialized skills for Requirements, Architecture, Frontend, Backend, QA, and Deployment.

## Tech Stack

- **Framework:** Next.js 16 (App Router), TypeScript
- **Styling:** Tailwind CSS + shadcn/ui (copy-paste components)
- **Backend:** Supabase (PostgreSQL + Auth + Storage) - optional
- **Deployment:** Vercel
- **Validation:** Zod + react-hook-form
- **State:** React useState / Context API

## Project Structure

```
src/
  app/              Pages (Next.js App Router)
  components/
    ui/             shadcn/ui components (NEVER recreate these)
  hooks/            Custom React hooks
  lib/              Utilities (supabase.ts, utils.ts)
features/           Feature specifications (OPH-X-name.md)
  INDEX.md          Feature status overview
docs/
  OPH-PRD.md        Product Requirements Document (OPH Platform)
  SALESFORCE-PRD.md  Product Requirements Document (Salesforce App)
  production/       Production guides (Sentry, security, performance)
```

## Development Workflow

1. `/requirements` - Create feature spec from idea
2. `/architecture` - Design tech architecture (PM-friendly, no code)
3. `/frontend` - Build UI components (shadcn/ui first!)
4. `/backend` - Build APIs, database, RLS policies
5. `/qa` - Test against acceptance criteria + security audit
6. `/deploy` - Deploy to Vercel + production-ready checks

### Operational Skills

- `/dealerrule` - Generate structured extraction hints for dealer profiles. Analyzes example order documents (PDF, Excel, CSV) to create precise hints that guide the AI extraction engine. Also creates dealer documentation in `dealerrules/`.

## Multi-Developer Workflow (PR-based, CI-gated)

`main` is protected: direct pushes are blocked, every change ships through a pull request.

### Branch naming

- `feat/OPH-X-short-name` — new features
- `fix/OPH-X-short-name` — bug fixes
- `chore/short-name` — non-feature work (CI, deps, docs only)
- `refactor/OPH-X-short-name` — refactors

### Per-change flow

```bash
git checkout main && git pull
git checkout -b feat/OPH-111-something
# make changes, commit (commit messages still follow `type(OPH-X): description`)
git push -u origin feat/OPH-111-something
gh pr create   # PR template auto-loads from .github/pull_request_template.md
```

### Merge gates (set on `main` branch protection)

- 1 approving review required
- `Build` CI check must be green (runs `npm run build` — includes TypeScript typecheck)
- Branch must be up to date with `main` before merge
- Force pushes and deletions disabled
- Admins are NOT exempt — applies to everyone

### Conflict avoidance for `features/INDEX.md` and the OPH-X counter

Every feature spec touches `features/INDEX.md` and bumps "Next Available ID". With multiple PRs in flight you will get merge conflicts. Mitigation:

- Reserve the next OPH-X ID in the PR *title* the moment you open the PR. Don't wait — even an empty PR with just the title reserves the slot for reviewers.
- If two PRs both grab the same ID, the second to merge updates `INDEX.md` to take the next one.
- `INDEX.md` conflicts are always trivial to resolve: keep both rows, take the higher "Next Available ID".

### CI

`.github/workflows/ci.yml` runs on every PR + push to `main`:

- `npm ci`
- `npm run build` (TypeScript typecheck included)

`npm run lint` is currently broken (Next 16 + ESLint 9 legacy-config incompatibility) — skipped in CI until the lint setup is migrated to flat config.

### Supabase Branching (staged — not yet activated)

`supabase/config.toml` is committed and ready. To activate per-PR isolated databases:

1. Upgrade the Supabase org's plan to **Pro** ($25/mo): https://supabase.com/dashboard/org/_/billing
2. Enable Branching on the **dev** project (`ocrqzesxmalebpikutwv`): https://supabase.com/dashboard/project/ocrqzesxmalebpikutwv/branches
3. Connect the GitHub repo (`IDS-online/oph-ki`) via the same page; pick `main` as the production branch and `supabase/migrations` as the migration folder
4. Authorise the Supabase ↔ Vercel integration so PR previews receive branch-specific env vars

Until activated, all devs share the dev Supabase (`ocrqzesxmalebpikutwv`) — fine for solo work, friction once a 2nd dev joins.

## Feature Tracking

All features tracked in `features/INDEX.md`. Every skill reads it at start and updates it when done. Feature specs live in `features/OPH-X-name.md`.

## Key Conventions

- **Feature IDs:** OPH-1, OPH-2, etc. (sequential)
- **Commits:** `feat(OPH-X): description`, `fix(OPH-X): description`
- **Single Responsibility:** One feature per spec file
- **shadcn/ui first:** NEVER create custom versions of installed shadcn components
- **Human-in-the-loop:** All workflows have user approval checkpoints

## Build & Test Commands

```bash
npm run dev        # Development server (http://localhost:3003)
npm run build      # Production build (TypeScript typecheck included)
npm run start      # Production server
# npm run lint     # Currently broken — Next 16 + ESLint 9 flat-config migration pending
```

## Product Context

@docs/OPH-PRD.md

## Feature Overview

@features/INDEX.md
