# Skill: magic links & i18n (external portal)

External parties get a single scoped, nav-less page per file. No costing, no HSN, no other files.

## Routes (separate per party — no toggle)
- `/u/:fileNumber/fwd/:token` — supplier / forwarder. EN ⇄ 中文 toggle; **zh-CN default for CN
  parties**. Shows shipment form + requested-document upload rows (incl. the bilingual `coa` extra).
- `/u/:fileNumber/cha/:token` — CHA. **English only.** Requested uploads (OOC, DO), 9-step
  read-only customs checklist, demurrage chip.

## Tokens
- Phase A: deterministic hex via `app/src/lib/links.ts` (`linkToken`, `magicPath`).
- Phase B: signed, revocable tokens in `access_link` (`allowed_actions` JSON, `expires_at`,
  `revoked`); resolve through `api/src/routes/access-links.ts`.

## i18n
- External surface only — internal app is English. Dictionaries in `app/src/i18n/{en,zh-CN}.json`,
  resolved by `tr(lang, key)`. Lang from `?lang=zh` / `access_link.lang`.
- Bilingual document labels come from `DOC_META[type].label` / `.zh` in `app/src/lib/docs.ts`.
- Structured correction reasons: `CORRECTION_REASONS` (zh + en), surfaced in the discrepancy
  flow on both the internal slide-over and the external page.
- utf8mb4 end-to-end so Chinese never mojibakes.

## Share modal
`MagicLinkPanel` (FileDetail → "Generate link"): two copyable scoped URLs (Forwarder w/ EN|中文,
CHA), expiry + revocable note, and an "Open preview" deep-link.
