# Skill: MySQL operations (Phase B)

The schema is authored in `db/schema.sql` (14 tables, InnoDB, utf8mb4). Phase A does not touch
MySQL; this is the Phase-B wiring reference.

## Tables
`supplier`, `item_master`, `app_user`, `file_template`, `import_file`, `container`,
`import_line_item`, `document`, `payment`, `duty_breakup`, `cha_status`, `note`,
`access_link`, `audit_log`.

## Key fidelity points
- `import_file.file_number` `VARCHAR(40) UNIQUE` — auto `IMP-25-0001`.
- Multi-invoice: each invoice = one `import_line_item` row (its own `supplier_id`,
  `invoice_number`, `goods_value`, `currency`, `hsn_code`). The CI/PL `document` rows link via
  `document.line_item_id` (NULL = a file-level doc).
- `duty_breakup.total` is `GENERATED ALWAYS AS (bcd+sws+igst+cess+anti_dumping+other) STORED` —
  never write it.
- `cha_status.status` ENUM includes `na` (step not applicable).
- `access_link(token CHAR(64) UNIQUE, party_type, lang DEFAULT 'zh-CN', allowed_actions JSON,
  expires_at, revoked)`.
- `audit_log` is **append-only** — INSERT only, never UPDATE/DELETE.

## Patterns
- Always `charset: utf8mb4` on the pool so Chinese round-trips.
- Server recomputes status via `api/src/services/deriveStatus.ts` (mirror of the frontend) —
  never trust a client-sent status.
- Enforce the financial/HSN field projection per role **before** serialising a response.

## Load the schema
```
mysql -u import_desk -p import_desk < db/schema.sql
```
`scripts/setup.sh` does this automatically when `MYSQL_*` is set and the mysql client is present.
