# Import Desk — DESIGN.md

## Register
product (tool UI; earned familiarity; density where useful)

## Color (Tailwind tokens, tailwind.config.ts)
- navy `#0E1726` — brand, sidebar, primary buttons, active states
- blue `#1B2740` — hover on navy, links, file numbers
- amber `#E8A33D` — logo mark, warnings/pending accents
- red `#DC3A45` — urgent, overdue, discrepant
- green `#16A34A` — done/paid/arrived/safe
- page `#F4F5F7` bg · border `#ECEEF1` · divider `#D7DAE0`
- ink `#1A1F2B` text · medium `#5A6172` · muted `#8B92A1` · faint `#97A0AE`
- Strategy: Restrained. Accent = navy for actions/selection; amber/red/green are
  STATE colors only, never decoration.
- Status/doc/priority tints are data (lib/docs.ts meta maps), applied inline.

## Typography
- Display + UI: "Hanken Grotesk"; mono: "JetBrains Mono" (file/container numbers).
- Fixed rem scale, ratio ~1.2. Card titles 14px bold; body 13–14px; meta 11px.
- Numbers: tabular where compared (payments, landed cost).

## Shape & elevation
- Card radius 16px (`rounded-card`); pills 999px; card shadow soft single-layer.
- One border weight (1px `border`); tint backgrounds for emphasis, no thick edges.

## Components (canonical)
- Button (components/Button.tsx): primary navy / ghost / danger. Pills for inline
  actions (11px semibold). One vocabulary everywhere.
- TopBar, Sidebar (248px navy) / MobileBottomNav (≤880px), FilterTabs, Modal +
  slide-over (components/Overlay), Toast (1.9s), StatusBadge/PriorityBadge.
- Rail card = status board: party · fileNo+arrival line · 🚢 track line · ☑ CHA line.

## Motion
- 150–250ms ease-out; `anim-pop` for list entries; motion = state change only.

## States
- Loading: prefer skeletons (gap: several screens still spinner-only).
- Empty states must teach the next action.
- Focus: visible ring on interactive elements (gap: custom pills lack it).
