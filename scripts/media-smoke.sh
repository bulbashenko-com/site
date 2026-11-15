#!/bin/sh
# Checks the site's media path end to end against the Nextcloud from docker-compose.yml, after
# `scripts/nextcloud-dev-setup.sh --fixtures`: sync, previews, Range, downloads, auth on the admin side. Used by CI (test.yml).
#   sh scripts/media-smoke.sh [site URL, default http://localhost:3000]
set -eu
B=${1:-http://localhost:3000}
fail() { echo "FAIL: $*"; exit 1; }
status() { curl -s -o /dev/null -w '%{http_code}' "$@"; }
header() { h=$1; shift; curl -s -o /dev/null -w "%header{$h}" "$@"; }

list=$(curl -fsS "$B/api/media")
pick() { echo "$list" | jq -r "$1"; }
pic=$(pick '[.[] | select(.kind == "IMAGE")][0]')
vid=$(pick '[.[] | select(.kind == "VIDEO")][0]')
bin=$(pick '[.[] | select(.section == "FILES")][0]')
[ "$pic" != null ] && [ "$vid" != null ] && [ "$bin" != null ] || fail "sync: expected an image, a video and a file, got $list"
echo "ok   sync lists image, video and file"

url() { echo "$1" | jq -r ".$2"; }

[ "$(status -r 0-99 "$B$(url "$vid" url)")" = 206 ] || fail "video: no 206 for a range"
[ "$(header content-range -r 0-99 "$B$(url "$vid" url)")" != "" ] || fail "video: no Content-Range"
echo "ok   video answers ranges (206)"

thumb=$(url "$pic" thumb)
[ "$thumb" != null ] || fail "image: no preview"
case "$(header content-type "$B$thumb")" in image/*) ;; *) fail "image: preview is not an image" ;; esac
[ "$(status "$B${thumb%&w=*}&w=999")" = 404 ] || fail "image: an arbitrary preview size was served"
echo "ok   image preview, fixed sizes only"

case "$(header content-disposition "$B$(url "$bin" url)")" in attachment*) ;; *) fail "files: not served as a download" ;; esac
etag=$(header etag "$B$(url "$bin" url)")
[ "$(status -H "If-None-Match: $etag" "$B$(url "$bin" url)")" = 304 ] || fail "files: no 304 on a matching ETag"
[ "$(status -r 999999999999-999999999999 "$B$(url "$bin" url)")" = 416 ] || fail "files: no 416 past the end"
echo "ok   files download, revalidate (304), reject bad ranges (416)"

[ "$(status "$B/m/does-not-exist/x")" = 404 ] || fail "unknown id is not 404"
[ "$(status "$B/api/media/all")" = 401 ] || fail "admin list is public"
[ "$(status -X POST "$B/api/media/sync")" = 401 ] || fail "sync is public"
echo "ok   unknown ids 404, admin endpoints need a session"
echo "media smoke test passed"
