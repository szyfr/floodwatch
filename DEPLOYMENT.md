# Deploying Pampanga Flood Watch on EC2

A single Amazon EC2 instance, self-managed end to end: no Docker, no RDS, no S3,
no load balancer. PostgreSQL, the Node process and nginx all live on the one
box, supervised by systemd.

Cloudflare sits in front as the public edge — it terminates the visitor's TLS,
and the instance accepts connections from nothing else. That is the only part of
this stack you do not run yourself; section 5 covers it, and also covers backing
it out if you ever want to.

Follow the sections in order — each assumes the previous one is done. Section 2
installs and configures PostgreSQL but stops short of migrating: the checkout
has to exist first, so `db:deploy` and `db:seed` live in section 3.

Substitute these throughout — they appear in commands, config files and
certificate paths:

| Placeholder | Meaning | Used below as |
| --- | --- | --- |
| Domain | the public hostname | `floodwatch.example.ph` |
| Admin IP | the address you SSH from | `203.0.113.7/32` |
| Repo | your git remote | `git@github.com:szyfr/floodwatch.git` |
| App directory | the checkout, and the unit's `WorkingDirectory` | `/srv/floodwatch` |
| Service account | OS user, its group, the DB role and the DB name | `floodwatch` |
| Home | the service account's home, deliberately *not* the checkout | `/home/floodwatch` |

Every command block says who runs it: your workstation, `ubuntu` with `sudo`,
or the unprivileged `floodwatch` account.

## What you are deploying

This is not a stock `next start` app, and three things about it shape every
decision below.

**It runs a custom server.** `server.ts` boots Next.js and attaches Socket.io to
the same HTTP listener at `/ws`, then runs the pair through `tsx`. `next start`
would serve pages and silently drop realtime, so the service must run
`tsx server.ts`. There is no `output: "standalone"`, so the deployed tree keeps
its `node_modules`, `.next` and source.

**It is a single process, on purpose.** Route handlers reach the Socket.io
instance through `globalThis` (`lib/realtime/registry.ts`), because the custom
server and the Next bundle are two module graphs in one process. There is no
Redis adapter. Run two copies — PM2 cluster mode, a second instance behind an
ALB — and reports stop appearing for half your users. Horizontal scaling is a
code change (a Socket.io adapter plus sticky sessions), not a deployment
change.

**It writes to its own disk.** Report photos go to
`join(process.cwd(), "var", "uploads")` and are streamed back by
`app/uploads/[name]/route.ts`. The service's working directory therefore decides
where photos land, and that directory has to survive deploys and get backed up
alongside the database.

| Piece      | What runs it                                              |
| ---------- | --------------------------------------------------------- |
| App        | `tsx server.ts` under systemd, bound to `127.0.0.1:3000`  |
| Realtime   | Socket.io on `/ws`, same port, same process                |
| Database   | PostgreSQL on the same instance, loopback only             |
| Uploads    | `/srv/floodwatch/var/uploads` on the EBS root volume       |
| Public edge| Cloudflare, proxying to nginx on 443 with a Cloudflare Origin CA cert |

```
visitor ──443──> Cloudflare edge ──443──> nginx ──> 127.0.0.1:3000 ──> Next.js  ┐
                 (TLS #1, real cert)  │   (TLS #2,                    Socket.io ┘ one
                                      │    Origin CA)                    node process
                                      └── /ws upgrade ──────────────────┘
                                                    127.0.0.1:5432 ──> PostgreSQL
                                                    /srv/floodwatch/var/uploads
```

TLS is terminated twice: once at Cloudflare with a browser-trusted certificate,
once at nginx with a Cloudflare Origin CA certificate that only Cloudflare
accepts. The origin's firewall allows 443 from Cloudflare's ranges only, so the
edge is the sole way in.

---

## Contents

1. [Instance provisioning and base system](#instance-provisioning-and-base-system)
2. [PostgreSQL, self-managed on the instance](#postgresql-self-managed-on-the-instance)
3. [First deploy: code, environment, database, build](#first-deploy-code-environment-database-build)
4. [Running the server as a systemd unit](#running-the-server-as-a-systemd-unit)
5. [nginx reverse proxy, WebSocket upgrade and TLS](#nginx-reverse-proxy-websocket-upgrade-and-tls)
6. [Operations, verification and troubleshooting](#operations-verification-and-troubleshooting)

---

## Instance provisioning and base system

This section takes you from an empty AWS account to a hardened Ubuntu 24.04 box with Node, bun, a service account, and a directory layout that the rest of the guide assumes. Nothing application-specific is installed or configured yet — PostgreSQL, the systemd unit, and nginx come later.

Two conventions used throughout:

- Blocks marked `# as: ubuntu (sudo)` run in your SSH session as the default `ubuntu` user, which has passwordless sudo.
- Blocks marked `# as: floodwatch` run as the unprivileged service account. Always enter it with `sudo -iu floodwatch` (a **login** shell) — plain `sudo -u floodwatch` leaves `HOME` pointing at the invoking user's home (`/home/ubuntu`), which sends bun's package cache to the wrong place.

The AWS CLI blocks below run in order: security group, then launch, then Elastic IP. Do not skip ahead — each one consumes an id produced by the one before it.

### Region and AMI

Use **`ap-southeast-1` (Singapore)**. It is the lowest-latency AWS region to Pampanga (~30–60 ms from Metro Manila, depending on your ISP's peering). Latency matters more here than for a typical CRUD app: the dashboard holds an open Socket.io connection, and every report, vote and DRRM broadcast fans out over it. A US or EU region makes the live map feel laggy even though page loads look fine.

Use the official Canonical **Ubuntu 24.04 LTS (Noble Numbat), amd64** AMI. Don't hardcode an AMI ID from a blog post — resolve the current one from Canonical's public SSM parameter:

```bash
# as: your workstation, with the AWS CLI configured
export AWS_REGION=ap-southeast-1

AMI_ID=$(aws ssm get-parameter \
  --name /aws/service/canonical/ubuntu/server/24.04/stable/current/amd64/hvm/ebs-gp3/ami-id \
  --query Parameter.Value --output text)
echo "$AMI_ID"
```

The `ebs-gp3` segment is release-specific: 24.04 publishes gp3-backed images, while 22.04 and earlier only publish `ebs-gp2`. If you ever get `ParameterNotFound`, list what Canonical currently publishes rather than guessing:

```bash
# as: your workstation
aws ssm get-parameters-by-path \
  --path /aws/service/canonical/ubuntu/server/24.04/stable/current/amd64/hvm/ \
  --recursive --query 'Parameters[].Name' --output text
```

**On architecture:** stay on x86_64. The dependency tree pulls prebuilt, architecture-specific native binaries — `@next/swc-linux-x64-gnu`, `@tailwindcss/oxide-linux-x64-gnu`, `lightningcss-linux-x64-gnu`, `@img/sharp-linux-x64`. None of them need a compiler (there is no `node-gyp` step anywhere in this tree; `bcryptjs` is pure JS, `pg` is pure JS, and Prisma 7 uses a WASM query compiler rather than a native engine), so you do **not** need `build-essential` on the box. But they do mean `node_modules` is architecture- and libc-specific.

> **Do not rsync `node_modules` from a macOS or Windows dev machine.** `bun install` must run on the instance. This matters more than usual for this app: `next.config.ts` sets no `output: "standalone"`, so the deployed tree is the full source plus `.next` plus a complete `node_modules` — there is no self-contained bundle to copy.

A Graviton `t4g.medium` is a valid ~20% cheaper substitute — `bun.lock` carries the `linux-arm64-gnu` variants of every one of those packages — but you must then take the `arm64` AMI, and download the `aarch64` bun build. Everything else in this guide is unchanged. Pick one and be consistent; a half-migrated box fails at `bun install` with confusing "cannot find module" errors from the SWC loader.

### Instance type: size for the build, not the traffic

This is the decision people get wrong. The steady-state load is modest — one Node process serving a province — but `next build` with Turbopack is memory-hungry, and it has to share the box with PostgreSQL.

Measured on this codebase on the **dev host (24 vCPU, 16 GiB)**, sampling total resident memory across the entire `next build` process tree every 300 ms:

| Condition | Peak RSS across the build tree |
| --- | --- |
| Build on a 24-vCPU host | **3.15 GiB** |
| Same build pinned to 2 CPUs (`taskset -c 0,1`) | **2.82 GiB** |

Constraining CPUs barely helps, because the peak is the Turbopack compile phase, not the static-generation worker fan-out. Treat these as indicative rather than as a prediction for a 4 GiB box — allocators behave differently under real pressure, which is exactly why the swapfile below is not optional. Plan for **~3 GiB of headroom during builds.**

| Instance type | RAM | Verdict |
| --- | --- | --- |
| `t3.micro` | 1 GiB | `next build` is OOM-killed. Not viable, swap or no swap. |
| `t3.small` | 2 GiB | OOM-killed without swap. Works with a 4 GiB swapfile, slowly, and only if you stop the app service first. |
| **`t3.medium`** | **4 GiB** | **Recommended.** Build peak fits with ~1 GiB left for PostgreSQL and the OS. Add the 2 GiB swapfile below as insurance. |
| `t3.large` | 8 GiB | Buy this if you want to build while the site is serving traffic without thinking about it. |

**Recommendation: `t3.medium` (2 vCPU / 4 GiB) with a 2 GiB swapfile.**

Two things worth knowing before you try to economise:

- **`NODE_OPTIONS=--max-old-space-size=...` is not a fix.** A large share of Turbopack's peak is native Rust allocation outside the V8 heap. Lowering the cap only makes the JavaScript side fail sooner; raising it does nothing for the native allocator. More RAM or more swap are the only levers.
- **Under memory pressure the OOM killer may take PostgreSQL, not the build.** It picks by resident size, and a mid-build `next build` and a warm Postgres are not that far apart on a 2 GiB box. A swapfile is what keeps the kernel from having to choose at all.

T3 instances are burstable and default to **unlimited** mode. A full build runs both vCPUs flat out for roughly one to three minutes; that burns CPU credits and, once they're exhausted, bills a small surplus charge. That is the right tradeoff — switching to `standard` mode to cap the bill just makes builds crawl.

### Root volume: 50 GiB gp3

There is one volume and everything lives on it. The budget, using figures measured from this repo:

| Consumer | Size | Note |
| --- | --- | --- |
| Ubuntu base, apt cache, journal | ~3 GiB | |
| `node_modules` | **2.0 GiB** | measured; includes dev dependencies, which the build needs |
| bun's install cache (`~/.bun/install/cache`) | up to ~1 GiB | |
| `.next` production output | **~28 MiB** | measured (`.next/server` 24 MiB + `.next/static` 2.7 MiB); `.next/cache` grows on top across rebuilds |
| PostgreSQL cluster + WAL | ~0.3 GiB empty, grows slowly | flood reports are small text rows |
| Swapfile | 2 GiB | |
| Backup staging (`pg_dump` + uploads tarball, pre-upload) | plan 5 GiB | |
| **Remaining for uploads** | **~35 GiB** | |

Uploads are the only thing that grows without bound, and they deserve a hard look:

- `POST /api/uploads` accepts JPG/PNG up to `PHOTO_MAX_BYTES` = 5 MiB each. A typical phone photo lands at 1.5–3 MiB.
- **Nothing in the codebase ever deletes an upload file.** Deleting a report is a soft delete (`deletedAt` is set); the file on disk stays forever. There is no pruning job, no TTL, no reaper.

At 200 photos/day averaging 2.5 MiB that is ~500 MiB/day, or ~15 GiB/month — so 35 GiB of headroom is roughly two months at a busy-season rate. **Set a disk alarm before you need one**, and plan for either a larger volume or a manual pruning policy before the second monsoon season. `gp3` rather than `gp2` because gp3 includes 3,000 IOPS and 125 MB/s at any size, whereas a 50 GiB gp2 volume is throttled to 150 baseline IOPS — which PostgreSQL will feel.

### Security group: three ports, nothing else

```bash
# as: your workstation
export AWS_REGION=ap-southeast-1
export ADMIN_CIDR="203.0.113.7/32"   # your own IP: curl -s https://checkip.amazonaws.com

VPC_ID=$(aws ec2 describe-vpcs --filters Name=isDefault,Values=true \
  --query 'Vpcs[0].VpcId' --output text)

SG_ID=$(aws ec2 create-security-group \
  --group-name floodwatch-web \
  --description "Floodwatch: SSH from admin only, HTTP/HTTPS from anywhere" \
  --vpc-id "$VPC_ID" --query GroupId --output text)

aws ec2 authorize-security-group-ingress --group-id "$SG_ID" \
  --ip-permissions "IpProtocol=tcp,FromPort=22,ToPort=22,IpRanges=[{CidrIp=$ADMIN_CIDR,Description=admin-ssh}]"

# 443 from Cloudflare's edge ranges only — never 0.0.0.0/0. Anyone who learns
# this instance's address would otherwise bypass the edge entirely, and every
# control Cloudflare applies stops applying.
for ip in $(curl -s https://www.cloudflare.com/ips-v4); do
  aws ec2 authorize-security-group-ingress --group-id "$SG_ID" \
    --ip-permissions "IpProtocol=tcp,FromPort=443,ToPort=443,IpRanges=[{CidrIp=$ip,Description=cloudflare}]"
done
for ip in $(curl -s https://www.cloudflare.com/ips-v6); do
  aws ec2 authorize-security-group-ingress --group-id "$SG_ID" \
    --ip-permissions "IpProtocol=tcp,FromPort=443,ToPort=443,Ipv6Ranges=[{CidrIpv6=$ip,Description=cloudflare}]"
done

echo "SG_ID=$SG_ID"
```

That is the complete ruleset:

- **22/tcp from `$ADMIN_CIDR` only.**
- **443/tcp from Cloudflare's published ranges only** — the site, and the `/ws` WebSocket upgrade, which rides the same port and the same nginx server block. Cloudflare publishes these at `cloudflare.com/ips-v4` and `ips-v6` and changes them occasionally; re-run the loops above when they do.
- **No port 80 at all.** With Cloudflare in Full (strict) the edge only ever connects to the origin on 443, and the Cloudflare Origin CA certificate needs no HTTP-01 challenge, so there is nothing for port 80 to serve. (The nginx config still carries a port-80 redirect block as a safety net for the day someone opens it.)
- **Default egress (allow all)** stays. The box needs to reach apt, NodeSource, GitHub (for bun and your repo), Cloudflare, and whichever map tile host you point at.

**Do not open 3000. Do not open 5432.** The Node server and PostgreSQL both bind loopback only and are reached exclusively through nginx and a Unix/localhost connection respectively. If you find yourself wanting to open 3000 to "test the app directly", you are about to discover the real reason it can't work: the session cookie is issued with `secure: true` whenever `NODE_ENV === "production"`, so a browser will silently refuse to store it over plain HTTP and sign-in will appear to fail with no error. Test through nginx and TLS or not at all.

Back this up in the app's own configuration: put `HOSTNAME=127.0.0.1` in `/srv/floodwatch/.env` (created in the configuration section). `server.ts` reads `process.env.HOSTNAME ?? "localhost"` and passes it straight to `httpServer.listen(port, hostname)`, so setting it explicitly guarantees the listener never binds a public interface even if a security group rule is later edited by mistake. systemd injects no `HOSTNAME` of its own, so the `.env` value is what the process sees — but note that `dotenv/config` never overwrites a variable that is already in the environment, so do not also set `HOSTNAME` in the unit file. `.env` is the single source for it.

### Launching

The key pair must already exist in this region, or `run-instances` fails with `InvalidKeyPair.NotFound`:

```bash
# as: your workstation — only if you don't already have one
aws ec2 create-key-pair --key-name floodwatch-admin \
  --query KeyMaterial --output text > ~/.ssh/floodwatch-admin.pem
chmod 400 ~/.ssh/floodwatch-admin.pem
```

```bash
# as: your workstation
INSTANCE_ID=$(aws ec2 run-instances \
  --image-id "$AMI_ID" \
  --instance-type t3.medium \
  --key-name floodwatch-admin \
  --security-group-ids "$SG_ID" \
  --block-device-mappings '[{"DeviceName":"/dev/sda1","Ebs":{"VolumeSize":50,"VolumeType":"gp3","Encrypted":true,"DeleteOnTermination":false}}]' \
  --metadata-options 'HttpTokens=required' \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=floodwatch}]' \
  --query 'Instances[0].InstanceId' --output text)

echo "INSTANCE_ID=$INSTANCE_ID"
aws ec2 wait instance-running --instance-ids "$INSTANCE_ID"
```

`HttpTokens=required` forces IMDSv2, which closes the SSRF-to-instance-credentials path. `DeviceName:/dev/sda1` is the root device name Canonical's Ubuntu AMIs use — get it wrong and you silently attach a second, unused volume instead of resizing the root one. `DeleteOnTermination=false` is deliberate: the PostgreSQL cluster **and** every uploaded report photo live on this root volume, so an accidental terminate must not take them with it. The cost is that terminating the instance leaves an orphaned 50 GiB volume you have to delete by hand.

### Elastic IP and DNS

An instance's default public IPv4 is released on stop/start, which would silently break the origin address Cloudflare forwards to. Allocate an Elastic IP and associate it before you touch DNS:

```bash
# as: your workstation
ALLOC_ID=$(aws ec2 allocate-address --domain vpc \
  --tag-specifications 'ResourceType=elastic-ip,Tags=[{Key=Name,Value=floodwatch}]' \
  --query AllocationId --output text)

aws ec2 associate-address --instance-id "$INSTANCE_ID" --allocation-id "$ALLOC_ID"

EIP=$(aws ec2 describe-addresses --allocation-ids "$ALLOC_ID" \
  --query 'Addresses[0].PublicIp' --output text)
echo "EIP=$EIP"
```

AWS bills for every public IPv4 address, in use or not — budget roughly $3.60/month for it ($0.005/hour). An EIP left allocated after you terminate the instance keeps billing, so release it if you tear the stack down.

In the **Cloudflare** dashboard, create a single **A record** for your hostname pointing at that Elastic IP, with the proxy **enabled** (orange cloud). Cloudflare manages TTL for proxied records, so the TTL field is fixed at Auto.

```
floodwatch.example.ph   A   <ELASTIC_IP>   Proxied
```

Then verify the name resolves to **Cloudflare**, not to your instance — that is what proxied means, and it is the check that the orange cloud is actually on:

```bash
# as: your workstation
dig +short floodwatch.example.ph @1.1.1.1
```

Those addresses should fall inside `curl -s https://www.cloudflare.com/ips-v4`. If the Elastic IP comes back instead, the record is grey-clouded (DNS-only): traffic would reach the origin directly, where the security group now refuses everything that is not Cloudflare, and the Origin CA certificate is not browser-trusted anyway. Turn the proxy on.

Do not add an AAAA record unless the instance has a routable IPv6 address; Cloudflare serves IPv6 visitors from its own edge regardless of whether your origin speaks it.

Now connect. Everything from here runs on the instance:

```bash
# as: your workstation
ssh -i ~/.ssh/floodwatch-admin.pem ubuntu@"$EIP"
```

### First boot: updates, timezone, unattended upgrades

```bash
# as: ubuntu (sudo)
sudo apt-get update
sudo DEBIAN_FRONTEND=noninteractive apt-get -y upgrade
sudo apt-get install -y ca-certificates curl gnupg git unzip bind9-dnsutils
```

`bind9-dnsutils` is not in the cloud image and gives you `dig`, which the checkpoint at the end of this section (and the TLS section) uses.

That first `upgrade` almost always installs a newer kernel, so expect `/var/run/reboot-required` to exist immediately. Reboot now, while nothing is running:

```bash
# as: ubuntu (sudo)
[ -f /var/run/reboot-required ] && sudo reboot
```

Set the timezone to **Asia/Manila**:

```bash
# as: ubuntu (sudo)
sudo timedatectl set-timezone Asia/Manila
timedatectl
```

This does **not** change any application data. The schema stores `DateTime` columns as absolute instants, the server only ever calls `new Date()` and `.toISOString()`, and the API serialises UTC. What it changes is what *you* read: `journalctl` output, PostgreSQL log lines, nginx logs and backup filenames. During an actual flood, at 3 a.m., correlating a DRRM broadcast against a log line is much easier when both are in local time.

Enable unattended security upgrades:

```bash
# as: ubuntu (sudo)
sudo apt-get install -y unattended-upgrades

sudo tee /etc/apt/apt.conf.d/20auto-upgrades >/dev/null <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
EOF

sudo tee /etc/apt/apt.conf.d/52unattended-upgrades-local >/dev/null <<'EOF'
// Reboots are manual: a reboot drops every open Socket.io connection and the
// in-process realtime registry with it. Clients reconnect, but pick the moment.
Unattended-Upgrade::Automatic-Reboot "false";
Unattended-Upgrade::Remove-Unused-Kernel-Packages "true";
Unattended-Upgrade::Remove-New-Unused-Dependencies "true";
EOF

sudo unattended-upgrade --dry-run --debug | tail -20
```

Two consequences to internalise now:

- Ubuntu's default `Allowed-Origins` covers only Ubuntu's own archive and security pockets. **NodeSource is not in it**, so Node.js will never be upgraded automatically. Node updates are a deliberate `apt-get install --only-upgrade nodejs` followed by `sudo systemctl restart floodwatch`.
- `Automatic-Reboot "false"` means you must check `/var/run/reboot-required` periodically and reboot on your own schedule. Because all realtime state (the Socket.io server instance, room membership, the `globalThis` registry) lives in this one process's memory with no Redis adapter, a reboot is a full realtime reset. Harmless — clients reconnect — but not something to have happen unattended during a storm.

### The swapfile

```bash
# as: ubuntu (sudo) — 2G on t3.medium; use 4G if you insisted on t3.small
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
printf 'vm.swappiness=10\n' | sudo tee /etc/sysctl.d/99-swappiness.conf
sudo sysctl --system
swapon --show
free -h
```

`swapon --show` must list `/swapfile`; the `/etc/fstab` line is what brings it back after a reboot. `vm.swappiness=10` keeps the kernel from paging out the idle Node process or Postgres' shared buffers during normal operation — the swap is there to absorb a build spike, not to substitute for RAM at steady state. (`fallocate` is correct on Ubuntu 24.04's default ext4 root. On XFS or btrfs use `dd if=/dev/zero of=/swapfile bs=1M count=2048` instead.)

### The service account and directory layout

Create a system user that owns the application and can neither log in remotely nor sudo:

```bash
# as: ubuntu (sudo)
sudo adduser --system --group --home /home/floodwatch --shell /bin/bash floodwatch

sudo install -d -o floodwatch -g floodwatch -m 0755 /srv/floodwatch

id floodwatch
ls -ld /home/floodwatch /srv/floodwatch
```

`--system` creates the account with its password field disabled, so there is no password to guess; `--shell /bin/bash` is still needed so `sudo -iu floodwatch` gives you a usable shell for builds and migrations.

**The home directory is deliberately *not* the checkout.** `/home/floodwatch` holds bun's install cache (`~/.bun`) and the deploy key (`~/.ssh`); `/srv/floodwatch` holds only the git working tree. Keeping them apart means a `git clean -xdf` in the checkout cannot delete the SSH key that fetches it, and `git status` on the box stays readable.

> **Leave `/srv/floodwatch` empty until the deploy section clones into it.** `git clone` aborts with *"destination path already exists and is not an empty directory"* if there is so much as one dotfile in it. In particular, do **not** pre-create `var/uploads` here — the repo already tracks `var/uploads/.gitkeep`, so the clone brings the directory with it.

Immediately after the clone, tighten the mode git created:

```bash
# as: ubuntu (sudo) — AFTER the deploy section has cloned the repo
sudo install -d -o floodwatch -g floodwatch -m 0750 /srv/floodwatch/var
sudo install -d -o floodwatch -g floodwatch -m 0750 /srv/floodwatch/var/uploads
ls -ld /srv/floodwatch /srv/floodwatch/var/uploads
```

The layout, once the deploy section has cloned the repo into it:

```
/home/floodwatch/                 # HOME of the service account — NOT the checkout
├── .bun/                         # bun's install cache
└── .ssh/                         # the deploy key

/srv/floodwatch/                  # the git checkout AND the service's WorkingDirectory
├── .env                          # 0600 floodwatch:floodwatch — created in the deploy section
├── .next/                        # build output — ~28 MiB after `bun run build`
├── app/  components/  lib/       # application source, from git
├── generated/prisma/             # `prisma generate` output — gitignored TypeScript, regenerated on this box
├── node_modules/                 # ~2.0 GiB, installed here, never copied in
├── prisma/                       # schema.prisma + migrations
├── server.ts                     # the custom Next + Socket.io server
└── var/
    └── uploads/                  # report photos, UUID-named JPG/PNG
```

**The checkout path is not cosmetic.** Two things resolve relative to the process's working directory:

- `lib/server/uploads.ts` defines `UPLOAD_DIR = join(process.cwd(), "var", "uploads")`. Both the write path (`POST /api/uploads`) and the read path (`app/uploads/[name]/route.ts`) use it. Start the service from a different directory and photos are written somewhere new and the ones already on disk 404.
- `server.ts` and `prisma7.config.ts` both begin with `import "dotenv/config"`, which loads `.env` from the working directory. A wrong cwd means no `DATABASE_URL` and no `AUTH_SECRET`.

So `WorkingDirectory=/srv/floodwatch` in the systemd unit, and `cd /srv/floodwatch` before any `bun run` command. Making `/srv/floodwatch` simultaneously the home directory and the checkout keeps those aligned by construction.

nginx never needs access to `var/uploads` — photos are streamed by the Node route handler, not served as static files (they are written after boot, and Next only indexes `public/` once at startup). `0750` is correct; do not loosen it to let nginx in.

### Node.js

`next/package.json` declares `engines: { "node": ">=20.9.0" }`, and Node is non-negotiable regardless of installer choice: both `bun run dev` and `bun run start` execute `tsx server.ts`, and **tsx is a Node loader** — bun installs packages here, it does not run the server.

Install **Node.js 24 LTS from the NodeSource apt repository**, system-wide. Node 24 is the Active LTS line as of August 2026 (Node 22 is in maintenance; Node 26 is Current and does not go LTS until October 2026). It also matches the dev machine (v24.18.0) and puts the binary at `/usr/bin/node`.

```bash
# as: ubuntu (sudo)
sudo install -d -m 0755 /etc/apt/keyrings
curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
  | sudo gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
sudo chmod 0644 /etc/apt/keyrings/nodesource.gpg

echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_24.x nodistro main" \
  | sudo tee /etc/apt/sources.list.d/nodesource.list

sudo apt-get update
sudo apt-get install -y nodejs
node -v   # expect v24.x
```

**Not nvm.** nvm installs into a single user's home directory and is only initialised by an interactive login shell. systemd's `ExecStart` runs no shell profile, so the unit would have to hardcode `/srv/floodwatch/.nvm/versions/node/v24.18.0/bin/node` — a path that changes on every patch upgrade and silently breaks the service the next time someone runs `nvm install`. A system package at a stable path is the right answer for anything that runs under systemd.

Remember that unattended-upgrades will not touch this repository. Node upgrades are manual:

```bash
# as: ubuntu (sudo) — when you choose to
sudo apt-get update && sudo apt-get install -y --only-upgrade nodejs
sudo systemctl restart floodwatch
```

### bun

The lockfile is `bun.lock`, so installs must go through bun to be reproducible. Install it system-wide at `/usr/local/bin/bun`, pinned to the version used in development (1.4.0), so root owns the binary and the systemd unit needs no `PATH` surgery:

```bash
# as: ubuntu (sudo)
cd /tmp
curl -fsSLO https://github.com/oven-sh/bun/releases/download/bun-v1.4.0/bun-linux-x64.zip
curl -fsSLO https://github.com/oven-sh/bun/releases/download/bun-v1.4.0/SHASUMS256.txt
grep ' bun-linux-x64.zip$' SHASUMS256.txt | sha256sum -c -   # must print: OK

sudo unzip -j -o /tmp/bun-linux-x64.zip 'bun-linux-x64/bun' -d /usr/local/bin
sudo chown root:root /usr/local/bin/bun
sudo chmod 0755 /usr/local/bin/bun
rm -f /tmp/bun-linux-x64.zip /tmp/SHASUMS256.txt

bun --version   # expect 1.4.0
```

The archive contains exactly one member, `bun-linux-x64/bun`; `-j` flattens that leading directory away.

Alternatives, if that asset name has moved: `curl -fsSL https://bun.sh/install | sudo BUN_INSTALL=/usr/local bash -s "bun-v1.4.0"` does the same thing via bun's official installer — the positional argument is the release tag, and `BUN_INSTALL` is the install prefix, so the binary lands at `/usr/local/bin/bun`. It must run under `sudo`, since `/usr/local` is root-owned; it will also append a PATH line to root's `~/.bashrc`, which is harmless. On a Graviton instance the asset is `bun-linux-aarch64.zip`. If `bun --version` dies with `Illegal instruction`, the CPU lacks AVX2 — use `bun-linux-x64-baseline.zip` (this should not happen on t3, which is Skylake or newer; the `bun.sh/install` script probes for AVX2 and picks the baseline build for you).

Confirm bun and Node agree with each other before moving on:

```bash
# as: floodwatch
sudo -iu floodwatch
which node bun && node -v && bun --version
exit
```

### Hardening

#### SSH: keys only

```bash
# as: ubuntu (sudo)
sudo tee /etc/ssh/sshd_config.d/99-floodwatch.conf >/dev/null <<'EOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
X11Forwarding no
EOF

sudo sshd -t
sudo systemctl daemon-reload
sudo systemctl restart ssh.socket
```

`sshd -t` validates the config before you touch the daemon — run it, because a syntax error plus a restart is how people lock themselves out.

Two Ubuntu 24.04 specifics worth knowing:

- sshd here is **socket-activated**: `ssh.socket` owns port 22 and starts sshd, and 24.04 derives the socket's listen address and port from the sshd configuration through a systemd generator. That is why the sequence above is `daemon-reload` then `restart ssh.socket` rather than `systemctl restart ssh` — restarting `ssh.service` directly is not what applies the drop-in, and can collide with the socket over port 22. Existing sessions are untouched; new connections pick up the new config.
- sshd uses the **first** obtained value for each keyword, and the cloud image already ships `/etc/ssh/sshd_config.d/50-cloud-init.conf`. A `99-` file therefore cannot override anything cloud-init has already set. It doesn't bite here (cloud-init sets `PasswordAuthentication no`, the same value), but if a directive of yours appears to be ignored, check that file first and number yours below it.

**Keep your current SSH session open** and prove a second one works from another terminal before you close the first.

The `floodwatch` account has no `~/.ssh` and no password, so it is unreachable over SSH by design. Reach it only via `sudo -iu floodwatch` from an admin account.

#### ufw

Redundant with the security group, and worth having anyway — it survives someone widening an SG rule in the console:

```bash
# as: ubuntu (sudo)
ADMIN_CIDR="203.0.113.7/32"   # REPLACE with your real address before running anything below

sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow from "$ADMIN_CIDR" to any port 22 proto tcp comment 'admin ssh'
for ip in $(curl -s https://www.cloudflare.com/ips-v4) $(curl -s https://www.cloudflare.com/ips-v6); do
  sudo ufw allow from "$ip" to any port 443 proto tcp comment 'cloudflare'
done

sudo ufw show added            # read this before enabling — the 22 rule must be YOUR address
sudo ufw --force enable
sudo ufw status verbose
```

> The `203.0.113.7/32` above is a documentation placeholder. Enabling a default-deny firewall whose only SSH rule points at someone else's address locks you out of the instance for good — recovery means the EC2 serial console or detaching the root volume. Set `ADMIN_CIDR`, run `ufw show added`, and only then enable.

That mirrors the security group: 443 from Cloudflare only, no port 80. Re-run the loop when Cloudflare changes its ranges — and note `ufw` rules are per-address, so this adds about twenty of them; `ufw status numbered` is how you prune the stale ones later.

ufw does not filter loopback, so nginx→Node on 127.0.0.1:3000 and Node→PostgreSQL on 127.0.0.1:5432 are unaffected. If your ISP gives you a dynamic address, use a `/24` from your provider or an SSM Session Manager setup rather than opening 22 to the world.

#### fail2ban

```bash
# as: ubuntu (sudo)
sudo apt-get install -y fail2ban python3-systemd

sudo tee /etc/fail2ban/jail.local >/dev/null <<'EOF'
[DEFAULT]
bantime  = 1h
findtime = 10m
maxretry = 5
backend  = systemd

[sshd]
enabled      = true
backend      = systemd
journalmatch = _SYSTEMD_UNIT=ssh.service + _COMM=sshd
EOF

sudo systemctl enable --now fail2ban
sleep 2
sudo fail2ban-client status sshd
```

`python3-systemd` is required for the systemd journal backend on 24.04 — without it fail2ban fails to start with the systemd backend. The explicit `journalmatch` matters just as much: upstream's sshd filter defaults to `_SYSTEMD_UNIT=sshd.service`, but Ubuntu's unit is **`ssh.service`**, so the stock jail reads a journal selector that matches nothing and reports itself happily active while banning no one.

With password authentication already disabled this mostly suppresses log noise rather than stopping a real attack — but it is cheap, and it keeps the journal readable when you actually need to search it.

### Checkpoint

Everything below should succeed before you move on to installing PostgreSQL:

```bash
# as: ubuntu (sudo)
lsb_release -ds                       # Ubuntu 24.04.x LTS
timedatectl | grep 'Time zone'        # Asia/Manila
node -v                               # v24.x  (>= 20.9.0)
bun --version                         # 1.4.0
id floodwatch                         # uid=... gid=... groups=...
ls -ld /home/floodwatch               # drwxr-xr-x floodwatch floodwatch
ls -ld /srv/floodwatch                # drwxr-xr-x floodwatch floodwatch, and EMPTY until the clone
free -h                               # ~3.8Gi Mem, 2.0Gi Swap
swapon --show                         # /swapfile  file  2G
df -h /                               # ~49G size, plenty available
sudo ufw status verbose               # 22 from admin CIDR, 80, 443
sudo systemctl is-active fail2ban     # active
curl -s https://checkip.amazonaws.com # the instance's own Elastic IP
dig +short floodwatch.example.ph @1.1.1.1   # Cloudflare edge IPs, NOT the Elastic IP
```

The box is now ready for PostgreSQL, the application checkout and build, the systemd unit, and nginx with TLS.

---

## PostgreSQL, self-managed on the instance

Floodwatch talks to Postgres through `@prisma/adapter-pg` — a plain `pg` connection pool inside the Node process, no Prisma proxy, no separate query engine. On this deployment shape that pool connects over loopback to a cluster running on the same EC2 instance. The database never accepts a connection from outside the box.

Everything below runs as `root` (via `sudo`) unless it says otherwise. Commands shown as `sudo -u postgres …` run as the `postgres` OS superuser; commands shown as `sudo -u floodwatch …` run as the unprivileged service account that the systemd unit uses.

**What this section assumes has already happened.** Install, role and cluster configuration stand alone — do them whenever you like. But everything from *DATABASE_URL* onward needs the application side in place first:

- the `floodwatch` OS account exists (created in *Instance provisioning*, and deliberately given the *same* name as the DB role — that is what makes `peer` authentication work below),
- `/srv/floodwatch` holds the checkout and a `.env`,
- a **full** `bun install` has run there. Not `--production`: `prisma` is a devDependency, and the `postinstall` hook (`prisma generate`) writes `generated/prisma/`, which is gitignored and therefore does not exist until you generate it on the box. `prisma/seed-base.ts` imports `../generated/prisma/client` directly, so without it the seed dies with `Cannot find module`.
- `bun` is reachable from a non-login shell as the `floodwatch` user. The official installer drops it in the *installing* user's `~/.bun/bin`, which the service account's PATH does not include. Check before you rely on it:

```bash
sudo -u floodwatch bash -c 'cd /srv/floodwatch && command -v bun && bun --version'
```

If that prints nothing, symlink or install bun into `/usr/local/bin` before continuing.

### Install

Ubuntu 24.04 LTS ships **PostgreSQL 16** in `main`. That is the right default here: it gets security updates from Ubuntu for the life of the LTS, and this schema needs nothing newer — it is plain tables, native enums, btree indexes and `TIMESTAMP(3)` columns, with no `CREATE EXTENSION` anywhere in `prisma/migrations/`.

```bash
sudo apt update
sudo apt install -y postgresql postgresql-client
```

Confirm what you actually got, where its files live, and that it will come back after a reboot:

```bash
apt-cache policy postgresql
pg_lsclusters
# Ver Cluster Port Status Owner    Data directory              Log file
# 16  main    5432 online postgres /var/lib/postgresql/16/main /var/log/postgresql/postgresql-16-main.log

systemctl is-enabled postgresql
# enabled
```

Config lives in `/etc/postgresql/16/main/` (`postgresql.conf`, `pg_hba.conf`, `conf.d/`), data in `/var/lib/postgresql/16/main`. Substitute your major version everywhere below if it differs.

The service unit is `postgresql@16-main.service`; `postgresql.service` is a meta-unit that starts every cluster. Both work with `systemctl`, but reload/restart the versioned one when you want to be sure which cluster you hit.

**Only if you specifically want a newer major** (nothing in this app does), use PGDG:

```bash
sudo apt install -y curl ca-certificates
sudo install -d /usr/share/postgresql-common/pgdg
sudo curl --fail -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc \
  https://www.postgresql.org/media/keys/ACCC4CF8.asc
echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt noble-pgdg main" \
  | sudo tee /etc/apt/sources.list.d/pgdg.list
sudo apt update
sudo apt install -y postgresql-17
```

Do this **before** installing the archive's `postgresql`, or you end up with two clusters — 16 on 5432 and 17 on 5433 — and a `DATABASE_URL` pointing at whichever one you didn't migrate. Check `pg_lsclusters` and drop the one you don't want with `sudo pg_dropcluster --stop 16 main`. If you go this route, remember that the version-specific notes below (the `postgresql@16-main` unit name, the `/etc/postgresql/16/main` paths, and the PG16-specific remarks about planner statistics in dumps) shift with the major version.

### Create the role and the database

Generate the password as hex. It goes into a URL, and hex has no characters that need percent-encoding — this sidesteps an entire category of "authentication failed" bugs caused by `@`, `/`, `#`, `?` or `%` in a password:

```bash
openssl rand -hex 32
```

Keep it somewhere safe for a minute; it goes into `.env` shortly. It must be a **different** value from `AUTH_SECRET`.

Create the role with a prompt rather than an inline SQL literal, so the plaintext never lands in your shell history or the Postgres server log (`createuser` hashes it client-side with `password_encryption`, which is `scram-sha-256` by default on 14+):

```bash
sudo -u postgres createuser --pwprompt --no-createdb --no-createrole --no-superuser floodwatch
```

Then the database, **owned by that role**:

```bash
sudo -u postgres createdb --owner=floodwatch --template=template0 \
  --encoding=UTF8 --lc-collate=C.UTF-8 --lc-ctype=C.UTF-8 floodwatch
```

Two deliberate choices there:

- **`--owner=floodwatch` is not optional.** Since PostgreSQL 15 the `public` schema no longer grants `CREATE` to `PUBLIC`. If `floodwatch` is merely a login role with connect rights, `prisma migrate deploy` dies on the first `CREATE TABLE` with `permission denied for schema public`. Owning the database makes the role an implicit member of `pg_database_owner`, which owns `public` — so it can create tables, types and the `_prisma_migrations` bookkeeping table without any extra `GRANT`.
- **`C.UTF-8` collation** sidesteps glibc collation-version drift, which can silently invalidate btree index ordering across an OS upgrade; the symptom is `WARNING:  database "floodwatch" has a collation version mismatch` in the log, with a hint to run `ALTER DATABASE … REFRESH COLLATION VERSION` (and, properly, `REINDEX`). `C.UTF-8` sorts by byte value, which is stable across glibc upgrades. The cost is that byte order is not linguistic order. For the LGU list that is a non-issue — `prisma/seed-data.ts` names all 22 Pampanga cities and municipalities in Title-Case ASCII, so `orderBy: { name: "asc" }` at `lib/server/queries.ts:136` reads the way you expect. Note that the same `name: "asc"` also orders **operator-entered** text: safe zones (`queries.ts:360`) and river gauges (`queries.ts:390`). A zone named `Ñ…` or `Éste…` will sort after every plain-ASCII name rather than where a Filipino reader would put it. That is the trade; it is cosmetic, and it is worth it.

Pin the search path on the role so schema resolution can never depend on whether a schema named after the user exists:

```bash
sudo -u postgres psql -v ON_ERROR_STOP=1 -c 'ALTER ROLE floodwatch SET search_path = public;'
```

Role-level settings are applied when a connection is established, so any `psql` session already open will not see it — reconnect before you test.

The role needs nothing else. No `SUPERUSER`, no `CREATEDB`, no `CREATEROLE`. `prisma migrate deploy` never creates a shadow database (only `migrate dev` does, and you will not run that in production).

### Authentication, and why this cluster listens on loopback only

Write the settings into a drop-in rather than editing the shipped `postgresql.conf`, so an `apt` upgrade never argues with you about a conffile:

```bash
sudo grep -n "^include_dir" /etc/postgresql/16/main/postgresql.conf
# include_dir = 'conf.d'
```

On Debian and Ubuntu `pg_createcluster` puts that line at the *end* of `postgresql.conf`, which is exactly why drop-ins win: later assignments override earlier ones. If the line is missing, append `include_dir = 'conf.d'` to the end of `postgresql.conf` and create `/etc/postgresql/16/main/conf.d/`. Then:

```bash
sudo tee /etc/postgresql/16/main/conf.d/10-floodwatch.conf >/dev/null <<'CONF'
# --- Floodwatch: connectivity -------------------------------------------
# The app is on this same instance and connects over loopback. Nothing
# outside the box has any business reaching 5432.
# listen_addresses and port are postmaster-level: a reload will not apply
# them, only a restart will.
listen_addresses = 'localhost'
port = 5432
password_encryption = scram-sha-256
CONF

sudo chown postgres:postgres /etc/postgresql/16/main/conf.d/10-floodwatch.conf
sudo systemctl restart postgresql@16-main
```

**Restart, not reload, here.** `listen_addresses` and `port` are `PGC_POSTMASTER` parameters: a reload re-reads the file, logs `parameter cannot be changed without restarting the server`, sets `pending_restart` and keeps the old value — and the `sourcefile` check below would then mislead you into hunting an include-ordering bug that does not exist. (`password_encryption` on its own would be reload-able.) This is the only restart in this subsection; the cluster is empty at this point, so it costs nothing.

`listen_addresses = 'localhost'` is the built-in default, so this is usually a no-op — set it explicitly anyway, because it documents the intent and survives someone "temporarily" flipping it to `'*'` and forgetting. If you ever run a second cluster on this box, do not share this drop-in: `port` is per-cluster.

**Why loopback-only rather than a security group rule:** the two controls are independent, and you want both. A security group is one console click, one Terraform typo, or one `ufw allow 5432` away from exposing the cluster to the internet, and 5432 is scanned constantly. With `listen_addresses = 'localhost'` there is no socket bound to a routable address at all, so even a wide-open SG on 5432 reaches nothing — the SG filters upstream of the instance, and the instance has nothing to offer behind it. It also means the connection never leaves the machine, so you need no server certificate, no `sslmode=verify-full`, and no cert rotation for the database. When you need a GUI or `bun run db:studio` from your laptop, tunnel instead of opening the port:

```bash
# on your laptop — local port 15432 so this does not collide with a
# Postgres you may already be running there
ssh -L 15432:127.0.0.1:5432 ubuntu@your-instance
```

Then point the laptop's `DATABASE_URL` at `127.0.0.1:15432` for the duration.

Now `pg_hba.conf`. Replace the rules block (leave the file's header comments if you like):

```bash
sudo tee /etc/postgresql/16/main/pg_hba.conf >/dev/null <<'HBA'
# TYPE  DATABASE        USER            ADDRESS                 METHOD

# Unix socket, OS identity. Used by maintenance (the backup timer runs
# pg_dump as the postgres user) and by `sudo -u floodwatch psql`, which
# peer-maps to the same-named DB role.
local   all             postgres                                peer
local   all             all                                     peer

# Loopback TCP. This is the line DATABASE_URL uses.
host    floodwatch      floodwatch      127.0.0.1/32            scram-sha-256
host    floodwatch      floodwatch      ::1/128                 scram-sha-256

# Belt and braces: nothing else over TCP, ever.
host    all             all             0.0.0.0/0               reject
host    all             all             ::/0                    reject
HBA

sudo chown postgres:postgres /etc/postgresql/16/main/pg_hba.conf
sudo chmod 640 /etc/postgresql/16/main/pg_hba.conf
sudo systemctl reload postgresql@16-main
```

The `chown`/`chmod` restore what the package ships: `tee` as root would otherwise leave your authentication policy root-owned and world-readable, and Debian's cluster tooling (`pg_upgradecluster` and friends) manipulates these files as `postgres`.

`pg_hba.conf` *is* reload-able, hence `reload` rather than `restart` here.

Naming the OS service account and the DB role identically (`floodwatch`) is what makes `peer` work for maintenance — a shell on the box can reach the database without the password ever being typed.

Verify both halves:

```bash
sudo ss -ltnp | grep 5432
# LISTEN 0 244 127.0.0.1:5432 0.0.0.0:*  users:(("postgres",...))
# LISTEN 0 244     [::1]:5432    [::]:*  users:(("postgres",...))

sudo -u postgres psql -c "select name, setting, sourcefile, pending_restart from pg_settings
  where name in ('listen_addresses','password_encryption','port');"
```

The `sourcefile` column should say `.../conf.d/10-floodwatch.conf` and `pending_restart` should be `f`. If `sourcefile` still points at `postgresql.conf`, either your `include_dir` line is not at the end of the main file, or you reloaded where a restart was needed — check `pending_restart` first before assuming the include ordering is wrong.

There must be **no** `0.0.0.0:5432` line in the `ss` output. If there is, you have `listen_addresses = '*'` winning somewhere.

### DATABASE_URL

`.env.example` shows the shape. **Append** the production value to `/srv/floodwatch/.env` — do not `tee` over that file. It is the same `.env` that holds `AUTH_SECRET`, `PORT`, `HOSTNAME` and `NEXT_PUBLIC_SOCKET_PATH`, it is gitignored (`.gitignore` ignores `.env*` except `.env.example`), so there is no copy in the repo to restore from, and clobbering `AUTH_SECRET` invalidates every session cookie already issued.

```dotenv
DATABASE_URL="postgresql://floodwatch:PASTE_THE_HEX_PASSWORD_HERE@127.0.0.1:5432/floodwatch?schema=public"
```

```bash
sudo chown floodwatch:floodwatch /srv/floodwatch/.env
sudo chmod 600 /srv/floodwatch/.env
```

(Both of those assume the deploy/systemd sections have already created the account and the tree. If you are running this section first, come back for them.)

Details that bite:

- **Use `127.0.0.1`, not `localhost`.** `localhost` resolves to `::1` first on Ubuntu, which works only because the `::1/128` HBA line above exists. Being explicit removes a resolver from the failure path.
- **`.env` is found relative to the working directory.** Both `server.ts` and `prisma7.config.ts` start with `import "dotenv/config"`, which loads `.env` from `process.cwd()`. The systemd unit therefore needs `WorkingDirectory=/srv/floodwatch`, and you must `cd /srv/floodwatch` before running any `prisma` command by hand — that same cwd is also how the Prisma CLI discovers `prisma7.config.ts` and where `var/uploads` resolves.
- **`?schema=public` is honoured by the Prisma CLI but ignored at runtime.** The migrate engine reads it from the `datasource.url` that `prisma7.config.ts` supplies and creates objects in that schema. At runtime, `lib/db.ts` constructs `new PrismaPg({ connectionString })` with no second options argument — and `@prisma/adapter-pg` takes the schema from its *options* object (`PrismaPgOptions.schema`), not from the URL. The param is copied verbatim onto the `pg` config by `pg-connection-string` (it copies every query parameter onto the config object), where `pg` ignores it. Queries therefore go out unqualified and resolve through `search_path`. With the `ALTER ROLE … SET search_path = public` above, both paths land in `public` and agree. **Consequence: do not change `?schema=` to anything but `public`.** Migrations would move to the new schema while the running app kept reading `public`, and you would get an empty-looking, silently broken app rather than an error.
- If you insist on a password with symbols, percent-encode it (`@` → `%40`, `/` → `%2F`, `#` → `%23`, `%` → `%25`). Hex avoids the whole problem.

### Tuning

The dataset is small — 22 LGUs plus reports, votes, alerts, zones and gauge readings — and will sit entirely in cache. The tuning that actually matters on this box is *not letting Postgres take RAM that Node needs*: `next build` is the memory high-water mark on this instance, and there is no `output: "standalone"`, so the full `node_modules` tree is resident during the build too.

The swapfile from *Instance provisioning* is what protects you here: the OOM killer's favourite victim is the postmaster, and a cluster killed mid-checkpoint is a worse afternoon than a slow build. Confirm it is on (`swapon --show`) before you ever run a build on this box.

The figures below are **starting points**, not a tuned configuration. Measure before changing them.

| Instance RAM | `shared_buffers` | `effective_cache_size` | `work_mem` | `maintenance_work_mem` | `max_connections` |
|---|---|---|---|---|---|
| 2 GB (t3.small) | `256MB` | `768MB` | `4MB` | `96MB` | `40` |
| 4 GB (t3.medium) | `512MB` | `1536MB` | `8MB` | `192MB` | `50` |
| 8 GB (t3.large) | `1GB` | `3GB` | `16MB` | `256MB` | `60` |

Note these are *below* the usual "25% of RAM for shared_buffers" advice, deliberately: Postgres is sharing this instance with the Node server, nginx, and periodically a Next build.

Append to the same drop-in (4 GB values shown):

```bash
sudo tee -a /etc/postgresql/16/main/conf.d/10-floodwatch.conf >/dev/null <<'CONF'

# --- Floodwatch: resources (starting points for a 4 GB instance) --------
max_connections = 50
shared_buffers = 512MB
effective_cache_size = 1536MB
work_mem = 8MB
maintenance_work_mem = 192MB

# EBS gp3 is SSD-backed; the default cost model assumes spinning rust.
random_page_cost = 1.1
effective_io_concurrency = 200

# Fewer, larger checkpoints.
max_wal_size = 2GB
min_wal_size = 256MB
checkpoint_completion_target = 0.9
wal_compression = on

# --- Floodwatch: logging ------------------------------------------------
log_min_duration_statement = 500ms
log_line_prefix = '%m [%p] %q%u@%d '
log_checkpoints = on
log_autovacuum_min_duration = 250ms

# UTC everywhere so server logs line up with the app's logs.
timezone = 'UTC'
log_timezone = 'UTC'
CONF

sudo systemctl restart postgresql@16-main
```

`shared_buffers` and `max_connections` require a **restart**, not a reload. Confirm they took:

```bash
sudo -u postgres psql -c "select name, setting, unit from pg_settings
  where name in ('shared_buffers','max_connections','work_mem','effective_cache_size');"
```

On timezone: the schema uses Prisma's default `TIMESTAMP(3)` — *without* time zone — but `@prisma/adapter-pg` installs its own type parsers for OIDs 1114/1184 and normalises those values itself, so the cluster's `timezone` setting does not corrupt round-tripped `DateTime` values. Setting it to UTC is for the benefit of your own `psql` sessions and log correlation, nothing more.

### Connection pooling, and where `max_connections` bites

There is no PgBouncer here and there should not be. The pooling is `pg`'s own, inside the app process:

- `lib/db.ts` builds one `PrismaClient` with `new PrismaPg({ connectionString })`. That becomes a single `pg.Pool`.
- `pg-pool` defaults to `max: 10`, `min: 0`, `idleTimeoutMillis: 10000`. So the app tops out at **10 backend connections**, and idle ones drop after 10 seconds.
- That `max` is **not** settable from the connection string. `pg-pool` never parses `connectionString` — it reads `max` only off the options object it is handed, and `lib/db.ts` passes only `{ connectionString }`. Raising it requires a one-line code change, not an env tweak.

Two things to watch:

1. **The globalThis dedupe in `lib/db.ts` is dev-only.** The last line is `if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma`. In production, nothing prevents a second pool if that module is evaluated twice — and this app already runs two module graphs in one process (the `tsx` graph that loads `server.ts`, and the Next/Turbopack server bundle; that split is why `lib/realtime/registry.ts` has to bridge the Socket.io instance through `globalThis` at all). `server.ts` does not import `lib/db.ts`, so today you should see one pool — but verify rather than assume.
2. **Everything else takes connections too.** `prisma migrate deploy`, `prisma db seed`, your interactive `psql`, and the nightly `pg_dump` each open one or more. `superuser_reserved_connections` holds back 3.

Check the real number under load:

```bash
sudo -u postgres psql -d floodwatch -c \
  "select state, count(*) from pg_stat_activity where datname='floodwatch' group by state;"
```

Expect ≤ 10 active/idle from the app. If you see ~20, you have two pools and the dedupe assumption above is wrong for your build. Note also that because the pool caps at 10, the worst-case `work_mem` exposure is roughly 10 concurrent queries × a few sort/hash nodes × 8 MB — a few hundred megabytes, not the `max_connections × work_mem` figure people usually fear.

`max_connections = 50` is chosen for headroom, not because the app needs it. Exhausting it surfaces as `FATAL: sorry, too many clients already` (SQLSTATE 53300) in the app's journal.

**Single process is the supported shape.** Do not scale this out by running a second app process against the same database — the Socket.io registry lives in one process's memory with no Redis adapter, so a second process silently halves your realtime fan-out. That constraint is about realtime, not the database, but it is why `max_connections` will never need to grow.

### Verifying connectivity as the app user

Three checks, weakest to strongest. Run them in order; stop at the first failure. From here on you need the prerequisites listed at the top of this section.

Socket, peer auth (proves the role and database exist):

```bash
sudo -u floodwatch psql -d floodwatch -c "select current_user, current_database();"
```

TCP with the real credentials (proves `pg_hba.conf`, scram, and the password all line up):

```bash
sudo -u floodwatch bash -c 'cd /srv/floodwatch && set -a && . ./.env && set +a
  psql "$DATABASE_URL" -c "select current_user, current_database(), current_schemas(true);"'
```

`current_schemas(true)` should show `{pg_catalog,public}`. If it shows only `{pg_catalog}`, the `ALTER ROLE … SET search_path` did not take and the app will not find its tables — re-run it, then open a **new** connection, because role settings apply at connection time.

Applying the migrations and seeding the baseline happens in *First deploy*, once the checkout, `bun install` and `.env` are all in place — that is also where the one-shot `SEED_ADMIN_PASSWORD` trap is spelled out, and *Operations* covers changing that password afterwards. Come back here only if those steps fail with a connection or permission error.

Once they have run, confirm the shape landed:

```bash
sudo -u postgres psql -d floodwatch -c 'select count(*) from "Lgu";'   # 22
sudo -u postgres psql -d floodwatch -c 'select migration_name, finished_at from _prisma_migrations order by finished_at;'
```

### Backups

Nightly `pg_dump` in custom format to a local directory, rotated, taken as the `postgres` OS user over the unix socket — so no password appears in any unit file. The uploads directory is tarred in the same run: `FloodReport` rows reference photo filenames under `var/uploads/`, and a database restored without the matching files gives you reports with dead image URLs.

The backup directory is set-gid to the `postgres` group and the script runs at `umask 027`, so dumps land `0640 root:postgres`. That matters: every restore path below reads a dump **as the `postgres` user**, and a root-only directory would make `pg_restore` fail with `could not open input file: Permission denied`. Nothing here becomes world-readable.

```bash
sudo install -d -m 2750 -o root -g postgres /var/backups/floodwatch

sudo tee /usr/local/sbin/floodwatch-backup.sh >/dev/null <<'SH'
#!/bin/bash
set -euo pipefail
umask 027

BACKUP_DIR=/var/backups/floodwatch
APP_DIR=/srv/floodwatch
KEEP_DAYS=14
STAMP=$(date -u +%Y%m%dT%H%M%SZ)

db_out="$BACKUP_DIR/floodwatch-$STAMP.dump"
up_out="$BACKUP_DIR/uploads-$STAMP.tar.gz"

# Write to .part first, then rename: an off-box sync must never pick up a
# half-written dump.
runuser -u postgres -- pg_dump --format=custom --compress=6 --dbname=floodwatch \
  > "$db_out.part"
mv "$db_out.part" "$db_out"

# app/api/uploads/route.ts mkdirs UPLOAD_DIR lazily on the first upload, so on
# a freshly deployed box this directory does not exist yet. Create it with the
# service account's ownership — root-owned would break uploads outright.
install -d -o floodwatch -g floodwatch -m 0755 "$APP_DIR/var/uploads"

tar -czf "$up_out.part" -C "$APP_DIR/var" uploads
mv "$up_out.part" "$up_out"

# Prove the dump is readable, not just non-empty. --list opens no database
# connection, so this runs as root and needs no privilege drop.
pg_restore --list "$db_out" > /dev/null

find "$BACKUP_DIR" -maxdepth 1 -type f \
  \( -name 'floodwatch-*.dump' -o -name 'uploads-*.tar.gz' -o -name '*.part' \) \
  -mtime +"$KEEP_DAYS" -delete

echo "backup ok: $(du -h "$db_out" | cut -f1) db, $(du -h "$up_out" | cut -f1) uploads"
SH

sudo chmod 700 /usr/local/sbin/floodwatch-backup.sh
```

Timer and unit:

```bash
sudo tee /etc/systemd/system/floodwatch-backup.service >/dev/null <<'UNIT'
[Unit]
Description=Floodwatch database and uploads backup
After=postgresql.service
Requires=postgresql.service

[Service]
Type=oneshot
ExecStart=/usr/local/sbin/floodwatch-backup.sh
Nice=10
IOSchedulingClass=idle
UNIT

sudo tee /etc/systemd/system/floodwatch-backup.timer >/dev/null <<'UNIT'
[Unit]
Description=Nightly Floodwatch backup

[Timer]
OnCalendar=*-*-* 03:17:00
RandomizedDelaySec=300
Persistent=true

[Install]
WantedBy=timers.target
UNIT

sudo systemctl daemon-reload
sudo systemctl enable --now floodwatch-backup.timer
sudo systemctl start floodwatch-backup.service     # run once now
sudo journalctl -u floodwatch-backup.service -n 20 --no-pager
ls -lh /var/backups/floodwatch
```

`Persistent=true` means a missed run (instance stopped overnight) fires on next boot.

The dump takes no exclusive locks and will finish in seconds on a dataset this size, so if losing up to 24 hours of flood reports is unacceptable — and for this application it probably is — change `OnCalendar` to `hourly`. If you do, drop `KEEP_DAYS` (14 days at hourly cadence is ~336 dumps plus ~336 uploads tarballs) or switch the rotation to a count rather than an age. That is a cheap change; full WAL archiving and point-in-time recovery are deliberately out of scope for a single-instance deployment.

**Off-box.** A backup on the same EBS volume as the database is not a backup. Add a sync step — this is the whole reason for the atomic `.part` rename above:

```bash
# append to /etc/systemd/system/floodwatch-backup.service, [Service] section
ExecStartPost=/usr/bin/rsync -a /var/backups/floodwatch/ backup@elsewhere:/backups/floodwatch/
```

with a passwordless SSH key for `root` restricted to that destination. Note the deliberate absence of `--delete`: with it, the local 14-day rotation is replayed on the remote and the off-box copy stops being an independent retention tier — and a local directory that is ever empty (a blank replacement volume, a botched restore) would propagate that emptiness and destroy the remote copies. Let the remote keep its own, longer retention.

If you are willing to add one AWS dependency purely for storage, `aws s3 cp` into a versioned bucket with a lifecycle rule is cheaper and simpler than maintaining a second host. An EBS snapshot schedule is a reasonable *additional* layer but not a substitute — it captures the volume, not a consistent logical dump you can restore selectively.

### Restore

Rehearse this before you need it. A backup you have never restored is a hypothesis.

One thing a dump does **not** contain: roles. `pg_dump` of a single database carries no `CREATE ROLE floodwatch` and no `ALTER ROLE … SET search_path`. Restoring onto this cluster is fine because the role is already there; restoring onto a rebuilt or replacement cluster means re-running the `createuser` and `ALTER ROLE` steps from *Create the role and the database* first, or every `OWNER TO floodwatch` in the dump fails.

**Rehearsal — restore into a scratch database, no downtime:**

```bash
DUMP=/var/backups/floodwatch/floodwatch-20260830T031700Z.dump

sudo -u postgres createdb --owner=floodwatch --template=template0 \
  --encoding=UTF8 --lc-collate=C.UTF-8 --lc-ctype=C.UTF-8 floodwatch_verify
sudo -u postgres pg_restore --dbname=floodwatch_verify --exit-on-error "$DUMP"
sudo -u postgres psql -d floodwatch_verify -c 'select count(*) from "Lgu";'
sudo -u postgres psql -d floodwatch_verify -c 'select count(*) from "FloodReport";'
sudo -u postgres dropdb floodwatch_verify
```

If `pg_restore --exit-on-error` is silent and the counts look right, that dump is good.

**Real restore.** Steps 3 and 6 are destructive and irreversible — `dropdb` and `rm -rf` — so do not paste this block wholesale; run it a line at a time and read each result. Stop the app first: the running process holds connections and would write into a database you are replacing. (`floodwatch.service` is the unit defined in the systemd section.)

```bash
# 1. Stop the app.
sudo systemctl stop floodwatch

# 2. Take a safety dump of the current state, however broken. You may want it.
#    The redirect must happen in a ROOT shell — `sudo -u postgres cmd > file`
#    would open the file as *you*, and /var/backups/floodwatch is not yours.
sudo bash -c 'umask 027; runuser -u postgres -- pg_dump -Fc -d floodwatch \
  > /var/backups/floodwatch/pre-restore-$(date -u +%Y%m%dT%H%M%SZ).dump'

# 3. Kick off any leftover backends, then recreate the database empty.
sudo -u postgres psql -v ON_ERROR_STOP=1 <<'SQL'
SELECT pg_terminate_backend(pid) FROM pg_stat_activity
 WHERE datname = 'floodwatch' AND pid <> pg_backend_pid();
SQL
sudo -u postgres dropdb floodwatch
sudo -u postgres createdb --owner=floodwatch --template=template0 \
  --encoding=UTF8 --lc-collate=C.UTF-8 --lc-ctype=C.UTF-8 floodwatch
sudo -u postgres psql -v ON_ERROR_STOP=1 -c 'ALTER ROLE floodwatch SET search_path = public;'

# 4. Restore. Run as postgres so the OWNER TO statements in the dump apply cleanly.
sudo -u postgres pg_restore --dbname=floodwatch --exit-on-error \
  /var/backups/floodwatch/floodwatch-20260830T031700Z.dump

# 5. On PG16, pg_dump does not carry planner statistics (PG18 added that).
#    Rebuild them.
sudo -u postgres vacuumdb --analyze-only --dbname=floodwatch

# 6. Restore the matching uploads snapshot.
sudo rm -rf /srv/floodwatch/var/uploads
sudo tar -xzf /var/backups/floodwatch/uploads-20260830T031700Z.tar.gz -C /srv/floodwatch/var
sudo chown -R floodwatch:floodwatch /srv/floodwatch/var/uploads

# 7. Confirm migration state matches the deployed code before letting traffic in.
sudo -u floodwatch bash -c 'cd /srv/floodwatch && bunx prisma migrate status'

# 8. Start the app.
sudo systemctl start floodwatch
sudo systemctl status floodwatch --no-pager
```

Pair the database dump with the uploads tarball from the **same run**. Restoring a database from Tuesday against uploads from Friday leaves rows pointing at files that do not exist and files nothing references.

Step 7 matters: the dump includes `_prisma_migrations`, so a restore also rewinds migration state. If you restored an older dump onto newer code, `prisma migrate status` will say migrations are pending — run `bun run db:deploy` before starting the service, not after.

---

## First deploy: code, environment, database, build

This section takes you from a bare Ubuntu 24.04 instance with Node, bun, and PostgreSQL already installed to a built, runnable tree at `/srv/floodwatch`. It stops just before the systemd unit and nginx.

It assumes the earlier sections left you with:

- Node.js ≥ 20.9.0 on `PATH` (`node --version`) — `tsx` is a Node loader, so Node runs the server no matter which package manager you install with.
- bun 1.4.x on `PATH` (`bun --version`).
- A PostgreSQL role and database (this guide assumes role `floodwatch`, database `floodwatch`, listening on `127.0.0.1:5432`).

Every command below is marked as root (`sudo …`) or as the app user (`sudo -u floodwatch …`).

### Run everything as the app user

The `floodwatch` account (home `/home/floodwatch`) and the empty `/srv/floodwatch` directory were both created in *Instance provisioning*. Confirm them before you start:

```bash
# root
id floodwatch && ls -ld /home/floodwatch /srv/floodwatch
```

Run **every** git, bun, and prisma command in this section as `floodwatch`. If you build or install as root, the resulting `node_modules/`, `.next/`, and `generated/` are root-owned and the service — which writes to `.next/cache` at runtime — breaks in ways that look like Next.js bugs. Root running `git` in a tree it does not own also trips git's "dubious ownership" guard.

#### Check the toolchain from the app user's shell, not yours

This is the single most common way this section fails on the first try. bun's official installer drops the binary in the **installing user's** `~/.bun/bin`, and nvm puts node under the installing user's `~/.nvm`. If you installed either as `ubuntu` or as root, `floodwatch` cannot see it and every command below dies with `bun: command not found` — which reads like a broken guide rather than a `PATH` problem.

```bash
# root — this must succeed as floodwatch, not just in your own shell
sudo -u floodwatch -H bash -lc 'command -v node && command -v bun && node --version && bun --version'
```

If either is missing, put it somewhere every user can reach it, for example:

```bash
# root — adjust the source path to wherever you actually installed them
sudo install -m 755 /root/.bun/bin/bun /usr/local/bin/bun
sudo ln -sfn "$(readlink -f "$(command -v node)")" /usr/local/bin/node
```

Re-run the check until both print a version. The systemd unit in the next section will need the same absolute paths.

### Get the code onto the box

**Deploy key (recommended).** A read-only key scoped to this one repository. Nothing on the instance can push, and revoking it is one click.

```bash
# app user — guarded so a re-run does not clobber a key GitHub already trusts
sudo -u floodwatch -H bash -c '
  install -d -m 700 ~/.ssh
  [ -f ~/.ssh/id_ed25519 ] || ssh-keygen -t ed25519 -N "" \
    -C "floodwatch-deploy@$(hostname)" -f ~/.ssh/id_ed25519
'
sudo -u floodwatch -H cat /home/floodwatch/.ssh/id_ed25519.pub
```

Overwriting that key after it is registered is the quiet failure mode: GitHub still holds the old public key, and every later `git pull` fails with `Permission denied (publickey)`. Hence the guard.

Paste that public key into GitHub → the `szyfr/floodwatch` repo → Settings → Deploy keys → Add deploy key, and leave "Allow write access" **unchecked**.

Pin GitHub's host key so the clone is never an interactive trust prompt, then check the fingerprint against the one GitHub publishes:

```bash
# app user
sudo -u floodwatch -H bash -c '
  ssh-keygen -F github.com >/dev/null || ssh-keyscan -t ed25519 github.com >> ~/.ssh/known_hosts
  ssh-keygen -lf ~/.ssh/known_hosts
'
# expect: SHA256:+DiY3wvvV6TuJJhbpZisF/zLDA0zPMSvHdkr4UvCOqU
```

Do not redirect `ssh-keyscan`'s stderr to `/dev/null`. If DNS or egress to `github.com:22` is blocked it writes nothing and still exits cleanly, and the real failure surfaces later as an interactive host-key prompt inside a `sudo -u` shell that has no terminal to answer it. Confirm the fingerprint above actually printed before continuing.

Clone into the (empty) directory:

```bash
# app user
sudo -u floodwatch -H git clone git@github.com:szyfr/floodwatch.git /srv/floodwatch
```

**HTTPS token (alternative).** If you cannot add a deploy key, use a fine-grained PAT with read-only Contents on this repo:

```bash
# app user — token goes into a 600 credential file, not into the remote URL
sudo -u floodwatch -H bash -c '
  umask 077
  printf "https://%s:%s@github.com\n" "USERNAME" "TOKEN" > ~/.git-credentials
  git config --global credential.helper store
'
sudo -u floodwatch -H git clone https://github.com/szyfr/floodwatch.git /srv/floodwatch
```

Do not embed the token in the remote URL — `git remote -v`, `.git/config`, and every error message would then print it. Tokens also expire, which turns a routine `git pull` into an outage; the deploy key does not.

### Write the production `.env`

`.env` is loaded by `import "dotenv/config"` at the top of both `server.ts` and `prisma7.config.ts`, and dotenv resolves it relative to **`process.cwd()`**. It must live at `/srv/floodwatch/.env` and the service's `WorkingDirectory` must be `/srv/floodwatch`. `.gitignore` ignores `.env*` (except `.env.example`), so this file survives `git pull` but is *not* created by a fresh clone.

These are all the variables the code actually reads:

| Variable | Read by | Production value |
| --- | --- | --- |
| `DATABASE_URL` | `lib/db.ts`, `prisma/seed-base.ts`, `prisma7.config.ts` | Local Postgres URL. Required — nothing starts without it. |
| `AUTH_SECRET` | `lib/auth/token.ts` | 32 random bytes hex. Required — sign-in throws without it. |
| `PORT` | `server.ts` | `3000` (loopback only; nginx proxies to it) |
| `HOSTNAME` | `server.ts` | `127.0.0.1` — see the warning below |
| `NEXT_PUBLIC_SOCKET_PATH` | `lib/realtime/events.ts` | `/ws`. **Inlined at build time** into the client bundle. |
| `S3_BUCKET` | `lib/server/uploads.ts` | Optional. Unset = photos on local disk under `var/uploads`. Set it and photos go to S3 instead; the public URL stays `/uploads/<uuid>.<ext>` either way. |
| `REKOGNITION_MODERATION` | `lib/server/moderation.ts` | Optional. `on` enables photo moderation; anything else disables it. Requires `S3_BUCKET`. Fails open by design. |
| `REKOGNITION_ALLOW_CATEGORIES` | `lib/server/moderation.ts` | Comma-separated top-level categories to let through. Empty means block everything Rekognition flags — including `Visually Disturbing`, which covers injuries and wreckage and will reject legitimate flood photos. |
| `AWS_REGION` | AWS SDK | Only with `S3_BUCKET`. Credentials come from the EC2 instance role via IMDS — never put AWS keys in `.env`. |
| `NODE_ENV` | `server.ts`, `lib/db.ts`, `lib/auth/token.ts` | `production`. Set by the `start` script / systemd unit — leave it out of `.env`. |
| `SEED_ADMIN_PASSWORD` | `prisma/seed-data.ts` | Seed only. Pass it inline for one command; **never** put it in `.env`. |

Generate the secret and write the file in one shot. The heredoc is expanded by *your* root shell, so the secret goes down the pipe rather than onto a command line where `ps` could see it, and `umask 077` means the file is born `600`:

```bash
# root — you will be prompted for the postgres password, which is not echoed
read -rsp 'postgres password for the floodwatch role: ' DB_PASS; echo
sudo -u floodwatch -H bash -c 'umask 077; cat > /srv/floodwatch/.env' <<EOF
# /srv/floodwatch/.env — production. Not in git.

# PostgreSQL on this same instance, over loopback.
DATABASE_URL="postgresql://floodwatch:${DB_PASS}@127.0.0.1:5432/floodwatch?schema=public"

# HS256 signing key for the session cookie (lib/auth/token.ts).
# Changing this invalidates every issued session cookie — everyone is logged out.
AUTH_SECRET="$(openssl rand -hex 32)"

# The single HTTP listener that Next and Socket.io share (server.ts).
# 127.0.0.1 keeps the Node process off the network: only nginx on this box can reach it.
PORT=3000
HOSTNAME=127.0.0.1

# Socket.io path. Baked into the client bundle at build time — must match the nginx location.
NEXT_PUBLIC_SOCKET_PATH=/ws
EOF
unset DB_PASS
```

If the database password contains any of `: / ? # [ ] @`, percent-encode it in the URL (`@` → `%40`) or the connection string will be parsed wrong. A `"` or a backslash in the password will also break the heredoc quoting — pick a password without them.

Verify ownership and mode — `AUTH_SECRET` is a session-forging key and `DATABASE_URL` holds the database password:

```bash
# root
stat -c '%U %G %a %n' /srv/floodwatch/.env
# expect: floodwatch floodwatch 600 /srv/floodwatch/.env
```

Now prove the URL actually connects, before an install failure makes you wonder whether it was the database or the tooling:

```bash
# app user — libpq rejects the ?schema=public that Prisma wants, so strip it for this check only
sudo -u floodwatch -H bash -lc '
  set -a; . /srv/floodwatch/.env; set +a
  psql "${DATABASE_URL%%\?*}" -tAc "select current_user, current_database();"
'
# expect: floodwatch|floodwatch
```

The stripping is not cosmetic: `psql "postgresql://…?schema=public"` fails outright with `psql: error: invalid URI query parameter: "schema"`. The parameter is there for the Prisma CLI; at runtime the app connects through `@prisma/adapter-pg`, which parses the string with node-postgres rather than libpq and ignores the unknown key.

#### Warning: `HOSTNAME` must be set explicitly

`server.ts` does `const hostname = process.env.HOSTNAME ?? "localhost"` and passes it straight to `httpServer.listen(port, hostname)`. The trap is that **bash sets `HOSTNAME` as a shell variable but never exports it**:

```bash
echo $HOSTNAME        # ip-10-0-1-23   ← shell variable
printenv HOSTNAME     # (nothing)      ← not in the environment
```

So you can neither assume it is inherited nor assume it is absent, and the two failure modes point in opposite directions:

- **Unset:** the server binds `"localhost"`. Node resolves that name, which on some configurations yields `::1` before `127.0.0.1` — nginx proxying to `127.0.0.1:3000` then gets `ECONNREFUSED` and every request is a 502.
- **Set by something else:** the server binds whatever that name resolves to. On an Ubuntu EC2 instance the instance hostname commonly resolves to `127.0.1.1` (again unreachable from an nginx upstream of `127.0.0.1`), or, if DNS answers, to the instance's **private IP** — which publishes the Node process on your VPC, unauthenticated and outside TLS, bypassing nginx entirely.

Set it in `.env` as above **and** in the systemd unit's `Environment=`. Note the precedence: dotenv 17 defaults to `override: false`, so anything already in the process environment beats `.env`. That makes the unit the authoritative place — `.env` is the fallback for when you run commands by hand.

### Install dependencies

The lockfile is `bun.lock`. `--frozen-lockfile` is the correct flag for bun 1.4 and makes the install fail rather than silently resolve a different dependency graph than the one that was tested:

```bash
# app user
sudo -u floodwatch -H bash -lc 'cd /srv/floodwatch && bun install --frozen-lockfile'
```

**Do not add `--production`.** The `prisma` CLI, `typescript`, `tailwindcss`, and `@tailwindcss/postcss` are all devDependencies, and both the postinstall hook and `next build` need them. `tsx` is a regular dependency, so the runtime is covered by a full install.

**`.env` must already exist when you run this.** `package.json` has `"postinstall": "prisma generate"`, bun runs the root package's own lifecycle scripts (it blocks *dependencies'* scripts unless trusted, but the root project's always run), and every Prisma CLI invocation loads `prisma7.config.ts` — which evaluates `env("DATABASE_URL")` eagerly while constructing the config object, so an empty value throws exactly like a missing one. With no `.env` the install dies with:

```
Failed to load config file "/srv/floodwatch/prisma7.config.ts" as a TypeScript/JavaScript module. Error: PrismaConfigEnvError: Cannot resolve environment variable: DATABASE_URL.
```

Prisma 7 does not read `.env` on its own any more, which is exactly why `prisma7.config.ts` starts with `import "dotenv/config"`.

Confirm the generated client actually landed — this is the artifact everything downstream imports:

```bash
# app user
sudo -u floodwatch -H bash -lc 'ls /srv/floodwatch/generated/prisma/client.ts'
```

**Recovery** if you installed before writing `.env`: `node_modules/` is fine, only `generated/prisma/` is missing. Write `.env`, then regenerate — no reinstall needed:

```bash
# app user
sudo -u floodwatch -H bash -lc 'cd /srv/floodwatch && bunx prisma generate'
```

Leaving it missing produces a confusing downstream failure instead: every `import … from "@/generated/prisma/client"` fails to resolve, so the build and the seed both blow up on a module-not-found error that says nothing about `DATABASE_URL`.

### Apply migrations

First confirm the `floodwatch` role owns the database. Since PostgreSQL 15 — and Ubuntu 24.04 ships 16 — the `public` schema is no longer writable by every role, so a database created without `-O floodwatch` makes the very first migration fail with `ERROR: permission denied for schema public`:

```bash
# root
sudo -u postgres psql -tAc \
  "SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname='floodwatch';"
# expect: floodwatch

# only if it printed something else:
sudo -u postgres psql -d floodwatch \
  -c 'ALTER DATABASE floodwatch OWNER TO floodwatch;' \
  -c 'ALTER SCHEMA public OWNER TO floodwatch;'
```

Then:

```bash
# app user
sudo -u floodwatch -H bash -lc 'cd /srv/floodwatch && bun run db:deploy'
sudo -u floodwatch -H bash -lc 'cd /srv/floodwatch && bunx prisma migrate status'
```

`db:deploy` is `prisma migrate deploy`. It applies the files already committed under `prisma/migrations/` in order, and nothing else. `migrate status` is informational and **exits non-zero whenever anything is pending or out of sync** — read its text rather than its exit code, and do not run it under `set -e` in a script that should continue.

**Never run `bun run db:migrate` (`prisma migrate dev`) on a server.** It is the authoring command: it is interactive, it compares the live database against `schema.prisma` and *generates new migration files* from any drift, it needs a shadow database (and therefore `CREATEDB` on the role), and when it detects drift it offers to reset — which drops and recreates your schema. On a box holding real citizen reports that is a data-loss command. Same goes for `db:reset` and `db:reset:demo` in `package.json`: both start with `prisma migrate reset --force` and will wipe the database without asking.

### Seed the baseline data

`db:seed` runs `tsx prisma/seed.ts` (wired through `migrations.seed` in `prisma7.config.ts`). It is idempotent and writes only what every environment needs: the 22 Pampanga LGUs plus one `OFFICIAL` account, `dev@renmendoza.com`.

That account's password defaults to the literal string `"floodwatch"`. Set `SEED_ADMIN_PASSWORD` so that password never exists on a public box, and use `read -rs` so it stays out of shell history and out of `ps`:

```bash
# app user
sudo -u floodwatch -H bash -lc '
  cd /srv/floodwatch
  read -rsp "password for dev@renmendoza.com: " SEED_ADMIN_PASSWORD; echo
  export SEED_ADMIN_PASSWORD
  bun run db:seed
'
```

Expected output contains `  22 cities and municipalities` and `  1 account: dev@renmendoza.com (OFFICIAL)`, then `done.`, then Prisma's own "seed command has been executed" line.

Exporting the variable works because dotenv defaults to `override: false` — `.env` never clobbers something already in the environment, and `SEED_ADMIN_PASSWORD` is not in `.env` anyway.

**You get exactly one chance at this.** In `prisma/seed-base.ts` the admin is written with `prisma.user.upsert`, and `passwordHash` appears only in the `create` branch — the `update` branch sets name, role, organisation, and LGU, but not the password. So if you ever seed without `SEED_ADMIN_PASSWORD`, the account is created with `"floodwatch"` and **re-running the seed with the variable set will not change it**.

The cleanest recovery is to sign in with `floodwatch` and change the password through the app. Deleting the row also works, but **only before that account has created anything** — and not for the reason you might expect:

```bash
# root — DESTRUCTIVE, read the paragraph below first
sudo -u postgres psql -d floodwatch -c 'DELETE FROM "User" WHERE email = '"'"'dev@renmendoza.com'"'"';'
```

This delete does **not** fail if the account has authored content — it succeeds and takes content with it. The foreign keys emitted by the initial migration are `ON DELETE SET NULL` for `FloodReport.authorId`, `FloodReport.verifiedById`, `Alert.authorId`, `SafeZone.createdById` and `EvacuationRoute.createdById`, and `ON DELETE CASCADE` for `ReportVote.userId` and `AlertDismissal.userId`. So every report, alert, safe zone and route that account created silently loses its author, and every vote and alert dismissal it owns is deleted outright, with no error. (`model User` has no `@@map`, so Postgres sees the quoted, case-sensitive identifier `"User"` — the quotes above are required.) Then re-run the seed command.

**Do not run `bun run db:seed:demo` in production.** It layers 4 river gauges, 7 safe zones, 18 flood reports, and 4 alerts on top of the baseline, and its own header says it *replaces that content wholesale* on every run — reports, alerts, and safe zones created through the app are deleted along with the previous demo data. It is a local-testing command. The only defensible production use is a staging clone or a pre-launch demo on a database you are willing to lose.

### Build

```bash
# app user
sudo -u floodwatch -H bash -lc 'cd /srv/floodwatch && bun run build'
```

`build` is `prisma generate && next build`, and it produces two gitignored artifacts:

- **`.next/`** — the compiled server and client bundles.
- **`generated/prisma/`** — the Prisma client, emitted as *TypeScript source* (`generator client { provider = "prisma-client", output = "../generated/prisma" }`). It is never committed and must be regenerated on every box and after every dependency change.

`next.config.ts` does **not** set `output: "standalone"`, so there is no self-contained bundle to copy around. The deployed tree is the whole thing: source + `node_modules/` + `.next/` + `generated/`. Do not prune `node_modules` after building.

**`NEXT_PUBLIC_SOCKET_PATH` is inlined at build time.** `lib/realtime/events.ts` exports `SOCKET_PATH = process.env.NEXT_PUBLIC_SOCKET_PATH || "/ws"`, and that module is imported by both `server.ts` (which reads the variable at runtime, from `.env`) and the browser bundle (where Next substitutes the literal string during `next build`).

The build reads `.env` through **Next's own env loader**, not through `server.ts` — `server.ts` is not executed by a build at all. That loader also resolves `.env` relative to the working directory, which is the second reason the `cd /srv/floodwatch` above is not optional: build from anywhere else and the variable is simply absent, the client silently falls back to the `|| "/ws"` default, and you never see an error. Change the value in `.env` and restart without rebuilding and the two halves disagree the same way: the server listens on the new path while every browser keeps requesting the old one, and realtime stops working with no server-side error. **Changing `NEXT_PUBLIC_SOCKET_PATH` always requires a rebuild**, and the value must match the nginx `location` block as well.

If the build is killed with no error message, it ran out of memory — Turbopack peaks around 3 GiB on this codebase (`journalctl -k | grep -i oom` will confirm). Check that the swapfile from *Instance provisioning* is active (`swapon --show`); if the box has under 4 GiB of RAM, enlarge it or move to a bigger instance.

### The uploads directory

`lib/server/uploads.ts` defines `UPLOAD_DIR = join(process.cwd(), "var", "uploads")`. It is **relative to the working directory**, not to an env var and not to the module's location. With the service's `WorkingDirectory=/srv/floodwatch`, photos land in `/srv/floodwatch/var/uploads/` and are served back out of the same directory by `app/uploads/[name]/route.ts`. Start the process from anywhere else and uploads write to a `var/uploads` under *that* directory, while previously stored photos 404.

`var/uploads/.gitkeep` is tracked, so the directory exists after a clone. Confirm it is writable by the app user:

```bash
# root
sudo install -d -o floodwatch -g floodwatch -m 750 /srv/floodwatch/var/uploads
stat -c '%U %G %a %n' /srv/floodwatch/var/uploads
```

`750` is enough: nginx never reads these files, the Node process streams them.

**With `S3_BUCKET` set**, none of that applies to new photos — they go to the bucket and `var/uploads` is only read for photos stored before the switch. Two follow-ons once you are confident nothing is left on disk: copy the stragglers up with `aws s3 sync var/uploads "s3://$S3_BUCKET/uploads/"`, and drop `/var/www/floodwatch/var` from the unit's `ReadWritePaths`, since the service no longer writes there. Set a bucket lifecycle rule too — deleting a report is a soft delete and nothing ever removes the file, so storage grows without bound in either backend.

**If you move to a release-directory scheme,** where each deploy is a fresh clone into `/srv/floodwatch/releases/<timestamp>` with a `current` symlink, note that systemd resolves `WorkingDirectory` symlinks at start time and Node's `process.cwd()` returns the *physical* path. So `UPLOAD_DIR` becomes `/srv/floodwatch/releases/<timestamp>/var/uploads` — every deploy silently starts with an empty photo directory and orphans the old one. Make `var/uploads` (and `.env`, for the same reason) a symlink into shared storage in every release:

```bash
# root — once. Both shared targets must exist before anything links at them.
sudo install -d -o floodwatch -g floodwatch -m 750 /srv/floodwatch/shared/uploads
# write /srv/floodwatch/shared/.env now, with the same heredoc as the .env section
# above but redirected to that path; it must end up floodwatch-owned and mode 600.
stat -c '%U %G %a %n' /srv/floodwatch/shared/.env
```

```bash
# app user — in every new release directory, before starting it.
# R is the directory you ACTUALLY cloned into. Do not recompute the timestamp
# here: $(date) would produce a fresh one, the paths below would not exist, and
# the ln would fail while rm -rf silently did nothing.
sudo -u floodwatch -H bash -lc '
  R=/srv/floodwatch/releases/20260830120000   # ← the release you just cloned
  test -d "$R" || { echo "no such release: $R" >&2; exit 1; }
  rm -rf "$R/var/uploads" "$R/.env"
  ln -s /srv/floodwatch/shared/uploads "$R/var/uploads"
  ln -s /srv/floodwatch/shared/.env    "$R/.env"
'
```

The single-directory layout in this guide has neither problem, which is one reason to prefer it here.

### Smoke test before wiring nginx

```bash
# app user — foreground, Ctrl-C to stop
sudo -u floodwatch -H bash -lc 'cd /srv/floodwatch && bun run start'
```

Expect `> Pampanga Flood Watch on http://127.0.0.1:3000  (dev=false)` and `> realtime on /ws`. If it says `dev=true`, `NODE_ENV` is not reaching the process — and that is not cosmetic: `server.ts` computes `dev = process.env.NODE_ENV !== "production"` and hands it to `next({ dev })`, so a `true` there boots the development compiler in production. Fix it before going further.

From a second shell:

```bash
# app user — the bind address, which is the claim that actually matters
sudo ss -ltnp | grep ':3000'
# expect 127.0.0.1:3000 — NOT 0.0.0.0:3000, *:3000 or [::]:3000

curl -sS -o /dev/null -w 'http %{http_code}\n' http://127.0.0.1:3000/
curl -sS -o /dev/null -w 'http %{http_code}\n' http://127.0.0.1:3000/signin
curl -sS 'http://127.0.0.1:3000/ws?EIO=4&transport=polling' | head -c 80; echo
```

The first is a **`307`**, not a `200` — `app/page.tsx` is nothing but `redirect("/dashboard")`, and curl does not follow it without `-L`. `/signin` is the page that actually renders, so that one should be `200`. The third should return a Socket.io handshake starting with `0{"sid":` — that confirms the io server attached to the same listener (`addTrailingSlash: false` means `/ws` with no trailing slash is the right form, though engine.io accepts `/ws/` too).

The `ss` check replaces "confirm it times out from outside": your security group almost certainly blocks 3000 regardless of what Node bound to, so an external timeout proves nothing about `HOSTNAME`. Check the listening socket on the box, where the answer is unambiguous.

Do not try to sign in over plain HTTP here. `sessionCookieOptions` sets `secure: process.env.NODE_ENV === "production"`, so in production the browser refuses to store the session cookie over HTTP and sign-in appears to fail silently with no error anywhere. That is expected until TLS is terminated by nginx.

Stop the foreground process before installing the systemd unit — nothing else can bind port 3000 while it runs.

### Redeploy / update runbook

Order matters. Run these in sequence, as the app user except the restart:

```bash
# root — snapshot the database AND the photos; migrate deploy has no undo, and
# the two must be taken at the same moment to be restorable as a pair.
STAMP=$(date +%F-%H%M%S)
sudo install -d -o postgres -g postgres -m 750 /var/backups/floodwatch
sudo -u postgres pg_dump -Fc -d floodwatch \
  -f /var/backups/floodwatch/pre-deploy-$STAMP.dump
sudo tar -C /srv/floodwatch/var -czf \
  /var/backups/floodwatch/pre-deploy-$STAMP-uploads.tar.gz uploads

# app user
sudo -u floodwatch -H bash -lc 'cd /srv/floodwatch && git pull --ff-only origin main'
sudo -u floodwatch -H bash -lc 'cd /srv/floodwatch && bun install --frozen-lockfile'
sudo -u floodwatch -H bash -lc 'cd /srv/floodwatch && bun run db:deploy'
sudo -u floodwatch -H bash -lc 'cd /srv/floodwatch && bun run build'

# root
sudo systemctl restart floodwatch
sudo systemctl status floodwatch --no-pager
sudo journalctl -u floodwatch -n 50 --no-pager
```

Why that order:

- `git pull` first, because everything after it depends on the new tree. It cannot touch `.env`, `var/uploads/`, `generated/`, or `.next/` — all gitignored. If `--ff-only` refuses, someone committed on the box; sort that out rather than forcing.
- `bun install` before migrating, because `postinstall` regenerates `generated/prisma` from the new schema. If `--frozen-lockfile` fails, `bun.lock` and `package.json` disagree in the commit you just pulled — fix it in the repo, not on the server.
- `db:deploy` before `build` to keep the window in which the *old* code faces the *new* schema as short as possible — it then lasts only for the build plus the restart, instead of spanning the whole build with the new code already compiled against a schema that does not exist yet. Note that `next build` itself never touches the database: `prisma generate` reads `prisma/schema.prisma`, and every DB-backed surface in this app goes through `getSessionUser()` → `cookies()`, so nothing is prerendered against Postgres.
- `restart` last. The socket.io registry, all rooms, and every connected client live in that one process's memory (there is no Redis adapter), so a restart drops every WebSocket; clients reconnect on their own and re-join their rooms.
- The window between `build` and `restart` is the risky one: `.next/` is replaced in place while the old process is still serving the old chunk filenames, so open tabs can 404 on a chunk until they reload. Keep the two steps back to back.

**Migrations that are not backward compatible.** For the length of the build plus the restart, the *old* code is running against the *new* schema. Additive migrations (new table, new nullable column, new index) are safe. A migration that drops or renames a column the running code still selects will throw on every request that touches it, and Prisma's generated SQL names columns explicitly, so it fails loudly rather than degrading.

Split those into two deploys (expand/contract):

1. **Expand** — deploy the additive half (add the new column, backfill it, keep the old one) together with code that writes both and reads whichever is present.
2. **Contract** — in a later deploy, once nothing reads the old column, ship the migration that drops it.

If you cannot split it, take a deliberate outage instead: `sudo systemctl stop floodwatch`, migrate, build, `start`. A 60-second maintenance window is much cheaper than an hour of 500s.

### Rollback

Code rollback is cheap; schema rollback is not. Prisma generates no down-migrations.

```bash
# app user — find the commit that was live before
sudo -u floodwatch -H bash -lc 'cd /srv/floodwatch && git log --oneline -10'
sudo -u floodwatch -H bash -lc 'cd /srv/floodwatch && git -c advice.detachedHead=false checkout <sha>'
sudo -u floodwatch -H bash -lc 'cd /srv/floodwatch && bun install --frozen-lockfile'
sudo -u floodwatch -H bash -lc 'cd /srv/floodwatch && bun run build'

# root
sudo systemctl restart floodwatch
```

Tag each release before deploying (`git tag -a deploy-2026-08-30 -m ''`) so `<sha>` is a name you can find under pressure — and push the tag, or it only exists on this box.

If the bad deploy included a migration, rolling the code back is not enough — the schema is still forward. Two options:

- **The migration was additive.** Do nothing to the database. Old code ignores the new column; you are already back.
- **The migration was destructive.** Restore the pre-deploy dump, which loses every write since it was taken:

  ```bash
  # root
  sudo systemctl stop floodwatch
  sudo -u postgres dropdb --force floodwatch
  sudo -u postgres createdb -O floodwatch floodwatch
  sudo -u postgres pg_restore -d floodwatch /var/backups/floodwatch/pre-deploy-<stamp>.dump
  sudo systemctl start floodwatch
  ```

  `--force` (PostgreSQL 13+, and 24.04 ships 16) terminates leftover connections; without it `dropdb` fails with `database "floodwatch" is being accessed by other users` for any stray `psql` or un-timed-out pool connection, and the rollback stalls half-done.

  Photos in `/srv/floodwatch/var/uploads/` are *not* in that dump and are not rolled back. Rows referencing a photo may be gone while the file remains — harmless, just orphaned bytes. The reverse (a row pointing at a file that no longer exists) only happens if you restore the uploads directory too, which is why the database dump and the uploads archive are taken as a pair above and must be restored as a pair:

  ```bash
  # root — only alongside the matching dump, never on its own
  sudo tar -C /srv/floodwatch/var -xzf \
    /var/backups/floodwatch/pre-deploy-<stamp>-uploads.tar.gz
  sudo chown -R floodwatch:floodwatch /srv/floodwatch/var/uploads
  ```

Finish either path by confirming what the database actually thinks:

```bash
# app user
sudo -u floodwatch -H bash -lc 'cd /srv/floodwatch && bunx prisma migrate status'
```

Then return to `main` when the fix lands (`git checkout main && git pull --ff-only`) so the next deploy is not building from a detached HEAD.

---

## Running the server as a systemd unit

Floodwatch is not a `next start` app. The unit has to launch `server.ts` — the custom server that calls `next({dev,hostname,port})`, `await app.prepare()`, creates one `http` listener, and attaches Socket.io to that same listener at `/ws`. That means:

- one long-lived Node process (see the last subsection for why exactly one),
- launched through `tsx`, which is a Node loader, not a runtime — so Node itself must be on the box regardless of the fact that dependencies were installed with bun,
- with a working directory that the app depends on at runtime.

### Find the real binary paths first

A systemd unit gets `PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin` and nothing else. It does not source `.bashrc`, so nvm shims, `~/.bun/bin`, and `$HOME/.local/bin` do not exist as far as the unit is concerned. The dev machine for this project, for example, resolves `node` to `/root/.nvm/versions/node/v24.18.0/bin/node` — a path that is both off the unit PATH and inside `/root`, which `ProtectHome=true` makes invisible to the service. Install Node system-wide instead:

*Instance provisioning* installs Node 24 system-wide from NodeSource for exactly this reason. Confirm where it landed — that absolute path is what goes in `ExecStart`:

```bash
# as root
which node                    # -> /usr/bin/node
readlink -f "$(which node)"   # resolve any symlink; use THIS in ExecStart
node -v                       # must satisfy next's engines: >= 20.9.0
```

The NodeSource package replaces any `nodejs` from the Ubuntu archive — 24.04 ships 18.19, which is below next's floor and below the 20.6 that the `--import` flag in `ExecStart` needs. If `apt-get` reported a held or conflicting `nodejs`, remove the distro one first (`apt-get remove -y nodejs libnode-dev`) and re-install.

The same rule applies to **bun**, which is why it was installed to `/usr/local/bin/bun` rather than through its own installer — that one drops it in `~/.bun/bin`, which is on nobody's `secure_path`, and every `sudo -u floodwatch bun …` would be `sudo: bun: command not found`:

```bash
# as root
sudo -u nobody /usr/local/bin/bun --version   # proves it resolves off the login shell
```

Now resolve the launcher. There are three ways to run `tsx` and only one of them is right for a unit:

```bash
# from /srv/floodwatch
readlink -f node_modules/.bin/tsx    # -> /srv/floodwatch/node_modules/tsx/dist/cli.mjs
head -1 node_modules/tsx/dist/cli.mjs # -> #!/usr/bin/env node
```

- `ExecStart=/srv/floodwatch/node_modules/.bin/tsx server.ts` — **wrong**. systemd execs the file directly and the kernel runs its `#!/usr/bin/env node` shebang, which searches the unit's PATH for `node`. Works only if Node is in `/usr/bin`, and dies with a confusing `203/EXEC` or "node: not found" if it isn't.
- `ExecStart=/usr/bin/node /srv/floodwatch/node_modules/tsx/dist/cli.mjs server.ts` — works, but the tsx CLI **spawns a second Node process** and the app runs in the child:

  ```
  PID 1830316  /usr/bin/node .../tsx/dist/cli.mjs server.ts            <- systemd's MainPID
  PID 1830328  /usr/bin/node --require .../preflight.cjs \
                             --import file://.../tsx/dist/loader.mjs server.ts   <- the actual app
  ```

  systemd then tracks the wrapper, not the server: `MainPID` is wrong for anything that inspects it, and `KillMode=mixed` or an `ExecStop` aimed at `$MAINPID` would signal the wrapper only.
- `ExecStart=/usr/bin/node --import file:///srv/floodwatch/node_modules/tsx/dist/loader.mjs /srv/floodwatch/server.ts` — **use this.** One process, correct MainPID, SIGTERM lands directly on the process that has the shutdown handler. This is exactly what tsx's own CLI ends up executing, minus the wrapper and minus `preflight.cjs`, which exists to bridge signals and IPC back to that wrapper — with no wrapper there is nothing to bridge. Verified booting this repo in production mode: it prints `> Pampanga Flood Watch on http://127.0.0.1:3000  (dev=false)` and `> realtime on /ws`, serves HTTP, and answers the Socket.io handshake at `/ws/?EIO=4&transport=polling` with 200. That handshake is also the proof that tsx's ESM loader is resolving the `@/…` tsconfig aliases, since `lib/realtime/handlers.ts` imports `@/lib/realtime/events`.

Note the `file://` URL. `--import tsx` (the bare specifier) also works, but only because Node resolves it relative to the *current working directory* — one more silent dependency on cwd. The absolute file URL has no such dependency.

### Prerequisites: the account, the writable paths, the build

Do all of this **before** the smoke test and before the first `systemctl start`. `ReadWritePaths` on a path that does not exist makes the unit fail with a mount-namespace error, and an empty `.next` makes it fail on every start with `Could not find a production build in the '.next' directory` — five times in a minute, straight into the crash-loop guard.

```bash
# as root — the account itself was created in *Instance provisioning*
id floodwatch
install -d -o floodwatch -g floodwatch -m 750 /srv/floodwatch/var/uploads

# .env must exist before the first start. Contents are in "How the environment
# actually reaches the process" below. The `test` guard matters: a bare `>` here
# would truncate a secrets file you already wrote.
test -f /srv/floodwatch/.env || install -o floodwatch -g floodwatch -m 600 /dev/null /srv/floodwatch/.env
chown floodwatch:floodwatch /srv/floodwatch/.env
chmod 600 /srv/floodwatch/.env

chown -R floodwatch:floodwatch /srv/floodwatch
```

Do **not** create `.next` by hand. It has to be a real build, and so does `generated/prisma` — both are gitignored, neither is in the repo, and `lib/db.ts` imports `@/generated/prisma/client`. *First deploy* covers the install, the migration and the build; here, just assert their results before the first `systemctl start`:

```bash
# as root
test -f /srv/floodwatch/.next/BUILD_ID && echo "build ok"
test -d /srv/floodwatch/generated/prisma && echo "client ok"
```

Now smoke-test the exact command under systemd's own environment before writing the unit:

```bash
# as root — runs a throwaway transient unit with the same user, cwd and env
systemd-run --unit=floodwatch-smoke --uid=floodwatch --gid=floodwatch \
  --property=WorkingDirectory=/srv/floodwatch \
  --setenv=NODE_ENV=production \
  /usr/bin/node --import file:///srv/floodwatch/node_modules/tsx/dist/loader.mjs /srv/floodwatch/server.ts
journalctl -u floodwatch-smoke -f
systemctl stop floodwatch-smoke
```

Two caveats. It binds the same port, so stop the real unit first if it is already running. And it deliberately runs **without** the hardening below — it proves the ExecStart line, the user, the cwd and `.env`, and nothing at all about `ProtectSystem=strict` or `ReadWritePaths`.

### The unit file

```ini
# /etc/systemd/system/floodwatch.service
[Unit]
Description=Floodwatch — Next.js custom server + Socket.io
After=network-online.target postgresql.service
Wants=network-online.target postgresql.service
# Crash-loop guard. These two belong in [Unit], NOT [Service].
StartLimitIntervalSec=60
StartLimitBurst=5

[Service]
Type=exec
User=floodwatch
Group=floodwatch

# Load-bearing: UPLOAD_DIR is join(process.cwd(),"var","uploads") and
# dotenv reads ./.env relative to cwd. See notes below.
WorkingDirectory=/srv/floodwatch

# The ONLY variable systemd sets. Everything else lives in /srv/floodwatch/.env,
# which the app loads itself via `import "dotenv/config"`.
Environment=NODE_ENV=production

ExecStart=/usr/bin/node --import file:///srv/floodwatch/node_modules/tsx/dist/loader.mjs /srv/floodwatch/server.ts

# Readiness gate: hold the start job until the listener is actually up.
# next().prepare() + the first Prisma client construction take a few seconds.
# The host AND port here MUST match HOSTNAME/PORT in /srv/floodwatch/.env and
# nginx's upstream. HOSTNAME must be the literal 127.0.0.1, not "localhost".
ExecStartPost=/bin/bash -c 'for i in {1..60}; do (exec 3<>/dev/tcp/127.0.0.1/3000) 2>/dev/null && exit 0; sleep 1; done; echo "floodwatch never opened 127.0.0.1:3000" >&2; exit 1'

TimeoutStartSec=120
TimeoutStopSec=20
KillSignal=SIGTERM
Restart=always
RestartSec=2

StandardOutput=journal
StandardError=journal
SyslogIdentifier=floodwatch
LogRateLimitIntervalSec=30s
LogRateLimitBurst=2000

# One fd per connected browser (websocket) plus the pg pool.
LimitNOFILE=65535
UMask=0027

# --- hardening (see "what breaks this app" below before editing) ---
NoNewPrivileges=true
CapabilityBoundingSet=
PrivateTmp=true
PrivateDevices=true
ProtectHome=true
ProtectSystem=strict
ReadWritePaths=/srv/floodwatch/var /srv/floodwatch/.next
ProtectProc=invisible
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectKernelLogs=true
ProtectControlGroups=true
ProtectClock=true
ProtectHostname=true
RestrictNamespaces=true
RestrictRealtime=true
RestrictSUIDSGID=true
LockPersonality=true
RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX AF_NETLINK
SystemCallArchitectures=native
SystemCallFilter=@system-service
SystemCallErrorNumber=EPERM

[Install]
WantedBy=multi-user.target
```

`After=`/`Wants=postgresql.service` is worth one clarification: on Ubuntu `postgresql.service` is an empty umbrella unit that returns instantly — the cluster is `postgresql@16-main.service`. So this buys ordering, not readiness. That is fine here (Prisma connects lazily), but do not read it as "the database is up by the time ExecStart runs".

Confirm the preconditions are all in place before the first start:

```bash
# as root — the unit will not start unless all of these hold
id floodwatch
test -d /srv/floodwatch/var/uploads && echo "uploads dir ok"
test -f /srv/floodwatch/.next/BUILD_ID && echo "build ok"
stat -c '%U %G %a %n' /srv/floodwatch/.env     # -> floodwatch floodwatch 600 /srv/floodwatch/.env
```

### Why WorkingDirectory is load-bearing

`WorkingDirectory=/srv/floodwatch` is not cosmetic. Four things in this codebase resolve from `process.cwd()`:

- **Uploads.** `lib/server/uploads.ts` has `export const UPLOAD_DIR = join(process.cwd(), "var", "uploads")`, and `app/api/uploads/route.ts` does `mkdir(UPLOAD_DIR, {recursive:true})` before writing. Start the service from `/` and the app happily creates `/var/uploads` and writes photos there — no error, uploads return 200, and `app/uploads/[name]/route.ts` even serves them back for as long as that process lives. The failure only surfaces when your backups (which cover `/srv/floodwatch/var/uploads`) turn out to contain nothing, or when the hardening below makes the write fail instead.
- **`.env`.** `server.ts` and `prisma7.config.ts` both `import "dotenv/config"`, which reads `${cwd}/.env`. Verified on this repo: with cwd `/srv/floodwatch`, `DATABASE_URL` is set; with cwd `/`, it is not — and `lib/db.ts` then throws `DATABASE_URL is not set — copy .env.example to .env` on the first query.
- **Next.** `next({dev,hostname,port})` locates `.next/`, `next.config.ts` and the build manifests relative to cwd.
- **tsx.** It reads `tsconfig.json` from cwd to resolve the `@/…` path aliases that `lib/realtime/*` and every route handler use.

Because the uploads half of this fails *silently*, verify it once against the real, sandboxed unit rather than trusting the smoke test — sign in, submit a report with a photo, then:

```bash
# as root, after the service is running
ls -l /srv/floodwatch/var/uploads     # the UUID.jpg/.png must appear HERE
ls -l /var/uploads 2>/dev/null        # must not exist
```

### How the environment actually reaches the process

There are two independent channels and they overlap, so pick one and be deliberate:

1. systemd's `Environment=` / `EnvironmentFile=` — injected into the process environment before Node starts.
2. `import "dotenv/config"` inside `server.ts` — parses `/srv/floodwatch/.env` at startup.

**dotenv does not overwrite variables that already exist.** Verified here: with `PORT=4321` in the process environment, `PORT` in `.env` (3000) is ignored and the app sees 4321. So anything you put in the unit *silently shadows* the same key in `.env` — the classic "I edited `.env`, restarted, nothing changed" trap.

**The recommendation: `.env` is the single source of truth for app config; the unit sets `NODE_ENV` and nothing else.**

```bash
# /srv/floodwatch/.env  — owned by floodwatch:floodwatch, mode 600
DATABASE_URL="postgresql://floodwatch:…@127.0.0.1:5432/floodwatch?schema=public"
AUTH_SECRET="…"            # openssl rand -hex 32
PORT=3000
HOSTNAME=127.0.0.1
NEXT_PUBLIC_SOCKET_PATH=/ws
```

Those five are the whole runtime surface — they are the only variables the code reads, apart from `NODE_ENV` and `SEED_ADMIN_PASSWORD` (seed scripts only). Note that `.env.example` ships `HOSTNAME=localhost`; change it, for the reason in the last bullet below.

Why this split:

- `prisma7.config.ts` also imports `dotenv/config`, so `bun run db:deploy` and `bun run db:seed` read the *same* file when you run them by hand as the app user from `/srv/floodwatch`. Move `DATABASE_URL` into the unit and those CLI runs stop working (or, worse, silently point at a different database).
- `NODE_ENV` is the exception because it is a property of *how the process is launched*, not of what the app reads. `server.ts` computes `const dev = process.env.NODE_ENV !== "production"`, and the `next` package itself reads `NODE_ENV` while its module graph loads. Putting it in `.env` only works because `import "dotenv/config"` happens to be ordered before `import next from "next"` — reorder those two lines and the app boots the Turbopack **dev** server in production. Setting it in the unit removes that dependence entirely, and it keeps `.env` usable for `next build` and the Prisma CLI without poisoning them.
- `NODE_ENV=production` is also what makes the session cookie secure: `lib/auth/token.ts` sets `secure: process.env.NODE_ENV === "production"`. Get this wrong and sign-in "works" but the cookie is not marked Secure. (Conversely, with it right, the cookie is only stored over HTTPS — so this unit is only useful behind the nginx TLS terminator.)
- `HOSTNAME=127.0.0.1` rather than `localhost`: `server.ts` passes it straight to `httpServer.listen(port, hostname)`, and the literal IP is deterministic (no `::1`-vs-`127.0.0.1` resolution surprise), matches nginx's `proxy_pass`, and matches the `/dev/tcp` readiness probe in `ExecStartPost`. With `localhost` the listener can end up on `::1` only, at which point the probe never connects and systemd tears down a service that was actually healthy. The app must not be reachable except through nginx.
- `NEXT_PUBLIC_SOCKET_PATH` is the odd one out: it is read at runtime by `server.ts`, but `lib/realtime/events.ts` is also imported by the client component `components/providers/socket-provider.tsx`, so the value is **inlined into the browser bundle at `next build`**. It therefore has to be in `.env` *when the build runs*, it has to match nginx's `location /ws`, and changing it needs a rebuild — a restart alone leaves browsers handshaking on the old path while the server listens on the new one. HTTP keeps working; realtime just stops, with nothing in any log. Never set this one in the unit only: `next build` would not see it.

If you genuinely want systemd to own the secrets (e.g. `.env` must not live in the app directory), use `EnvironmentFile=/etc/floodwatch.env` and *delete* `/srv/floodwatch/.env` so there is still exactly one source — dotenv treats a missing file as a no-op. Be aware that systemd's parser is not dotenv's: no `export` prefix, no multi-line values, and `$` in a value is expanded by systemd unless you write `$$`. You will then have to pass `DATABASE_URL` by hand for every Prisma CLI invocation, and `NEXT_PUBLIC_SOCKET_PATH` still has to be present in the environment of the *build*, not just of the service.

Inspect what the running process actually got:

```bash
# as root — shows the real merged environment, secrets included
tr '\0' '\n' < /proc/$(systemctl show -p MainPID --value floodwatch)/environ
systemctl show floodwatch -p Environment   # shows ONLY what systemd set, not .env
```

### Restart, timeouts, and the crash-loop guard

- `Type=exec` (not `simple`): systemd waits for the `execve()` to succeed, so a typo in `ExecStart` or a permissions problem is reported as a failed start rather than a service that "started" and vanished.
- **The start timeout only means something because of `ExecStartPost`.** With `Type=exec` there is no readiness protocol — systemd considers the service started the moment the binary is exec'd, and `TimeoutStartSec=` would otherwise be inert. The start *job* is not complete until `ExecStartPost` returns, and `TimeoutStartSec=120` covers the whole job. The `/dev/tcp` poll returns as soon as `httpServer.listen()` fires, which is after `await app.prepare()` — i.e. it really is Next's boot that it waits for. Consequences worth knowing: `systemctl start floodwatch` blocks until the app answers, and if the app never opens the port the unit is marked failed and torn down instead of sitting there half-alive.
- The flip side: a failing `ExecStartPost` fails the *unit*, so `Restart=always` retries it, and each attempt can burn the full 60s of the probe. A host/port mismatch therefore looks like a very slow, very quiet crash loop rather than an error.
- `Restart=always` + `RestartSec=2`: covers crashes, unhandled rejections and the OOM killer (check with `journalctl -k | grep -i oom`). `systemctl stop` is never treated as a restart trigger, so this does not fight you.
- `StartLimitIntervalSec=60` / `StartLimitBurst=5`: five failures in a minute (a bad `DATABASE_URL`, a missing `.next` build) put the unit into `failed` instead of hammering Postgres forever. Clear it with `sudo systemctl reset-failed floodwatch` after fixing the cause.
- `TimeoutStopSec=20` + `KillSignal=SIGTERM`: `server.ts` handles SIGTERM by `io.close()`, `httpServer.close()`, then `app.close().finally(() => process.exit(0))`. That is fast, and 20s is a generous ceiling before systemd escalates to SIGKILL. Because `ExecStart` is a single process (no tsx wrapper), the signal reaches that handler directly.
- `Wants=`/`After=postgresql.service`, not `Requires=`: the app boots fine with the database down (Prisma connects lazily), so a Postgres restart should not drag the web tier down with it — it should just return errors for a moment.

### Hardening: what is safe here, and what breaks this app

The set in the unit above has been chosen against this app's actual behaviour. `ProtectSystem=strict` mounts the entire filesystem read-only except `/dev`, `/proc`, `/sys`, so **every path this process writes must be listed in `ReadWritePaths`**:

- `/srv/floodwatch/var` — report photos. `POST /api/uploads` does `mkdir(UPLOAD_DIR,{recursive:true})` then `writeFile`. Listing `var` rather than `var/uploads` means the `mkdir` still works if the directory is ever removed.
- `/srv/floodwatch/.next` — Next writes its runtime caches here in production (`.next/cache/fetch-cache`, `.next/cache/.rscinfo`, the image-optimizer cache). On this repo those files have mtimes *after* the build, which is exactly what a read-only `.next` would break: not a crash, but EACCES noise in the journal and a cache that never warms.

Everything else in `/srv/floodwatch` — source, `node_modules`, `generated/prisma`, `.env` — stays read-only to the service, which is the point.

Compatible and worth keeping:

- `NoNewPrivileges=true`, `CapabilityBoundingSet=` (empty): the app listens on 3000, above 1024, so it needs no `CAP_NET_BIND_SERVICE`. nginx owns 80/443.
- `PrivateTmp=true`: uploads never touch `/tmp`, and the Ubuntu Postgres package puts its unix socket in `/run/postgresql`, not `/tmp`. **This would break a Postgres built from source with `unix_socket_directories = '/tmp'`.**
- `ProtectHome=true`: safe *because* the app lives in `/srv`, not `/home`. It is also what kills an nvm-based `ExecStart` under `/root` or `/home/ubuntu`, so keep the system-wide Node.
- `RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX AF_NETLINK`: `AF_INET` for the listener and for `DATABASE_URL` over `127.0.0.1:5432`; `AF_UNIX` for a socket-based `DATABASE_URL`, journald and NSS lookups; `AF_NETLINK` because Node's resolver/libuv queries interfaces over netlink. Dropping `AF_UNIX` or `AF_NETLINK` produces bizarre, hard-to-attribute failures.
- `SystemCallFilter=@system-service` with `SystemCallErrorNumber=EPERM`: the standard service set covers Node. `EPERM` is deliberate — without it a filtered syscall kills the process with SIGSYS and you get no explanation, and with it the calls Node merely *probes* for (io_uring, for instance) fall back to their portable path instead of taking the process down.

Do **not** add these:

- `MemoryDenyWriteExecute=true` — forbids W+X pages and instantly kills V8's JIT. Node will not run.
- `PrivateNetwork=true` — an isolated netns has only its own loopback: nginx can no longer reach the app *and* the app can no longer reach Postgres on `127.0.0.1`.
- `ProcSubset=pid` — hides `/proc/cpuinfo`, `/proc/stat`, `/proc/meminfo`. `os.cpus()` returns an empty array and anything sizing worker pools from it misbehaves. `ProtectProc=invisible` (which only hides *other* processes) is the safe half of this pair.
- `ReadOnlyPaths=/srv/floodwatch` without the two `ReadWritePaths` entries — silently breaks photo uploads.
- `DynamicUser=true` — the uploads directory and `.env` need a stable owner across restarts.

If you switch `DATABASE_URL` to the unix-socket form (`postgresql:///floodwatch?host=/run/postgresql`) and see a connect error, add `/run/postgresql` to `ReadWritePaths` — `ProtectSystem=strict` makes `/run` read-only too, and connecting to a unix socket needs write access to it. Score the result with:

```bash
# as root
systemd-analyze security floodwatch.service
```

`ProtectProc=`, `LogRateLimit*=` and the rest of this set need systemd 240+/247+; Ubuntu 24.04 ships 255, so all of it is available. On an older box, check `systemd-analyze verify` before assuming a directive was honoured — an unknown one is a warning, not an error.

### Logs

Output goes to journald with a stable identifier, so both of these work:

```bash
journalctl -u floodwatch -f                 # follow
journalctl -u floodwatch -n 200 --no-pager  # last 200 lines
journalctl -u floodwatch --since "10 min ago" -p err   # errors only
journalctl -t floodwatch -o cat             # by SyslogIdentifier, message text only
journalctl -u floodwatch -b                 # this boot
```

To read these without `sudo`, your admin user needs to be in `adm` (or `systemd-journal`) — on Ubuntu cloud images the default `ubuntu` user already is, so check before adding: `id -nG "$USER" | tr ' ' '\n' | grep -x adm || sudo adduser "$USER" adm` (log out and back in for it to take).

What you will see: the two boot lines from `server.ts`, `[next] request failed …` for handler exceptions, and Prisma's `error`-level log (`lib/db.ts` sets `log: ["error"]` when `NODE_ENV !== "development"`). Per-request logging is *not* here — that is nginx's access log.

Rate limiting matters because one bad deploy can emit thousands of stack traces a second and journald's global default (`RateLimitIntervalSec=30s`, `RateLimitBurst=10000`) will start dropping messages system-wide, taking nginx's and Postgres's logs with it. `LogRateLimitIntervalSec=30s` / `LogRateLimitBurst=2000` in the unit confines the damage to this service. Cap disk use in `/etc/systemd/journald.conf`:

```ini
[Journal]
Storage=persistent
SystemMaxUse=500M
SystemMaxFileSize=50M
```

```bash
# as root
systemctl restart systemd-journald
journalctl --disk-usage
journalctl --vacuum-size=500M
```

### Enable, start, check, restart

```bash
# as root
systemctl daemon-reload            # re-read unit files after ANY edit to floodwatch.service
systemctl enable --now floodwatch  # start now + start at boot
systemctl status floodwatch
systemctl is-active floodwatch
systemctl show floodwatch -p MainPID -p NRestarts -p ActiveEnterTimestamp
```

Then prove the two things that a green `systemctl status` does not prove:

```bash
curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/          # 307
curl -sS -o /dev/null -w '%{http_code}\n' \
  'http://127.0.0.1:3000/ws/?EIO=4&transport=polling'                     # 200
```

Do not try to sign in yet if nginx and its certificate are not up. With `NODE_ENV=production`, `sessionCookieOptions` marks the session cookie `Secure`, so over plain HTTP the browser discards it and sign-in fails with no error message at all. That is expected here, not a bug in the unit.

`systemctl reload floodwatch` **fails** — there is no `ExecReload`, and adding one would be a lie: the compiled `.next` output and the route-handler bundle are read into memory during `app.prepare()`, so nothing short of a restart picks up new code.

The full deploy sequence lives in *First deploy → Redeploy / update runbook*, and `systemctl restart floodwatch` is its last step. Two things about it belong here:

- **`bun run build` replaces `.next` under the running process.** The live server still holds the old `BUILD_ID`, so between the build finishing and the restart, browsers get 404s on chunks that no longer exist and cache writes land in a directory that has been swapped out. Keep the build and the restart back to back; do not build "now" and restart "tonight".
- **`cd /srv/floodwatch` before every `sudo -u floodwatch` command.** `sudo -u` does not change directory. From `/root`, the app user inherits a cwd it cannot read — `process.cwd()` fails and bun/node abort — and dotenv would look for `.env` somewhere else even if it did not.

Run the build **as the app user**, not as root. `generated/prisma` and `.next` are gitignored and rebuilt on the box; if root builds them, the service (running as `floodwatch`) can read them but cannot write `.next/cache`, and you get permission errors on every cache write. If you slip, `sudo chown -R floodwatch:floodwatch /srv/floodwatch/.next /srv/floodwatch/generated` fixes it.

What a restart costs: the port closes, so nginx returns 502 for the few seconds `app.prepare()` takes; every websocket drops. Clients recover on their own — `socket.io-client` reconnects, and `useScope` in `components/providers/socket-provider.tsx` re-emits `scope:join` whenever `connected` flips back to true, so the `province` and `lgu:<slug>` rooms rebuild without a page reload. In-flight uploads are lost; there is no request draining.

### Why exactly one process (no PM2 cluster, no autoscaling group)

The Socket.io server instance is shared with the route handlers through `globalThis`:

```ts
// lib/realtime/registry.ts
const globalForSocket = globalThis as unknown as { __floodwatchIO?: FloodWatchServer }
export function registerSocketServer(io: FloodWatchServer): void { globalForSocket.__floodwatchIO = io }
```

That bridge exists because tsx and the Next bundle are two module graphs inside **one process**. Room membership (`province`, `lgu:<slug>`, `user:<id>`) lives in that instance's memory, and there is no Redis/cluster adapter anywhere in `package.json`. So:

- **PM2 cluster mode, `systemd` templated instances, or any second process**: a report created on process A emits into A's rooms only. Half your users see live updates; the other half see nothing until they reload. Nothing errors — this failure is completely silent, which is what makes it dangerous.
- **An ALB + autoscaling group** adds a second failure: the client requests `websocket` first but falls back to `polling`, and polling requires every request from a session to hit the same process. Without sticky sessions you get intermittent `Session ID unknown` handshake errors on top of the split fan-out.
- Do not run PM2 under systemd anyway — you would have two supervisors, two restart policies, and PM2's own log files competing with journald for the same output.

The supported shape is one systemd unit, one process, one box. Vertical scaling (a bigger instance) is the supported growth path. Before you can scale horizontally you need, in this order: a `@socket.io/redis-adapter` (or the Redis-streams adapter) wired into `server.ts` so `io.to(room).emit()` fans out across processes, sticky sessions at the proxy (nginx `ip_hash` or a cookie-based upstream), and a shared cache/session story — the Prisma pool and Next's on-disk caches are per-process too, and the uploads directory is local disk. Until all three exist, `Restart=always` on a single unit is the availability story.

---

## nginx reverse proxy, WebSocket upgrade and TLS

Cloudflare sits in front of this instance. A visitor's TLS terminates at Cloudflare's edge; Cloudflare opens a second TLS connection to nginx on this box; nginx forwards to the app on `127.0.0.1:3000` and forwards the Socket.io upgrade at `/ws`. Everything below runs **as root** (shown with `sudo`); nothing in this section runs as the `floodwatch` app user.

Replace `floodwatch.example.ph` everywhere, including inside the certificate paths.

### What Cloudflare changes

Four things differ from a bare nginx origin, and three of them are easy to get wrong:

- **The certificate is a Cloudflare Origin CA cert, not Let's Encrypt.** It is valid for 15 years, needs no renewal timer and no port-80 ACME challenge — but it is **not browser-trusted**. Only Cloudflare accepts it. Grey-cloud the DNS record and visitors reach the origin directly and get a certificate warning.
- **`$remote_addr` is a Cloudflare address, not the visitor's.** Without the real-IP config below, access logs are useless, any rate limiting keys on the wrong address, and fail2ban bans Cloudflare rather than the attacker.
- **The origin must be locked to Cloudflare.** Otherwise anyone who learns the EC2 address bypasses the edge entirely, and everything Cloudflare is doing for you stops applying.
- **Some edge features break this app.** Rocket Loader in particular reorders script execution and breaks React hydration.

### HTTPS is not optional for this app

`lib/auth/token.ts` sets the session cookie like this:

```ts
export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax",
  path: "/",
  maxAge: SESSION_MAX_AGE,
  secure: process.env.NODE_ENV === "production",
} as const
```

The unit runs with `NODE_ENV=production`, so on the box `secure` is always `true`. Over plain `http://` the browser silently discards the `Set-Cookie`: `POST /api/auth/signin` returns `200`, the UI navigates, and the very next request arrives with no session — sign-in *appears* to work and then quietly fails, with nothing in the server log.

Cloudflare gives the browser HTTPS, so this is satisfied at the edge. It is still worth understanding, because it is exactly what you will see if you ever test against the origin's IP directly, or leave Cloudflare in **Flexible** mode while debugging something else.

### Before you start

In the Cloudflare dashboard, the `A` record for `floodwatch.example.ph` points at the instance's Elastic IP and is **proxied** (orange cloud). The security group allows 443 from Cloudflare's ranges only — *Instance provisioning* covers both.

Confirm the name resolves to Cloudflare rather than to your instance, which is what proxied means:

```bash
# your laptop — these should be Cloudflare addresses, NOT the Elastic IP
dig +short floodwatch.example.ph @1.1.1.1
```

### Install nginx

```bash
sudo apt update
sudo apt install -y nginx
sudo systemctl enable --now nginx
```

Port 3000 must **not** be reachable from anywhere but this box. The `.env` sets `HOSTNAME=127.0.0.1` so the custom server binds loopback only:

```bash
sudo ss -lntp | grep 3000     # expect 127.0.0.1:3000, not 0.0.0.0:3000
```

Set it explicitly rather than leaving it unset. `server.ts` does `httpServer.listen(port, process.env.HOSTNAME ?? "localhost")`, and `localhost` resolves through the system resolver — if it comes back `::1` first the listener binds IPv6 loopback only and every `proxy_pass http://127.0.0.1:3000` in the config answers `502`. `HOSTNAME=127.0.0.1` removes the ambiguity.

Confirm the app answers on the loopback before nginx is in the picture. Everything after this point assumes this line prints `200`:

```bash
curl -sI http://127.0.0.1:3000/dashboard | head -1   # expect HTTP/1.1 200 OK
```

(`/` is not the check to use: `app/page.tsx` is a bare `redirect("/dashboard")`, so it answers `307`.)

### The Cloudflare Origin certificate

In the dashboard: **SSL/TLS → Origin Server → Create Certificate**. Accept the defaults (RSA, 15 years) and list both `floodwatch.example.ph` and `*.floodwatch.example.ph`. Cloudflare shows two blobs exactly once — paste each onto the box before closing the page:

```bash
sudo install -d -m 0700 /etc/ssl/cloudflare
sudo nano /etc/ssl/cloudflare/floodwatch.pem   # paste the "Origin Certificate"
sudo nano /etc/ssl/cloudflare/floodwatch.key   # paste the "Private Key"
sudo chmod 0600 /etc/ssl/cloudflare/floodwatch.key
sudo chmod 0644 /etc/ssl/cloudflare/floodwatch.pem
```

This replaces certbot entirely on this box. Nothing renews, nothing needs port 80 open, and there is no renewal job that can fail 60 days from now with nobody watching. The trade is that the certificate is worthless to a browser — see *What Cloudflare changes* above.

### Restoring the visitor's real IP, and the maps

Behind Cloudflare every connection arrives from an edge address, so `$remote_addr` is Cloudflare rather than the visitor: access logs are useless, any rate limiting keys on the wrong address, and fail2ban bans Cloudflare instead of the attacker. The config restores it with `real_ip_header CF-Connecting-IP` plus a `set_real_ip_from` list of Cloudflare's published ranges — so that header is trusted **only** from those ranges and cannot be forged by anyone reaching the origin directly. Ubuntu's `nginx-core` is built `--with-http_realip_module`, so nothing extra needs installing.

Cloudflare changes those ranges occasionally, and when they do the symptom is exactly the failure above. `deploy/nginx/refresh-cloudflare-ips.sh` rewrites the list in place:

```bash
sudo /srv/floodwatch/deploy/nginx/refresh-cloudflare-ips.sh /etc/nginx/sites-available/floodwatch
sudo systemctl reload nginx
```

Two `map` blocks sit alongside it. `$connection_upgrade` echoes the client's `Upgrade` header back to the upstream and sends `close` for ordinary requests, so they are never mislabelled as an upgrade. `$fw_proto` passes Cloudflare's `X-Forwarded-Proto` through and falls back to the origin's own `$scheme` when the header is absent — which is what keeps the config correct under Cloudflare's **Flexible** mode too, where the origin hop is plain HTTP even though the visitor is on HTTPS.

### Worker capacity for long-lived sockets

Every viewer holds one WebSocket open for as long as their tab is, and each one costs nginx **two** connections — the client side and the upstream side — for its whole lifetime. Ubuntu's stock `events { worker_connections 768; }` is therefore a hard ceiling of roughly 380 concurrent viewers per worker, and it is reached during exactly the flood event this service exists for. Raise it in `/etc/nginx/nginx.conf`:

```nginx
events {
    worker_connections 4096;
}
```

`worker_processes auto;` (Ubuntu's default) already gives one worker per vCPU. Also raise the unit's file-descriptor limit if you go much higher — `sudo systemctl edit nginx` and set `LimitNOFILE=16384`.

Note that Cloudflare terminates the visitor's connection, so these are edge-to-origin sockets. Cloudflare does not pool or multiplex WebSockets: one viewer's socket is still one socket here.

### The configuration file

The whole nginx configuration — both maps, the real-IP block and both server blocks — lives in the repo at **`deploy/nginx/floodwatch.conf`**, with its own README. That is the canonical copy; this section explains it rather than repeating it, so the two cannot drift.

```bash
cd /srv/floodwatch/deploy/nginx
sudo cp floodwatch.conf /etc/nginx/sites-available/floodwatch
sudo ln -sfn /etc/nginx/sites-available/floodwatch /etc/nginx/sites-enabled/floodwatch
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

Replace `floodwatch.example.ph` first — it appears in `server_name` and in the port-80 redirect.

`nginx -t` must print `syntax is ok` / `test is successful` before the reload. `reload` is a graceful rebind — it does not drop in-flight requests, but it *does* close proxied WebSocket connections; clients reconnect on their own.

It is deliberately **one file**. `sites-enabled/*` is included from inside nginx.conf's `http{}` block, which is what makes the `map` and `set_real_ip_from` directives legal there. Do not also place a copy of the maps under `conf.d/`: nginx then refuses to start with `duplicate map`.

Two details in it worth knowing before you edit it. `listen 443 ssl http2;` is the form Ubuntu 24.04's nginx 1.24 wants — on 1.25.1 or newer it still works but logs a deprecation warning, and there you may write `listen 443 ssl;` plus a separate `http2 on;`; check with `nginx -v`. And `default_server` on both listeners means a request with an unrecognised `Host` lands here rather than on nginx's stock welcome page — remove it if you ever host a second site on this box.

### Why the WebSocket block looks like that

Strictly speaking a dedicated `location /ws` is not *required*: `proxy_http_version 1.1` plus the `Upgrade`/`Connection` pair on `location /` alone will proxy the handshake correctly, and the `map` guarantees ordinary requests are not mislabelled. It is not resilient, though — without a separate block you cannot give the long-lived socket a one-hour read timeout without imposing that timeout on every request, and you cannot disable response buffering for engine.io's polling transport without disabling it site-wide. Hence: upgrade headers on **both** locations, dedicated tuning in `/ws`.

Getting the upgrade right is not optional either. `components/providers/socket-provider.tsx` calls `io({ path: SOCKET_PATH, addTrailingSlash: false, transports: ["websocket", "polling"] })` and does **not** set `tryAllTransports`, which defaults to `false` in the bundled engine.io-client. WebSocket is first in that list, so if the upgrade is mishandled the client raises a connection error and stops — it does not quietly fall back to polling. A broken upgrade means no realtime at all, not a slower realtime.

`proxy_read_timeout` is the one that bites. It measures the gap between two successive reads from the upstream, and its default is 60 seconds. Socket.io's server-side heartbeat fires every `pingInterval` — 25,000 ms by default — so a stock deployment survives on a 35-second margin. Anyone who raises `pingInterval`, or an event loop stalled by a slow Prisma query, drops every open socket at once; the clients reconnect, and the symptom is "the live feed flickers every minute" rather than an error anywhere. Set it explicitly.

**Cloudflare must have WebSockets enabled** (Network → WebSockets), or the upgrade never reaches this box at all. It is on by default on every plan, but it is the first thing to check when the handshake works against the origin and fails through the edge.

Also note `SOCKET_PATH = process.env.NEXT_PUBLIC_SOCKET_PATH || "/ws"`. Because the variable is `NEXT_PUBLIC_`, it is inlined into the client bundle at `next build` time. Changing it means a rebuild *and* editing the location prefix here — they must agree. And per the README, never add an App Router route under `/ws`.

One more constraint that belongs here: this config assumes exactly **one** upstream process. The Socket.io registry lives in that process's memory (`lib/realtime/registry.ts`, via `globalThis`) with no Redis adapter. A second app process behind this `proxy_pass` would break fan-out and split engine.io's polling handshake across backends. Do not add an `upstream {}` pool.

### Host, X-Forwarded-* and the 403 CROSS_SITE trap

`proxy.ts` guards every `POST`/`PUT`/`PATCH`/`DELETE` under `/api`:

```ts
const fetchSite = request.headers.get("sec-fetch-site")
if (fetchSite) return fetchSite !== "same-origin" && fetchSite !== "none"

const origin = request.headers.get("origin")
if (!origin) return false
return new URL(origin).origin !== new URL(request.url).origin
```

Two things matter operationally.

**`sec-fetch-site` is the branch that actually runs.** Every browser in current use sends it, and both Cloudflare and nginx forward unrecognised request headers untouched, so this works out of the box. The rule is negative: never add `proxy_set_header Sec-Fetch-Site ...`, never blank it with `proxy_set_header Sec-Fetch-Site "";`, and do not add a Cloudflare Transform Rule that strips or rewrites `Sec-Fetch-*`. If it disappears, every browser POST falls through to the Origin branch below and starts returning `403 {"code":"CROSS_SITE"}`.

**The Origin fallback probably cannot be satisfied by header configuration.** Because `server.ts` constructs Next with an explicit `hostname` and `port`, the URL Next hands to `proxy.ts` is built from *those* values plus `x-forwarded-proto` — `https://127.0.0.1:3000/api/...` — rather than from the `Host` header (`experimental.trustHostHeader` is not set in `next.config.ts`). Where that holds, `new URL(request.url).origin` can never equal `https://floodwatch.example.ph`, the fallback branch always rejects, and no `proxy_set_header` line will change it.

Do not leave this to theory: *Operations → step 7* has a one-line curl that tells you which behaviour your build actually has. `401` means the fallback resolves your public origin and every client can write; `403` means only clients that send `Sec-Fetch-Site` can — which is every current browser, but not iOS Safari before 16.4, and never a page served over plain HTTP.

Set `Host $host` anyway — Next copies it into `x-forwarded-host`, and it keeps access logs and any future host-dependent behaviour honest.

### Upload size

nginx's stock `client_max_body_size` is **1m**. Leave it and every single photo upload dies at the proxy with a `413` HTML page — the request never reaches Next, so the app's own `422` with the `t.err.photo` message never renders and the form just shows a generic failure.

The numbers, from `lib/domain.ts` and `app/api/uploads/route.ts`:

- `PHOTO_MAX_BYTES = 5 * 1024 * 1024` = 5,242,880 bytes
- `MAX_BODY_BYTES = PHOTO_MAX_BYTES + 64 * 1024` = 5,308,416 bytes — the route rejects any declared `content-length` above this before buffering

`client_max_body_size 8m` sits above the app's own ceiling, so oversize bodies are rejected by the route with structured JSON rather than by nginx with an HTML error page. Do not set it *equal* to 5,308,416 — multipart framing varies with the boundary string and field names, and you want the app to be the component that says no.

There is a ceiling on the other side too. `proxy.ts` matches `/api/:path*`, so Next clones the request body for the proxy, bounded by `experimental.proxyClientMaxBodySize` — default **10 MiB**. Past that Next *truncates* the clone and only logs a warning, so a `client_max_body_size` above `10m` would corrupt multipart uploads instead of rejecting them. Anything between `6m` and `10m` is safe — this guide uses `8m`.

Cloudflare imposes its own request-body cap (100 MB on Free and Pro), which is far above anything this app accepts, so it never binds here.

### What may and may not be cached

No `proxy_cache` is configured above, and that is deliberate. The edge is now the cache that matters:

- **`/api/*` must never be cached.** `proxy.ts` already stamps `cache-control: private, no-store` and `vary: cookie` on every `/api` response, and Cloudflare honours that. Add an explicit **Cache Rule** bypassing `/api/*` and `/ws*` anyway: it costs nothing, and it means a future config change cannot accidentally serve one resident's dashboard to another.
- **`/uploads/<uuid>.jpg` is the one thing that is safely cacheable.** `app/uploads/[name]/route.ts` returns `cache-control: public, max-age=31536000, immutable`, and the filename is a freshly minted UUID, so the bytes behind a URL never change. Caching these at the edge takes real load off the single origin during an event.
- **`/_next/static/*`** is content-hashed and immutable, and benefits the same way.

Do not add `add_header Cache-Control ...` in this server block. `add_header` appends, so you would emit two `Cache-Control` headers and hand Cloudflare an ambiguous instruction that contradicts the app's per-route intent.

### Cloudflare dashboard settings

- **SSL/TLS → Overview → Full (strict).** Not Flexible: that leaves the Cloudflare-to-EC2 hop in plaintext across the public internet, and makes the Origin CA certificate pointless.
- **SSL/TLS → Edge Certificates → Always Use HTTPS: on.**
- **Network → WebSockets: on.** Without it `/ws` never reaches the origin.
- **Speed → Optimization → Rocket Loader: off.** It reorders script execution and breaks React hydration.
- **Cache Rules:** bypass cache for `/api/*` and `/ws*`.
- **Bot Fight Mode:** leave off, or verify sign-in and report submission still work — it can challenge the API's non-navigational POSTs.

### Locking the origin to Cloudflare

Anyone who learns the EC2 address otherwise bypasses the edge, and every control above stops applying. Two layers, in increasing strength:

**The security group** (covered in *Instance provisioning*) allows 443 from Cloudflare's published ranges only. Refresh it when they change:

```bash
# your workstation
CF=$(curl -s https://www.cloudflare.com/ips-v4)
for ip in $CF; do
  aws ec2 authorize-security-group-ingress --group-id "$SG_ID" \
    --ip-permissions "IpProtocol=tcp,FromPort=443,ToPort=443,IpRanges=[{CidrIp=$ip,Description=cloudflare}]"
done
```

**Authenticated Origin Pulls** refuse any TLS client that cannot present Cloudflare's client certificate, so even a leaked address with a lapsed firewall rule gets rejected at the handshake:

```bash
sudo curl -fsSL -o /etc/ssl/cloudflare/origin-pull-ca.pem \
  https://developers.cloudflare.com/ssl/static/authenticated_origin_pull_ca.pem
```

Uncomment the two `ssl_client_certificate` / `ssl_verify_client` lines in the server block, enable it under **SSL/TLS → Origin Server → Authenticated Origin Pulls**, then `nginx -t && systemctl reload nginx`. Enable the dashboard toggle *before* reloading nginx, or Cloudflare's next request is refused and the site goes down.

### HSTS

Do this at the edge, not here: **SSL/TLS → Edge Certificates → HTTP Strict Transport Security**. Cloudflare is what browsers actually talk to, so an `add_header` on the origin is both redundant and easy to get wrong.

The usual caveats apply, and they are not theoretical for a service a province depends on. A one-year `max-age` commits every browser that has visited to refusing plain HTTP for this hostname for a year; you cannot recall it, only serve a shorter `max-age` to visitors who come back. Do not enable `includeSubDomains` unless every current and future subdomain has a certificate, and do not enable `preload` unless you accept that removal from the browser preload list takes months. Turn it on only once HTTPS is confirmed working end to end.

### Verify the whole path

```bash
# Redirect and TLS, through the edge
curl -sI http://floodwatch.example.ph/dashboard  | head -3   # 301 -> https://...
curl -sI https://floodwatch.example.ph/          | head -1   # 307 (-> /dashboard)
curl -sI https://floodwatch.example.ph/dashboard | head -1   # 200

# Confirm you are actually going through Cloudflare
curl -sI https://floodwatch.example.ph/dashboard | grep -i '^cf-ray\|^server'

# Engine.io polling handshake through the edge
curl -s "https://floodwatch.example.ph/ws?EIO=4&transport=polling"
# expect: 0{"sid":"...","upgrades":["websocket"],"pingInterval":25000,...}

# Real WebSocket upgrade. --http1.1 is required: with HTTP/2 enabled curl
# would negotiate h2 and the Upgrade mechanism does not exist there.
curl -i -N --http1.1 --max-time 5 \
  -H "Connection: Upgrade" \
  -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Version: 13" \
  -H "Sec-WebSocket-Key: $(openssl rand -base64 16)" \
  "https://floodwatch.example.ph/ws?EIO=4&transport=websocket"
# expect: HTTP/1.1 101 Switching Protocols
```

Reading the failures correctly matters here:

- A **Cloudflare-branded error page** (520, 521, 522, 526) is the edge failing to reach or trust the origin, not the app. `521` is the origin refusing the connection — check the security group and that nginx is running. `526` is an invalid origin certificate — the Origin CA cert is missing, mismatched, or Cloudflare is in Full (strict) with a self-signed cert.
- A **400 with a tiny JSON body** (`{"code":3,"message":"Bad request"}`) came *from engine.io itself* — the proxy is fine, the query string is not.
- An **HTML body**, i.e. Next's 404 page, means `/ws` fell through to the Next handler and engine.io never saw the request. Check the `location /ws` prefix against `NEXT_PUBLIC_SOCKET_PATH`, and that nobody added a route under `/ws`.
- A **502** means nginx cannot reach `127.0.0.1:3000` — usually the loopback-binding trap above, or the app unit is down.

Then confirm the real-IP config is working, which nothing else will tell you:

```bash
# instance · root — your own address must appear, not a Cloudflare range
sudo tail -5 /var/log/nginx/floodwatch.access.log
```

Finally, the two checks only a browser can do: sign in and confirm the session survives a reload (proves the `Secure` cookie is being stored), and open the map in two tabs and file a report in one — it must appear in the other without a refresh (proves the upgrade at `/ws` is live end to end).

### If you ever drop Cloudflare

Point the DNS `A` record straight at the Elastic IP, reopen 80 and 443 to `0.0.0.0/0` in the security group, and swap the Origin CA certificate for a browser-trusted one:

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d floodwatch.example.ph \
  -m ops@example.ph --agree-tos --no-eff-email --redirect
```

certbot rewrites the `ssl_certificate` lines in place; leave the rest of the server block as it is. Port 80 must then stay open permanently for HTTP-01 renewal, and `systemctl list-timers certbot.timer` plus `sudo certbot renew --dry-run` become things you actually have to check. Delete `/etc/nginx/conf.d/cloudflare-realip.conf` at the same time — with no Cloudflare in front, `CF-Connecting-IP` is an attacker-controlled header, and trusting it would let anyone forge their address in your logs.

---

## Operations, verification and troubleshooting

Everything below assumes the shape built in the previous sections: one EC2 instance, one `floodwatch.service` systemd unit running `server.ts` through `tsx`, PostgreSQL and nginx on the same box.

| Placeholder | Value used below |
| --- | --- |
| Domain | `floodwatch.example.ph` |
| App directory | `/srv/floodwatch` (also the unit's `WorkingDirectory`) |
| Unix user / unit / DB name / DB role | `floodwatch` |
| App listener | `127.0.0.1:3000` (`HOSTNAME=127.0.0.1`, `PORT=3000`) |
| Environment file | `/srv/floodwatch/.env`, mode `0600`, owned by `floodwatch` |
| bun | installed **system-wide** at `/usr/local/bin/bun` |

Every block is labelled with who runs it: `# instance · root`, `# instance · app user`, or `# your laptop`.

> `bun` must be on a path `sudo` will find. `sudo` resets `PATH` to `secure_path` (`/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin`), and the usual bun installer drops it in `~/.bun/bin`, which is not on that list — so every `sudo -u floodwatch bun …` below would fail with `sudo: bun: command not found`. Install it system-wide, confirm with `command -v bun`, and substitute your real absolute path if it is not `/usr/local/bin/bun`.

> A healthy service is **one** node process, because the unit's `ExecStart` invokes tsx's loader directly (`node --import file://…/tsx/dist/loader.mjs /srv/floodwatch/server.ts`). systemd's `MainPID` is then the process that actually holds the HTTP listener, the socket.io registry and the `SIGINT`/`SIGTERM` handlers, so `SIGTERM` reaches the shutdown handler directly.
>
> If you instead run it through the tsx **CLI** (`node …/tsx/dist/cli.mjs server.ts`), you get two processes — the CLI wrapper is `MainPID` and the app runs in a child — and the unit must then keep systemd's default `KillMode=control-group`, because `KillMode=process` would signal only the wrapper and the graceful shutdown would never run. The single-process form in *Running the server as a systemd unit* avoids all of that.

### Post-deploy smoke test

Run these in order. Each one proves a different moving part, and a failure tells you which section to re-check.

**1. The service is up and it is running in production mode.**

```bash
# instance · root
systemctl is-active floodwatch
systemctl show floodwatch -p NRestarts -p MainPID -p WorkingDirectory
journalctl -u floodwatch -n 20 --no-pager
```

Expected: `active`, `NRestarts=0`, `WorkingDirectory=/srv/floodwatch`, and in the log:

```
> Pampanga Flood Watch on http://127.0.0.1:3000  (dev=false)
> realtime on /ws
```

`dev=false` is the load-bearing part. `server.ts` computes `dev = process.env.NODE_ENV !== "production"`, so `dev=true` means `NODE_ENV` never reached the process and Next is running its development server against a production build directory.

**2. The app listens on loopback only; nginx and Postgres are where they should be.**

```bash
# instance · root
ss -lntp | grep -E ':(80|443|3000|5432)\b'
```

Expected: `127.0.0.1:3000` (`node`, and its pid is the unit's `MainPID`), `127.0.0.1:5432` (`postgres`), and `0.0.0.0:80` / `0.0.0.0:443` (`nginx`, usually alongside `[::]:80` and `[::]:443`). Anything showing `0.0.0.0:3000` or `*:3000` means the Node process is reachable from the internet without TLS. Confirm from outside:

```bash
# your laptop
curl --max-time 5 http://<instance-public-ip>:3000/ ; echo "exit=$?"
```

Expected: `exit=28` (timed out) or connection refused. A `200` here is a failed test — fix `HOSTNAME` and the security group before continuing.

**3. The database is reachable, migrated and seeded — as the app, not just as root.**

```bash
# instance · root
pg_isready -h 127.0.0.1 -p 5432
sudo -u postgres psql -d floodwatch -c 'select count(*) as lgus from "Lgu";'
sudo -u postgres psql -d floodwatch -c 'select email, role from "User";'
sudo -u postgres psql -d floodwatch -c 'select migration_name, finished_at, rolled_back_at from _prisma_migrations order by finished_at;'
```

Expected: `lgus = 22`; one row `dev@renmendoza.com | OFFICIAL`; every migration with a non-null `finished_at` and a null `rolled_back_at`. If `User` is empty, `bun run db:seed` has not run. If it has extra sample reports and gauges, someone ran `db:seed:demo` — that script replaces reports, alerts and zones wholesale and must never run on the live box.

Those three commands connect as the `postgres` superuser over the peer socket, which proves nothing about the credentials the *app* uses. Prove those separately, with the role, password and host from `DATABASE_URL`:

```bash
# instance · root
PGPASSWORD='<the password from DATABASE_URL>' \
  psql -h 127.0.0.1 -U floodwatch -d floodwatch -c 'select 1'
```

Expected: one row. A failure here is a `pg_hba.conf` or password problem the superuser check cannot see — **Fix C**.

**4. TLS, the redirect and renewal.**

```bash
# your laptop
curl -sSI http://floodwatch.example.ph/ | head -n 3
openssl s_client -connect floodwatch.example.ph:443 -servername floodwatch.example.ph </dev/null 2>/dev/null \
  | openssl x509 -noout -subject -issuer -dates -ext subjectAltName
```

Expected: `301` (or `308`) with `Location: https://floodwatch.example.ph/`, and a certificate **issued by Cloudflare** — that is the edge certificate the browser sees, not the Origin CA certificate on your box. Match the `subjectAltName`, not the subject CN.

The origin's own certificate is a separate thing and is checked separately:

```bash
# instance · root — the Cloudflare Origin CA cert nginx presents to the edge
openssl x509 -in /etc/ssl/cloudflare/floodwatch.pem -noout -subject -issuer -dates
```

Expect an issuer of `CloudFlare Origin SSL Certificate Authority` and a `notAfter` roughly 15 years out. There is nothing to renew and no timer to check — which is the point of using it.

```bash
# instance · root
# Confirm requests really are arriving via Cloudflare, not direct
curl -sI https://floodwatch.example.ph/dashboard | grep -i '^cf-ray\|^server'

# Confirm the origin refuses anyone who is not Cloudflare
curl -sk --max-time 8 https://<ELASTIC_IP>/ -o /dev/null -w '%{http_code}\n' || echo "refused — correct" 
```

**5. The app renders over HTTPS.**

```bash
# your laptop
curl -sS -o /dev/null -L -w '%{http_code} %{url_effective}\n' https://floodwatch.example.ph/
```

Expected: `200 https://floodwatch.example.ph/dashboard` — `app/page.tsx` redirects to `/dashboard`, which renders signed out as well as signed in.

**6. The JSON API reaches Postgres, and `proxy.ts` is decorating responses.**

```bash
# your laptop
curl -sS -D - -o /dev/null "https://floodwatch.example.ph/api/dashboard?lgu=sf"
curl -sS "https://floodwatch.example.ph/api/dashboard?lgu=sf" | head -c 200; echo
```

Expected: `200`, plus these two headers set by `proxy.ts`:

```
cache-control: private, no-store
vary: cookie
```

and a body starting `{"lgu":{"id":"...","slug":"sf","name":"City of San Fernando",...`. A `500` here with an empty body is almost always a Prisma connection failure — check `journalctl -u floodwatch -n 50`.

**7. `proxy.ts` is live and rejecting cross-site writes.**

```bash
# your laptop — must be 403
curl -sS -w '\n%{http_code}\n' -X POST \
  -H 'content-type: application/json' \
  -H 'Sec-Fetch-Site: cross-site' \
  -d '{"email":"nobody@example.com","password":"wrongpassword"}' \
  https://floodwatch.example.ph/api/auth/signin
```

Expected exactly:

```
{"error":"Cross-site request rejected","code":"CROSS_SITE"}
403
```

And the counterpart, which proves the guard is not over-blocking the path a real browser takes:

```bash
# your laptop — must be 401, not 403
curl -sS -w '\n%{http_code}\n' -X POST \
  -H 'content-type: application/json' \
  -H 'Sec-Fetch-Site: same-origin' \
  -d '{"email":"nobody@example.com","password":"wrongpassword"}' \
  https://floodwatch.example.ph/api/auth/signin
```

Expected: `{"error":"That email and password do not match an account","code":"BAD_CREDENTIALS","fields":{"password":"errCreds"}}` with `401`.

> Do **not** treat `-H 'Origin: https://floodwatch.example.ph'` with no `Sec-Fetch-Site` as a pass/fail test. When `Sec-Fetch-Site` is absent, `proxy.ts` falls back to comparing `Origin` against `new URL(request.url).origin`, and whether that URL carries your public origin or the server's internal one (`http://127.0.0.1:3000`) is a Next internal, not something this app controls. Against the dev server it is the internal one, so the comparison fails for every public origin and returns 403. Run it once anyway, as a **diagnostic**, because the answer decides which browsers can write at all:

```bash
# your laptop — diagnostic, not pass/fail
curl -sS -o /dev/null -w '%{http_code}\n' -X POST \
  -H 'content-type: application/json' \
  -H 'Origin: https://floodwatch.example.ph' \
  -d '{"email":"nobody@example.com","password":"wrongpassword"}' \
  https://floodwatch.example.ph/api/auth/signin
```

`401` means the `Origin` fallback resolves your public origin and every browser can write. `403` means the fallback can never match, so writes only work for clients that send `Sec-Fetch-Site` — which is most, but not all: fetch-metadata headers are sent only from secure contexts (never over plain HTTP), and Safari only began sending them in 16.4, so an iPhone on iOS 16.3 or older would get 403 on every sign-in and every report. If you see `403` here, either accept that limit knowingly or change `isCrossSite` to compare against the forwarded host. Either way, anything in front of nginx that strips `Sec-Fetch-*` headers will break every write; see the troubleshooting table.

**8. Sign in as the seeded official, and check the cookie is `Secure`.**

```bash
# your laptop
curl -sS -c /tmp/fw.jar -D - -o /tmp/fw.json -X POST \
  -H 'content-type: application/json' \
  -d '{"email":"dev@renmendoza.com","password":"floodwatch"}' \
  https://floodwatch.example.ph/api/auth/signin | grep -i '^set-cookie'
```

Expected, in some order and any case:

```
set-cookie: fw_session=eyJ...; Path=/; Expires=...; Max-Age=2592000; HttpOnly; Secure; SameSite=lax
```

`Secure` is only added when `NODE_ENV === "production"` (`lib/auth/token.ts`). If it is missing, stop and fix the unit — over plain HTTP the browser will drop the cookie entirely and sign-in appears to silently fail.

```bash
# your laptop
curl -sS -b /tmp/fw.jar https://floodwatch.example.ph/api/auth/me
```

Expected: the `OFFICIAL` user for `City of San Fernando`. Signed out, this endpoint returns `{"user":null}` with `200` — it never 401s.

**9. Upload a photo: proves the uploads directory, its permissions, and `client_max_body_size`.**

`/api/uploads` requires a session, accepts JPG and PNG only and checks magic bytes, so a synthetic file with a JPEG header is enough for a scripted test. Run these in `bash` or `zsh` — `printf '\xff…'` is not portable to `dash`/`sh`.

```bash
# your laptop
{ printf '\xff\xd8\xff\xe0'; head -c 200000 /dev/zero; } > /tmp/smoke.jpg
curl -sS -b /tmp/fw.jar -F "file=@/tmp/smoke.jpg;type=image/jpeg" \
  -w '\n%{http_code}\n' https://floodwatch.example.ph/api/uploads
```

Expected: `{"url":"/uploads/<uuid>.jpg"}` with `200`. Fetch it back:

```bash
# your laptop — substitute the uuid you got
curl -sS -D - -o /dev/null https://floodwatch.example.ph/uploads/<uuid>.jpg
```

Expected: `200`, `content-type: image/jpeg`, `cache-control: public, max-age=31536000, immutable`, and either `content-length: 200004` or `transfer-encoding: chunked` — the route sets an explicit length but nginx may re-frame the streamed body. Confirm it landed in the right directory, owned by the right user:

```bash
# instance · root
ls -l /srv/floodwatch/var/uploads/
```

Now check the body-size ceiling. The app hard-rejects anything over 5 MB + 64 KB with `422`; nginx rejects with `413` and an HTML error page. Which one answers tells you whether `client_max_body_size` is set correctly:

```bash
# your laptop
{ printf '\xff\xd8\xff\xe0'; head -c 6000000 /dev/zero; } > /tmp/toobig.jpg
curl -sS -b /tmp/fw.jar -F "file=@/tmp/toobig.jpg;type=image/jpeg" \
  -w '\n%{http_code}\n' https://floodwatch.example.ph/api/uploads
```

Expected with `client_max_body_size 8m;`: `{"error":"That photo was not accepted","code":"INVALID","fields":{"file":"photo"}}` and `422` — the request reached the app and the app refused it. A `413` with `<html><head><title>413 Request Entity Too Large` means nginx cut it off, and a legitimate 4 MB photo will fail the same way.

**10. Realtime through nginx: handshake, then upgrade.**

```bash
# your laptop
curl -sS "https://floodwatch.example.ph/ws?EIO=4&transport=polling"
```

Expected (one line, no newline):

```
0{"sid":"...","upgrades":["websocket"],"pingInterval":25000,"pingTimeout":20000,"maxPayload":1000000}
```

`"upgrades":["websocket"]` must be non-empty. Now force the upgrade:

```bash
# your laptop
curl -sS -i -N --http1.1 --max-time 5 \
  -H 'Connection: Upgrade' -H 'Upgrade: websocket' \
  -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' \
  "https://floodwatch.example.ph/ws?EIO=4&transport=websocket"
```

Expected:

```
HTTP/1.1 101 Switching Protocols
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=
```

followed by binary noise and `curl: (28) Operation timed out`. **Exit 28 is the pass** — the socket stayed open until the deadline. `--http1.1` is mandatory: HTTP/2 has no `Upgrade` mechanism, so without it curl may negotiate h2 over TLS and the test proves nothing. A `400`, `404` or `502`, or an immediate close, means nginx is not forwarding the upgrade.

**11. Two browsers, one live report.**

1. Browser A: sign in as `dev@renmendoza.com` at `https://floodwatch.example.ph/signin`.
2. Browser B: a private window on `https://floodwatch.example.ph/dashboard`. Signed out is fine — the dashboard and the socket both work unauthenticated.
3. In B, open DevTools → Network → **WS**. There must be exactly one `ws` entry with status **101** that stays open. Repeating `?transport=polling` requests returning `200` forever mean the upgrade is being swallowed (see troubleshooting).
4. In A, go to `/submit`, pick **City of San Fernando**, drop a pin on the map, choose a water level, attach a **real** JPG or PNG under 5 MB, and submit.
5. B's dashboard must gain the new pin and card **without a reload** — this is the `report:created` broadcast to the `province` and `lgu:sf` rooms.
6. In B, open the new report and load its photo. This is the end-to-end proof of the upload directory, the service's working directory and nginx's body limit in one click.
7. In B, narrow the area picker to City of San Fernando (this emits `scope:join`), then file a report in A for a *different* area. B must still receive it — every socket stays in the `province` room regardless of scope.

**12. Broadcast an alert.**

> Do this **before the site is public**. A `CRITICAL` broadcast raises a full-screen acknowledgement gate on every connected browser, real visitors included, and there is no delete endpoint for alerts.

In browser A go to `/admin`; the **Broadcast** tab is the default. Send one with type `FLOOD_WARNING`, priority `HIGH`, province-wide. Browser B must show the alert banner immediately, with no reload, and `/alerts` must list it. Send one at priority `CRITICAL` once, and confirm B raises the full-screen acknowledgement gate, then dismiss it.

The scriptable equivalent:

```bash
# your laptop
curl -sS -b /tmp/fw.jar -X POST -H 'content-type: application/json' \
  -d '{"title":"Deployment smoke test","message":"Ignore.","type":"GENERAL","priority":"LOW","scope":"PROVINCE"}' \
  -w '\n%{http_code}\n' https://floodwatch.example.ph/api/alerts
```

Expected: `201` with `{"alert":{...,"sentBy":"Flood Watch operations",...}}`. Repeat it with a resident account's cookie jar (make one via `/signup`) and it must return `403 {"error":"You do not have access to this","code":"FORBIDDEN"}` — that is `requireOfficial` doing its job.

**13. Restart and reboot survival.** *(pre-launch only — the reboot takes the flood map offline for a minute or two)*

```bash
# instance · root
systemctl restart floodwatch
journalctl -u floodwatch -n 5 --no-pager
```

Browser B's WS entry should drop and re-establish on its own (socket.io reconnects); the dashboard keeps working. Then:

```bash
# instance · root
systemctl is-enabled floodwatch nginx postgresql
reboot
```

After it comes back, re-run steps 1, 5 and 10.

**14. Clean up the smoke-test data.**

Delete the test report in the UI (an `OFFICIAL` account can delete any report; it is a soft delete, so its photo stays on disk — remove that too). Alerts have no delete endpoint, so remove it with SQL — `AlertArea` and `AlertDismissal` cascade:

```bash
# instance · root
sudo -u postgres psql -d floodwatch -c "delete from \"Alert\" where title = 'Deployment smoke test';"
rm -f /srv/floodwatch/var/uploads/<uuid>.jpg
```

A SQL delete cannot fire `revalidateTag` and emits no socket event, so browsers already open keep showing the alert until they reload. On reload, alert and report reads are wrapped in `unstable_cache` with a 15-second TTL, so the change appears within about 15 seconds. Zones take up to 5 minutes and gauges 2 minutes. The LGU list is 24 hours, and **a restart does not shorten it** — in a production build those entries are written through to `.next/cache/fetch-cache` and outlive the process. To force it:

```bash
# instance · root
systemctl stop floodwatch
rm -rf /srv/floodwatch/.next/cache/fetch-cache
systemctl start floodwatch
```

### Troubleshooting

| Symptom | Likely cause | Confirm | Fix |
| --- | --- | --- | --- |
| Sign-in returns 200, then the app immediately shows signed out; `/api/auth/me` returns `{"user":null}` | Site served over plain HTTP. `sessionCookieOptions.secure` is `NODE_ENV === "production"`, so the browser silently discards a `Secure` cookie on an insecure origin | `curl -sS -D - -o /dev/null -X POST -H 'content-type: application/json' -d '{"email":"x@y.z","password":"z"}' http://floodwatch.example.ph/api/auth/signin \| grep -i '^set-cookie'` — cookie carries `Secure` while the page is `http` (do **not** use `-I` here: that is `--head` and will not read the body) | Finish TLS and force the redirect (step 4). Never "fix" it by unsetting `NODE_ENV=production` — that also puts Next into dev mode |
| Every POST/PUT/PATCH/DELETE to `/api/*` returns `403 CROSS_SITE`, in a browser | Something in front of nginx (a WAF, another CDN/proxy, an in-app webview) is stripping `Sec-Fetch-Site`, so `proxy.ts` falls back to the `Origin` comparison — which may never match. Or the client genuinely does not send `Sec-Fetch-*`: iOS Safari before 16.4, or any plain-HTTP page | `curl -sS -o /dev/null -w '%{http_code}\n' -X POST -H 'content-type: application/json' -H 'Sec-Fetch-Site: same-origin' -d '{"email":"x@y.z","password":"z"}' https://floodwatch.example.ph/api/auth/signin` → `401` means the guard is fine and the header is being stripped upstream. Then run the `Origin`-only diagnostic from step 7 to see whether the fallback can ever match | Remove the intermediary or stop it rewriting `Sec-Fetch-*`. Also make sure nginx passes `Host $host` and `X-Forwarded-Proto $scheme` and does not blank `Origin` (**Fix A**) |
| Realtime never arrives; DevTools shows `/ws?...&transport=polling` requests repeating forever and no 101 | The `location /ws` block is missing `proxy_http_version 1.1` and the `Upgrade`/`Connection` headers | Step 10's upgrade curl returns something other than `101` | **Fix A** |
| WebSocket connects, then drops every ~60 s and reconnects | nginx's default `proxy_read_timeout` is 60 s. Engine.io's 25 s `pingInterval` normally keeps it under that, so if you see this also suspect an intermediary with its own idle timeout (ALB, NAT gateway, corporate proxy) | `grep -rn 'proxy_read_timeout' /etc/nginx/` ; `grep -c 'upstream timed out' /var/log/nginx/error.log` | **Fix A** — `proxy_read_timeout 3600s;` and `proxy_buffering off;` |
| Realtime completely dead: handshake returns 404 or the Next 404 page | `NEXT_PUBLIC_SOCKET_PATH` changed after the last build (it is inlined into the client bundle at build time, so the browser asks for the old path), or an App Router route was added under `/ws` | `curl -sS "https://floodwatch.example.ph/ws?EIO=4&transport=polling"` ; `grep -rn NEXT_PUBLIC_SOCKET_PATH /srv/floodwatch/.env` ; `ls /srv/floodwatch/app/ws 2>/dev/null` | Keep `/ws` and rebuild after any change: `cd /srv/floodwatch && sudo -u floodwatch /usr/local/bin/bun run build && systemctl restart floodwatch`. Never create `app/ws/**` — engine.io claims that path by prefix |
| Realtime works for some viewers, not others; journal shows repeated `Session ID unknown` | More than one app process (PM2 cluster, a second instance, an ASG). Rooms live in one process's memory via `globalThis`, with no socket.io Redis adapter | `pgrep -cf 'tsx/dist/loader\.mjs'` → must be `1`; `ss -lntp 'sport = :3000'` → exactly one listener | Run exactly one process. This app is not horizontally scalable without a Redis adapter plus sticky sessions |
| Photo upload fails with `413 Request Entity Too Large` and nothing in `journalctl -u floodwatch` | `client_max_body_size` too small (nginx default is `1m`) | `grep -rn client_max_body_size /etc/nginx/` ; `grep 'too large body' /var/log/nginx/error.log` | Set `client_max_body_size 8m;` in the server block, `nginx -t && systemctl reload nginx`. The app still caps photos at 5 MB and answers `422` itself |
| Upload returns 500, or photos upload but 404 when displayed | `UPLOAD_DIR` is `join(process.cwd(), "var", "uploads")` — a wrong `WorkingDirectory` writes them somewhere else, or the directory is not writable by the app user | `systemctl show floodwatch -p WorkingDirectory` ; `ls -ld /srv/floodwatch/var/uploads` ; `journalctl -u floodwatch \| grep -i EACCES` | `WorkingDirectory=/srv/floodwatch` in the unit; `chown -R floodwatch:floodwatch /srv/floodwatch/var && chmod 750 /srv/floodwatch/var/uploads`. If the unit uses `ProtectSystem=strict`, add `ReadWritePaths=/srv/floodwatch/var /srv/floodwatch/.next` — `.next` is needed at **runtime** too, because `unstable_cache` writes to `.next/cache` while the service runs. Do not add an nginx `location /uploads` — the route handler serves those |
| Build or start fails: `Cannot find module '/srv/floodwatch/generated/prisma/client'`, or `Module not found: Can't resolve '@/generated/prisma/client'` | `generated/prisma` is gitignored Prisma output and must be regenerated on the box; a bare `git pull` never brings it | `ls /srv/floodwatch/generated/prisma` | `cd /srv/floodwatch && sudo -u floodwatch /usr/local/bin/bun install --frozen-lockfile` (the `postinstall` script runs `prisma generate`), or `cd /srv/floodwatch && sudo -u floodwatch npx prisma generate`. Then rebuild |
| Start fails: `Error: Could not find a production build in the '/srv/floodwatch/.next' directory` | The unit runs with `NODE_ENV=production` but `next build` never ran (or `.next` was wiped) | `journalctl -u floodwatch -n 30 --no-pager` ; `ls /srv/floodwatch/.next/BUILD_ID` | `cd /srv/floodwatch && sudo -u floodwatch /usr/local/bin/bun run build && systemctl restart floodwatch` |
| `PrismaClientInitializationError … P1001: Can't reach database server at …` | Postgres down, wrong host/port in `DATABASE_URL`, or it is not listening on the address you named | `pg_isready -h 127.0.0.1 -p 5432` ; `ss -lntp \| grep 5432` ; `sudo -u postgres psql -c 'show listen_addresses;'` | `systemctl enable --now postgresql`; use `127.0.0.1:5432` in `DATABASE_URL`; **Fix C** for `listen_addresses`/`pg_hba` |
| `P1000: Authentication failed against database server` | Wrong role or password, an un-encoded special character in the URL password, or `pg_hba.conf` demanding a different method | `PGPASSWORD='…' psql -h 127.0.0.1 -U floodwatch -d floodwatch -c 'select 1'` ; `grep -v '^#' /etc/postgresql/16/main/pg_hba.conf \| grep -v '^$'` | Reset the password (**Fix C** — mind the shell quoting there), percent-encode `@ : / # ? & %` and any space in the URL password, and re-check `pg_hba.conf` |
| Unit fails instantly with `status=203/EXEC` | `ExecStart` names a binary systemd cannot execute. Classic cause: the path was taken from a dev shell where node comes from `~/.nvm`, which systemd's minimal PATH cannot see and the app user cannot read. `node_modules/.bin/tsx` is a symlink to a file whose shebang is `#!/usr/bin/env node` | `systemctl cat floodwatch` ; `systemctl show floodwatch -p ExecStart` ; `sudo -u floodwatch test -x /usr/bin/node && echo ok` | Install Node system-wide and call it explicitly (**Fix B**) |
| `next build` dies with `Killed`, exit 137, or the whole box goes unresponsive | Out of memory. A Turbopack build of this app does not reliably fit in 1 GB | `dmesg -T \| grep -i 'out of memory'` ; `journalctl -k \| grep -i oom` ; `free -h` | Add swap (**Fix D**), or use an instance with ≥ 4 GB RAM. Build during a quiet window: the build rewrites `.next` in place under the running server |
| App unreachable through nginx (`502`), though the process is running | It bound the wrong interface. `server.ts` listens on `process.env.HOSTNAME ?? "localhost"`, and a shell wrapper that exports `HOSTNAME` hands it the machine name, which may resolve to `127.0.1.1` | `ss -lntp \| grep 3000` ; `journalctl -u floodwatch \| grep 'Pampanga Flood Watch on'` ; `grep 'connect() failed' /var/log/nginx/error.log` | Pin `Environment=HOSTNAME=127.0.0.1` in the unit and point `proxy_pass` at `http://127.0.0.1:3000`. Never set `HOSTNAME=0.0.0.0` — that exposes the app outside TLS |
| Map renders as blank grey tiles; DevTools shows `401` from `tiles.stadiamaps.com` | The production hostname is not on the Stadia property allowlist, a `Referrer-Policy: no-referrer` header is stripping the credential, or the account hit its credit limit and is being hard-limited with `429` | `curl -s -o /dev/null -w '%{http_code}\n' -H 'Referer: https://floodwatch.example.ph/' 'https://tiles.stadiamaps.com/tiles/osm_bright/16/54738/30000.png'` ; check the Stadia dashboard's usage page | Add the hostname under Properties; remove any `no-referrer` policy; enable pay-as-you-go overage so a credit limit degrades into a small bill rather than a blank map |
| Site is slow, pages recompile on every visit, the dev overlay appears | `NODE_ENV` is not `production`, so `dev = true` and Next runs its development server | `journalctl -u floodwatch \| grep 'dev='` → `dev=true` | Add `Environment=NODE_ENV=production` to the unit and restart. This also restores the `Secure` session cookie |

**Fix A — nginx WebSocket and proxy headers.**

First check whether the earlier nginx section already defined `$connection_upgrade`; adding a second `map` for the same variable makes `nginx -t` fail with `duplicate map`.

```bash
# instance · root
grep -rn 'connection_upgrade' /etc/nginx/    # if this hits, skip the map file below
```

```nginx
# /etc/nginx/conf.d/upgrade-map.conf   (http{} scope, once per box)
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}
```

```nginx
# inside the TLS server{} block of /etc/nginx/sites-available/floodwatch
client_max_body_size 8m;

location /ws {
    proxy_pass         http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header   Upgrade $http_upgrade;
    proxy_set_header   Connection $connection_upgrade;
    proxy_set_header   Host $host;
    proxy_set_header   X-Real-IP $remote_addr;
    proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header   X-Forwarded-Proto $scheme;
    proxy_buffering    off;
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
}
```

```bash
# instance · root
nginx -t && systemctl reload nginx
```

**Fix B — a node systemd can actually exec.**

Install Node system-wide (the NodeSource steps are in *Instance provisioning*), then point `ExecStart` at the absolute path:

```bash
# instance · root
/usr/bin/node -v          # must satisfy next's engines: >= 20.9.0
```

```ini
# /etc/systemd/system/floodwatch.service  (the ExecStart line)
ExecStart=/usr/bin/node --import file:///srv/floodwatch/node_modules/tsx/dist/loader.mjs /srv/floodwatch/server.ts
```

That form runs the app as a single process, so `MainPID` is the process holding the listener and `SIGTERM` reaches `server.ts`'s shutdown handler directly. Do not use `/srv/floodwatch/node_modules/.bin/tsx` — systemd execs it and the kernel runs its `#!/usr/bin/env node` shebang against the unit's minimal `PATH`, which is the usual source of `203/EXEC`.

```bash
# instance · root
systemctl daemon-reload && systemctl restart floodwatch
```

**Fix C — Postgres over loopback TCP.**

Edit the drop-in created in *PostgreSQL*, not the shipped `postgresql.conf`:

```conf
# /etc/postgresql/16/main/conf.d/10-floodwatch.conf
listen_addresses = 'localhost'
```

```conf
# /etc/postgresql/16/main/pg_hba.conf — above the generic host lines
host    floodwatch    floodwatch    127.0.0.1/32    scram-sha-256
```

```bash
# instance · root
# listen_addresses is postmaster-level: a reload will NOT apply it.
# (If you only edited pg_hba.conf, `systemctl reload postgresql` is enough.)
systemctl restart postgresql
systemctl restart floodwatch      # the Prisma pool does not survive a Postgres restart
```

Reset the role's password with a quoted heredoc, so the shell cannot expand `$` or `!` inside it:

```bash
# instance · root
sudo -u postgres psql <<'SQL'
alter role floodwatch with password 'NEW-PASSWORD';
SQL
```

Then update `DATABASE_URL` in `/srv/floodwatch/.env` (percent-encode any of `@ : / # ? & %` or a space in the password) and `systemctl restart floodwatch`.

**Fix D — more swap, so `next build` survives on a small instance.**

*Instance provisioning* already created a 2 GiB `/swapfile`. On a 2 GiB instance that is not enough for a Turbopack build; grow it to 4 GiB. Check the root volume has room first — swap competes with photos and Postgres for the same disk.

```bash
# instance · root
df -h /
swapoff /swapfile
fallocate -l 4G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=4096
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
swapon --show
free -h
```

`swapoff` first: `mkswap` on a file that is currently in use corrupts the running swap area. If `/swapfile` does not exist at all, drop the `swapoff` line.

### Reading the logs

```bash
# instance · root
journalctl -u floodwatch -f                      # live app log
journalctl -u floodwatch --since '15 min ago'    # recent window
journalctl -u floodwatch -p err --since today    # errors only
journalctl -u floodwatch -b -1                   # previous boot
tail -f /var/log/nginx/access.log
tail -f /var/log/nginx/error.log
journalctl -u nginx --since today                # nginx startup/config failures only
```

The app writes nothing to files — `console.error` from `server.ts` and from route handlers goes to stdout/stderr and lands in the journal. nginx's access and error logs are files and do not appear in the journal. Useful greps:

```bash
# instance · root
journalctl -u floodwatch --since today | grep -i 'prisma\|P100'      # database trouble
grep ' 413 \| 502 \| 499 ' /var/log/nginx/access.log | tail -50      # body limit / upstream / client aborts
grep '/ws' /var/log/nginx/access.log | tail -20                      # 101s should be rare and long-lived
```

### Log rotation and retention

nginx already ships `/etc/logrotate.d/nginx` (daily, 14 generations, compressed). Verify rather than rewrite:

```bash
# instance · root
logrotate -d /etc/logrotate.d/nginx
```

Cap the journal so a chatty week cannot fill the root volume:

```bash
# instance · root
mkdir -p /etc/systemd/journald.conf.d
cat > /etc/systemd/journald.conf.d/floodwatch.conf <<'EOF'
[Journal]
SystemMaxUse=500M
SystemMaxFileSize=50M
MaxRetentionSec=1month
EOF
systemctl restart systemd-journald
journalctl --disk-usage
journalctl --vacuum-size=500M      # reclaim now, if it is already over
```

### Restarting and shipping an update

```bash
# instance · root
systemctl restart floodwatch       # there is no reload; the unit has no reload command
systemctl stop floodwatch
systemctl start floodwatch
```

`server.ts` traps `SIGINT`/`SIGTERM`, closes socket.io, stops accepting new connections and awaits `app.close()` — but it then calls `process.exit(0)` without waiting for `httpServer.close()` to drain, so shutdown is best-effort and an in-flight request can be cut. Restart in a quiet window. Every WebSocket drops; connected browsers reconnect on their own within a few seconds.

A full deploy:

```bash
# instance · root
sudo -u floodwatch git -C /srv/floodwatch pull --ff-only
cd /srv/floodwatch && sudo -u floodwatch /usr/local/bin/bun install --frozen-lockfile   # postinstall runs prisma generate
cd /srv/floodwatch && sudo -u floodwatch /usr/local/bin/bun run db:deploy               # prisma migrate deploy
cd /srv/floodwatch && sudo -u floodwatch /usr/local/bin/bun run build                   # prisma generate && next build
systemctl restart floodwatch
```

Every one of those needs `/srv/floodwatch` as its working directory and needs `/srv/floodwatch/.env` readable by `floodwatch` — `prisma generate`, `migrate deploy` and the build all resolve `DATABASE_URL` through `prisma7.config.ts`, which loads `.env` from the current directory.

Two things to know about this shape. There is no `output: "standalone"`, so the deployed tree needs the full `node_modules`, `.next` and source — you cannot ship `.next` alone. And `next build` rewrites `.next` underneath the running server, so viewers mid-session may see a handful of 404s on JS chunks between the build finishing and the restart; do it in a quiet window and restart immediately. After every deploy, re-run smoke steps 1, 6, 10 and 11.

### Monitoring without a stack

First, let systemd do the restarting — the unit in *Running the server as a systemd unit* already carries `Restart=always`, `RestartSec=2`, and a `StartLimitIntervalSec=60` / `StartLimitBurst=5` guard in `[Unit]`.

Those limits are a deliberate trade. Five failed starts in a minute park the unit in `failed` instead of hammering Postgres forever, which is what you want for a *configuration* fault (bad `DATABASE_URL`, missing `.next`) — but it also means a genuinely transient fault can stop the service for good until someone runs `systemctl reset-failed floodwatch`. If you would rather it keep trying, widen them to `StartLimitIntervalSec=300` / `StartLimitBurst=10` and rely on the health check below to tell you it is flapping.

Then an external check that notices a process which is alive but not serving. This one exercises Postgres too, because `/api/dashboard` reads through Prisma:

```ini
# /etc/systemd/system/floodwatch-healthcheck.service
[Unit]
Description=Floodwatch HTTP health check
OnFailure=floodwatch-restart.service

[Service]
Type=oneshot
ExecStart=/usr/bin/curl -fsS --max-time 10 --retry 2 --retry-delay 5 --retry-connrefused -o /dev/null "http://127.0.0.1:3000/api/dashboard?lgu=sf"
```

```ini
# /etc/systemd/system/floodwatch-restart.service
[Unit]
Description=Restart floodwatch after a failed health check

[Service]
Type=oneshot
ExecStart=/usr/bin/systemctl --no-block restart floodwatch
```

```ini
# /etc/systemd/system/floodwatch-healthcheck.timer
[Unit]
Description=Run the Floodwatch health check every minute

[Timer]
OnBootSec=2min
OnUnitActiveSec=1min
AccuracySec=10s

[Install]
WantedBy=timers.target
```

```bash
# instance · root
systemctl daemon-reload
systemctl enable --now floodwatch-healthcheck.timer
systemctl list-timers floodwatch-healthcheck.timer
journalctl -u floodwatch-healthcheck -n 20 --no-pager
```

Every automatic restart drops every WebSocket on the box, so a *repeating* restart is a symptom to investigate, not a self-healing system: if `journalctl -u floodwatch-restart --since today` shows more than the occasional entry, find out why the health check is failing rather than leaving it to bounce.

Optionally add the CloudWatch agent for memory and disk, which EC2 does not report on its own. The instance needs an IAM role with `CloudWatchAgentServerPolicy`.

```bash
# instance · root
ARCH=$(dpkg --print-architecture)          # amd64 or arm64
curl -fsSLo /tmp/amazon-cloudwatch-agent.deb \
  "https://amazoncloudwatch-agent.s3.amazonaws.com/ubuntu/${ARCH}/latest/amazon-cloudwatch-agent.deb"
dpkg -i -E /tmp/amazon-cloudwatch-agent.deb
usermod -aG adm cwagent    # /var/log/nginx is root:adm 750 — without this, log collection silently fails
```

```json
// /opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json
{
  "agent": { "metrics_collection_interval": 60, "run_as_user": "cwagent" },
  "metrics": {
    "namespace": "Floodwatch",
    "append_dimensions": { "InstanceId": "${aws:InstanceId}" },
    "metrics_collected": {
      "mem":  { "measurement": ["mem_used_percent"] },
      "swap": { "measurement": ["swap_used_percent"] },
      "disk": { "measurement": ["used_percent"], "resources": ["/"] }
    }
  },
  "logs": {
    "logs_collected": {
      "files": {
        "collect_list": [
          { "file_path": "/var/log/nginx/error.log",  "log_group_name": "/floodwatch/nginx/error",  "log_stream_name": "{instance_id}" },
          { "file_path": "/var/log/nginx/access.log", "log_group_name": "/floodwatch/nginx/access", "log_stream_name": "{instance_id}" }
        ]
      }
    }
  }
}
```

```bash
# instance · root
/opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl \
  -a fetch-config -m ec2 -s -c file:/opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json
systemctl status amazon-cloudwatch-agent --no-pager
tail -n 20 /opt/aws/amazon-cloudwatch-agent/logs/amazon-cloudwatch-agent.log   # permission errors show up here
```

Then set CloudWatch alarms on `mem_used_percent > 90`, `disk_used_percent > 85` and the EC2 `StatusCheckFailed` metric. That is enough for a single box; do not build anything larger here.

### Unattended security updates

*Instance provisioning* installs and configures `unattended-upgrades` with `Automatic-Reboot "false"`. What belongs here is checking that it is actually running:

```bash
# instance · root
unattended-upgrade --dry-run --debug | tail -20
cat /var/run/reboot-required 2>/dev/null     # prints when a reboot is pending
tail -n 40 /var/log/unattended-upgrades/unattended-upgrades.log
journalctl -u apt-daily-upgrade.service --since '7 days ago'
```

(`journalctl -u unattended-upgrades` is nearly always empty — that unit only runs at shutdown. The scheduled runs are `apt-daily-upgrade.service`, and the real record is the log file.)

`floodwatch.service` is not a packaged unit, so unattended-upgrades will never restart it — the Node process keeps running against whatever libraries it started with. Reboot in a maintenance window when `/var/run/reboot-required` appears, then re-run smoke steps 1, 5 and 10.

### Watching disk

Three things grow on this box: report photos, Postgres, and the journal. Next's on-disk cache (`unstable_cache` entries under `.next/cache`) is a distant fourth but does grow.

```bash
# instance · root
df -h /
du -sh /srv/floodwatch/var/uploads /srv/floodwatch/.next/cache
du -sh /var/lib/postgresql
journalctl --disk-usage
ls /srv/floodwatch/var/uploads | wc -l
```

At 5 MB per photo, 10,000 reports with photos is ~50 GB. Size the EBS volume for the flood season, not for today, and alarm on `disk_used_percent > 85`. A full disk breaks uploads (`ENOSPC` on `writeFile`) and Postgres writes at the same time, so it is the failure worth catching early.

Photos and the database must be backed up **together** — a `pg_dump` without `var/uploads` restores reports whose photos 404. *PostgreSQL → Backups* sets up exactly that: one script, one nightly timer, both artifacts from the same run. Check it is actually firing:

```bash
# instance · root
systemctl list-timers floodwatch-backup.timer
journalctl -u floodwatch-backup.service -n 20 --no-pager
ls -lh /var/backups/floodwatch
```

Two things that section leaves to you and the checklist does not let you skip: **ship the directory off the instance** (the EBS volume is the thing you are protecting against), and **rehearse a restore at least once** — the rehearsal recipe restores into a scratch database with no downtime, after which re-run smoke steps 3, 6 and 9.

### Rotating AUTH_SECRET

```bash
# instance · root
openssl rand -hex 32
editor /srv/floodwatch/.env            # replace the AUTH_SECRET= line
chown floodwatch:floodwatch /srv/floodwatch/.env
chmod 600 /srv/floodwatch/.env
systemctl restart floodwatch
```

What this invalidates: **every session, for everyone, immediately.** Sessions are stateless JWTs signed with `AUTH_SECRET` (`lib/auth/token.ts`); there is no session table. After the restart, every existing `fw_session` cookie fails `jwtVerify`, `getSessionUser()` returns `null`, and every signed-in browser is silently signed out and must sign in again. Stale cookies in browsers are harmless — they simply never verify again.

What it does not touch: passwords, uploads, reports, alerts, or anything else in the database.

Rotate it if the secret has ever been in a chat message, a screenshot, a shared `.env`, or a repo; rotate it when handing the instance to a new operator. Do not rotate during an active flood event — you will sign out every responder mid-report.

### Changing the seeded official's password

The seed creates `dev@renmendoza.com` with the password `floodwatch` unless `SEED_ADMIN_PASSWORD` was set on the **first** run. Re-running `bun run db:seed` will *not* change it: `prisma/seed-base.ts` upserts the account and only sets `passwordHash` in its `create` branch. So on an already-seeded box, change the hash directly.

```bash
# instance · app user — type the password, then Ctrl-D. Nothing lands in argv or shell history.
cd /srv/floodwatch
sudo -u floodwatch /usr/bin/node -e 'const b=require("bcryptjs");const fs=require("fs");console.log(b.hashSync(fs.readFileSync(0,"utf8").trim(),10))'
```

It prints a `$2b$10$…` string. **Do not paste that into a double-quoted shell command** — bash expands `$2b`, `$10` and the rest, and you will silently write a truncated hash that no password can ever match. Use a quoted heredoc, which expands nothing:

```bash
# instance · root — paste the hash between the single quotes, then Ctrl-D is not needed; the heredoc ends at SQL
sudo -u postgres psql -d floodwatch <<'SQL'
update "User" set "passwordHash" = '<paste the $2b$10$… hash here>' where email = 'dev@renmendoza.com';
SQL
```

Expected output: `UPDATE 1`. Existing sessions are JWTs and stay valid until they expire — rotate `AUTH_SECRET` as well if you need to evict them. Sign in with the new password to confirm, then re-run smoke step 8.

### Before you serve the province

- [ ] **The production hostname is on the Stadia Maps property allowlist.** `components/map/map-constants.ts` serves OSM Bright from `tiles.stadiamaps.com`, authenticated by domain: the browser's `Origin`/`Referer` is the credential, so nothing ships in the bundle — but a hostname that is not registered under Properties in the Stadia dashboard answers **every tile with 401 and draws a blank map**. `localhost` and `127.0.0.1` are exempt, which is exactly why this passes in development and fails the moment it is behind a real domain.

  ```bash
  # your laptop — the credential is the header, so send one
  curl -s -o /dev/null -w '%{http_code}\n' \
    -H 'Referer: https://floodwatch.example.ph/' \
    'https://tiles.stadiamaps.com/tiles/osm_bright/16/54738/30000.png'
  ```

  `200` means the allowlist is right; `401` means it is not. Two related traps: do **not** add a `Referrer-Policy: no-referrer` header anywhere in nginx or the app, because it strips the evidence Stadia authenticates on; and **enable pay-as-you-go overage in the Stadia dashboard**, because every plan — free and paid — otherwise hard-stops at its credit limit with HTTP 429 until the next billing cycle, which would blank the map for the rest of the month during exactly the event this service exists for.

- [ ] **Tile budget is sized for a flood, not for a quiet day.** Raster tiles cost 10–16 requests per map view, and one credit each. Measure a realistic pan-and-zoom in DevTools → Network (filter `png`), multiply by expected sessions, and pick the plan from that — a 10,000-session event day is on the order of a million tiles.

  Any change to `TILE_URL`, `TILE_ATTRIBUTION` or `TILE_MAX_ZOOM` is compiled into the client bundle, so it needs `bun run build` and a restart — not just a restart. If you switch providers again, mind the axis order (Stadia, OSM and CARTO are `{z}/{x}/{y}`; Esri's ArcGIS services are `{z}/{y}/{x}`) and leave Leaflet's `detectRetina` off — `{r}` already handles high-DPI screens, while `detectRetina` requests tiles a zoom deeper and quadruples both the count and the bill.
- [ ] Seeded official's password changed from `floodwatch` (see above), and the account's email/name updated if it is not the real operator.
- [ ] `AUTH_SECRET` is a fresh `openssl rand -hex 32`, and `/srv/floodwatch/.env` is mode `0600` owned by `floodwatch` — and readable by the build, which loads it from the working directory.
- [ ] `NODE_ENV=production` in the unit — the journal must say `dev=false`.
- [ ] `HOSTNAME=127.0.0.1`; `ss -lntp` shows port 3000 on loopback only; the security group opens 22, 80 and 443 and nothing else.
- [ ] Exactly one app process: `pgrep -cf 'tsx/dist/loader\.mjs'` returns `1`. No PM2 cluster mode, no second instance, no autoscaling group. Socket.io rooms live in this process's memory with no Redis adapter.
- [ ] `NEXT_PUBLIC_SOCKET_PATH` is the same in `/srv/floodwatch/.env` now as it was when `.next` was built — it is inlined into the client bundle.
- [ ] `db:seed:demo` has never been run here — it replaces reports, alerts and zones wholesale.
- [ ] No route exists or will ever be added under `app/ws/**`.
- [ ] Cloudflare is in **Full (strict)**, Always Use HTTPS is on, WebSockets are on, and Rocket Loader is **off** (it breaks React hydration).
- [ ] The DNS record is **proxied** (orange cloud): `dig +short` returns Cloudflare addresses, not the Elastic IP.
- [ ] The security group allows 443 from Cloudflare's ranges only, and port 80 is not open. Connecting to the Elastic IP directly must fail.
- [ ] `/etc/nginx/conf.d/cloudflare-realip.conf` exists and the access log shows real visitor addresses rather than Cloudflare ranges.
- [ ] Nightly `pg_dump` **and** `var/uploads` backed up together, shipped off the instance, with a restore rehearsed at least once.
- [ ] Swap configured if the instance has under 4 GB of RAM.
- [ ] The step 7 `Origin`-only diagnostic answered `401` — or you have accepted, knowingly, that clients which do not send `Sec-Fetch-Site` (iOS Safari before 16.4) cannot write.
- [ ] The whole smoke test above passes end to end, including the two-browser realtime check.
