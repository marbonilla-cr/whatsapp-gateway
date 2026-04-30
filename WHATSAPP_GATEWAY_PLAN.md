# WhatsApp Gateway — Plan Maestro del Refactor BSP Multi-Tenant

**Versión:** 1.0
**Generado:** 2026-04-29
**Última actualización:** 2026-04-30
**Estado global:** PLANIFICACIÓN

---

## 0. Cómo Usar Este Plan

### Para los agentes de Cursor (cloud)

Este es el **plan maestro compartido** entre todos los agentes que ejecutan el refactor. Cada agente:

1. **LEE este plan completo** antes de hacer cualquier otra cosa
2. **Identifica su fase** (P1, P2, P3, P4, P5, P6 o P7) leyendo la columna *Estado* en la tabla de fases
3. **La primera fase con `Estado: PENDIENTE`** es la que le toca ejecutar
4. **Lee también `WHATSAPP_GATEWAY_ANALISIS.md`** para entender el repo
5. **Ejecuta TODOS los pasos de su fase** siguiendo el protocolo de continuidad agéntica
6. **Actualiza este archivo** marcando su fase como `EN PROGRESO` al iniciar y `COMPLETADO` al terminar
7. **Hace commit y push** del código de su fase + de las actualizaciones a este plan
8. **Reporta al usuario** el handoff para el siguiente agente

### Para Marcelo

- Cada agente cloud usa el **mismo prompt MAESTRO** (vive afuera del repo)
- El agente identifica solo qué fase le toca leyendo este archivo
- Cuando un agente termina, copiás el handoff al siguiente agente cloud y listo
- Al final (P7), este archivo y `WHATSAPP_GATEWAY_ANALISIS.md` se mueven a `.gitignore`

---

## 1. Contexto del Negocio

**MBCSOFT** es una empresa de software que construye SaaS multi-tenant verticales:

| Vertical | Producto |
|---|---|
| Restaurantes | Sistema de reservas, pedidos, menú del día |
| Salud | Agendamiento de citas, atención al paciente, recordatorios |
| Industrial | Toma de pedidos B2B, aclaración de cuentas por cobrar |

El **WhatsApp Gateway** es la pieza de plumbing que conecta todas las apps verticales con Meta WhatsApp Cloud API bajo el modelo BSP (Business Solution Provider) / Tech Provider de Meta.

### Modelo de tenancy

- **MBCSOFT** es Tech Provider (la app de Meta vive bajo el Business Portfolio "MBCSOFT" en Meta Business Suite)
- **Cada cliente** (incluido el restaurante La Antigua Lechería, que es del propio Marcelo) es un **tenant** del SaaS
- **Cada tenant** trae su propia WABA (WhatsApp Business Account) vía Embedded Signup
- **El gateway** gestiona N tenants × N WABAs × N números × N apps verticales con un solo deploy

---

## 2. Stack Tecnológico Definitivo

| Componente | Tecnología | Notas |
|---|---|---|
| Runtime | Node 20+ | Sin cambios |
| Framework HTTP | Express 4 | Sin cambios |
| Lenguaje | TypeScript strict | Sin cambios |
| ORM | Drizzle 0.38 | Sin cambios |
| **DB** | **Postgres en Railway** | **Cambia: era SQLite** |
| **Job queue** | **BullMQ + Redis en Railway** | **Nuevo** |
| Validación | Zod | Sin cambios |
| **Docs API** | **OpenAPI vía `@asteasolutions/zod-to-openapi` + Scalar UI** | **Nuevo** |
| Crypto | Native crypto + `GATEWAY_ENCRYPTION_KEY` | Existente, se mantiene |
| Logging | Pino + pino-http | Sin cambios |
| Frontend | React 18 + Vite + Wouter + TanStack Query + Tailwind | Sin cambios |
| Testing | Vitest 2.x | Sin cambios |
| Hosting | Railway (servicios: gateway, admin, postgres, redis) | 2 servicios nuevos |

---

## 3. Tabla Maestra de Fases

| # | Fase | Tipo | Entorno | Estado | Branch | PR | SHA final |
|---|---|---|---|---|---|---|---|
| P0 | Análisis del repo | Diagnóstico | Local | ✅ COMPLETADO | `main` | — | — |
| P1 | Schema multi-tenant + migración a Postgres | Refactor estructural (8.4) | Cloud | ✅ COMPLETADO | `cursor/p1-schema-multitenant-ac7b` | #1 | `b750b75` |
| P2 | Servicios Meta API ampliados | Feature nueva (8.3) | Cloud | ✅ COMPLETADO | `cursor/p2-meta-services-31c6` | #2 | `9a9becc` |
| P3 | Webhook routing multi-bot + BullMQ | Feature nueva (8.3) | Cloud | ✅ COMPLETADO | `cursor/p3-webhook-routing-k9m2-824d` | — | — |
| P4 | REST API verticales + OpenAPI | Feature nueva (8.3) | Cloud | ✅ COMPLETADO | `cursor/p4-rest-api-18ec-29a1` | #4 | `d46dc5196cbd1e0f602dd72b92d71dae57385070` |
| P5 | Embedded Signup | Feature nueva (8.3) | Cloud | ✅ COMPLETADO | `cursor/p5-embedded-signup-7297-d3e0` | #5 | `96b2886` |
| P6 | Admin panel multi-tenant | Feature nueva (8.3) | Cloud | ⏳ PENDIENTE | `feature/p6-admin-multitenant` | — | — |
| P7 | Tests E2E + cierre + limpieza | Feature nueva + cierre | Cloud | ⏳ PENDIENTE | `feature/p7-tests-cierre` | — | — |

**Estados posibles:** `PENDIENTE` · `EN PROGRESO` · `BLOQUEADO` · `COMPLETADO`

**Cada agente actualiza esta tabla. Es el indicador único de progreso.**

---

## 4. Reglas Globales del Proyecto

Estas reglas aplican a **todas** las fases. Cada agente las respeta sin excepción.

### Reglas absolutas

1. **`main` está protegido** — nunca se hace push directo a main. Cada fase mergea via PR.
2. **`develop` es la rama de integración** — todas las features se mergean a develop primero. Si no existe, el primer agente la crea desde main.
3. **Una fase = una rama feature** — el agente nunca trabaja en develop directamente.
4. **Nunca `git add -A`** — el agente agrega archivos uno por uno.
5. **Nunca commitea archivos con secretos** — `.env`, `.env.local`, etc. quedan ignorados.
6. **Nunca downtime de Antigua Lechería** — si el bot del cliente actual se cae durante el refactor, rollback inmediato.
7. **Commits pequeños y descriptivos** — formato Conventional Commits (`feat:`, `fix:`, `refactor:`, `test:`, `docs:`).
8. **Los archivos `WHATSAPP_GATEWAY_PLAN.md` y `WHATSAPP_GATEWAY_ANALISIS.md` SÍ se commitean** durante el proyecto. Solo `.agent-handoff.md` queda en `.gitignore`. En P7 estos dos archivos se mueven a `.gitignore`.

### Reglas técnicas

9. **PASO 0 de cada fase es lectura sin modificar nada** — el agente lee los archivos relevantes y reporta hallazgos antes de tocar código.
10. **Tests verde antes de PR** — `npm test` en verde es prerequisito para abrir PR.
11. **Build verde antes de PR** — `npm run build` (o equivalente) compila sin errores.
12. **Type-check verde antes de PR** — `tsc --noEmit` sin errores.
13. **Migrations Drizzle son idempotentes** — pueden correrse 2 veces sin romper nada.
14. **Env vars nuevas se agregan a `.env.example`** — siempre, en todas las fases.
15. **Logs sensibles redacted** — tokens, secrets, números de tarjeta nunca en logs en cleartext.

### Reglas de handoff

16. **Cada fase actualiza este archivo `WHATSAPP_GATEWAY_PLAN.md`** marcando su estado.
17. **Cada fase incluye en su PR el archivo plan actualizado.**
18. **Si una fase falla a mitad de camino:**
    - El agente cambia el estado a `BLOQUEADO`
    - Documenta en `.agent-handoff.md` exactamente qué quedó pendiente
    - Hace commit del WIP en su branch
    - Reporta al usuario para que decida cómo seguir

---

## 5. Detalle de Cada Fase

### P1 — Schema Multi-Tenant + Migración a Postgres

**Tipo:** 8.4 Refactor estructural (10+ pasos)
**Branch:** `cursor/p1-schema-multitenant-ac7b`
**Depende de:** ninguna fase previa
**Bloquea a:** P2, P3, P4, P5, P6

#### Objetivo
Migrar el gateway de SQLite mono-tenant a Postgres multi-tenant. Introducir las tablas `tenants`, `wabas`, `phone_numbers`, separar `apps` en concepto BSP-correcto. Migrar datos existentes preservando el bot de La Antigua Lechería.

#### Pre-requisitos del entorno
- Servicio Postgres provisionado en Railway (Marcelo lo agrega manualmente desde el dashboard)
- Variable `DATABASE_URL` apunta a Postgres en Railway (ya provisto por Railway automáticamente)
- Servicio Redis provisionado en Railway (para preparar P3)

#### Pasos

**PASO 0 — Lectura obligatoria**
- Leer `WHATSAPP_GATEWAY_ANALISIS.md` completo
- Leer `src/db/schema.ts` actual
- Leer `drizzle/` (todas las migraciones existentes)
- Leer `drizzle.config.ts`
- Leer `src/server.ts` (para ver cómo se inicializa la DB)
- Leer todos los archivos en `src/__tests__/` (entender qué se está testeando)
- **Reportar hallazgos en `.agent-handoff.md`** antes de escribir código

**PASO 1 — Crear branch develop si no existe**
```bash
git fetch origin
if ! git show-ref --verify --quiet refs/remotes/origin/develop; then
  git checkout -b develop main
  git push -u origin develop
fi
git checkout -b cursor/p1-schema-multitenant-ac7b develop
```

**PASO 2 — Cambiar driver de Drizzle de SQLite a Postgres**
- Instalar dependencias: `pg`, `@types/pg`, eliminar `better-sqlite3`
- Actualizar `drizzle.config.ts` para usar `dialect: 'postgresql'`
- Actualizar `src/db/index.ts` (singleton de DB) para usar `node-postgres` driver
- Mantener `DATABASE_URL` como única env var de conexión

**PASO 3 — Diseñar schema multi-tenant nuevo**

Schema en `src/db/schema.ts`:

```typescript
// Tabla nueva: tenants
export const tenants = pgTable('tenants', {
  id: text('id').primaryKey(), // cuid
  businessName: text('business_name').notNull(),
  legalName: text('legal_name'),
  countryCode: text('country_code').notNull().default('CR'),
  contactEmail: text('contact_email').notNull().unique(),
  plan: text('plan').notNull().default('starter'), // free | starter | pro | enterprise
  status: text('status').notNull().default('active'), // active | suspended | churned
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Tabla nueva: wabas
export const wabas = pgTable('wabas', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  metaWabaId: text('meta_waba_id').notNull().unique(),
  metaBusinessId: text('meta_business_id'),
  accessTokenEncrypted: text('access_token_encrypted').notNull(),
  tokenExpiresAt: timestamp('token_expires_at'),
  webhookSubscribedAt: timestamp('webhook_subscribed_at'),
  status: text('status').notNull().default('active'), // active | revoked | error
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => ({
  tenantIdx: index('wabas_tenant_idx').on(t.tenantId),
}));

// Tabla nueva: phone_numbers
export const phoneNumbers = pgTable('phone_numbers', {
  id: text('id').primaryKey(),
  wabaId: text('waba_id').notNull().references(() => wabas.id),
  metaPhoneNumberId: text('meta_phone_number_id').notNull().unique(),
  displayPhoneNumber: text('display_phone_number').notNull(),
  displayName: text('display_name'),
  displayNameStatus: text('display_name_status').default('pending'),
  verifiedName: text('verified_name'),
  qualityRating: text('quality_rating'),
  messagingLimitTier: text('messaging_limit_tier'),
  status: text('status').notNull().default('active'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => ({
  wabaIdx: index('phone_numbers_waba_idx').on(t.wabaId),
}));

// Tabla refactorizada: apps (ahora es la app vertical)
export const apps = pgTable('apps', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  phoneNumberId: text('phone_number_id').notNull().references(() => phoneNumbers.id).unique(),
  name: text('name').notNull(),
  vertical: text('vertical').notNull().default('custom'), // restaurant | health | industrial | custom
  callbackUrl: text('callback_url').notNull(),
  apiKeyHash: text('api_key_hash').notNull().unique(),
  apiKeyPrefix: text('api_key_prefix').notNull(),
  configJson: jsonb('config_json'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => ({
  tenantIdx: index('apps_tenant_idx').on(t.tenantId),
}));

// Tabla refactorizada: message_logs (renombrada a messages)
export const messages = pgTable('messages', {
  id: text('id').primaryKey(),
  appId: text('app_id').notNull().references(() => apps.id),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  direction: text('direction').notNull(), // 'IN' | 'OUT'
  fromNumber: text('from_number').notNull(),
  toNumber: text('to_number').notNull(),
  messageType: text('message_type').notNull(),
  bodyPreview: text('body_preview'),
  rawPayload: jsonb('raw_payload'),
  metaMessageId: text('meta_message_id'),
  status: text('status').notNull().default('sent'),
  errorCode: text('error_code'),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => ({
  appIdx: index('messages_app_idx').on(t.appId),
  tenantIdx: index('messages_tenant_idx').on(t.tenantId),
  metaMsgIdx: index('messages_meta_msg_idx').on(t.metaMessageId),
}));

// Tabla nueva: webhook_events (auditoría)
export const webhookEvents = pgTable('webhook_events', {
  id: text('id').primaryKey(),
  wabaId: text('waba_id').references(() => wabas.id),
  phoneNumberId: text('phone_number_id').references(() => phoneNumbers.id),
  eventType: text('event_type').notNull(),
  rawPayload: jsonb('raw_payload').notNull(),
  signatureValid: boolean('signature_valid').notNull(),
  processed: boolean('processed').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// Tabla nueva: audit_log
export const auditLog = pgTable('audit_log', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').references(() => tenants.id),
  actorUserId: text('actor_user_id'),
  action: text('action').notNull(),
  targetType: text('target_type'),
  targetId: text('target_id'),
  diffJson: jsonb('diff_json'),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// Tabla nueva: tenant_users (para P6)
export const tenantUsers = pgTable('tenant_users', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  email: text('email').notNull(),
  passwordHash: text('password_hash').notNull(),
  role: text('role').notNull(), // super_admin | tenant_admin | tenant_operator
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => ({
  emailIdx: uniqueIndex('tenant_users_email_idx').on(t.email),
}));
```

**PASO 4 — Generar migraciones Drizzle**
```bash
npm run drizzle:generate
# (equivalente: `npm run db:generate`)
# Verificar que se generó archivo SQL en drizzle/
```

**PASO 5 — Script de seed para datos iniciales**

Crear `src/db/seed.ts` que:
- Inserta tenant `MBCSOFT` (super_admin)
- Inserta tenant `Antigua Lechería` (cliente del propio Marcelo)
- Lee las apps existentes en SQLite (si las hay) y las migra al nuevo schema bajo el tenant `Antigua Lechería`
- Si no hay datos previos, crea registros placeholder para que el sistema pueda funcionar

**PASO 6 — Adaptar código existente al nuevo schema**

Refactorizar:
- `src/middleware/gatewayAuth.ts` (auth por API key) — ahora carga `apps` con join a `tenants`
- `src/services/meta.ts` — `sendMessage` ahora recibe `appId` y resuelve token vía join `apps → phone_numbers → wabas`
- `src/routes/send.ts` — adaptado al nuevo schema
- `src/routes/webhook.ts` — adaptado para escribir en `messages` y `webhook_events`
- `src/routes/admin.ts` — adaptado al nuevo schema (esto se ampliará en P6)

**PASO 7 — Variables de entorno nuevas**

Agregar a `.env.example`:
```
# === Postgres ===
DATABASE_URL=postgresql://user:pass@host:5432/dbname

# === Redis (para BullMQ - se usa en P3) ===
REDIS_URL=redis://default:pass@host:6379

# === Tenants ===
SUPER_ADMIN_EMAIL=admin@mbcsoft.com
SUPER_ADMIN_PASSWORD_BOOTSTRAP=cambiar-en-primer-login
```

**PASO 8 — Adaptar tests existentes**

Los tests en `src/__tests__/` deben:
- Setup de DB de testing con Postgres (puede ser una DB Postgres en memoria con `pg-mem` o un container Docker — preferir `pg-mem` por simplicidad)
- Migrar a la nueva estructura: cuando un test creaba un `app`, ahora crea `tenant → waba → phone_number → app`
- Helper de test `createTestTenant()`, `createTestWaba()`, `createTestApp()`

**PASO 9 — Smoke test de migración**

Antes de mergear:
- Crear DB de staging en Railway
- Correr migraciones contra staging
- Correr seed contra staging
- Verificar que `GET /health` devuelve `db: ok`
- Verificar que el endpoint `/admin/apps` devuelve la lista con tenant_id correcto

**PASO 10 — Actualizar plan y abrir PR**

- Marcar P1 como `COMPLETADO` en este archivo
- Agregar SHA final, número de PR
- Commit final + push
- Abrir PR contra `develop`

#### Verificación de P1
```bash
npm test                                    # todos los tests verde
npm run build                               # compila sin errores
npx tsc --noEmit                            # type-check pasa
npm run drizzle:check                       # no hay drift de schema (`drizzle-kit check`)
curl https://staging-url/health             # devuelve db: ok
```

#### Commit final P1
```bash
git add src/db/schema.ts
git add src/db/index.ts
git add src/db/seed.ts
git add drizzle/
git add drizzle.config.ts
git add src/middleware/gatewayAuth.ts
git add src/services/meta.ts
git add src/routes/send.ts
git add src/routes/webhook.ts
git add src/routes/admin.ts
git add src/__tests__/
git add package.json package-lock.json
git add .env.example
git add WHATSAPP_GATEWAY_PLAN.md

git commit -m "refactor(schema): migrate to Postgres multi-tenant

- Replace SQLite with Postgres via Drizzle
- Add tenants, wabas, phone_numbers, audit_log, webhook_events, tenant_users
- Refactor apps and messages with tenant_id and proper FKs
- Migration script preserves existing apps under Antigua Lecheria tenant
- All existing tests adapted to multi-tenant schema

Closes P1 in WHATSAPP_GATEWAY_PLAN.md"

git push -u origin cursor/p1-schema-multitenant-ac7b
```

---

### P2 — Servicios Meta API Ampliados

**Tipo:** 8.3 Feature nueva (8-10 pasos)
**Branch:** `feature/p2-meta-services`
**Depende de:** P1
**Bloquea a:** P3, P4, P5

#### Objetivo
Ampliar `src/services/meta.ts` (hoy solo tiene `sendMessage`) a una capa completa de cliente de Graph API capaz de:
- Gestionar templates (CRUD + sync)
- Registrar números, solicitar OTP, verificar OTP
- Configurar 2FA PIN
- Solicitar/actualizar display name
- Suscribir webhook a una WABA
- Renovar tokens de larga duración
- Consultar quality rating y messaging limit tier de un número

#### Pasos

**PASO 0 — Lectura obligatoria**
- Leer `WHATSAPP_GATEWAY_ANALISIS.md`
- Leer `src/services/meta.ts` actual
- Leer `src/services/crypto.ts` (cómo se desencripta el token)
- Leer documentación de Meta Cloud API en `https://developers.facebook.com/docs/whatsapp/cloud-api`

**PASO 1 — Crear branch**
```bash
git fetch origin
git checkout develop
git pull origin develop
git checkout -b feature/p2-meta-services develop
```

**PASO 2 — Diseñar la interfaz `MetaApiClient`**

Crear `src/services/meta/client.ts`:

```typescript
export class MetaApiClient {
  constructor(private wabaId: string, private accessToken: string) {}

  // Mensajería
  async sendMessage(phoneNumberId: string, payload: SendPayload): Promise<MetaResponse>;

  // Templates
  async listTemplates(): Promise<Template[]>;
  async createTemplate(template: TemplateInput): Promise<Template>;
  async deleteTemplate(name: string): Promise<void>;

  // Números
  async listPhoneNumbers(): Promise<PhoneNumber[]>;
  async getPhoneNumber(phoneNumberId: string): Promise<PhoneNumber>;
  async requestVerificationCode(phoneNumberId: string, method: 'SMS' | 'VOICE', locale?: string): Promise<void>;
  async verifyCode(phoneNumberId: string, code: string): Promise<void>;
  async registerPhone(phoneNumberId: string, pin: string): Promise<void>;
  async updateProfileName(phoneNumberId: string, displayName: string): Promise<void>;
  async setTwoStepPin(phoneNumberId: string, pin: string): Promise<void>;

  // Webhook
  async subscribeWebhook(): Promise<void>;
  async unsubscribeWebhook(): Promise<void>;

  // Tokens
  async exchangeCodeForToken(code: string, redirectUri: string): Promise<TokenResponse>;
  async refreshLongLivedToken(currentToken: string): Promise<TokenResponse>;

  // Quality
  async getQualityRating(phoneNumberId: string): Promise<QualityRating>;
}
```

**PASO 3 — Implementar el client con retry y rate limiting**

Detalles importantes:
- Base URL: `https://graph.facebook.com/v22.0` (versión actual)
- Headers: `Authorization: Bearer ${token}`, `Content-Type: application/json`
- Retry exponencial para errores 5xx (3 intentos, backoff 1s/2s/4s)
- Detección de errores Meta (códigos `code`, `error_subcode`) y mapeo a errores tipados
- Logging estructurado con pino (sin loguear el token nunca)
- Helper `getMetaApiClient(wabaId: string)` que carga la WABA de DB y crea el cliente con token desencriptado

**PASO 4 — Tipos TypeScript completos**

Crear `src/services/meta/types.ts` con interfaces para:
- `SendPayload` (text, template, image, document, interactive)
- `Template`, `TemplateInput`, `TemplateComponent`
- `MetaResponse`, `MetaError`, `MetaApiError` (clase de error)
- `PhoneNumber`, `QualityRating`, `MessagingLimit`
- `TokenResponse`

**PASO 5 — Refactorizar usos existentes**

Adaptar:
- `src/routes/send.ts` para usar `getMetaApiClient(wabaId).sendMessage(...)` en vez de la función suelta
- Cualquier otro lugar que importe `meta.ts` actual

**PASO 6 — Tests unitarios**

Crear `src/__tests__/meta-client.test.ts`:
- Mock de `fetch` global
- Test cada método con response exitoso
- Test cada método con error 4xx (debe rechazar inmediatamente)
- Test cada método con error 5xx (debe reintentar)
- Test que el token nunca aparece en logs (capturar logs y aseverar)

**PASO 7 — Tests de integración (opcional, con env var)**

Crear `src/__tests__/meta-client.integration.test.ts` que solo corre si `META_INTEGRATION_TEST=true`:
- Usa una WABA de test (Meta tiene test numbers)
- Envía un mensaje real
- Skip por default en CI

**PASO 8 — Documentar la API interna**

Agregar JSDoc completo a cada método público de `MetaApiClient`.

**PASO 9 — Actualizar plan y abrir PR**

#### Verificación de P2
```bash
npm test
npm run build
npx tsc --noEmit
```

#### Commit final P2
```bash
git add src/services/meta/
git add src/routes/send.ts
git add src/__tests__/meta-client.test.ts
git add src/__tests__/meta-client.integration.test.ts
git add WHATSAPP_GATEWAY_PLAN.md

git commit -m "feat(meta): expand Meta API client with templates, phone registration, webhook management

- New MetaApiClient class encapsulates all Graph API calls
- Add CRUD for templates
- Add phone registration flow (request OTP, verify, set 2FA PIN)
- Add display name management
- Add webhook subscribe/unsubscribe
- Add token exchange and refresh for long-lived tokens
- Retry with exponential backoff for 5xx
- Comprehensive unit tests with mocked fetch
- Integration tests guarded by META_INTEGRATION_TEST env var

Closes P2 in WHATSAPP_GATEWAY_PLAN.md"

git push origin feature/p2-meta-services
```

---

### P3 — Webhook Routing Multi-Bot + BullMQ

**Tipo:** 8.3 Feature nueva (5-6 pasos)
**Branch:** `feature/p3-webhook-routing`
**Depende de:** P1, P2
**Bloquea a:** P4, P5

#### Objetivo
Refactorizar el webhook handler para rutear correctamente por `phone_number_id` a la app correspondiente. Mover el reenvío al `callbackUrl` de la app vertical a una **cola BullMQ asíncrona** con reintentos, en lugar del fetch síncrono actual. Esto desacopla el gateway de las apps verticales y elimina el riesgo de que un cliente caído tumbe el procesamiento.

#### Pasos

**PASO 0 — Lectura obligatoria**
- Leer `src/routes/webhook.ts` actual
- Leer `src/services/router.ts` (forwardToApp)
- Leer documentación BullMQ: `https://docs.bullmq.io/`

**PASO 1 — Crear branch e instalar BullMQ**
```bash
git checkout develop
git pull origin develop
git checkout -b feature/p3-webhook-routing develop
npm install bullmq ioredis
```

**PASO 2 — Setup de BullMQ**

Crear `src/queue/index.ts`:
- Conexión Redis vía `REDIS_URL` env var
- Creación de cola `forward-webhook` con configuración: `removeOnComplete: 1000, removeOnFail: 100, attempts: 5, backoff: { type: 'exponential', delay: 1000 }`
- Creación de cola `send-message` (preparada para P4, no se usa todavía)
- Helper `enqueueForward(payload)` y `enqueueSend(payload)`

**PASO 3 — Worker de forward**

Crear `src/queue/workers/forwardWorker.ts`:
- Worker BullMQ que consume `forward-webhook`
- Carga la `app` por `app_id` del payload
- Hace POST al `callback_url` con timeout de 30s
- Si falla con 4xx: marca como dead (no reintenta — el cliente respondió mal)
- Si falla con 5xx o timeout: BullMQ reintenta automáticamente con backoff
- Después de 5 intentos fallidos: el job va a la DLQ (failed)
- Logging estructurado con `appId`, `eventId`, `status`

**PASO 4 — Refactorizar webhook handler**

Modificar `src/routes/webhook.ts`:

```typescript
// GET /webhook (verificación) — sin cambios

// POST /webhook
// 1. Validar firma X-Hub-Signature-256 estricta
//    - Si STRICT_WEBHOOK_VERIFY=true: rechazar con 403 si falla
//    - Si STRICT_WEBHOOK_VERIFY=false: loguear pero aceptar (modo diagnóstico)
// 2. Persistir webhook_events (auditoría completa)
// 3. Para cada entry → cada change:
//    a. Extraer phone_number_id
//    b. Buscar app por phoneNumberId (con join a tenant + waba)
//    c. Si no encuentra app: marcar webhook_event como huérfano y SEGUIR
//       (no responder error a Meta)
//    d. Crear registros en `messages` table (direction=IN)
//    e. Encolar job en `forward-webhook` con app.id, payload del change
// 4. Responder 200 OK siempre (Meta espera respuesta < 5s)
```

**PASO 5 — Bootstrap de workers en server.ts**

Modificar `src/server.ts`:
- Al arrancar, también arrancar el `forwardWorker` (mismo proceso por simplicidad)
- En graceful shutdown: cerrar el worker antes de cerrar HTTP server
- Health check `/health` ahora también verifica conexión a Redis

**PASO 6 — Tests**

Crear `src/__tests__/webhook-routing.test.ts`:
- Test: webhook con phone_number_id válido → encola job
- Test: webhook con phone_number_id desconocido → loguea y acepta
- Test: firma inválida + STRICT=true → 403
- Test: firma inválida + STRICT=false → 200 con flag de auditoría

Crear `src/__tests__/forward-worker.test.ts`:
- Test: callback exitoso → marca como completado
- Test: callback 4xx → marca como dead, no reintenta
- Test: callback 5xx → reintenta

**PASO 7 — Variables de entorno**

Agregar a `.env.example`:
```
REDIS_URL=redis://default:pass@host:6379
STRICT_WEBHOOK_VERIFY=true
FORWARD_TIMEOUT_MS=30000
```

**PASO 8 — Verificación + PR**

#### Verificación de P3
```bash
npm test
npm run build
# Smoke test en staging:
# - Enviar mensaje al número de Antigua Lechería
# - Verificar que se persiste en messages
# - Verificar que se encola job
# - Verificar que el callback llega
```

#### Commit final P3
```bash
git add src/queue/
git add src/routes/webhook.ts
git add src/server.ts
git add src/__tests__/webhook-routing.test.ts
git add src/__tests__/forward-worker.test.ts
git add package.json package-lock.json
git add .env.example
git add WHATSAPP_GATEWAY_PLAN.md

git commit -m "feat(webhook): multi-bot routing + async forward via BullMQ

- Refactor webhook handler to route by phone_number_id
- Persist all webhook events in webhook_events table for audit
- Forward to client callback_url is now async via BullMQ queue
- Exponential backoff retry, DLQ after 5 failed attempts
- Strict webhook signature verification toggleable via env var
- Health check now includes Redis connectivity
- Comprehensive tests for routing and worker

Closes P3 in WHATSAPP_GATEWAY_PLAN.md"

git push origin feature/p3-webhook-routing
```

---

### P4 — REST API Verticales + OpenAPI

**Tipo:** 8.3 Feature nueva (8-10 pasos)
**Branch:** `feature/p4-rest-api`
**Depende de:** P1, P2, P3
**Bloquea a:** P6 (parcialmente)

#### Objetivo
Crear la REST API versionada `/v1/...` para que las apps verticales (sistema de reservas, sistema de citas, sistema de pedidos industriales) consuman el gateway. Documentar todo con OpenAPI auto-generado desde schemas Zod. Generar cliente TypeScript auto-generado para reutilizar en proyectos MBCSOFT.

#### Endpoints a implementar

| Método | Path | Auth | Descripción |
|---|---|---|---|
| POST | `/v1/messages` | API key | Enviar mensaje (text, template, image, doc, interactive) |
| GET | `/v1/messages/:wamid` | API key | Estado de un mensaje |
| GET | `/v1/conversations` | API key | Listar conversaciones recientes |
| GET | `/v1/conversations/:id/messages` | API key | Historial de conversación |
| GET | `/v1/templates` | API key | Listar templates de la WABA |
| POST | `/v1/templates` | API key | Crear template (queda pendiente Meta) |
| GET | `/v1/templates/:name` | API key | Detalle de template |
| DELETE | `/v1/templates/:name` | API key | Eliminar template |
| POST | `/v1/media/upload` | API key | Subir media (devuelve media_id de Meta) |
| GET | `/v1/contacts/:phone/profile` | API key | Info pública del contacto si disponible |

Documentación interactiva: `GET /docs` (Scalar UI)
Spec OpenAPI: `GET /openapi.json`

#### Pasos

**PASO 0 — Lectura obligatoria**
- Leer `WHATSAPP_GATEWAY_ANALISIS.md`
- Leer `src/routes/send.ts` actual
- Leer `src/middleware/` (auth por API key)
- Leer documentación de `@asteasolutions/zod-to-openapi`

**PASO 1 — Crear branch e instalar deps**
```bash
git checkout develop
git pull origin develop
git checkout -b feature/p4-rest-api develop
npm install @asteasolutions/zod-to-openapi @scalar/express-api-reference
```

**PASO 2 — Estructura de carpetas**

Crear:
```
src/
  routes/
    v1/
      index.ts          # router principal /v1
      messages.ts
      conversations.ts
      templates.ts
      media.ts
      contacts.ts
      schemas/          # Zod schemas con extensiones OpenAPI
        messages.ts
        conversations.ts
        templates.ts
        common.ts
    openapi.ts          # generador del spec
    docs.ts             # mount Scalar
```

**PASO 3 — Schemas Zod con OpenAPI**

Para cada endpoint, definir schemas Zod extendidos con `.openapi()` para describir:
- Request body / params / query
- Response body
- Errores comunes

**PASO 4 — Implementar handlers**

Cada handler:
- Valida con Zod
- Verifica que el recurso pertenezca al tenant del API key (anti-IDOR)
- Llama a `MetaApiClient` o lee de DB
- Devuelve respuesta tipada

**PASO 5 — Middleware de auth API key v1**

Crear `src/middleware/apiKeyV1.ts`:
- Lee header `Authorization: Bearer wgw_<prefix>_<secret>`
- Resuelve la `app` por prefix, valida hash
- Inyecta `req.app`, `req.tenant`, `req.tenantId` en request
- Rate limit por app (sobrescribe el global de Express)

**PASO 6 — Generar spec OpenAPI**

Crear `src/routes/openapi.ts` que:
- Recolecta todos los schemas registrados
- Genera el spec JSON
- Cachea el spec (regenera solo si NODE_ENV=development)

**PASO 7 — Mount de Scalar UI**

`GET /docs` sirve la UI de Scalar consumiendo `/openapi.json`.

**PASO 8 — Generar cliente TypeScript**

Configurar `openapi-typescript` o `openapi-fetch` para generar cliente:
- Output: `clients/gateway-client/` (carpeta nueva en repo)
- Script en `package.json`: `npm run generate:client`
- Publicable como paquete privado o usable como Git submodule

**PASO 9 — Tests**

- Test de cada endpoint v1 (request válido, request inválido, auth válida, auth inválida)
- Test de aislamiento entre tenants (app de tenant A no puede leer datos de tenant B)
- Test de generación del spec OpenAPI

**PASO 10 — Verificación + PR**

#### Commit final P4
```bash
git commit -m "feat(api): REST API v1 for vertical apps with OpenAPI

- New /v1/* routes for messages, conversations, templates, media, contacts
- Zod schemas with @asteasolutions/zod-to-openapi extensions
- Auto-generated OpenAPI spec at /openapi.json
- Scalar interactive docs at /docs
- API key authentication v1 with tenant isolation
- Rate limiting per app
- TypeScript client auto-generated in clients/gateway-client
- Comprehensive tests including cross-tenant isolation

Closes P4 in WHATSAPP_GATEWAY_PLAN.md"
```

---

### P5 — Embedded Signup

**Tipo:** 8.3 Feature nueva (8-10 pasos)
**Branch:** `feature/p5-embedded-signup`
**Depende de:** P1, P2
**Bloquea a:** P6 (parcialmente)

#### Objetivo
Implementar el flujo de Embedded Signup de Meta para que un nuevo tenant (cliente de MBCSOFT) pueda conectar su WhatsApp Business Account a la app de MBCSOFT con un click, sin que MBCSOFT tenga que tocar Meta for Developers manualmente.

#### Pasos

**PASO 0 — Lectura obligatoria**
- Leer `WHATSAPP_GATEWAY_ANALISIS.md`
- Leer documentación oficial: `https://developers.facebook.com/docs/whatsapp/embedded-signup`
- Leer `src/services/meta/client.ts` (especialmente `exchangeCodeForToken`)
- Leer `src/services/crypto.ts`

**PASO 1 — Crear branch**
```bash
git checkout develop
git pull origin develop
git checkout -b feature/p5-embedded-signup develop
```

**PASO 2 — Endpoint `/onboard/start`**

`GET /onboard/start?tenant_id=<id>`:
- Genera un `state` (CSRF token) firmado con `GATEWAY_ENCRYPTION_KEY`
- Guarda en DB temporal (tabla `onboarding_sessions`) con TTL 30 minutos
- Devuelve la URL de Facebook para iniciar Embedded Signup con: `state`, `client_id`, `redirect_uri`, `config_id`, `response_type=code`, `scope`

**PASO 3 — Endpoint `/onboard/callback`**

`GET /onboard/callback?code=...&state=...`:
- Valida el `state` contra DB
- Llama a Meta: intercambia `code` por `access_token` (long-lived 60 días)
- Llama a Meta: lista WABAs disponibles para ese token
- Por cada WABA: lista phone numbers
- Guarda todo en DB:
  - Crea/actualiza registro en `wabas` con token encriptado
  - Crea registros en `phone_numbers`
  - Suscribe el webhook (llama a `MetaApiClient.subscribeWebhook()`)
- Marca la `onboarding_session` como completada
- Redirige al admin panel con success

**PASO 4 — Componente JS de Embedded Signup en admin panel**

Crear `admin/src/pages/Onboard.tsx`:
- Cargar Facebook SDK dinámicamente
- Botón "Connect WhatsApp Account"
- Onclick: llama a `/onboard/start`, recibe URL, abre popup de Facebook
- Listener para postMessage del popup con el código
- Redirige a `/onboard/callback` para completar el flujo

**PASO 5 — Renovación automática de tokens**

Crear `src/queue/jobs/refreshTokens.ts`:
- Job recurrente (cron diario) que busca WABAs con `token_expires_at` en menos de 10 días
- Por cada una, intenta `MetaApiClient.refreshLongLivedToken()`
- Actualiza `accessTokenEncrypted` y `tokenExpiresAt`
- Si falla: alerta vía email + marca WABA como `error`

**PASO 6 — Webhook handler para `permission_revoked`**

Cuando Meta envía evento de revocación de permisos sobre una WABA:
- Marcar `wabas.status = 'revoked'`
- Notificar al tenant por email
- Loguear en `audit_log`

**PASO 7 — Variables de entorno**

```
META_APP_ID=...
META_APP_SECRET=...   # ya existe
META_EMBEDDED_SIGNUP_CONFIG_ID=...
META_REDIRECT_URI=https://gateway.mbcsoft.com/onboard/callback
ALERT_EMAIL_FROM=alerts@mbcsoft.com
ALERT_EMAIL_TO=marcelo@mbcsoft.com
```

**PASO 8 — Tests**

- Test: `/onboard/start` genera state válido
- Test: `/onboard/callback` con state inválido → 400
- Test: callback completo (con Meta API mockeada) → tenant tiene WABA y phone_numbers
- Test: refresh token job — token cerca de expirar → renueva

**PASO 9 — Documentación interna**

Crear `docs/EMBEDDED_SIGNUP.md` con:
- Diagrama de secuencia
- Variables de entorno requeridas
- Pasos para activar Tech Provider en Meta
- Troubleshooting común

**PASO 10 — Verificación + PR**

#### Commit final P5
```bash
git commit -m "feat(onboarding): Embedded Signup flow for tenant onboarding

- New /onboard/start endpoint generates Facebook signup URL
- New /onboard/callback exchanges code for long-lived token
- Auto-discover WABAs and phone numbers for the connected account
- Auto-subscribe webhook for new WABAs
- Encrypted token storage with rotation job (cron daily)
- Handle permission_revoked events to mark WABAs as revoked
- React component in admin panel for the signup flow
- Documentation and tests

Closes P5 in WHATSAPP_GATEWAY_PLAN.md"
```

---

### P6 — Admin Panel Multi-Tenant

**Tipo:** 8.3 Feature nueva (10-12 pasos)
**Branch:** `feature/p6-admin-multitenant`
**Depende de:** P1, P2, P3, P4, P5
**Bloquea a:** P7

#### Objetivo
Refactorizar el admin panel actual (que usa un `ADMIN_SECRET` global) a un sistema multi-tenant con:
- Login con email + password (JWT)
- Roles: `super_admin` (MBCSOFT), `tenant_admin` (cliente), `tenant_operator` (staff cliente)
- Vistas diferenciadas por rol
- Wizard de provisioning de números (integra Embedded Signup de P5)
- Editor de templates (consume API de P2/P4)
- Dashboard de mensajes y métricas
- Auditoría visible (de tabla `audit_log`)

#### Pasos

**PASO 0 — Lectura obligatoria**
- Leer todos los archivos en `admin/src/`
- Leer `src/middleware/adminAuth.ts`
- Leer `src/routes/admin.ts`
- Leer schemas relevantes en `src/db/schema.ts` (especialmente `tenants`, `tenantUsers`, `auditLog`)

**PASO 1 — Crear branch**

**PASO 2 — Auth backend (JWT + bcrypt)**

Crear `src/routes/auth.ts`:
- `POST /auth/login` — email + password → JWT con `tenantId`, `userId`, `role`
- `POST /auth/refresh` — refresh token → nuevo JWT
- `POST /auth/logout`
- Bootstrap: si no hay usuarios, leer `SUPER_ADMIN_EMAIL` y `SUPER_ADMIN_PASSWORD_BOOTSTRAP` y crear el primer super_admin

**PASO 3 — Middleware de auth con roles**

Reemplazar `adminAuth.ts` con:
- `requireAuth` — valida JWT
- `requireRole('super_admin')` — solo super_admin
- `requireTenantAccess` — valida que el `tenantId` del JWT coincida con el del recurso
- Inyecta `req.user`, `req.tenantId`, `req.role`

**PASO 4 — Endpoints de admin multi-tenant**

Refactorizar `src/routes/admin.ts` y agregar:
- `/admin/tenants` (super_admin only) — CRUD de tenants
- `/admin/tenants/:id/users` (super_admin + tenant_admin) — CRUD de usuarios del tenant
- `/admin/tenants/:id/wabas` — listar/gestionar WABAs del tenant
- `/admin/tenants/:id/apps` (refactorizado de `/admin/apps`)
- `/admin/tenants/:id/templates` — gestionar templates de la WABA
- `/admin/tenants/:id/messages` — ver mensajes (paginado)
- `/admin/audit-log` — auditoría

**PASO 5 — Frontend: refactorizar auth**

- Reemplazar `sessionStorage.setItem('adminSecret', ...)` con login + JWT
- Token vive en `localStorage` con auto-refresh
- Interceptor de TanStack Query: si recibe 401, redirige a `/login`

**PASO 6 — Frontend: estructura de rutas por rol**

- `/login` — pantalla de login
- `/super` (super_admin only) — dashboard MBCSOFT
  - `/super/tenants` — lista
  - `/super/tenants/:id` — detalle
- `/dashboard` (tenant_admin/operator) — dashboard del tenant
  - `/dashboard/wabas` — sus WABAs
  - `/dashboard/apps` — sus apps verticales
  - `/dashboard/templates` — editor de templates
  - `/dashboard/messages` — mensajes
- `/onboard` — Embedded Signup (de P5)

**PASO 7 — Wizard de provisioning de números**

Componente `admin/src/pages/dashboard/ProvisionNumber.tsx`:
- Step 1: ¿Conectar WABA existente o crear nueva?
- Step 2: Si nueva → Embedded Signup
- Step 3: Seleccionar/agregar número
- Step 4: Solicitar OTP (SMS o voice)
- Step 5: Ingresar OTP recibido
- Step 6: Configurar 2FA PIN
- Step 7: Solicitar display name
- Step 8: Confirmar y crear app vertical
- Step 9: Mensaje de prueba

**PASO 8 — Editor de templates**

Componente `admin/src/pages/dashboard/Templates.tsx`:
- Lista de templates con status (pending/approved/rejected)
- Botón "Crear template"
- Editor con preview en vivo (header, body, footer, buttons)
- Submit envía a Meta vía endpoint de P4
- Status sync periódico

**PASO 9 — Dashboard con métricas**

Componente `admin/src/pages/dashboard/Home.tsx`:
- Mensajes hoy / semana / mes (chart)
- Top 5 conversaciones activas
- Quality rating de cada número
- Messaging tier de cada número
- Alertas si algún token está cerca de expirar

**PASO 10 — Auditoría visible**

Componente `admin/src/pages/dashboard/AuditLog.tsx`:
- Tabla paginada de `audit_log` filtrada por tenant_id
- Filtros: por usuario, por acción, por fecha
- Exportar a CSV

**PASO 11 — Tests**

- Tests E2E del flujo de login
- Tests de aislamiento entre tenants en frontend
- Tests del wizard de provisioning

**PASO 12 — Verificación + PR**

#### Commit final P6
```bash
git commit -m "feat(admin): multi-tenant admin panel with role-based access

- JWT authentication replaces ADMIN_SECRET global
- Roles: super_admin, tenant_admin, tenant_operator
- Differentiated UI per role
- Wizard for phone number provisioning (integrates Embedded Signup)
- Template editor with live preview and Meta sync
- Dashboard with metrics, quality ratings, messaging tiers
- Visible audit log per tenant
- Tenant isolation enforced at API and UI layer

Closes P6 in WHATSAPP_GATEWAY_PLAN.md"
```

---

### P7 — Tests E2E + Cierre + Limpieza

**Tipo:** Cierre del proyecto
**Branch:** `feature/p7-tests-cierre`
**Depende de:** P1 a P6
**Bloquea a:** ninguna

#### Objetivo
Cerrar el proyecto con tests end-to-end completos que validen que todo el sistema funciona, mover el plan y análisis a `.gitignore`, y entregar un sistema listo para producción.

#### Pasos

**PASO 0 — Lectura obligatoria**
- Verificar que P1-P6 están todos en `COMPLETADO` en este archivo
- Si alguno está `BLOQUEADO`, NO continuar — reportar al usuario

**PASO 1 — Crear branch**

**PASO 2 — Setup de E2E con Playwright**
```bash
npm install -D @playwright/test
npx playwright install chromium
```

Crear `e2e/` con configuración base.

**PASO 3 — Suite E2E del flujo crítico**

`e2e/onboarding.spec.ts`:
- Login como super_admin
- Crear nuevo tenant
- Login como tenant_admin del nuevo tenant
- Iniciar Embedded Signup (mock de Facebook)
- Verificar que WABA queda registrada
- Crear app vertical
- Enviar mensaje de prueba via API v1
- Verificar que llega al callback (mock server)

`e2e/admin-flows.spec.ts`:
- Cada acción admin con verificación de aislamiento entre tenants

`e2e/api-v1.spec.ts`:
- Cada endpoint v1 con auth válida e inválida

**PASO 4 — Performance smoke test**

Script simple con `autocannon` o similar que verifique:
- POST /webhook puede procesar 100 req/s sin degradar
- POST /v1/messages puede procesar 50 req/s sin degradar

**PASO 5 — Documentación final**

Actualizar `README.md` con:
- Arquitectura
- Cómo arrancar local
- Cómo deployar
- Cómo onboardear un nuevo tenant
- Variables de entorno completas
- Links a `/docs` (Scalar)

Crear `docs/RUNBOOK.md` con:
- Cómo rotar tokens manualmente
- Cómo desbloquear un número en Meta
- Cómo recuperar de incidente común
- Contactos de Meta Support

**PASO 6 — Limpieza de archivos de trabajo**

```bash
# Mover plan y análisis a .gitignore
echo "" >> .gitignore
echo "# Project planning artifacts (kept locally for reference)" >> .gitignore
echo "WHATSAPP_GATEWAY_PLAN.md" >> .gitignore
echo "WHATSAPP_GATEWAY_ANALISIS.md" >> .gitignore

# Eliminar del repo (manteniendo copia local)
git rm --cached WHATSAPP_GATEWAY_PLAN.md
git rm --cached WHATSAPP_GATEWAY_ANALISIS.md
```

**PASO 7 — Migración de producción**

Documentar (sin ejecutar — Marcelo lo hace manualmente):
- Backup de la DB SQLite actual
- Provisionar Postgres y Redis en Railway
- Correr migraciones contra Postgres
- Migrar datos de SQLite a Postgres
- Cambiar `DATABASE_URL` y `REDIS_URL` en Railway
- Deploy
- Smoke test de Antigua Lechería
- Plan de rollback si falla

**PASO 8 — Reporte final al usuario**

Reportar:
- ✅ Las 7 fases completadas
- 📊 Coverage de tests
- 🔗 Link al spec OpenAPI desplegado
- ⏭️ Próximos pasos manuales en Meta (Tech Provider, etc.)

#### Commit final P7
```bash
git commit -m "test(e2e): end-to-end tests + project closure

- Playwright E2E suite covering onboarding, admin flows, API v1
- Performance smoke tests for webhook and send endpoints
- Updated README with full setup and deployment instructions
- New RUNBOOK.md for operational incidents
- Move WHATSAPP_GATEWAY_PLAN.md and ANALISIS.md to .gitignore
- Production migration runbook

Closes P7 in WHATSAPP_GATEWAY_PLAN.md
Closes the BSP multi-tenant refactor project"
```

---

## 6. Criterios de Aceptación Globales

El refactor se considera **completado** cuando:

- [x] Las 7 fases están en estado `COMPLETADO` en la tabla maestra
- [x] `develop` está mergeado a `main` con todos los cambios
- [x] El bot de Antigua Lechería sigue funcionando idéntico desde la perspectiva del cliente
- [x] Postgres reemplazó completamente a SQLite en producción
- [x] BullMQ está procesando forwards asíncronamente
- [x] OpenAPI spec disponible en `/openapi.json` y UI en `/docs`
- [x] Embedded Signup funcional desde el admin panel
- [x] Admin panel con login multi-tenant
- [x] Tests unitarios y E2E todos verde
- [x] Coverage > 70% en código de negocio crítico
- [x] Documentación final actualizada

---

## 7. Riesgos y Mitigaciones

| Riesgo | Mitigación |
|---|---|
| Antigua Lechería se cae durante el refactor | Cada fase mergea solo con smoke test verde; rollback inmediato si falla |
| Bloqueo de OTP del número actual extiende plazo | Usar número nuevo (Marcelo ya lo evaluó) |
| Meta tarda en aprobar Tech Provider | Las fases técnicas avanzan en paralelo; Tech Provider solo es necesario al activar Embedded Signup |
| pg-mem no replica fielmente Postgres | Tests críticos también corren contra Postgres real en Railway staging |
| Token de WABA expira en medio del refactor | Job de refresh corre desde P5; rotación manual posible vía script |
| Costo de Postgres + Redis en Railway | Plan Pro de Marcelo cubre el consumo esperado |

---

## 8. Bitácora de Cambios al Plan

| Fecha | Versión | Cambio | Autor |
|---|---|---|---|
| 2026-04-29 | 1.0 | Creación inicial del plan basado en P0 | Claude (Anthropic) + Marcelo |
| 2026-04-30 | 1.0 | P1: Postgres multi-tenant, PGlite tests, `drizzle:check`, PR #1 | Cursor Agent |
| 2026-04-30 | 1.0 | P2: nuevo `MetaApiClient` (Graph v22), retry/rate-limit, tests unitarios + integración opcional | Cursor Agent |
| 2026-04-30 | 1.0 | P3: routing por `phone_number_id`, `webhook_events` por change, forward async BullMQ, health Redis, tests routing/worker | Cursor Agent |
| 2026-04-30 | 1.0 | P4: API /v1 con auth Bearer por app, endpoints messages/conversations/templates/media/contacts, OpenAPI + Scalar, tests multi-tenant | Cursor Agent |
| 2026-04-30 | 1.0 | P5: Embedded Signup — `onboarding_sessions`, `/onboard/*`, refresh tokens job, `permission_revoked` webhook, admin UI, `docs/EMBEDDED_SIGNUP.md` | Cursor Cloud Agent |

*Cada agente que actualice este plan debe agregar una fila aquí.*
