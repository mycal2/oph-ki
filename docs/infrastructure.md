# Infrastructure & Environment Setup

## Three-Environment Architecture

| Environment | URL | Git Branch | Vercel Env |
|---|---|---|---|
| **Production** | `https://oph-ki.ids.online` | `main` | Production |
| **Staging** | `https://oph-ki-staging.ids.online` | `staging` | Preview (`staging`) |
| **Development** | `https://oph-ki-dev.ids.online` | `develop` | Preview (`develop`) |

### Git Workflow

```
develop  →  staging  →  main
  (dev)    (testing)   (production)
```

## Supabase Projects

| Environment | Project ID | URL |
|---|---|---|
| Production | `irmieskihipgcyhxlqlf` | `https://irmieskihipgcyhxlqlf.supabase.co` |
| Staging | `ydcdimwtoyzjhbpbammb` | `https://ydcdimwtoyzjhbpbammb.supabase.co` |
| Development | `ocrqzesxmalebpikutwv` | `https://ocrqzesxmalebpikutwv.supabase.co` |

All projects are in the **ids.online** Supabase organization.

### Supabase Auth Configuration

Each project has the `custom_access_token_hook` enabled:
- **Authentication → Hooks → Custom Access Token**
- Schema: `public`, Function: `custom_access_token_hook`
- Permissions granted to `supabase_auth_admin`

## Postmark (Email)

Each environment has its own Postmark server for isolated email handling.

| Environment | Sender Email | Inbound Domain |
|---|---|---|
| Production | `message-from-oph@oph.ids.online` | `oph.ids.online` |
| Staging | `staging@oph.ids.online` | `oph-staging.ids.online` |
| Development | `development@oph.ids.online` | `oph-dev.ids.online` |

### Inbound Email Addresses

Tenant inbound addresses follow the pattern `{tenant-slug}@{inbound-domain}`:
- Production: `test-dental-gmbh@oph.ids.online`
- Staging: `test-dental-gmbh@oph-staging.ids.online`
- Development: `test-dental-gmbh@oph-dev.ids.online`

### DNS Records (MX)

| Name | Value | Priority |
|---|---|---|
| `oph` | `inbound.postmarkapp.com` | 10 |
| `oph-staging` | `inbound.postmarkapp.com` | 10 |
| `oph-dev` | `inbound.postmarkapp.com` | 10 |

## Vercel Configuration

### Deployment Protection

Staging and dev domains are unprotected (publicly accessible) to allow Postmark webhook access:
- `oph-ki-staging.ids.online`
- `oph-ki-dev.ids.online`

### Environment Variables

All env vars are scoped per branch in Vercel. "Preview" deployments require branch-specific scoping for `staging` and `develop`.

#### Per-Environment (different values)

| Variable | Scope | Description |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Public | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server | Supabase service role key |
| `NEXT_PUBLIC_SITE_URL` | Public | App URL for the environment |
| `POSTMARK_SERVER_API_TOKEN` | Server | Postmark server API token |
| `POSTMARK_SENDER_EMAIL` | Server | From address for outbound emails |
| `POSTMARK_MESSAGE_STREAM` | Server | Postmark message stream ID (default: "outbound") |
| `POSTMARK_INBOUND_WEBHOOK_TOKEN` | Server | Secret for inbound webhook auth |
| `INBOUND_EMAIL_DOMAIN` | Server | Domain for inbound email forwarding |

#### Shared (same across all environments)

| Variable | Scope | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | Server | Claude API key for extraction |
| `EXTRACTION_MODEL` | Server | Optional, defaults to `claude-sonnet-4-6` |
| `CRON_SECRET` | Server | Secret for cron job auth |
| `PLATFORM_ADMIN_EMAIL` | Server | Admin email for trial expiry alerts |
| `NEXT_PUBLIC_SESSION_TIMEOUT_HOURS` | Public | Optional, defaults to 8 hours |

### Vercel Env Var Scoping

In Vercel, both `staging` and `develop` are **Preview** deployments. To differentiate:

1. Add the variable
2. Select **Preview** environment
3. Set **Git Branch** to `staging` or `develop`
4. Repeat for the other branch with its value

**Important:** The "Development" environment in Vercel is only for local `vercel dev` — not for the `develop` branch.

## Adding a New Environment

1. Create a new Supabase project
2. Apply the schema from `supabase/schema-bootstrap.sql` (in parts due to dependencies)
3. Enable `custom_access_token_hook` in Supabase Auth settings
4. Grant permissions to `supabase_auth_admin`
5. Create a Postmark server with sender signature and inbound domain
6. Add MX record for the inbound domain
7. Add branch-scoped env vars in Vercel
8. Create the git branch and push
9. Add the domain in Vercel and unprotect it
10. Create admin user (insert into `auth.users` + `auth.identities` + `user_profiles`)
