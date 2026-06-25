# Shipment ETD/ETA reminders via n8n

The app computes reminders (green / amber ≤3 days / red overdue) from each file's
`etd` / `eta`. Delivering them as **email or WhatsApp** is done by an n8n flow so the
app never holds mail/WhatsApp credentials and the webhook URL never reaches the browser.

## Phase A (shipped) — manual test + contract

- `api/` route **`POST /reminders/test`** forwards a reminder payload to
  `process.env.N8N_REMINDER_WEBHOOK`. Returns `503 reminders_not_configured` when the
  env var is unset, so the UI degrades gracefully.
- In the app, an admin's **"Test reminder"** button on a file (FileDetail header) fires
  the soonest reminder for that file through this route.
- Config in `api/.env` (see `.env.example`): `N8N_REMINDER_WEBHOOK`, `APP_URL`,
  `REMINDER_AMBER_DAYS`.

### Payload contract (what n8n receives)
```json
{
  "event": "shipment_reminder",
  "fileNumber": "IMP-25-0005",
  "kind": "etd",                
  "date": "2026-07-02",         
  "daysLeft": 8,
  "suppliers": ["JINAN HAOXIN INDUSTRY CO.,LTD"],
  "product": "POLYESTER SPUNBOND NONWOVEN",
  "to": { "email": "ops@favouritefab.com" },
  "appUrl": "http://localhost:5173"
}
```
`kind` is `etd` (departure) or `eta` (arrival). `to.email` is optional — the n8n flow
may resolve the recipient from its own config instead.

## n8n flow — manual webhook (works today)
1. **Webhook** node (POST) → copy its URL into `N8N_REMINDER_WEBHOOK`.
2. **Email** (SMTP/Gmail) or **WhatsApp** node → compose from the payload, e.g.
   *"IMP-25-0005 departs in 8 days (02 Jul). Supplier: JINAN HAOXIN."* with a link to
   `{{$json.appUrl}}`.

## Production (Phase B) — daily cron, no app interaction
The reminders that matter fire when the user is **not** in the app, so production runs
on a schedule against the backend (which Phase B adds — Phase A has no server DB):
1. **Schedule** node — daily (e.g. 08:00 IST).
2. **HTTP Request** node → `GET {API}/reminders/due?within=3` (a Phase-B endpoint that
   returns every file whose ETD or ETA is within N days, reusing the same pure
   `shipmentReminders` logic server-side).
3. **Split** → per reminder, **Email/WhatsApp** node using the payload contract above.
4. Optional **dedupe** (don't re-send the same reminder twice a day) via an n8n Data
   table or a `reminders_sent` row.

Until the Phase-B backend + `/reminders/due` exist, only the manual test path is wired.
The payload contract is stable, so the production flow is additive — no app changes.
