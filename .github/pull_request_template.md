<!--
  PR title format: `feat(OPH-X): ...` | `fix(OPH-X): ...` | `refactor(OPH-X): ...`
  Keep the title under 70 characters.
-->

## Linked feature

- OPH-XXX — short feature name (link to `features/OPH-XXX-*.md`)

## Summary

<!-- 1–3 bullets. What changed and WHY. The reviewer should be able to understand the change without opening the diff. -->

-
-

## Database migrations

<!-- Tick one. If "Yes", list the migration filename(s) and which Supabase project(s) you've already applied them to. -->

- [ ] **No migrations** in this PR
- [ ] **Yes, migrations included:** `supabase/migrations/0XX_*.sql`
  - [ ] Applied to dev (`ocrqzesxmalebpikutwv`)
  - [ ] Applied to staging (`ydcdimwtoyzjhbpbammb`) — *only after this PR is merged*
  - [ ] Applied to prod (`irmieskihipgcyhxlqlf`) — *only at production deploy time*

## Test plan

<!-- How did you verify? Tick everything you actually did. -->

- [ ] `npm run build` passes locally
- [ ] Feature exercised manually on `http://localhost:3003` (golden path + at least one edge case)
- [ ] No regressions in adjacent features I touched
- [ ] If UI: tested on mobile width (375 px) and desktop (1440 px)
- [ ] If RLS / auth touched: verified with both `tenant_admin` and `tenant_user` roles

## Screenshots / proof

<!-- Required for any visible UI change. Drop screenshots or a short Loom. -->

## Reviewer checklist

- [ ] Title follows `type(OPH-X): description`
- [ ] Linked feature spec is up to date (status, AC met)
- [ ] No secrets in the diff
- [ ] No unused imports / commented-out code / debug logs left behind
