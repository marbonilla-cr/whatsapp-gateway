# Operations Runbook

## Quick reference

Health check:

```bash
curl -sS "${GATEWAY_URL:-http://localhost:3000}/health" | jq
```

OpenAPI spec:

```bash
curl -sS "${GATEWAY_URL}/openapi.json" | jq '.openapi, (.paths | keys | length)'
```

Login (JWT) for scripts:

```bash
curl -sS -X POST "${GATEWAY_URL}/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"email":"'"$SUPER_ADMIN_EMAIL"'","password":"'"$PASSWORD"'"}' | jq -r .access
```

## Common incidents

### Token expired for a WABA

**Symptoms:** the tenant’s vertical app receives `401` when sending messages.

**Cause:** long-lived token expired (uncommon if the refresh worker is running).

**Resolution:**

1. Check WABA row in Postgres:

   ```sql
   SELECT id, status, token_expires_at FROM wabas WHERE id = '<id>';
   ```

2. If `status = 'revoked'`: tenant must run Embedded Signup again from `/dashboard/onboard`.

3. If `status = 'active'` but token is stale: trigger or debug the refresh token worker / repeat job; verify `META_APP_ID` and `META_APP_SECRET`.

### Webhook signature verification failing

**Symptoms:** Meta receives `403` on `POST /webhook`.

**Checks:**

1. `META_APP_SECRET` matches the Meta app (Railway env).
2. `STRICT_WEBHOOK_VERIFY=true` in production.
3. Logs show invalid HMAC / signature mismatch.

**Resolution:** rotate App Secret in Meta Developers, update Railway, redeploy.

### Phone number locked by Meta (verification rate limit)

**Symptoms:** OTP verification errors such as “too many requests”.

**Cause:** Meta temporarily blocks verification after repeated failures.

**Resolution:** wait 24–48 hours; communicate clearly to the tenant.

### High DLQ count in BullMQ (`forward-webhook`)

**Symptoms:** many failed jobs; vertical apps not receiving events.

**Checks:**

1. Is `callbackUrl` reachable from the gateway (TLS, DNS, firewall)?
2. Is `FORWARD_TIMEOUT_MS` too low for slow clients?

**Resolution:** fix the downstream URL or increase timeout; replay failed jobs after the client is healthy.

### Database connection lost

**Symptoms:** `/health` returns `db: "error"`.

**Resolution:**

1. Verify Postgres on Railway (status, connections).
2. Confirm `DATABASE_URL` on the gateway service.
3. Restart the gateway process if the pool is stuck after a network blip.

## Manual operations

### Rotate token for a specific WABA

Use Meta’s OAuth tools or re-run Embedded Signup for that tenant. Ensure `META_APP_ID` / secrets are correct before exchanging codes.

### Force a webhook resend

Use Meta’s tooling in the app dashboard or contact Meta support for message-level resends; the gateway processes whatever Meta delivers to `/webhook`.

### Bootstrap super admin if locked out

1. Ensure `SUPER_ADMIN_EMAIL` and `SUPER_ADMIN_PASSWORD_BOOTSTRAP` are set in the environment.
2. If **no** `super_admin` user exists in `tenant_users`, the gateway creates one on next login bootstrap.
3. If a super admin exists but password is unknown: use a controlled DB migration or support script to set a new `password_hash` (bcrypt) for that user in Postgres — do this only via your secure ops process.

## Support contacts

- [Meta Business Help Center](https://www.facebook.com/business/help)
- [Meta Cloud API / Platform status](https://developers.facebook.com/status/)
- [Railway documentation](https://docs.railway.app/)
