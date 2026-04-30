# WhatsApp Gateway — MBCSOFT BSP Platform

Multi-tenant WhatsApp Business Solution Provider gateway. Tech Provider for Meta WhatsApp Cloud API.

## Arquitectura

```
                    ┌─────────────────┐
  Meta Cloud API ◄──┤  WhatsApp       ├──► Vertical apps (callbacks)
                    │  Gateway        │
                    │  (Express)      │
                    └────────┬────────┘
                             │
         ┌───────────────────┼───────────────────┐
         ▼                   ▼                   ▼
   PostgreSQL            Redis (BullMQ)     Admin UI (React/Vite)
   (Drizzle ORM)     webhook forward +     JWT + roles
                     token refresh jobs
```

## Stack

- Node 20+ / TypeScript (strict) / Express
- Postgres (Drizzle ORM) + Redis (BullMQ)
- React + Vite + Wouter (admin panel)
- Meta Graph API v22.0
- OpenAPI + Scalar at `/openapi.json` and `/docs`
- Deploy: Railway

## Local development

```bash
npm install
cp .env.example .env
# Edit .env: DATABASE_URL (Postgres), REDIS_URL, JWT_*, GATEWAY_ENCRYPTION_KEY (64 hex chars),
# ADMIN_SECRET, META_VERIFY_TOKEN, SUPER_ADMIN_*, META_REDIRECT_URI, etc.

npm run db:push   # or migrations per your workflow
npm run dev       # gateway API + hot reload
```

Admin UI is bundled into the gateway for production (`npm run build` copies `admin/dist` to `dist/admin-ui`). For local UI development against a running gateway:

```bash
cd admin && cp .env.example .env
# Set VITE_GATEWAY_URL=http://localhost:3000 (optional: same-origin works when using built admin)
npm install && npm run dev
```

## Architecture overview

- **Multi-tenant:** tenants → wabas → phone_numbers → apps (vertical integrations)
- **API v1** for vertical apps: REST + `Authorization: Bearer wgw_<prefix>_<secret>`
- **Admin panel v2:** `/admin/v2/*` with JWT (`/auth/login`) and roles (`super_admin`, `tenant_admin`, `tenant_operator`)
- **Embedded Signup:** `/onboard/*` for tenant WABA connection
- **Webhook:** `POST /webhook` — routing by `phone_number_id`, async forward to app `callbackUrl` via BullMQ when Redis is configured

## Key endpoints

| Path | Purpose |
|------|---------|
| `/health` | Liveness: `db`, optional `redis` |
| `/webhook` | Meta webhook (GET verify, POST events) |
| `/v1/*` | REST API for vertical apps |
| `/admin/v2/*` | Multi-tenant admin API |
| `/auth/*` | Login / refresh (JWT) |
| `/onboard/*` | Embedded Signup flow |
| `/docs` | Scalar interactive API reference |
| `/openapi.json` | OpenAPI 3 specification |
| `/send` | Legacy send path (`X-Gateway-Key`) |

## Environment variables

See `.env.example` for the full list and comments. Highlights:

- **Core:** `PORT`, `NODE_ENV`, `LOG_LEVEL`, `DATABASE_URL`, `ADMIN_SECRET`, `GATEWAY_ENCRYPTION_KEY`, `META_VERIFY_TOKEN`
- **Auth:** `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, optional TTL vars
- **Queue / webhook:** `REDIS_URL`, `STRICT_WEBHOOK_VERIFY`, `FORWARD_TIMEOUT_MS`
- **Bootstrap:** `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD_BOOTSTRAP`
- **Meta:** `META_APP_ID`, `META_APP_SECRET`, `META_EMBEDDED_SIGNUP_CONFIG_ID`, `META_REDIRECT_URI`, optional `ADMIN_PUBLIC_URL`
- **Email alerts (optional):** `EMAIL_*`, `ALERT_*`

Admin build-time (Vite): `VITE_GATEWAY_URL` (optional when admin is served from the gateway), `VITE_META_APP_ID`, optional `VITE_META_REDIRECT_URI`.

**E2E (Playwright, optional):** `E2E_BASE_URL`, `E2E_SUPER_EMAIL` / `E2E_SUPER_PASSWORD`, `E2E_TENANT_ADMIN_EMAIL` / `E2E_TENANT_ADMIN_PASSWORD`, `E2E_USE_WEBSERVER=1` to auto-start `npm run start`, `E2E_PERF=1` for webhook concurrency smoke.

## Tenant onboarding

1. Super admin creates tenants under `/super/tenants`.
2. Tenant admin logs in → `/dashboard`.
3. Tenant admin uses **WhatsApp signup** (`/dashboard/onboard`) — Embedded Signup.
4. Tenant admin uses **Provisioning** wizard (`/dashboard/provision`) for numbers and apps.
5. Tenant admin manages **Templates** (`/dashboard/templates`).
6. Vertical app calls **API v1** with its issued API key.

## Deployment (Railway)

1. Create **Postgres** and **Redis** services; wire `DATABASE_URL` and `REDIS_URL` on the gateway service.
2. Set all secrets from `.env.example` (JWT, encryption key, Meta, bootstrap super admin).
3. Build command: `npm run build`; start: `npm run start`.
4. Point Meta webhook to `https://<your-host>/webhook` and align `META_VERIFY_TOKEN` / `META_APP_SECRET`.
5. For Embedded Signup, configure `META_REDIRECT_URI` and app settings in Meta Developers.

## Testing

- `npm test` — Vitest unit and integration tests
- `npm run build` — TypeScript + admin bundle
- `npx tsc --noEmit` — type-check gateway `src/`
- `npm run test:e2e` — Playwright (needs running gateway + Postgres; see `.env.example` E2E vars)
- `npm run test:e2e:ui` — Playwright UI mode

Install browsers once: `npx playwright install chromium`

## Documentation

- `/docs` — interactive API reference (Scalar)
- `docs/EMBEDDED_SIGNUP.md` — BSP Embedded Signup notes
- `docs/RUNBOOK.md` — operations playbook
- `docs/MIGRATION_TO_PRODUCTION.md` — production cutover checklist

## License

To be defined by Marcelo / MBCSOFT.
