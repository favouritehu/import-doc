# Deploy Import Desk on Coolify (self-hosted, Ubuntu)

One-click via Docker Compose. Two services go live in Phase A — **web** (static
SPA) and **api** (Fastify, AI features). The database is Phase B (opt-in).

> Data note (Phase A): shipment data lives in each browser (IndexedDB). It is
> per-device and not shared between users yet. That changes in Phase B (API CRUD
> + MySQL). Treat the Phase-A deploy as a real-URL preview.

## A. One-click on Coolify

1. **New Resource → Docker Compose**, source = the `import-doc` Git repo,
   branch `main`, compose file = `docker-compose.yml`.
2. **Environment variables** (Coolify → the resource → Environment) — set:
   ```
   VITE_API_URL = https://api.importdesk.<your-domain>     # public API URL
   CORS_ORIGIN  = https://importdesk.<your-domain>          # the web domain
   APP_URL      = https://importdesk.<your-domain>
   GEMINI_API_KEY = <key>        DEEPSEEK_API_KEY = <key>
   AI_TEXT_PROVIDER = auto
   N8N_REMINDER_WEBHOOK =        # optional
   ```
   `VITE_API_URL` is baked into the SPA at build time, so it MUST be the public
   API URL before the first build (rebuild if you change it).
3. **Domains:** map `web` → `importdesk.<your-domain>`, `api` →
   `api.importdesk.<your-domain>` (Coolify → Domains, per service). Coolify's
   Traefik issues Let's Encrypt HTTPS automatically.
4. **Deploy.** Coolify builds both images and starts them. Enable the
   **auto-deploy webhook** so every push to `main` redeploys.

## B. Plain Docker (any box, to test)

```bash
cp .env.example .env          # fill VITE_API_URL, CORS_ORIGIN, AI keys
docker compose up -d --build  # web on :8080, api on :8787
```
Open http://localhost:8080. AI features need the keys set in `.env`.

## C. Phase B — add the database (later)

When the API gains real CRUD:
```bash
# set MYSQL_PASSWORD + MYSQL_ROOT_PASSWORD in .env first
docker compose --profile full up -d --build
```
This also starts MySQL 8 and auto-loads `db/schema.sql` on first run. On Coolify,
either add the `full` profile to the compose resource or attach Coolify's
one-click MySQL and point the API's `MYSQL_*` env at it.

## Notes
- API health/AI status: `GET https://api.importdesk.<your-domain>/ai/status`.
- Secrets live only in Coolify env (or local `.env`, gitignored) — never in git.
- The web image is nginx with SPA routing (`try_files … /index.html`) so deep
  links like `/files/5` work on refresh.
