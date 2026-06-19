#!/usr/bin/env bash
# Import Desk — one-shot, idempotent setup (FORGE rule 9).
# Phase A: only the app/ install + dev server are load-bearing. MySQL steps skip
# cleanly when creds / the mysql client are absent.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
echo "▶ Import Desk setup ($ROOT)"

# 1. env files (only if missing)
for d in app api; do
  if [ -f "$d/.env.example" ] && [ ! -f "$d/.env" ]; then
    cp "$d/.env.example" "$d/.env"
    echo "  • created $d/.env"
  fi
done

# 2. dependencies
echo "▶ Installing app dependencies"
(cd app && npm install --no-audit --no-fund)
echo "▶ Installing api dependencies"
(cd api && npm install --no-audit --no-fund)

# 3. optional MySQL schema load
if [ -n "${MYSQL_DATABASE:-}" ] && command -v mysql >/dev/null 2>&1; then
  echo "▶ Loading db/schema.sql into ${MYSQL_DATABASE}"
  mysql -h "${MYSQL_HOST:-localhost}" -P "${MYSQL_PORT:-3306}" -u "${MYSQL_USER:-root}" \
    ${MYSQL_PASSWORD:+-p"${MYSQL_PASSWORD}"} "${MYSQL_DATABASE}" < db/schema.sql \
    && echo "  • schema loaded" || echo "  • schema load skipped (check creds)"
else
  echo "▶ Skipping MySQL load — set MYSQL_* + install the mysql client to enable."
  echo "  (Phase A demos the app entirely on seed data; no DB required.)"
fi

cat <<'EOF'

✓ Setup complete. Next steps:
    cd app && npm run dev     # http://localhost:5173  (the app)
    cd app && npm test        # derive + alerts + render tests
    cd api && npm run dev      # http://localhost:8080  (Phase-B stubs)
EOF
