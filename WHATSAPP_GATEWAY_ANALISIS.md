# WhatsApp Gateway — Análisis del Estado Actual del Repo

**Generado:** 2026-04-29 (America/Costa_Rica, hora local del análisis)  
**Rama:** `main`  
**Último commit (HEAD):** `66a9728` — fix: MetaWebhookChange type for optional value and nullable rawPayload  

> Nota: el working tree puede tener cambios locales no commiteados; este análisis refleja el contenido leído del filesystem en el momento de la generación.

---

## 1. Stack Tecnológico Detectado

### Backend

| Aspecto | Detalle |
|--------|---------|
| Runtime | Node **>=20** (`package.json` → `engines`) |
| Framework | **Express** 4.x |
| Lenguaje | **TypeScript** (strict, ES2022, CommonJS → `dist/`) |
| ORM | **Drizzle ORM** 0.38 + **better-sqlite3** |
| DB | **SQLite** (archivo vía `DATABASE_URL`, ej. `./data/gateway.db`) |
| Job queue | **Ninguno** detectado |
| Otros | **Zod** validación; **pino** + **pino-http** logging; **cors**; **express-rate-limit** |

### Frontend (Admin Panel)

| Aspecto | Detalle |
|--------|---------|
| Ubicación | `admin/` |
| Framework | **React** 18 |
| Build | **Vite** 6 |
| Routing | **Wouter** |
| State / data | **TanStack Query** 5 |
| Styling | **Tailwind CSS** 3 + **tailwindcss-animate** |
| UI | Estilo **shadcn-like** (Radix primitives: dialog, label, select, slot, switch) |

### Infraestructura

| Aspecto | Detalle |
|--------|---------|
| Hosting detectado | **Railway** (`railway.toml`: `buildCommand`, `startCommand`, healthcheck `/health`) |
| CI/CD | **NO ENCONTRADO** `.github/workflows` — deploy asumido vía Railway conectado al repo |
| Servicios | Un solo proceso Node (`node dist/server.js`); panel puede embebérse como estáticos en `dist/admin-ui` si el build completo corre |

---

## 2. Estructura de Carpetas

```
whatsapp-gateway/
├── admin/                 # SPA Vite (login, apps, logs, diagnostics)
│   ├── src/
│   │   ├── components/    # UI + Shell
│   │   ├── lib/           # api.ts, utils
│   │   └── pages/
│   ├── index.html
│   ├── package.json
│   └── vite.config.ts
├── drizzle/               # Migraciones SQL Drizzle + meta/
├── scripts/               # copy-admin-ui.js (build → dist/admin-ui)
├── src/
│   ├── __tests__/         # Vitest + supertest
│   ├── db/                # schema.ts, index (singleton DB)
│   ├── middleware/        # adminAuth, gateway auth
│   ├── routes/            # admin, health, send, webhook
│   ├── services/          # crypto, meta (Graph), router (forward)
│   ├── types/
│   └── server.ts          # buildApp + listen
├── .env.example
├── drizzle.config.ts
├── package.json
├── railway.toml
├── tsconfig.json
├── vitest.config.ts
└── README.md
```

*(Se omiten `node_modules/`, `dist/`, `.git/`.)*

---

## 3. Variables de Entorno

| Variable | ¿Documentada? | Uso detectado |
|----------|---------------|---------------|
| `PORT` | sí (README) | `src/server.ts` — default `3000` |
| `NODE_ENV` | sí | `src/server.ts`, tests; `railway.toml` fija `production` en deploy |
| `ADMIN_SECRET` | sí (`.env.example`, README) | `src/server.ts`, tests |
| `GATEWAY_ENCRYPTION_KEY` | sí | `src/server.ts`, tests — AES para tokens Meta en DB |
| `META_VERIFY_TOKEN` | sí | `src/server.ts`, tests — verificación `GET /webhook` |
| `META_APP_SECRET` | sí (README); **no** en `.env.example` | `src/server.ts` — HMAC `x-hub-signature-256`; fallback a `GATEWAY_ENCRYPTION_KEY` |
| `DATABASE_URL` | sí | `src/server.ts`, tests, `drizzle.config.ts` |
| `LOG_LEVEL` | sí | `src/server.ts`, tests |
| `VITE_GATEWAY_URL` | sí (admin `.env.example` / README admin) | `admin/src/lib/api.ts` — base URL del API en el browser (build-time) |
| `WA_GATEWAY_KEY` | solo en ejemplo README | **No** aparece en código TypeScript del gateway — ejemplo de cliente para header `X-Gateway-Key` |

⚠️ No se leyeron valores de `.env` (archivo ignorado / no inspeccionado).

---

## 4. Endpoints del Backend

Montajes en `src/server.ts` (orden relevante para rate limits):

| Método | Ruta | Archivo | Notas |
|--------|------|---------|--------|
| * | `/webhook` | `src/routes/webhook.ts` vía `server.ts:~129` | `GET /` verificación Meta (`hub.verify_token` / `hub.challenge`); `POST /` payload webhook, HMAC, logs, reenvío opcional |
| POST | `/send` | `src/routes/send.ts` vía `server.ts:~138` | Requiere `X-Gateway-Key`; body text/template/image/document → Meta Cloud API |
| GET | `/health` | `src/routes/health.ts` vía `server.ts:~142` | JSON `status`, `uptime`, `version`, `db` |
| GET | `/admin/logs` | `src/routes/admin.ts` | Últimos 50 `message_logs`; header `X-Admin-Secret` |
| POST | `/admin/apps` | `src/routes/admin.ts` | Crear app + API key |
| GET | `/admin/apps` | `src/routes/admin.ts` | Listar apps (sin secretos) |
| PATCH | `/admin/apps/:id` | `src/routes/admin.ts` | Actualizar app |
| POST | `/admin/apps/:id/rotate-key` | `src/routes/admin.ts` | Rotar API key |
| DELETE | `/admin/apps/:id` | `src/routes/admin.ts` | Soft-delete (`isActive: false`) |
| GET/HEAD | `/`, `/login`, `/apps`, … | `src/server.ts:~145` | **Solo si existe `dist/admin-ui`:** estáticos Vite + SPA fallback |
| * | *(otros)* | `src/server.ts` | `404` JSON `NOT_FOUND` |

Rate limit: `express-rate-limit` en `/send` (100/min por key) y global 1000/min (`server.ts`).

---

## 5. Schema de Base de Datos

Definición Drizzle: `src/db/schema.ts`.

### Tabla `apps`

| Columna (TS) | SQL / tipo | Notas |
|----------------|------------|--------|
| `id` | text PK | |
| `name` | text NOT NULL | |
| `apiKeyHash` | text NOT NULL UNIQUE | hash de API key |
| `apiKeyPrefix` | text NOT NULL | prefijo visible |
| `callbackUrl` | text NOT NULL | URL POST reenvío webhook |
| `phoneNumberId` | text NOT NULL UNIQUE | enlace a número Meta |
| `wabaId` | text NOT NULL | |
| `metaAccessToken` | text NOT NULL | cifrado en reposo (AES) |
| `isActive` | boolean default true | |
| `createdAt`, `updatedAt` | text ISO | |

### Tabla `message_logs`

| Columna | Notas |
|---------|--------|
| `id` | PK text |
| `appId` | FK → `apps.id` |
| `direction` | enum lógico `'IN' \| 'OUT'` |
| `fromNumber`, `toNumber` | text |
| `messageType` | text |
| `bodyPreview` | opcional |
| `rawPayload` | opcional (text) |
| `metaMessageId` | opcional |
| `status` | default `'sent'` |
| `errorMessage` | opcional |
| `createdAt` | text |

Migraciones SQL en `drizzle/` (`0000_initial.sql`, `0001_message_logs_raw_payload.sql`, meta journal).

**NO ENCONTRADO:** Postgres/MySQL; tenant/org column — el modelo actual es **multi-app** vía filas `apps`, no BSP formal.

---

## 6. Lógica del Bot Antigua Lechería

- **Archivo principal:** NO ENCONTRADO en este repositorio.  
- **Estado:** N/A — el repo es un **gateway** (webhook + forward + send + admin), sin dominio de negocio “Lechería”.  
- **Características detectadas (gateway, no bot conversacional):**
  - [x] Recibe webhooks Meta (`/webhook`)
  - [ ] Mantiene contexto conversacional propio del gateway — **no** (estado vive en apps cliente vía `callbackUrl`)
  - [ ] Flujo conversacional / cotizaciones — **no** en este repo
  - [x] Logs en DB (`message_logs`)

---

## 7. Integración con Meta Cloud API

| Tema | Detalle |
|------|---------|
| Wrapper Graph API | `src/services/meta.ts` — función `sendMessage` |
| Base URL | `https://graph.facebook.com/v19.0` |
| Autenticación saliente | **Bearer** por app: token desencriptado de `apps.metaAccessToken` + `phoneNumberId` en path |
| Endpoint usado (saliente) | `POST /{phone-number-id}/messages` |
| Webhook entrante | Parseo de `entry[].changes[]` en `src/routes/webhook.ts`; validación HMAC opcional/diagnóstico; reenvío a `callbackUrl` con `forwardToApp` (`src/services/router.ts`) |

**NO ENCONTRADO:** llamadas Graph adicionales (templates management, phone registration, embedded signup, etc.) — solo envío de mensajes vía `sendMessage`.

---

## 8. Admin Panel — Funcionalidades Detectadas

| Funcionalidad | ¿Presente? | Mecanismo |
|---------------|------------|-----------|
| Login / auth | sí | `adminSecret` en `sessionStorage` + header `X-Admin-Secret` en llamadas API (`admin/src/pages/Login.tsx`, `lib/api.ts`) |
| Dashboard clásico | no | Navegación lateral: Apps, Logs, Diagnóstico |
| Lista de “bots” / apps | sí | `admin/src/pages/Apps.tsx` — CRUD vía `/admin/apps` |
| Logs | sí | `admin/src/pages/Logs.tsx` — `GET /admin/logs` |
| Templates Meta (gestión UI) | no | Solo envío de tipo `template` vía API `/send` desde Diagnóstico |
| Configuración global | no | Todo por env vars en servidor |

Rutas SPA (wouter): `/login`, `/`, `/apps`, `/logs`, `/diagnostics` (`admin/src/App.tsx`).

---

## 9. Testing

| Tema | Detalle |
|------|---------|
| Framework | **Vitest** 2.x (`vitest.config.ts`, `environment: 'node'`, `fileParallelism: false`) |
| Archivos | `src/__tests__/admin.test.ts`, `send.test.ts`, `webhook.test.ts`, `crypto.test.ts` |
| Áreas | Admin CRUD + logs; send; webhook verificación; crypto |
| Coverage | **no medido** — no hay configuración `coverage` en `vitest.config.ts` |

---

## 10. Deuda Técnica Identificada

- **Un `ADMIN_SECRET` global** para todo el panel/API admin — no hay tenants ni RBAC.
- **SQLite monolítico** — escala y multi-región limitadas; un archivo por deploy (riesgo sin volumen persistente en PaaS).
- **Un `phone_number_id` por app (UNIQUE)** — acopla fuerte 1:1 número–app; BSP multi-número por cliente requerirá rediseño.
- **Webhook POST:** en ramas diagnóstico se acepta payload y se responde `200` aunque falle HMAC o no haya app — conveniente para debug, **riesgo de seguridad/comportamiento** en producción estricta.
- **README vs código:** ejemplo con `WA_GATEWAY_KEY` no existe como env en el servidor real (el gateway usa `X-Gateway-Key` validado contra DB).
- **Sin CI** en repo para tests/lint automáticos.
- **Sin TODO/FIXME** grep en `*.ts` — deuda no etiquetada en comentarios.

---

## 11. Riesgos para el Refactor BSP Multi-Tenant

| # | Riesgo | Impacto | Mitigación sugerida |
|---|--------|---------|---------------------|
| 1 | Schema sin `tenant_id` / org; admin global | alto | Introducir entidad tenant + FK en `apps`, logs, credenciales; particionar auth admin |
| 2 | Tokens Meta y WABA por fila `apps` sin aislamiento legal/operativo | alto | Modelar “cuenta BSP” vs “número” vs “cliente final”; cifrado y rotación por política |
| 3 | Webhook único por app por `phone_number_id` | medio | Routing por `phone_number_id` + posible cola; múltiples números por tenant |
| 4 | Reenvío síncrono `fetch(callbackUrl)` 5s timeout | medio | Colas + retries + DLQ para clientes BSP |
| 5 | HMAC / “diagnostic 200” | medio | Flags por entorno (`STRICT_WEBHOOK_VERIFY`) para producción |

---

## 12. Recomendaciones para los Prompts P1-P6

### P1 (Schema multi-tenant)

Añadir `tenants` (o `organizations`), `tenant_id` en `apps` y `message_logs`, relajar o reemplazar `UNIQUE(phone_number_id)` con `(tenant_id, phone_number_id)` según modelo BSP; plan migración desde SQLite o salto a Postgres.

### P2 (Servicios Meta API)

Extraer `meta.ts` a capa de cliente con versionado, rate limits, y métodos para onboarding (WABA, números, templates); hoy solo existe `sendMessage`.

### P3 (Webhook routing)

Centralizar extracción de `phone_number_id` / WABA; tabla de ruteo tenant-aware; opción de no persistir `raw_payload` completo o truncar por política RGPD.

### P4 (REST API verticales)

Versionar API (`/v1/...`), separar keys de “cliente final” vs “BSP console”, documentar OpenAPI.

### P5 (Embedded Signup)

NO ENCONTRADO en repo — diseñar módulo nuevo: OAuth Meta, almacenamiento de tokens por tenant, flujos de re-consentimiento.

### P6 (Admin panel multi-tenant)

Reemplazar sesión solo por `ADMIN_SECRET` con login por tenant (JWT/session), aislar queries por `tenant_id`, onboarding UI para números y templates.

---

## 13. Resumen Ejecutivo

El repositorio **whatsapp-gateway** es un **microservicio Express** que actúa como **puente entre Meta WhatsApp Cloud API y aplicaciones cliente**: verifica (o registra en modo laxo) webhooks, **persiste eventos** en SQLite, **reenvía** el JSON original al `callbackUrl` de cada app, y expone **`POST /send`** autenticado por API key para enviar mensajes a Graph. El **panel React** gestiona apps y diagnóstico pero **no implementa BSP multi-tenant ni Embedded Signup**. Para evolucionar a **BSP multi-tenant**, el mayor trabajo está en **modelo de datos**, **autenticación/autorización**, **ruteo de webhooks** y **ampliación de la capa Meta** más allá del envío básico; la base actual es **clara y acotada**, lo que facilita refactor incremental si se introduce tenant y colas sin romper el contrato actual de `callbackUrl` en una fase intermedia.
