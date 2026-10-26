#!/usr/bin/env bash
# Rallywise: prepare the existing Capacitor iOS project for a TestFlight build.
#
# What it does (and nothing else):
#   1. Updates a local BadmintonApp checkout to the latest `develop` (clones it if missing).
#   2. Optionally checks that a required commit is included (--require <sha>).
#   3. Finds the existing Capacitor project (--cap <path>, or searches your Mac for it).
#   4. Reads webDir from its capacitor.config, backs that folder up, and copies `project/` into it.
#   5. Runs `npx cap sync ios` and checks the iOS project is still there with the same
#      Bundle ID, version, build number and signing team.
#   6. Checks Simplified Chinese (zh-Hans) is declared, and adds it to Info.plist only if missing.
#   7. Voice input: installs @capacitor-community/speech-recognition in the Capacitor project if missing
#      (the version that matches its Capacitor), and adds the microphone and speech recognition
#      permission texts to Info.plist if missing. WKWebView has no working Web Speech API.
#
# It never creates a Capacitor or Xcode project, never changes signing, Bundle ID, version or
# build number, never deletes files, and never uploads anything.
#
# Usage:
#   prepare-ios-release.sh [--cap <capacitor project>] [--repo <BadmintonApp checkout>]
#                          [--require <commit>] [--branch develop] [--no-zh-fix] [--no-speech]
set -euo pipefail

REPO_URL="https://github.com/PeacePeach/BadmintonApp.git"
BRANCH="develop"
CAP=""
REPO=""
REQUIRE=""
ZH_FIX=1
SPEECH=1
SPEECH_PKG="@capacitor-community/speech-recognition"
MIC_TEXT="Rallywise uses the microphone so you can describe a match by voice."
SPEECH_TEXT="Rallywise turns what you say about a match into text, so it can fill in the match for you to review."
BACKUP_ROOT="$HOME/Rallywise-release/backups"

bold() { printf '\n\033[1m%s\033[0m\n' "$*"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$*"; }
die()  { printf '\n\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

while [ $# -gt 0 ]; do
  case "$1" in
    --cap) CAP="${2:-}"; shift 2 ;;
    --repo) REPO="${2:-}"; shift 2 ;;
    --require) REQUIRE="${2:-}"; shift 2 ;;
    --branch) BRANCH="${2:-}"; shift 2 ;;
    --no-zh-fix) ZH_FIX=0; shift ;;
    --no-speech) SPEECH=0; shift ;;
    -h|--help) sed -n '2,20p' "$0" 2>/dev/null || true; exit 0 ;;
    *) die "Unknown option: $1 (see --help)" ;;
  esac
done

expand() { case "$1" in "~"|"~/"*) printf '%s%s' "$HOME" "${1#\~}" ;; *) printf '%s' "$1" ;; esac; }

# ---------------------------------------------------------------- dependencies
mkdir -p "$BACKUP_ROOT"
bold "Checking tools"
[ "$(uname -s)" = "Darwin" ] || die "Run this on your Mac (Xcode is needed for iOS)."
for t in git node npm npx rsync /usr/libexec/PlistBuddy; do
  command -v "$t" >/dev/null 2>&1 || die "Missing '$t'. Install Xcode (with command line tools) and Node.js, then run this again."
done
command -v xcodebuild >/dev/null 2>&1 || warn "xcodebuild not found; build settings won't be read. Install Xcode."
ok "git, node, npx, rsync found"

# ---------------------------------------------------------------- web code
bold "Updating the web code ($BRANCH)"
if [ -z "$REPO" ]; then
  # Running from inside a checkout: use it. Otherwise use (or clone into) ~/Rallywise-release/BadmintonApp.
  here="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd || true)"
  if [ -n "$here" ] && [ -f "$here/../project/Badminton Tracker.dc.html" ] && git -C "$here/.." rev-parse >/dev/null 2>&1; then
    REPO="$(cd "$here/.." && pwd)"
  else
    REPO="$HOME/Rallywise-release/BadmintonApp"
  fi
fi
REPO="$(expand "$REPO")"
if [ ! -d "$REPO/.git" ]; then
  [ -e "$REPO" ] && die "$REPO exists but is not a git checkout. Pass --repo <path to your BadmintonApp checkout>."
  mkdir -p "$(dirname "$REPO")"
  git clone --branch "$BRANCH" "$REPO_URL" "$REPO" >/dev/null 2>&1 || die "Could not clone $REPO_URL."
  ok "Cloned into $REPO"
fi
if [ -n "$(git -C "$REPO" status --porcelain)" ]; then
  die "$REPO has uncommitted changes. Commit or discard them first; nothing was changed."
fi
git -C "$REPO" fetch --quiet origin "$BRANCH" || die "Could not fetch $BRANCH from GitHub."
git -C "$REPO" checkout --quiet "$BRANCH" 2>/dev/null || git -C "$REPO" checkout --quiet -b "$BRANCH" "origin/$BRANCH"
git -C "$REPO" merge --quiet --ff-only "origin/$BRANCH" || die "Local $BRANCH has diverged from GitHub; nothing was copied."
HEAD_SHA="$(git -C "$REPO" rev-parse --short HEAD)"
ok "$REPO is at $HEAD_SHA ($(git -C "$REPO" log -1 --format=%s))"
if [ -n "$REQUIRE" ]; then
  git -C "$REPO" cat-file -e "$REQUIRE^{commit}" 2>/dev/null || die "Commit $REQUIRE was not found on $BRANCH."
  git -C "$REPO" merge-base --is-ancestor "$REQUIRE" HEAD || die "Commit $REQUIRE is not included in $BRANCH."
  ok "Includes required commit $REQUIRE"
fi
WEB_SRC="$REPO/project"
ENTRY="Badminton Tracker.dc.html"
[ -f "$WEB_SRC/$ENTRY" ] || die "$WEB_SRC/$ENTRY is missing."

# ---------------------------------------------------------------- capacitor project
bold "Finding the Capacitor iOS project"
if [ -z "$CAP" ]; then
  candidates="$( { mdfind -name capacitor.config.json 2>/dev/null; mdfind -name capacitor.config.ts 2>/dev/null; } \
    | grep -v -e '/node_modules/' -e '/ios/App/App/' -e '/android/' -e '/.Trash/' -e "^$REPO/" | sed 's|/capacitor.config.[jt]s.*$||' | sort -u \
    | while read -r d; do [ -d "$d/ios/App" ] && printf '%s\n' "$d"; done || true)"
  n="$(printf '%s' "$candidates" | grep -c . || true)"
  if [ "$n" = "1" ]; then CAP="$candidates"
  elif [ "$n" = "0" ]; then die "No Capacitor project with an ios/ folder was found. Run again with --cap \"<path to the folder with capacitor.config>\"."
  else printf '%s\n' "$candidates" | sed 's/^/    /'; die "Found several Capacitor projects (above). Run again with --cap \"<one of them>\"."
  fi
fi
CAP="$(cd "$(expand "$CAP")" 2>/dev/null && pwd)" || die "Capacitor project folder not found: $CAP"
CONFIG=""
for f in capacitor.config.json capacitor.config.ts capacitor.config.js; do [ -f "$CAP/$f" ] && CONFIG="$CAP/$f" && break; done
[ -n "$CONFIG" ] || die "$CAP has no capacitor.config.json/ts/js. Is this the right folder?"
IOS="$CAP/ios/App"
PBX="$IOS/App.xcodeproj/project.pbxproj"
PLIST="$IOS/App/Info.plist"
[ -f "$PBX" ] || die "No iOS project at $IOS/App.xcodeproj. This script does not create one."
[ -f "$PLIST" ] || die "No Info.plist at $PLIST."
ok "Project: $CAP"

WEBDIR="$(node -e '
  const fs = require("fs"), f = process.argv[1], s = fs.readFileSync(f, "utf8");
  let w = null;
  if (f.endsWith(".json")) { try { w = JSON.parse(s).webDir; } catch (e) {} }
  else { const m = s.match(/webDir\s*:\s*["\x27`]([^"\x27`]+)["\x27`]/); if (m) w = m[1]; }
  if (w) process.stdout.write(w);' "$CONFIG")"
[ -n "$WEBDIR" ] || die "Could not read webDir from $(basename "$CONFIG")."
case "$WEBDIR" in /*) WEB_DST="$WEBDIR" ;; *) WEB_DST="$CAP/$WEBDIR" ;; esac
APP_ID="$(node -e '
  const fs = require("fs"), s = fs.readFileSync(process.argv[1], "utf8");
  const m = s.match(/"?appId"?\s*:\s*["\x27`]([^"\x27`]+)/); process.stdout.write(m ? m[1] : "?");' "$CONFIG")"
ok "Config: $(basename "$CONFIG"), appId $APP_ID, webDir \"$WEBDIR\""

# Refuse web dirs that would overwrite the project or native folders.
WEB_REAL="$(cd "$WEB_DST" 2>/dev/null && pwd -P || true)"
[ -n "$WEB_REAL" ] || die "webDir $WEB_DST does not exist. Build 1 must have used another folder; check capacitor.config."
case "$WEB_REAL" in
  "$(cd "$CAP" && pwd -P)"|"$HOME"|/|"$(cd "$CAP" && pwd -P)/ios"*|"$(cd "$CAP" && pwd -P)/android"*|*/node_modules*)
    die "webDir resolves to $WEB_REAL, which is not a safe place to copy into." ;;
esac

# ---------------------------------------------------------------- snapshot native settings
settings() {
  grep -E '^[[:space:]]*"?(PRODUCT_BUNDLE_IDENTIFIER|MARKETING_VERSION|CURRENT_PROJECT_VERSION|DEVELOPMENT_TEAM|CODE_SIGN_STYLE|CODE_SIGN_IDENTITY[^=]*|PROVISIONING_PROFILE_SPECIFIER)"?[[:space:]]*=' "$PBX" | sed 's/^[[:space:]]*//' | sort | uniq -c || true
}
BEFORE="$(settings)"

# ---------------------------------------------------------------- copy web files
bold "Copying web files"
SRC_REAL="$(cd "$WEB_SRC" && pwd -P)"
if [ "$WEB_REAL" = "$SRC_REAL" ]; then
  ok "webDir already points at $WEB_SRC; nothing to copy"
else
  STAMP="$(date +%Y%m%d-%H%M%S)"
  mkdir -p "$BACKUP_ROOT"
  BACKUP="$BACKUP_ROOT/webdir-$STAMP.tgz"
  tar -czf "$BACKUP" -C "$(dirname "$WEB_REAL")" "$(basename "$WEB_REAL")" || die "Could not back up $WEB_REAL; nothing was copied."
  ok "Backed up the current web folder to $BACKUP"

  if [ -f "$WEB_REAL/rallywise-config.js" ] && ! cmp -s "$WEB_REAL/rallywise-config.js" "$WEB_SRC/rallywise-config.js"; then
    warn "rallywise-config.js in the iOS web folder differed from GitHub; it now uses the GitHub version (old one is in the backup)."
  fi
  # Copy everything from project/ over the web folder. No --delete: files that only exist in the
  # web folder are left alone.
  rsync -a --exclude '.DS_Store' --exclude '.thumbnail' "$WEB_SRC/" "$WEB_REAL/"
  ok "Copied $(find "$WEB_SRC" -type f | wc -l | tr -d ' ') files from project/ ($HEAD_SHA)"

  # Capacitor opens index.html. If Build 1 used a full copy of the app as index.html, refresh it;
  # if it is a small wrapper that loads the app file, leave it; if there is none, create it.
  IDX="$WEB_REAL/index.html"
  if [ ! -f "$IDX" ]; then
    cp "$WEB_SRC/$ENTRY" "$IDX"; warn "There was no index.html; created it from $ENTRY."
  elif grep -q 'rallywise-backend.js' "$IDX" && [ "$(wc -c < "$IDX")" -gt 50000 ]; then
    cp "$WEB_SRC/$ENTRY" "$IDX"; ok "Refreshed index.html (a copy of $ENTRY)"
  else
    ok "Kept your index.html (it does not contain the app itself)"
  fi
fi

# ---------------------------------------------------------------- cap sync
bold "Running npx cap sync ios"
cd "$CAP"
if [ ! -d node_modules/@capacitor/cli ]; then
  warn "Capacitor packages are not installed; installing them."
  if [ -f package-lock.json ]; then npm ci; else npm install; fi
fi
if [ "$SPEECH" = 1 ]; then
  bold "Voice input plugin ($SPEECH_PKG)"
  CAP_MAJOR="$(node -e 'try { process.stdout.write(String(require(process.argv[1] + "/node_modules/@capacitor/core/package.json").version.split(".")[0])); } catch (e) {}' "$CAP")"
  [ -n "$CAP_MAJOR" ] || die "Could not read the @capacitor/core version in $CAP/node_modules."
  [ "$CAP_MAJOR" -ge 5 ] || die "Capacitor $CAP_MAJOR is too old for $SPEECH_PKG (needs 5 or later)."
  [ -f "$IOS/Podfile" ] || die "$IOS has no Podfile (Swift Package Manager project). $SPEECH_PKG needs CocoaPods; nothing was changed for voice."
  if [ -d "node_modules/$SPEECH_PKG" ]; then
    ok "$SPEECH_PKG $(node -p "require('./node_modules/$SPEECH_PKG/package.json').version") already installed"
  else
    PLUGIN_MAJOR="$CAP_MAJOR"; [ "$CAP_MAJOR" -gt 7 ] && PLUGIN_MAJOR=7
    STAMP2="$(date +%Y%m%d-%H%M%S)"
    cp package.json "$BACKUP_ROOT/package.json-$STAMP2"; [ -f package-lock.json ] && cp package-lock.json "$BACKUP_ROOT/package-lock.json-$STAMP2"
    npm install --save "$SPEECH_PKG@^$PLUGIN_MAJOR" || die "Could not install $SPEECH_PKG@^$PLUGIN_MAJOR (Capacitor $CAP_MAJOR)."
    ok "Installed $SPEECH_PKG@^$PLUGIN_MAJOR for Capacitor $CAP_MAJOR (package.json backup in $BACKUP_ROOT)"
  fi
  # iOS kills an app that uses the mic or speech recognition without these texts.
  plist_added=0
  for kv in "NSMicrophoneUsageDescription|$MIC_TEXT" "NSSpeechRecognitionUsageDescription|$SPEECH_TEXT"; do
    k="${kv%%|*}"; v="${kv#*|}"
    cur="$(/usr/libexec/PlistBuddy -c "Print :$k" "$PLIST" 2>/dev/null || true)"
    if [ -n "$(printf '%s' "$cur" | tr -d '[:space:]')" ]; then
      ok "Info.plist already has $k: \"$cur\""
    else
      [ "$plist_added" = 1 ] || cp "$PLIST" "$BACKUP_ROOT/Info.plist-$(date +%Y%m%d-%H%M%S)"
      /usr/libexec/PlistBuddy -c "Delete :$k" "$PLIST" >/dev/null 2>&1 || true
      /usr/libexec/PlistBuddy -c "Add :$k string $v" "$PLIST"; plist_added=1
      ok "Added $k to Info.plist"
    fi
  done
  # Verify both texts are really there: without them iOS ends the app on the first tap of the mic.
  for k in NSMicrophoneUsageDescription NSSpeechRecognitionUsageDescription; do
    [ -n "$(/usr/libexec/PlistBuddy -c "Print :$k" "$PLIST" 2>/dev/null | tr -d '[:space:]')" ] || die "$k is still missing from $PLIST."
  done
  ok "Info.plist has both usage descriptions (Microphone, Speech Recognition)"
fi

npx cap sync ios || die "npx cap sync ios failed (output above). The web folder backup is in $BACKUP_ROOT."
ok "cap sync finished"

# ---------------------------------------------------------------- verify
bold "Checking the iOS project"
[ -f "$PBX" ] || die "The iOS project disappeared after sync."
PUB="$IOS/App/public"
if [ -d "$PUB" ]; then
  if [ -f "$PUB/rallywise-backend.js" ] && cmp -s "$PUB/rallywise-backend.js" "$WEB_SRC/rallywise-backend.js"; then
    ok "ios/App/App/public has the new web files"
  else
    die "ios/App/App/public does not match project/ after sync."
  fi
else
  die "ios/App/App/public is missing after sync."
fi
AFTER="$(settings)"
if [ "$BEFORE" != "$AFTER" ]; then
  printf '%s\n--- after ---\n%s\n' "$BEFORE" "$AFTER"
  die "Signing, Bundle ID, version or build settings changed during sync (above). Check the project in Xcode before archiving."
fi
ok "Bundle ID, version, build number and signing unchanged"
if [ "$SPEECH" = 1 ]; then
  if grep -q 'CapacitorCommunitySpeechRecognition' "$IOS/Podfile"; then ok "Podfile includes the speech recognition plugin"
  else die "The speech recognition plugin is not in $IOS/Podfile after sync; voice input would not work in the app."; fi
fi

# ---------------------------------------------------------------- Chinese localization
bold "Checking Simplified Chinese"
has_region=0; grep -Eq '"?zh-Hans"?[,;]' "$PBX" && has_region=1
locs="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleLocalizations' "$PLIST" 2>/dev/null || true)"
if printf '%s' "$locs" | grep -q 'zh-Hans'; then
  ok "Info.plist declares zh-Hans"
elif [ -n "$locs" ]; then
  warn "Info.plist has a CFBundleLocalizations list without zh-Hans. Not changed; add Chinese, Simplified in Xcode › Project › Info › Localizations."
elif [ "$has_region" = 1 ]; then
  ok "Project lists zh-Hans in its localizations"
elif [ "$ZH_FIX" = 1 ]; then
  cp "$PLIST" "$BACKUP_ROOT/Info.plist-$(date +%Y%m%d-%H%M%S)"
  /usr/libexec/PlistBuddy -c 'Add :CFBundleLocalizations array' -c 'Add :CFBundleLocalizations:0 string en' -c 'Add :CFBundleLocalizations:1 string zh-Hans' "$PLIST"
  ok "Added English and Simplified Chinese to Info.plist (CFBundleLocalizations), so a Chinese iPhone opens the app in Chinese"
else
  warn "zh-Hans is not declared (left as is because of --no-zh-fix)."
fi

# ---------------------------------------------------------------- summary
bold "Current Xcode settings"
if command -v xcodebuild >/dev/null 2>&1 && [ -d "$IOS/App.xcworkspace" ]; then
  xcodebuild -workspace "$IOS/App.xcworkspace" -scheme App -configuration Release -showBuildSettings 2>/dev/null \
    | grep -E '^[[:space:]]*(PRODUCT_BUNDLE_IDENTIFIER|MARKETING_VERSION|CURRENT_PROJECT_VERSION|DEVELOPMENT_TEAM) =' | sed 's/^ */  /' || warn "Could not read build settings."
else
  printf '%s\n' "$AFTER" | sed 's/^/  /'
fi

bold "Done. Web code $HEAD_SHA is in the iOS project. Nothing was uploaded."
cat <<EOF
Next, in Xcode (open $IOS/App.xcworkspace):
  1. App target › General › Build: raise it by one (keep Version as is).
  2. Choose "Any iOS Device (arm64)", then Product › Archive.
  3. In the Organizer: Distribute App › App Store Connect › Upload, when you're ready.
EOF
