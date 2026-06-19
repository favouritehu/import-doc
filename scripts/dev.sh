#!/usr/bin/env bash
# Run the app (and the Phase-B API stubs) together.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

(cd "$ROOT/api" && npm run dev) &
API=$!
(cd "$ROOT/app" && npm run dev) &
APP=$!

trap 'kill "$API" "$APP" 2>/dev/null || true' EXIT
wait
