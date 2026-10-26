#!/usr/bin/env bash
# Rallywise: make sure no diagnostic UI ships. The device-test build marker (the "web <commit> · scale …" label that
# sync-ios-web.sh --marker adds) must never reach Preview, Production or TestFlight.
#   check-no-diagnostics.sh <dir>...          fail if any diagnostic is found (Vercel build runs this on project/)
#   check-no-diagnostics.sh --strip <dir>...  remove it first, then check (release and sync scripts on the iOS web folders)
set -euo pipefail
SIG='rallywise-build-marker|RALLYWISE_WEB_BUILD'
STRIP=0; [ "${1:-}" = "--strip" ] && { STRIP=1; shift; }
[ $# -gt 0 ] || { echo "usage: $0 [--strip] <dir>..." >&2; exit 2; }
for d in "$@"; do
  [ -d "$d" ] || { echo "✗ not a folder: $d" >&2; exit 2; }
  if [ "$STRIP" = 1 ]; then
    rm -f "$d/rallywise-build-marker.js"
    for f in "$d"/*.html; do
      [ -f "$f" ] && grep -q 'rallywise-build-marker' "$f" && perl -0pi -e 's/\n?<script src="rallywise-build-marker\.js"><\/script>//g' "$f"
    done
  fi
  hits="$(grep -rlE "$SIG" "$d" --include='*.html' --include='*.js' 2>/dev/null || true)"
  if [ -n "$hits" ]; then
    printf '✗ Diagnostic UI found in %s:\n%s\n' "$d" "$hits" >&2; exit 1
  fi
  printf '  ✓ No diagnostic UI in %s\n' "$d"
done
