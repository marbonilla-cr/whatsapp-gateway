# Embedded Signup (Meta WhatsApp)

Flujo interno del gateway para que un **tenant** conecte su WABA vía [Embedded Signup](https://developers.facebook.com/docs/whatsapp/embedded-signup).

## Secuencia (ASCII)

```
Admin UI                    Gateway API                 Meta
   |                            |                        |
   |-- POST /onboard/start ---->|                        |
   |<-- signup_url, session_id --|                        |
   |                            |                        |
   |-------- popup: Facebook OAuth + Embedded Signup ---->|
   |                            |                        |
   |<---------------- redirect: GET /onboard/callback?code&state --|
   |                            |                        |
   |                            |-- exchange code ------>|
   |                            |<-- access_token -------|
   |                            |-- me/businesses ------->|
   |                            |-- list WABAs / phones->|
   |                            |-- subscribe webhook -->|
   |                            |                        |
   |-- poll GET /onboard/status/:id (cada 2s) ---------->|
   |<-- status completed --------------------------------|
```

## Variables de entorno

| Variable | Requerida | Descripción |
|----------|-----------|-------------|
| `META_APP_ID` | Sí | App ID de Meta |
| `META_APP_SECRET` | Sí | App Secret |
| `META_EMBEDDED_SIGNUP_CONFIG_ID` | Sí | Config ID del flujo Embedded Signup en el dashboard |
| `META_REDIRECT_URI` | Sí | Debe coincidir **exactamente** con la redirect URI registrada en Meta (ej. `https://.../onboard/callback`) |
| `GATEWAY_ENCRYPTION_KEY` | Sí | Firma del `state` CSRF y cifrado AES de tokens |
| `ADMIN_PUBLIC_URL` | No | Base URL del admin para redirects post-callback; si falta se infiere del host de `META_REDIRECT_URI` |
| `EMAIL_ENABLED` + SMTP | No | Alertas de refresh fallido / revocación |

Frontend (admin): `VITE_META_APP_ID`, opcional `VITE_META_REDIRECT_URI`.

## Activación manual en Meta (Tech Provider)

1. Completar **App Review** y rol de Tech Provider cuando Meta lo apruebe.
2. En **Meta for Developers** → tu app → **WhatsApp** → configurar **Embedded Signup** y obtener el **Configuration ID**.
3. Copiar ese valor a `META_EMBEDDED_SIGNUP_CONFIG_ID`.
4. En **Facebook Login / OAuth** (según producto), agregar la **Redirect URI** exacta igual a `META_REDIRECT_URI`.
5. Desplegar el gateway con esas variables y probar desde `/onboard` en el admin.

## Troubleshooting

- **Invalid state / redirect con `reason=invalid_state`**: el `state` expiró (30 min), fue manipulado, o la sesión ya no está `pending`.
- **Insufficient permissions / scope**: verificar scopes `whatsapp_business_management,whatsapp_business_messaging` en la URL de OAuth.
- **Token exchange fails / redirect `exchange_failed`**: `META_REDIRECT_URI` debe ser idéntico al usado en el primer paso y al configurado en Meta; `META_APP_SECRET` correcto.
- **401 en llamadas Graph después de conectar**: token revocado en Meta; el cliente marca la WABA `revoked` en ciertos códigos OAuth; revisar permisos en Business Manager.

## Probar sin Meta real

Los tests en `src/__tests__/onboard.test.ts` mockean `fetch` global para simular `oauth/access_token`, `me/businesses`, WABAs y `phone_numbers`. Correr:

```bash
npm test -- src/__tests__/onboard.test.ts
```
