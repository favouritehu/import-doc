# Deploy Import Desk on Coolify (self-hosted, Ubuntu)

One-click via Docker Compose. Two containers: **web** (the SPA + a same-origin
`/api` proxy) and **api** (Fastify: AI + shared-data CRUD). Data lives in **Postgres**;
the whole app sits behind **one shared password**.

- **One public domain** — `import.favouritehub.in`. The browser only ever talks to
  the web container; nginx proxies `/api/*` to the api container. No CORS, and no
  API URL is baked into the build (so a domain change never needs a rebuild).
- **Shared data** — set `DATABASE_URL`; the app stores one JSONB row per import file
  (table auto-created on boot). Blank => each browser keeps its own copy.
- **Auth** — set `APP_PASSWORD`; everyone signs in with it, then picks their role.

## 0. DNS
Point the web domain at the Coolify server IP (A record):

```
import   A   <server-ip>
```

(Only ONE record now — the API is same-origin, no `api.` subdomain.)

## 1. Connect the repo (one-time)
`import-doc` is private → Coolify → **Sources → GitHub** → install the Coolify
GitHub App on the `favouritehu` org and grant the `import-doc` repo.

## 2. New resource → Docker Compose
- Coolify → **Projects** → New → **+ New Resource** → **Docker Compose** (private GitHub).
- Repo `favouritehu/import-doc`, branch `main`, compose file `docker-compose.yml`, base dir `/`.

## 3. Join the api to the Postgres network
The api reaches Postgres over Coolify's internal Docker network. On BOTH this
resource and your Postgres resource, enable **Connect to Predefined Network** (label
varies by Coolify version) so they share one network — otherwise the api can't resolve
the Postgres hostname (`ENOTFOUND` in the api logs = networks not joined).

## 4. Environment variables (the resource → Environment Variables)
```
VITE_API_URL = /api              ← tick "Build Variable"
DATABASE_URL = postgres://postgres:<password>@<internal-host>:5432/postgres
APP_PASSWORD = <your team password>
APP_URL      = https://import.favouritehub.in
GEMINI_API_KEY   = <key>
DEEPSEEK_API_KEY = <key>
AI_TEXT_PROVIDER = auto
```
- `DATABASE_URL` = the **internal** connection string from your Coolify Postgres
  resource (host is a Docker-internal name, only reachable inside the network — see §3).
- Secrets live ONLY here (Coolify env), never in git.
- `APP_PASSWORD` blank = no login; `DATABASE_URL` blank = per-browser data.

## 5. Domain
Map ONE domain to the **web** service → `https://import.favouritehub.in`.
Coolify's Traefik issues Let's Encrypt HTTPS automatically. The api needs no domain.

## 6. Deploy
Click **Deploy**. Watch build logs (web ~2-3 min, api ~1 min). On first boot the api
creates the `import_files` table automatically.

## 7. Verify
- `https://import.favouritehub.in` → login screen (password set) → app loads.
- `https://import.favouritehub.in/api/health` → `{"status":"ok",...}`.
- `https://import.favouritehub.in/api/auth/status` → `{"required":true}`.
- Create a file in one browser → open in another (same password) → it's there.
- Bring your existing data up: **Settings → Shared data → "Send this browser's files
  to the server"** (one-time, explicit — not automatic).

## 8. Auto-deploy
Enable the **GitHub webhook** in the resource → every push to `main` redeploys.

## Local test (any box, no Coolify)
```bash
cp .env.example .env     # optionally set DATABASE_URL + APP_PASSWORD
docker compose up -d --build
```
Open http://localhost:8080. With `DATABASE_URL` blank it runs per-browser (IndexedDB);
set it to a local Postgres to test sharing.

## Notes / limitations
- **Shared = last-writer-wins, no live refresh.** Two people editing the same file at
  once: last save wins. Reload to see others' edits. Fine for a small team.
- **Roles are cosmetic under one shared password** — anyone can "view as" any role.
- **The external magic-link portal is behind the password too** for now; anonymous
  scoped external access (supplier/CHA upload pages) is a follow-up.
- A failed server save falls back to this browser's IndexedDB and retries — data isn't
  lost, it's "not shared right now" until the server is reachable.
- **Rotate the Postgres password** in Coolify if it was ever shared in plain text.
