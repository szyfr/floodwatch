#!/usr/bin/env bash
#
# Refresh the Cloudflare edge ranges inside floodwatch.conf, in place.
#
# Cloudflare changes these occasionally. When they do, the origin starts seeing
# edge addresses it does not trust: $remote_addr stops being the visitor, the
# access log fills with Cloudflare ranges, and fail2ban starts banning the edge.
#
#   ./refresh-cloudflare-ips.sh                                  # this repo's copy
#   sudo ./refresh-cloudflare-ips.sh /etc/nginx/sites-available/floodwatch
#
# Rewrites only the block between the >>> and <<< cloudflare-ips markers.
set -euo pipefail

CONF="${1:-$(cd "$(dirname "$0")" && pwd)/floodwatch.conf}"
[ -f "$CONF" ] || { echo "no such file: $CONF" >&2; exit 1; }
grep -q '^# >>> cloudflare-ips' "$CONF" || { echo "no cloudflare-ips marker in $CONF" >&2; exit 1; }
grep -q '^# <<< cloudflare-ips' "$CONF" || { echo "no closing marker in $CONF" >&2; exit 1; }

ips=$( { curl -fsS --max-time 20 https://www.cloudflare.com/ips-v4; echo
         curl -fsS --max-time 20 https://www.cloudflare.com/ips-v6; echo
       } | sed '/^$/d' )

# Refuse to write a truncated list: an error page or a half-finished response
# would silently narrow the set of addresses we trust.
count=$(printf '%s\n' "$ips" | grep -c '/')
if [ "$count" -lt 10 ]; then
  echo "only $count ranges returned — refusing to write $CONF" >&2
  exit 1
fi

tmp=$(mktemp)
trap 'rm -f "$tmp"' EXIT
{
  sed '/^# >>> cloudflare-ips/,$d' "$CONF"
  echo "# >>> cloudflare-ips  (generated $(date -u +%F) — refresh with ./refresh-cloudflare-ips.sh)"
  printf '%s\n' "$ips" | sed 's#^#set_real_ip_from #; s#$#;#'
  echo "# <<< cloudflare-ips"
  sed '1,/^# <<< cloudflare-ips/d' "$CONF"
} > "$tmp"
cat "$tmp" > "$CONF"

echo "$CONF: $count Cloudflare ranges"
command -v nginx >/dev/null && nginx -t 2>&1 | tail -2 || \
  echo "nginx not on PATH here — run 'sudo nginx -t && sudo systemctl reload nginx' on the server"
