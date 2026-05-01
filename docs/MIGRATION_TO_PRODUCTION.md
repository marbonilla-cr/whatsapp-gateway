# Production Migration Plan

When all feature PRs are merged to `main` / `develop`, use this checklist to go live. **Do not execute blindly** — adapt to your current Railway and Meta configuration.

## Prerequisites on Railway

- [ ] Postgres service provisioned
- [ ] Redis service provisioned
- [ ] `DATABASE_URL` referencing `${{Postgres.DATABASE_URL}}` (or equivalent)
- [ ] `REDIS_URL` referencing `${{Redis.REDIS_URL}}`
- [ ] `JWT_ACCESS_SECRET` (32+ random characters)
- [ ] `JWT_REFRESH_SECRET` (32+ random characters)
- [ ] `GATEWAY_ENCRYPTION_KEY` (64 hex characters = 32 bytes)
- [ ] `META_APP_SECRET` (from developers.facebook.com)
- [ ] `META_VERIFY_TOKEN` (matches Meta webhook configuration)
- [ ] `META_APP_ID` (e.g. `1288462783222737` for MBCSOFT Tech Provider app)
- [ ] `SUPER_ADMIN_EMAIL` (e.g. `admin@mbcsoftcr.com`)
- [ ] `SUPER_ADMIN_PASSWORD_BOOTSTRAP` (change on first login)
- [ ] `STRICT_WEBHOOK_VERIFY=true`
- [ ] `FORWARD_TIMEOUT_MS=30000`
- [ ] `META_REDIRECT_URI` aligned with production host (e.g. `https://gateway.mbcsoftcr.com/onboard/callback`)

## Prerequisites on Meta

- [ ] Tech Provider / Embedded Signup app review completed as required
- [ ] Embedded Signup configuration created in Meta App Dashboard
- [ ] `META_EMBEDDED_SIGNUP_CONFIG_ID` set in Railway
- [ ] Privacy Policy URL in Meta app (e.g. `https://mbcsoftcr.com/privacy`)
- [ ] Terms of Service URL in Meta app (e.g. `https://mbcsoftcr.com/terms`)

## Prerequisites on DNS (Cloudflare or registrar)

- [ ] `CNAME` `gateway.mbcsoftcr.com` → your Railway production hostname (or direct `*.up.railway.app` during testing)
- [ ] (Future) apex / marketing site records as needed

## Migration phases

### Phase 1 — Backup

1. Full backup of any legacy SQLite file if it still exists: `cp data/gateway.db "backup_$(date +%Y%m%d).db"`.
2. Export critical tables from the old environment for audit if you are migrating data.

### Phase 2 — Switch to Postgres

1. Point `DATABASE_URL` at the Railway Postgres instance.
2. Run Drizzle migrations / `drizzle-kit push` as per your release process (once, from a trusted job or local machine with network access).
3. Import or transform legacy data if applicable; verify tenant and WABA rows.
4. Confirm `/health` → `db: "ok"`.

### Phase 3 — Enable new stack features

1. Webhook URL in Meta: `https://<your-host>/webhook` (update when DNS changes).
2. Smoke: send a test message to a known sandbox number; confirm BullMQ `forward-webhook` completes and the vertical callback receives the payload.

### Phase 4 — Bootstrap super admin

1. Set `SUPER_ADMIN_PASSWORD_BOOTSTRAP` in Railway and redeploy if needed.
2. Log in to the admin UI with `SUPER_ADMIN_EMAIL`.
3. Change password immediately.
4. Create initial tenants and API keys for vertical apps.

### Phase 5 — Post-deploy monitoring (24h)

- Watch `/health` and application logs for `5xx`.
- Watch failed BullMQ jobs.
- Confirm inbound messages still reach vertical `callbackUrl`s.
- If stable, declare migration successful.

## Rollback plan

1. Revert `DATABASE_URL` / `REDIS_URL` / Meta-related env vars to the last known-good values.
2. Redeploy the previous Railway release (image / SHA).
3. Confirm `/health` and a minimal webhook test.
4. If SQLite was the fallback, only switch back if that path is still supported by your codebase version.
