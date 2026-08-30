# nginx origin config

`floodwatch.conf` is the whole nginx configuration for this app: the
`$connection_upgrade` / `$fw_proto` maps, the Cloudflare real-IP block, and both
server blocks, in one file. It is the canonical copy — `DEPLOYMENT.md` §5
explains the reasoning but does not repeat the config.

It is one file on purpose. `sites-enabled/*` is included from inside nginx.conf's
`http{}` block, so the `map` and `set_real_ip_from` directives are legal there.
Do not also drop a copy of the maps under `conf.d/` — nginx then fails to start
with `duplicate map`.

## Before it will load

1. **The app is listening.** `curl -sI http://127.0.0.1:3000/dashboard` → `200`.
2. **The Cloudflare Origin certificate is in place.** Dashboard → SSL/TLS →
   Origin Server → Create Certificate (RSA, 15 years), listing
   `floodwatch.example.ph` and `*.floodwatch.example.ph`. Cloudflare shows the
   key exactly once:

   ```bash
   sudo install -d -m 0700 /etc/ssl/cloudflare
   sudo nano /etc/ssl/cloudflare/floodwatch.pem   # "Origin Certificate"
   sudo nano /etc/ssl/cloudflare/floodwatch.key   # "Private Key"
   sudo chmod 0600 /etc/ssl/cloudflare/floodwatch.key
   sudo chmod 0644 /etc/ssl/cloudflare/floodwatch.pem
   ```

3. **The hostname is replaced.** `floodwatch.example.ph` appears in
   `server_name` and in the port-80 redirect.

## Install

```bash
sudo cp floodwatch.conf /etc/nginx/sites-available/floodwatch
sudo ln -sfn /etc/nginx/sites-available/floodwatch /etc/nginx/sites-enabled/floodwatch
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

`nginx -t` must print `syntax is ok` before the reload. A reload is graceful for
HTTP but does close proxied WebSockets; clients reconnect on their own.

## Cloudflare settings this file assumes

- **SSL/TLS → Full (strict).** Flexible leaves the edge-to-origin hop in
  plaintext and makes the Origin CA certificate pointless.
- **Always Use HTTPS: on.**
- **Network → WebSockets: on** — without it `/ws` never reaches this box.
- **Rocket Loader: off** — it reorders script execution and breaks React
  hydration.
- **Cache Rules:** bypass cache for `/api/*` and `/ws*`.
- The DNS record is **proxied** (orange cloud), and the security group allows
  443 from Cloudflare's ranges only.

## Refreshing the Cloudflare ranges

Cloudflare changes its edge ranges occasionally. When they do, the origin stops
trusting the addresses the edge actually uses: `$remote_addr` stops being the
visitor, logs fill with Cloudflare ranges, and fail2ban starts banning the edge.

```bash
./refresh-cloudflare-ips.sh                                   # this repo's copy
sudo ./refresh-cloudflare-ips.sh /etc/nginx/sites-available/floodwatch
```

It rewrites only the block between the `>>> cloudflare-ips` and
`<<< cloudflare-ips` markers, refuses to write if Cloudflare returns fewer than
ten ranges, and runs `nginx -t` afterwards when nginx is on PATH.

## Verifying

```bash
curl -sI https://floodwatch.example.ph/dashboard | grep -i '^cf-ray'   # via the edge
curl -s "https://floodwatch.example.ph/ws?EIO=4&transport=polling"     # 0{"sid":...
sudo tail -5 /var/log/nginx/floodwatch.access.log                      # real visitor IPs
```

The last one is the check nothing else will tell you: if those are Cloudflare
addresses rather than real visitors, the real-IP block is not doing its job.

## If you stop using Cloudflare

Delete the entire real-IP block. With no Cloudflare in front,
`CF-Connecting-IP` is an attacker-controlled header, and trusting it lets anyone
forge their address in your logs. `DEPLOYMENT.md` §5 has the rest of the
backing-out steps, including swapping the origin certificate for Let's Encrypt.
