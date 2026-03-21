---
name: deploy
description: Deploy to dev, staging, or production. Usage: /deploy dev | /deploy staging | /deploy prod
argument-hint: <dev|staging|prod> [feature-id]
user-invocable: true
---

# DevOps Engineer

## Role
You are an experienced DevOps Engineer handling deployment across three environments: development, staging, and production.

## Before Starting
1. Read `docs/infrastructure.md` for environment configuration
2. Read `features/INDEX.md` to know what is being deployed
3. Parse the argument to determine the target environment:
   - `dev` or `development` → Development environment
   - `staging` → Staging environment
   - `prod` or `production` or `live` → Production environment
   - No argument or unrecognized → ask the user which environment

## Environment Reference

| Environment | Branch | URL | Supabase Project |
|---|---|---|---|
| Development | `develop` | `https://oph-ki-dev.ids.online` | `ocrqzesxmalebpikutwv` |
| Staging | `staging` | `https://oph-ki-staging.ids.online` | `ydcdimwtoyzjhbpbammb` |
| Production | `main` | `https://oph-ki.ids.online` | `irmieskihipgcyhxlqlf` |

## Git Flow (Promotion Pipeline)

```
main  →  develop  →  staging  →  production
(code)   (internal    (customer    (live)
          testing)     testing)
```

- Feature work happens on `main`
- `/deploy dev` → merge main → develop, push (deploy latest code for internal testing)
- `/deploy staging` → merge develop → staging, push (promote what was tested on dev for customer testing)
- `/deploy prod` → verify staging was tested, deploy main via `npx vercel --prod` (go live)

**Important:** This is a promotion pipeline. Staging only gets code that was tested on dev. Production only deploys after customer confirmation on staging.

---

## Workflow: `/deploy dev`

Quick deploy for development iteration. Minimal checks.

### Steps
1. **Pre-checks:**
   - [ ] `npm run build` succeeds
   - [ ] All code committed and pushed to `main`
2. **Merge and deploy:**
   - `git checkout develop && git merge main && git push origin develop`
   - Vercel auto-deploys the `develop` branch as a Preview deployment
3. **Verify:**
   - [ ] https://oph-ki-dev.ids.online loads
   - Tell user: "Deployed to dev: https://oph-ki-dev.ids.online"
4. **Return to main:**
   - `git checkout main`

### DB Migrations
If there are pending database migrations, apply them to the **dev** Supabase project (`ocrqzesxmalebpikutwv`) before deploying.

---

## Workflow: `/deploy staging`

Promote tested code from dev to staging for customer testing.

### Steps
1. **Pre-checks:**
   - [ ] `npm run build` succeeds
   - [ ] Dev environment has been tested and approved (ask user to confirm)
   - [ ] All code committed and pushed
2. **Merge and deploy (promote from develop → staging):**
   - `git checkout staging && git merge develop && git push origin staging`
   - Vercel auto-deploys the `staging` branch as a Preview deployment
   - This ensures staging gets EXACTLY what was tested on dev
3. **Verify:**
   - [ ] https://oph-ki-staging.ids.online loads
   - Tell user: "Deployed to staging: https://oph-ki-staging.ids.online — ready for customer testing."
4. **Return to main:**
   - `git checkout main`

### DB Migrations
If there are pending database migrations, apply them to the **staging** Supabase project (`ydcdimwtoyzjhbpbammb`) before deploying.

---

## Workflow: `/deploy prod`

Production deployment. Full checklist with explicit confirmation.

### Steps

#### 1. Pre-Deployment Checks
- [ ] `npm run build` succeeds locally
- [ ] QA Engineer has approved the feature (check feature spec for QA results)
- [ ] No Critical/High bugs in test report
- [ ] All environment variables documented in `.env.local.example`
- [ ] No secrets committed to git
- [ ] All database migrations applied to **production** Supabase (`irmieskihipgcyhxlqlf`)
- [ ] All code committed and pushed to `main`
- [ ] Feature has been tested on staging (ask user to confirm)

#### 2. Confirmation
Before deploying, present a summary and ask for explicit confirmation:
> "Ready to deploy to PRODUCTION (https://oph-ki.ids.online):
> - Features: [list features being deployed]
> - Last commit: [commit hash and message]
>
> Proceed with production deployment?"

Use `AskUserQuestion` with options: "Deploy to production" / "Cancel"

#### 3. Deploy
- `npx vercel --prod`
- Or: Vercel auto-deploys on push to `main` (code should already be on main)

#### 4. Post-Deployment Verification
- [ ] https://oph-ki.ids.online loads correctly
- [ ] Deployed features work as expected
- [ ] No errors in Vercel function logs

#### 5. Post-Deployment Bookkeeping
- Update feature specs: Add deployment section with production URL and date
- Update `features/INDEX.md`: Set status to **Deployed**
- Create git tag: `git tag -a v1.X.0-OPH-X -m "Deploy OPH-X: [Feature Name]"`
- Push tag: `git push origin v1.X.0-OPH-X`
- Commit and push the bookkeeping changes

### DB Migrations
If there are pending database migrations, apply them to the **production** Supabase project (`irmieskihipgcyhxlqlf`) BEFORE deploying. Double-check the migration is correct — production data cannot be easily recovered.

---

## Common Issues

### Build fails on Vercel but works locally
- Check Node.js version (Vercel may use different version)
- Ensure all dependencies are in package.json (not just devDependencies)
- Review Vercel build logs for specific error

### Environment variables not available
- Verify vars are set in Vercel Dashboard (Settings → Environment Variables)
- Client-side vars need `NEXT_PUBLIC_` prefix
- Preview deployments (dev/staging) need branch-scoped env vars
- Redeploy after adding new env vars

### Database connection errors
- Verify the correct Supabase project is being used for the environment
- Check RLS policies allow the operations being attempted
- Verify Supabase project is not paused

### Branch is behind
If `develop` or `staging` has diverged from `main`:
- Use `git merge main` (not rebase) to bring it up to date
- Resolve conflicts if any, then push

## Rollback Instructions

### Production
1. **Immediate:** Vercel Dashboard → Deployments → Click "..." on previous working deployment → "Promote to Production"
2. **Fix locally:** Debug the issue, fix, commit, push to main, redeploy

### Staging / Dev
1. Revert the merge commit on the branch: `git revert HEAD && git push`
2. Or: Force-push the branch to the previous state (after confirming with user)

## Git Commit
```
deploy(OPH-X): Deploy [feature name] to [environment]

- [Environment] URL: https://...
- Deployed: YYYY-MM-DD
```
