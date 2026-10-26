#!/usr/bin/env bash
# Rallywise: copy ONLY the web app (project/) of a branch into the existing Capacitor iOS project, for testing on a
# device from Xcode. Nothing native is touched: no npm install, no `cap sync`, no plugins, Podfile, Package.swift,
# Info.plist, signing, Bundle ID, version or build number. Nothing is uploaded.
#
#   1. Downloads the branch (default feature/voice-g3-integration) into a temporary folder.
#   2. Checks the web code contains the zoom fix (5546c81) and, with --require, a given commit.
#   3. Finds the Capacitor project (--cap <path>, or searches your Mac) and its webDir.
#   4. Backs up webDir and ios/App/App/public, then copies project/ into BOTH (public is what Xcode bundles;
#      `cap sync` normally fills it, which is why a sync that stops early leaves Xcode on the old web code).
#   5. Stamps the copy with a build marker: a small label at the bottom of the app shows the commit plus live
#      readings from the device (page scale, focused field font size), so you can see what Xcode is running.
#      The marker is only in this local copy, never in the repo; the release script overwrites it.
#
# Usage: sync-ios-web.sh [--branch <branch>] [--require <commit>] [--cap <capacitor project>]
set -euo pipefail

BRANCH="feature/voice-g3-integration"
REQUIRE=""
CAP=""
REPO_URL="https://github.com/PeacePeach/BadmintonApp.git"
BACKUP_ROOT="$HOME/Rallywise-release/backups"
ENTRY="Badminton Tracker.dc.html"

bold() { printf '\n\033[1m%s\033[0m\n' "$*"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; }
die()  { printf '\n\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

while [ $# -gt 0 ]; do
  case "$1" in
    --branch) BRANCH="${2:-}"; shift 2 ;;
    --require) REQUIRE="${2:-}"; shift 2 ;;
    --cap) CAP="${2:-}"; shift 2 ;;
    -h|--help) sed -n '2,17p' "$0" 2>/dev/null || true; exit 0 ;;
    *) die "Unknown option: $1" ;;
  esac
done
[ "$(uname -s)" = "Darwin" ] || die "Run this on your Mac."
for t in git rsync node; do command -v "$t" >/dev/null 2>&1 || die "Missing '$t'."; done

# ---------------------------------------------------------------- web code
bold "Downloading $BRANCH"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
git clone --quiet --depth 200 --branch "$BRANCH" "$REPO_URL" "$TMP/repo" || die "Could not download $BRANCH."
SHA="$(git -C "$TMP/repo" rev-parse --short HEAD)"
ok "$BRANCH is at $SHA ($(git -C "$TMP/repo" log -1 --format=%s))"
for c in 5546c81 $REQUIRE; do
  git -C "$TMP/repo" merge-base --is-ancestor "$c" HEAD 2>/dev/null || die "Commit $c is not in $BRANCH."
  ok "Includes commit $c"
done
SRC="$TMP/repo/project"
grep -q -- '--rw-field-font: 16px' "$SRC"/_ds/*/tokens/v2.css || die "The zoom fix is missing from tokens/v2.css."
grep -q 'touch-action:manipulation' "$SRC/$ENTRY" || die "The zoom fix is missing from $ENTRY."
ok "Web code has the zoom fix (16px fields, no double-tap zoom)"

# ---------------------------------------------------------------- capacitor project
bold "Finding the Capacitor iOS project"
if [ -z "$CAP" ]; then
  candidates="$( { mdfind -name capacitor.config.json 2>/dev/null; mdfind -name capacitor.config.ts 2>/dev/null; } \
    | grep -v -e '/node_modules/' -e '/ios/App/App/' -e '/android/' -e '/.Trash/' -e '/Rallywise-release/' | sed 's|/capacitor.config.[jt]s.*$||' | sort -u \
    | while read -r d; do [ -d "$d/ios/App" ] && printf '%s\n' "$d"; done || true)"
  n="$(printf '%s' "$candidates" | grep -c . || true)"
  if [ "$n" = "1" ]; then CAP="$candidates"
  elif [ "$n" = "0" ]; then die "No Capacitor project found. Run again with --cap \"<folder with capacitor.config>\"."
  else printf '%s\n' "$candidates" | sed 's/^/    /'; die "Several Capacitor projects found (above). Run again with --cap \"<one of them>\"."
  fi
fi
CAP="$(cd "${CAP/#\~/$HOME}" 2>/dev/null && pwd -P)" || die "Folder not found: $CAP"
CONFIG=""; for f in capacitor.config.json capacitor.config.ts capacitor.config.js; do [ -f "$CAP/$f" ] && CONFIG="$CAP/$f" && break; done
[ -n "$CONFIG" ] || die "$CAP has no capacitor.config."
WEBDIR="$(node -e '
  const fs = require("fs"), f = process.argv[1], s = fs.readFileSync(f, "utf8"); let w = null;
  if (f.endsWith(".json")) { try { w = JSON.parse(s).webDir; } catch (e) {} }
  else { const m = s.match(/webDir\s*:\s*["\x27`]([^"\x27`]+)["\x27`]/); if (m) w = m[1]; }
  if (w) process.stdout.write(w);' "$CONFIG")"
[ -n "$WEBDIR" ] || die "Could not read webDir from $(basename "$CONFIG")."
case "$WEBDIR" in /*) WEB="$WEBDIR" ;; *) WEB="$CAP/$WEBDIR" ;; esac
WEB="$(cd "$WEB" 2>/dev/null && pwd -P)" || die "webDir $WEBDIR does not exist."
PUB="$CAP/ios/App/App/public"
[ -d "$PUB" ] || die "$PUB is missing (the iOS project has never been synced)."
case "$WEB" in "$CAP"|"$HOME"|/|"$CAP/ios"*|"$CAP/android"*|*/node_modules*) die "webDir $WEB is not a safe place to copy into." ;; esac
ok "Project $CAP, webDir \"$WEBDIR\""

# ---------------------------------------------------------------- build marker
STAMP="$(date +%Y%m%d-%H%M%S)"
MARK="$SHA · $(date '+%m-%d %H:%M')"
cat > "$SRC/rallywise-build-marker.js" <<EOF
/* Local device-test marker written by sync-ios-web.sh ($STAMP). Not in the repo. */
window.RALLYWISE_WEB_BUILD = { commit: "$SHA", branch: "$BRANCH", copied: "$STAMP" };
(function () {
  var el, f = function () {
    if (!document.body) return;
    if (!el) { el = document.createElement('div'); el.setAttribute('aria-hidden', 'true');
      el.style.cssText = 'position:fixed;left:6px;bottom:calc(env(safe-area-inset-bottom) + 2px);z-index:2147483647;pointer-events:none;font:500 10px/1.3 -apple-system,system-ui,sans-serif;color:#fff;background:rgba(0,0,0,.55);padding:2px 6px;border-radius:6px;';
      document.body.appendChild(el); }
    var vv = window.visualViewport, a = document.activeElement, fld = a && a.matches && a.matches('input,textarea,select,[contenteditable]');
    el.textContent = 'web $MARK · scale ' + (vv ? vv.scale.toFixed(2) : '?') + ' · w ' + innerWidth
      + (fld ? ' · field ' + getComputedStyle(a).fontSize : '') + (window.scrollY ? ' · scrollY ' + Math.round(window.scrollY) : '');
  };
  ['focusin', 'focusout', 'scroll', 'load'].forEach(function (e) { window.addEventListener(e, function () { setTimeout(f, 50); }, true); });
  if (window.visualViewport) { visualViewport.addEventListener('resize', f); visualViewport.addEventListener('scroll', f); }
  setInterval(f, 1000);
})();
EOF
# Load the marker first thing in the app page.
node -e '
  const fs = require("fs"), p = process.argv[1]; let s = fs.readFileSync(p, "utf8");
  if (!s.includes("rallywise-build-marker.js")) s = s.replace("<head>", "<head>\n<script src=\"rallywise-build-marker.js\"></script>");
  fs.writeFileSync(p, s);' "$SRC/$ENTRY"

# ---------------------------------------------------------------- copy
bold "Copying web files"
mkdir -p "$BACKUP_ROOT"
tar -czf "$BACKUP_ROOT/webdir-$STAMP.tgz" -C "$(dirname "$WEB")" "$(basename "$WEB")" || die "Backup failed; nothing copied."
tar -czf "$BACKUP_ROOT/ios-public-$STAMP.tgz" -C "$(dirname "$PUB")" public || die "Backup failed; nothing copied."
ok "Backups in $BACKUP_ROOT (webdir-$STAMP.tgz, ios-public-$STAMP.tgz)"
for DST in "$WEB" "$PUB"; do
  # No --delete: Capacitor's own files in public (capacitor.config.json, cordova*.js, plugins) stay as they are.
  rsync -a --exclude '.DS_Store' --exclude '.thumbnail' "$SRC/" "$DST/"
  IDX="$DST/index.html"
  if [ ! -f "$IDX" ] || { grep -q 'rallywise-backend.js' "$IDX" && [ "$(wc -c < "$IDX")" -gt 50000 ]; }; then
    cp "$SRC/$ENTRY" "$IDX"   # index.html is a full copy of the app: refresh it
  elif ! grep -q 'rallywise-build-marker.js' "$IDX"; then
    node -e 'const fs=require("fs"),p=process.argv[1];let s=fs.readFileSync(p,"utf8");s=s.replace("<head>","<head>\n<script src=\"rallywise-build-marker.js\"></script>");fs.writeFileSync(p,s);' "$IDX"
  fi
done
ok "Copied project/ ($SHA) into webDir and ios/App/App/public"

# ---------------------------------------------------------------- verify
bold "Verifying what Xcode will bundle"
grep -q 'touch-action:manipulation' "$PUB/$ENTRY" || die "public/$ENTRY is missing the zoom fix."
ok "public/$ENTRY has the zoom fix"
if grep -q 'touch-action:manipulation' "$PUB/index.html"; then ok "public/index.html (the page Capacitor opens) has the zoom fix"
elif grep -q 'Badminton' "$PUB/index.html"; then ok "public/index.html is a small page that opens $ENTRY"
else die "public/index.html neither has the fix nor opens $ENTRY; tell Claude what it contains."; fi
grep -q 'rallywise-build-marker.js' "$PUB/index.html" || grep -q 'rallywise-build-marker.js' "$PUB/$ENTRY" || die "Build marker is not loaded."
grep -q -- '--rw-field-font: 16px' "$PUB"/_ds/*/tokens/v2.css || die "public tokens/v2.css is missing the zoom fix."
ok "public/_ds tokens/v2.css has --rw-field-font: 16px"
grep -q "$SHA" "$PUB/rallywise-build-marker.js" || die "Build marker missing."
ok "Build marker: web $MARK"
printf '\n\033[1mDone.\033[0m In Xcode: Product › Clean Build Folder (⇧⌘K), then Run (⌘R) on your iPhone.\nThe app shows \"web %s\" at the bottom left.\n' "$MARK"
