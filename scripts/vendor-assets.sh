#!/usr/bin/env bash
# Rallywise: download the app's fonts (Poppins, Noto Sans SC, from Google Fonts) into project/assets/fonts, with a
# local CSS file per family, and its third-party scripts (React, Lucide, supabase-js) into project/assets/vendor, so
# the packaged iOS app (and the web app) never needs the network to draw. The browser still loads only the
# unicode-range font slices a screen uses. Run again only to update a font or a script version.
set -euo pipefail
cd "$(dirname "$0")/../project/assets/fonts"
UA="Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
vendor() { # <dir> <css2 query> <subsets to keep, regex>
  local dir="$1" q="$2" keep="$3"
  rm -rf "$dir"; mkdir -p "$dir"
  curl -fsS -A "$UA" "https://fonts.googleapis.com/css2?$q&display=swap" |
    awk -v keep="$keep" 'BEGIN{RS="}"} /@font-face/ { c=$0; sub(/^[ \n]*/, "", c); if (c ~ /^\/\*/ && c !~ ("^/\\* (" keep ") \\*/")) next; print c "}" }' > "$dir/raw.css"
  grep -o 'https://fonts.gstatic.com/[^)]*' "$dir/raw.css" | sort -u | while read -r u; do
    curl -fsS -o "$dir/$(basename "$u")" "$u"
  done
  sed -E 's#https://fonts.gstatic.com/[^)]*/([^/)]+)#\1#' "$dir/raw.css" > "$dir/$dir.css"; rm "$dir/raw.css"
}
vendor poppins 'family=Poppins:wght@300;400;500;600;700' 'latin|latin-ext'
vendor noto-sans-sc 'family=Noto+Sans+SC:wght@400;500;600' '.*'
du -sh poppins noto-sans-sc

# The app's third-party scripts, same pinned versions as before (React's checksums match support.js's SRI).
cd ../vendor 2>/dev/null || { mkdir -p ../vendor && cd ../vendor; }
J=https://cdn.jsdelivr.net/npm
curl -fsS -o react.production.min.js "$J/react@18.3.1/umd/react.production.min.js"
curl -fsS -o react-dom.production.min.js "$J/react-dom@18.3.1/umd/react-dom.production.min.js"
curl -fsS -o lucide.min.js "$J/lucide@0.460.0/dist/umd/lucide.min.js"
curl -fsS -o supabase.js "$J/@supabase/supabase-js@2.99.3/dist/umd/supabase.js"
