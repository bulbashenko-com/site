#!/bin/sh
# Prepares the local Nextcloud from docker-compose.yml the way production's is set up (infra
# apps/production/nextcloud/release.yaml): a read-only user `site` and the Team folder `Site` with Gallery/ and Files/.
# With --fixtures it also uploads a few sample files (an image, a video, a file, a hidden-by-default nothing).
# Safe to re-run. Prints the env the app needs.
#   docker compose up -d && sh scripts/nextcloud-dev-setup.sh --fixtures
set -eu
cd "$(dirname "$0")/.."

NC_URL=${NC_URL:-http://localhost:8081}
ADMIN=admin:admin-dev-password
SITE_PASSWORD=site-dev-password

occ() { docker compose exec -T -u www-data -e OC_PASS="$SITE_PASSWORD" nextcloud php occ "$@"; }
dav() { curl -fsS -u "$ADMIN" "$@"; }

echo "waiting for Nextcloud to finish installing"
until occ status --output=json 2>/dev/null | grep -q '"installed":true'; do sleep 3; done

occ app:getpath groupfolders >/dev/null 2>&1 || occ app:install groupfolders
occ app:enable groupfolders >/dev/null
occ group:add site-reader >/dev/null 2>&1 || true
occ user:info site >/dev/null 2>&1 || occ user:add --password-from-env --display-name "bulbashenko.com" site
occ group:adduser site-reader site

id=$(occ groupfolders:list --output=json | jq -r '.[] | select(.mountPoint == "Site") | .id')
[ -n "$id" ] || id=$(occ groupfolders:create Site)
occ groupfolders:group "$id" admin read write share delete >/dev/null
occ groupfolders:group "$id" site-reader read >/dev/null

for dir in Gallery Files; do
  dav -o /dev/null -X MKCOL "$NC_URL/remote.php/dav/files/admin/Site/$dir" 2>/dev/null || true
done

if [ "${1:-}" = "--fixtures" ]; then
  tmp=$(mktemp -d)
  trap 'rm -rf "$tmp"' EXIT
  # Real media when the tools are there (local runs); otherwise stand-ins Nextcloud still types by extension (CI).
  if command -v magick >/dev/null; then
    pic=plasma.jpg
    magick -size 1600x1000 plasma:green-black "$tmp/$pic"
  else
    pic=logo.png
    curl -fsS -o "$tmp/$pic" "$NC_URL/core/img/logo/logo.png" # any picture Nextcloud can preview
  fi
  if command -v ffmpeg >/dev/null; then
    ffmpeg -loglevel error -f lavfi -i testsrc=duration=3:size=640x360:rate=25 -pix_fmt yuv420p "$tmp/clip.mp4"
  else
    head -c 200000 /dev/urandom > "$tmp/clip.mp4"
  fi
  head -c 3000000 /dev/urandom > "$tmp/sample.bin"
  dav -o /dev/null -T "$tmp/$pic" "$NC_URL/remote.php/dav/files/admin/Site/Gallery/$pic"
  dav -o /dev/null -T "$tmp/clip.mp4" "$NC_URL/remote.php/dav/files/admin/Site/Gallery/clip.mp4"
  dav -o /dev/null -X MKCOL "$NC_URL/remote.php/dav/files/admin/Site/Files/Tools" 2>/dev/null || true
  dav -o /dev/null -T "$tmp/sample.bin" "$NC_URL/remote.php/dav/files/admin/Site/Files/Tools/sample.bin"
  echo "fixtures uploaded"
fi

cat <<EOF
Nextcloud is ready. App env:
  NEXTCLOUD_URL=$NC_URL
  NEXTCLOUD_PUBLIC_URL=$NC_URL
  NEXTCLOUD_USER=site
  NEXTCLOUD_PASSWORD=$SITE_PASSWORD
  NEXTCLOUD_ROOT=Site
EOF
