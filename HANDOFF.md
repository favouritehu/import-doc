# Import Desk — Session Handoff

> Favourite Fab import control tower. Live at **import.favouritehub.in** (Coolify, host port 3005).
> Repo: `git@github.com:favouritehu/import-doc.git`. Local: `generated/import-desk/`.
> Last updated: 2026-07-06.

---

## What it is
One shared web app for the team to track every India import shipment: documents, payments,
customs (CHA), and free carrier tracking — in one place. One shared team password, everyone
sees the same live data.

## Stack
- **app/** — Vite + React 18 + TS strict + Tailwind 3.4. React Router 6, lucide icons.
- **api/** — Fastify 5 + Postgres (JSONB rows). Same-origin `/api` via nginx (no CORS).
- **Deploy** — Coolify Docker Compose. nginx serves the SPA + proxies `/api` to Fastify.
- **AI** — DeepSeek (text only) for extract/classify + tracking-page field extraction.
  Gemini is out of credits (unused).

## Auth
One shared team password → HMAC bearer token. `onRequest` hook guards routes.
401 → clears token + reloads once. **Password: `FavFab@Import2026`** (unchanged).

## Free tracking loop (no paid API)
1. Staff opens a carrier tracking page (or any page with shipment text).
2. Chrome extension captures `document.body.innerText` → `POST /api/tracking/capture`.
3. DeepSeek extracts etd/eta/arrivedOn/vessel/latestEvent.
4. Server auto-matches by container regex `\b[A-Z]{4}\s?\d{7}\b` + normalized BL → patches the JSONB row.
Terminal49 fully removed.

---

## Shipped this session
- **App UX Phase 1** — dates one format, red error toasts (4s), rail skeleton, global focus ring,
  contrast fix on file numbers, `inrCompact` (₹X.XX L / ₹X.XX Cr).
- **App UX Phase 2** — party rail grouped by lifecycle phase (Needs action → Arrived/clearing →
  In transit → Done), ↑↓ keyboard nav, `/` focuses rail search, **Cmd/Ctrl+K command palette**
  (search party / file no / container / BL).
- **Chrome widget** (`extension/popup.html` + `popup.js`) — toolbar mini control tower: shows the
  6 shipments needing eyes (overdue/arriving-soon first) with latest milestone; tap → opens file;
  keeps the one-click page-capture. Navy #0e1726 + amber "ID" mark.

### Commits (both pushed to `main`)
- `811e397` — app UX Phase 1 + 2
- `dd11fb6` — Chrome widget

Verification standard each batch (all green): `npx tsc --noEmit` clean · `npx vitest run` = 91 pass ·
`npm run build` clean.

---

## Deploy state (action needed to go live)
- **App** (`811e397`) → needs **Coolify Redeploy + hard-refresh** to show today's UX live.
- **Widget** (`dd11fb6`) → local extension; just **reload the unpacked extension** in Chrome. No deploy.

---

## Secrets (never committed)
All in Coolify env / gitignored `.env` only, never in the browser:
`DATABASE_URL` (with Postgres pw), `APP_PASSWORD=FavFab@Import2026`, `DEEPSEEK_API_KEY`,
`GEMINI_API_KEY`, `TERMINAL49_API_KEY`. User declined rotating Postgres pw ("im safe").

---

## Recurring bug class (watch for it)
`fetch` with `content-type: application/json` on an **empty body** → Fastify 400.
**Only set content-type when a body is present.** Bit us multiple times.

---

## Key files
| File | Role |
|---|---|
| `app/src/screens/Workspace.tsx` | Party rail (phase-grouped) + detail pane, keyboard nav |
| `app/src/components/CommandPalette.tsx` | Cmd/Ctrl+K everything-search |
| `app/src/lib/rail.ts` | `RailItem` phase logic (closed→done; red→action; arrived/cha→clearing; else transit) |
| `app/src/lib/derive.ts` | Status/priority/alerts engine + `allDocs` aggregation |
| `app/src/store/store.tsx` | Store, `ready` flag, toast |
| `extension/popup.js` / `popup.html` | Chrome widget |
| `api/src/routes/tracking.ts` | Capture endpoint + auto-match |

---

## Deferred — approved plan, Phases 3–5 (NOT started)
Pick up here next session:
- Nav diet (9 → 5 items)
- FileDetail journey-header merge + tab badges
- Inline edit
- PWA phone install
- WhatsApp share
- Print CHA cover sheet
- File-page command center

Plan file: `~/.claude/plans/tidy-giggling-tarjan.md` (full Phase-A spec + addenda).

## Next-session first steps
1. `cd generated/import-desk/app && npm install` (if fresh clone).
2. `npx vitest run` → expect 91 pass. `npm run build` → clean.
3. If continuing: start Phase 3 (nav diet) — but confirm scope first (approval boundary).
4. Remind user to Coolify-Redeploy `811e397` if not done.
