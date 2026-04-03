# WhatsApp Gateway

Microservicio Node.js/TypeScript que centraliza la integración con [Meta WhatsApp Cloud API](https://developers.facebook.com/docs/whatsapp/cloud-api): verificación de webhook, reenvío de mensajes entrantes a tus apps y envío saliente con credenciales por aplicación.

## Quick start

```bash
git clone <repo> && cd whatsapp-gateway
npm install
cp .env.example .env
# Completá .env (ver tabla más abajo). GATEWAY_ENCRYPTION_KEY: 64 caracteres hex (32 bytes).
npm run dev
```

En otra terminal:

```bash
curl -s http://localhost:3000/health | jq
```

Deberías ver `status: "ok"` y `db: "ok"`.

## Panel de administración (`admin/`)

Aplicación React aparte (Vite + Tailwind + TanStack Query + Wouter + shadcn-style UI) para gestionar apps, ver logs y diagnóstico.

```bash
cd admin
cp .env.example .env
# Editá VITE_GATEWAY_URL (URL pública del gateway) y dejá VITE_ADMIN_SECRET vacío (el secreto se ingresa en pantalla).
npm install
npm run dev
```

Abre `http://localhost:5173`, ingresá el **Admin Secret** (mismo que `ADMIN_SECRET` del gateway). El build de producción queda en `admin/dist/`.

El gateway expone **CORS** (origen reflejado + cabeceras `X-Admin-Secret` / `X-Gateway-Key`) para que el panel pueda llamar al API desde el navegador.

## Registrar una nueva app

Generá un secreto de admin y llamá a `POST /admin/apps`:

```bash
curl -s -X POST http://localhost:3000/admin/apps \
  -H "Content-Type: application/json" \
  -H "X-Admin-Secret: $ADMIN_SECRET" \
  -d '{
    "name": "Poiesis HIS",
    "callbackUrl": "https://tu-app.com/webhooks/whatsapp",
    "phoneNumberId": "TU_PHONE_NUMBER_ID_DE_META",
    "wabaId": "TU_WABA_ID",
    "metaAccessToken": "EAAxxxx..."
  }' | jq
```

La respuesta `201` incluye `apiKey` **una sola vez**. Guardalo en el vault de la app cliente.

## Configurar el webhook en Meta Business Manager

1. En la app de Meta → WhatsApp → **Configuration** → **Webhook**, editá la URL de callback: `https://tu-dominio.com/webhook` (sin sufijo extra: el gateway expone `GET` y `POST` en `/webhook`).
2. **Verify token**: el mismo valor que `META_VERIFY_TOKEN` en tu `.env`.
3. Suscribí el campo **messages** (y los que necesites).
4. **Firma `X-Hub-Signature-256`**: Meta firma con el **App Secret** de la aplicación. Podés definir la variable opcional `META_APP_SECRET` con ese valor; si no existe, el gateway usa `GATEWAY_ENCRYPTION_KEY` para validar el HMAC (útil en tests; en producción conviene `META_APP_SECRET`).

## Integración desde una app cliente (`/send`)

```typescript
const res = await fetch('https://tu-gateway.railway.app/send', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Gateway-Key': process.env.WA_GATEWAY_KEY!,
  },
  body: JSON.stringify({
    to: '50688887777',
    type: 'text',
    text: { body: '¡Hola! Tu cita está confirmada para mañana.' },
  }),
});
const data = (await res.json()) as { success?: boolean; messageId?: string; error?: unknown };
```

## Variables de entorno

| Variable | Obligatoria | Descripción |
|----------|-------------|-------------|
| `PORT` | No (default `3000`) | Puerto HTTP. |
| `NODE_ENV` | No (default `development`) | `development` \| `production`, etc. |
| `ADMIN_SECRET` | Sí | Secreto para header `X-Admin-Secret` en rutas `/admin/*`. |
| `GATEWAY_ENCRYPTION_KEY` | Sí | 64 caracteres hex (32 bytes). Cifra `metaAccessToken` en SQLite (AES-256-GCM). |
| `META_VERIFY_TOKEN` | Sí | Token de verificación del webhook (`GET /webhook`). |
| `META_APP_SECRET` | No | App Secret de Meta para validar `x-hub-signature-256`. Si falta, se usa `GATEWAY_ENCRYPTION_KEY`. |
| `DATABASE_URL` | Sí | Ruta del archivo SQLite (ej. `./data/gateway.db`). |
| `LOG_LEVEL` | Sí | `trace` \| `debug` \| `info` \| `warn` \| `error`. |

Generar `GATEWAY_ENCRYPTION_KEY`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Deploy en Railway

1. Creá un proyecto en [Railway](https://railway.app) y conectá el repo (o subí el código).
2. El archivo `railway.toml` define `startCommand = "node dist/server.js"`, healthcheck en `/health` y `NODE_ENV=production`.
3. En el dashboard de Railway, definí las variables de entorno de la tabla anterior (al menos las obligatorias).
4. Build: Nixpacks ejecutará `npm install` y debe ejecutarse `npm run build` (configurá el build command si tu imagen no lo hace automáticamente; por ejemplo **Build Command**: `npm run build`).
5. Asegurate de que `DATABASE_URL` apunte a un volumen persistente si querés conservar la base entre despliegues (Railway: montá un volumen y usá su ruta, ej. `/data/gateway.db`).

## Scripts útiles

| Script | Uso |
|--------|-----|
| `npm run dev` | Servidor con `tsx watch`. |
| `npm run build` | Compila a `dist/`. |
| `npm start` | `node dist/server.js`. |
| `npm test` | Vitest. |
| `npm run db:generate` | Genera migraciones Drizzle. |
| `npm run db:migrate` | Aplica migraciones (CLI). |
| `npm run db:push` | Push de schema (desarrollo). |

Al arrancar, el gateway crea el directorio de datos si falta y aplica migraciones desde `drizzle/` automáticamente.

## Seguridad

- No se registran en logs el `metaAccessToken` ni el API key completo; solo `apiKeyPrefix`.
- Los mensajes de error siguen el formato `{ "error": { "code", "message" } }`.

## Licencia

MIT (ajustá según tu organización).
