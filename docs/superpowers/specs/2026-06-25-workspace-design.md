# Import Desk — Parties workspace (3-pane control tower)

> Design + implementation spec. Approved 2026-06-25.
> Replaces the dense Dashboard with a master/detail workspace: a party-name rail
> + a detail pane. This is the §11 "3-col workspace" deferred from the original plan.

## Goal
Make the home easy: the user recognises shipments by **party (supplier) name**, not
`IMP-25-xxxx`. Pick a party from a left rail → its full detail opens on the right.
Party name is the hero everywhere; the IMP number stays as a small secondary id.

## Layout

### Desktop (> 880px) — two panes in `main` (nav Sidebar = the third column)
- **Parties rail** (`w-80`, own scroll):
  - Sticky header: title **"Imports"** + count, a search input, and a filter toggle
    **All / Needs attention** (needs-attention = files with a red/amber reminder or
    missing/discrepant docs or overdue payment).
  - Rows sorted by urgency (red → amber → green → rest), then by id desc. Each row:
    - **PARTY NAME** bold ink (`supplierLabel(file)`) — primary.
    - `IMP-25-0005` small/faint + a one-line status (next reminder label or status badge).
    - a status **dot** (red `#DC2626` / amber `#F59E0B` / green `#16A34A`) via the
      reminder/derive engines. Selected row highlighted (navy tint + left border).
- **Detail pane** (`flex-1`, own scroll): the selected file rendered by the shared
  `FileDetailBody` (header card with party name + IMP no + value + status, ShipmentTimeline,
  ProgressStepper, and the Summary/Documents/Payments/CHA/Notes tabs + all its modals).
  Empty state ("Select an import on the left") when nothing is selected.

### Mobile (≤ 880px)
No 3-pane. Workspace renders the **rail list full-width**; each row links to the existing
`/files/:id` route (full-screen detail with its own TopBar + back). `useIsMobile()` (880px)
switches.

### Top of workspace
A slim `TopBar` (title "Imports", role switcher, New file) above the two panes so role
switching + create stay reachable.

## Selection / routing
- Workspace lives at `/` (the Dashboard route). Nav label stays "Dashboard".
- Selected file is the URL param **`?file=<id>`** (deep-linkable, refresh-safe). Tab within
  the detail stays `?tab=…`, so a full URL reads `/?file=5&tab=documents`.
- Desktop default selection: the most-urgent file (first in the sorted rail) when `?file`
  is absent. Mobile: none (show the list).

## Refactor — split `FileDetail.tsx`
Today `FileDetail()` (the route) renders TopBar + the whole body + modals. Extract the body
so the workspace pane and the `/files/:id` route share it:
- **`export function FileDetailBody({ file }: { file: ImportFile })`** — everything currently
  inside `FileDetail` EXCEPT the outer `<TopBar>` (the header card, tab bar, tab content,
  and all modals). Owns its state (slide, addDoc, pasteOpen, chaseOpen, editFile, …) and reads
  `?tab=` from `useSearchParams`.
- **`FileDetail()`** (route) becomes thin: resolve `id` from `useParams`; not-found path keeps
  its TopBar; else render `<><TopBar title={supplierLabel(file)} subtitle={file.fileNumber} back/><FileDetailBody file={file}/></>`
  (party name as the TopBar title — party-forward).
- **`setTab` must MERGE params, not replace** — `setParams` currently does `{ tab }` with
  `replace`, which would drop `?file` in the workspace. Change to preserve existing params
  (read current, set `tab`, write back).
- Helper components (SummaryTab, EditFileModal, AddDocumentModal, ChaseModal, PasteUpdateModal,
  L, inputCls, etc.) stay in the file, reused by `FileDetailBody`.

## New `app/src/screens/Workspace.tsx`
- Reads `files`, `useIsMobile()`, `useSearchParams`, `role` (for the role-gated detail).
- Builds the sorted/filtered party list. Urgency rank: derive a per-file status from
  `shipmentReminders` (worst of red/amber/green) combined with `requiredMissingDocs` /
  overdue payments → a single `red|amber|green|none`. Reuse `lib/today.ts` helpers where they
  fit; add a small `lib/rail.ts` pure helper `railItems(files, today)` returning
  `{ fileId, fileNumber, party, status, line }[]` sorted, so it's unit-testable — do NOT inline
  the sort logic in the component.
- Desktop: `<TopBar/>` + flex row [`PartiesRail` | detail pane]. Detail pane renders
  `FileDetailBody` for the `?file` id (defaulting to `railItems[0]`), else the empty state.
- Mobile: `<TopBar/>` + the rail list full-width; rows `navigate('/files/'+id)`.
- `PartiesRail` may be an inline subcomponent or its own file; keep it focused.

## Wiring
- `App.tsx`: route `/` → `Workspace` (was `Dashboard`). Keep `Dashboard.tsx`? Remove its route
  use; it can be deleted if nothing else references it (check ImportFileCard/Upcoming usages
  moved). Prefer: delete `Dashboard.tsx` once `/` points to Workspace and nothing imports it.
- Keep `/files/:id` working (mobile detail + deep links).

## Identifier rule (app-wide, light touch)
Party name is primary on the rail, the FileDetail TopBar, and cards (cards already do this).
IMP number stays as the small secondary id. No data change — `supplierLabel` already exists.

## Tests
- `lib/rail.test.ts`: `railItems` sort (red→amber→green), filter, party label, line text. Inject `today`.
- Update `render.test.tsx`: `/` now renders `Workspace` — assert it contains a party name
  (e.g. "Ningbo Foods Co.") + an `IMP-25-…` id. Drop the old Dashboard-specific assertions
  (or render the now-unused Dashboard only if kept).
- Keep all existing tests green. `tsc --strict` + `vite build` + vitest green.

## Verification
1. `cd app && npm run build && npm test` green.
2. Browser: `/` desktop → rail of party names + status dots, click a party → detail (timeline +
   tabs) opens on the right; `?file=` in URL; refresh keeps selection; switch tab updates
   `?tab=` without losing `?file=`. Resize < 880px → rail list, tap → `/files/:id`. Role switch
   still gates financials in the pane.

## Out of scope
A third "timeline/activity" column (the rail + detail is enough); drag-reorder; saved filters;
multi-select. Per-file data unchanged.
