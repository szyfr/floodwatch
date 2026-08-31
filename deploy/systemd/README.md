# systemd units

`floodwatch-push-sweep.{service,timer}` are the canonical copies of the push
resume sweep. `DEPLOYMENT.md` §"The push resume sweep" explains the reasoning;
these files are what you actually install.

The app's own unit, `floodwatch.service`, is **not** here - it is written inline
in `DEPLOYMENT.md` §"Running the server as a systemd unit", because it carries
host-specific paths and a readiness gate that must match `PORT`/`HOSTNAME` in
`.env`.

## What it is for

A broadcast writes one `PushDispatch` row in the same transaction as the alert
and fans out in pages of 500, saving a cursor after each page.

A normal `systemctl restart` needs none of this: `server.ts` calls
`stopDispatching()` before `app.close()`, and `app.close()` awaits the pending
`after()` work, so the page in flight finishes and writes its cursor inside
`TimeoutStopSec=20`.

This timer exists for what the app cannot handle from inside itself - SIGKILL,
the OOM killer, power loss. Without it, a dispatch interrupted at device 500 of
3000 sits with `finishedAt` NULL forever and the other 2500 phones never ring,
with nothing to say so.

## Before it will work

1. **Push is configured.** `grep -c PUSH_SWEEP_SECRET /var/www/floodwatch/.env` → `1`.
   Without it the route answers 404 to everyone, including this timer.
2. **`.env` is readable by the service account.**
   `ls -l /var/www/floodwatch/.env` → `-rw------- floodwatch floodwatch`. The unit
   runs as `floodwatch` and sources the file to read the secret.
3. **The app is up.** `systemctl is-active floodwatch` → `active`.

## Install

```bash
sudo install -m 0644 deploy/systemd/floodwatch-push-sweep.service \
                     deploy/systemd/floodwatch-push-sweep.timer \
                     /etc/systemd/system/

sudo systemctl daemon-reload
sudo systemctl enable --now floodwatch-push-sweep.timer
```

Enable the **timer**, not the service. A `.timer` activates the `.service` of the
same basename automatically; enabling the service instead runs it once at boot
and never again.

`daemon-reload` is required after any edit to these files. Editing them in this
repo changes nothing on the box until you re-`install` and reload.

## Verify

```bash
systemctl list-timers floodwatch-push-sweep        # NEXT / LEFT / LAST
journalctl -u floodwatch-push-sweep.service -n 20 --no-pager
```

A healthy run prints `{"resumed":0}` and exits 0. `resumed:0` is the normal
state - it means nothing was outstanding.

To prove it actually resumes rather than merely running, force the condition and
watch it clear within a minute without sending any broadcast:

```sql
UPDATE "PushDispatch" SET "finishedAt" = NULL WHERE id = '<id>';
```

## When it complains

| Symptom | Cause |
| --- | --- |
| `404` in the journal | Wrong or missing `PUSH_SWEEP_SECRET`. The route answers 404 rather than 401 so a scanner learns nothing; check the variable first. |
| `Connection refused` | The app is down. Correct behaviour, not a timer fault. |
| `Permission denied` | `.env` ownership - see "Before it will work" #2. |
| Timer listed, never fires | You enabled the `.service` instead of the `.timer`. |
| Unexplained failure | Comment out the hardening block in the `.service` and re-test before looking anywhere else. |

## Two bounds worth knowing

A dispatch older than **two hours** is never resumed (`RESUME_MAX_AGE_MS` in
`lib/push/dispatch.ts`), so a box that was down for three days cannot wake the
province on Friday with Tuesday's flood warning.

Delivery is **at-least-once** by design. A push that a service accepted but whose
outcome was never recorded is sent again after a restart. The duplicate is
collapsed on the handset by the notification tag, which is the alert id. A
duplicate evacuation order is an annoyance; a dropped one is a life.
