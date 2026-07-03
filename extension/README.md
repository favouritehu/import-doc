# Import Desk Tracker — Chrome extension

One click on any carrier tracking page → the page is sent to Import Desk, the AI
reads it (ETA, arrival, vessel, latest event) and the **matching shipment updates
automatically** (matched by the container/BL number shown on the page). Free —
no tracking API, no quota.

## Install (once, ~1 minute)
1. Chrome → `chrome://extensions`
2. Turn ON **Developer mode** (top right)
3. **Load unpacked** → choose this `extension/` folder
4. Pin "Import Desk Tracker" from the puzzle icon

## Use
1. Open the shipment's tracking page — e.g. MSC: search the container
   (`MSNU6087121`) on msc.com, or use the **Open tracking** button in Import Desk.
2. Click the extension icon → **Send this page to Import Desk**
3. First time only: enter the team password (same as the app)
4. Done — popup shows what got updated, e.g. `Updated IMP-25-0007 — eta: 2026-07-12 · vessel: MSC ANNA`

## Requirements
- The shipment must already exist in Import Desk with that **container no or BL**
  on it (that's how the page is matched to the file).
- Works on any page: carrier sites, ldb.co.in (free tracking for all containers
  at Indian ports), terminal pages.
