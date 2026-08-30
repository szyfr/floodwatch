# Pampanga Flood Watch

Live flood reporting for the 22 cities and municipalities of Pampanga: citizen
reports on a map, PAGASA-style river gauges, safe zones, and DRRM broadcast
alerts — all updating in real time, in English and Tagalog.

Built from the design handoff in `docs/ui-mockups-pending-scope/`.

## Stack

| Layer     | Choice                                                                        |
| --------- | ----------------------------------------------------------------------------- |
| Framework | Next.js 16 (App Router, Turbopack, React 19)                                  |
| Database  | PostgreSQL via Prisma 7 (`prisma-client` generator + `@prisma/adapter-pg`)    |
| Realtime  | Socket.io sharing one HTTP listener with Next (`server.ts`)                   |
| UI        | shadcn/ui on Base UI, Phosphor icons, CSS Modules over `--fw-*` design tokens |
| Auth      | Email + password, bcrypt hashes, JWT in an httpOnly cookie (`jose`)           |

## Getting started

```bash
# 1. PostgreSQL 14+ running locally, with a database and role to match .env
createdb floodwatch

# 2. Configure
cp .env.example .env      # set DATABASE_URL and AUTH_SECRET

# 3. Install, migrate, seed
bun install
bun run db:deploy         # or `bun run db:migrate` to author new migrations
bun run db:seed           # 22 cities and municipalities + the one account
bun run db:seed:demo      # optional: sample reports, gauges, alerts, safe zones

# 4. Run — this is a custom server, so `next dev` alone will NOT start realtime
bun run dev               # http://localhost:3000
```

`bun run build && bun run start` runs the same custom server in production mode.

### Seeded account

One account, and it is an official — so it can broadcast alerts and manage safe
zones from the provincial panel.

| Email                | Role                                                    | Password                                      |
| -------------------- | ------------------------------------------------------- | --------------------------------------------- |
| `dev@renmendoza.com` | OFFICIAL (Flood Watch operations, City of San Fernando) | `floodwatch`, or `SEED_ADMIN_PASSWORD` if set |

```bash
SEED_ADMIN_PASSWORD='…' bun run db:seed   # anywhere that is not a dev machine
```

### Demo content

`bun run db:seed` writes the cities and that account and nothing else, so a
freshly seeded database has no reports, gauges, alerts or safe zones in it —
which is what any shared environment wants. `prisma migrate reset` (`bun run
db:reset`) runs that same baseline seed.

`bun run db:seed:demo` lays the design bundle's sample content on top for local
testing: 4 river gauges with six hours of readings, 7 safe zones, 18 flood
reports and 4 broadcast alerts. Those reports are unattributed — they carry no
author and render as "Anonymous", a state the design already covers. Sign up
through the app to exercise the resident path and the owner-only Edit/Delete on
a report.

The demo seed writes report and alert timestamps relative to when it runs, so
the "last hour" filters have something in them. Re-run `bun run db:seed:demo` to
refresh them — it replaces reports, alerts and zones wholesale, including any
you filed through the app, and leaves accounts alone.

## Layout

```
app/
  (app)/            signed-in surfaces, wrapped in the shared shell
    dashboard/      map + live reports
    submit/         file or edit a report
    alerts/         DRRM broadcasts
    admin/          provincial panel (officials only)
  (auth)/           sign in / sign up, outside the shell
  api/              route handlers — see the table below
components/
  shell/            headers, banners, drawer, area picker
  map/              the Leaflet map ported from the prototype
  dashboard/ submit/ alerts/ admin/ auth/
  providers/        language, session, socket
  ui/               shadcn/ui primitives
lib/
  domain.ts         water levels, colours, formatters — shared by client and server
  dto.ts            wire shapes
  validation.ts     zod schemas for every mutating endpoint
  serialize.ts      Prisma row → DTO
  server/queries.ts read paths used by pages and route handlers
  realtime/         socket contract, the globalThis bridge, the broadcast helper
prisma/             schema, migrations, baseline + demo seeds
styles/tokens.css   the design's colours, radii, shadows and keyframes
server.ts           Next + Socket.io on one port
```

## API

| Method + path                                                | Auth                          | Purpose                                            |
| ------------------------------------------------------------ | ----------------------------- | -------------------------------------------------- |
| `POST /api/auth/signup` · `signin` · `signout`               | –                             | session cookie in/out                              |
| `GET` · `PATCH /api/auth/me`                                 | – / user                      | current user, language preference                  |
| `GET /api/lgus`                                              | –                             | the 22 areas with report rollups                   |
| `GET /api/dashboard`                                         | –                             | everything the map screen needs, one round-trip    |
| `GET` · `POST /api/reports`                                  | – / user                      | list and file reports                              |
| `GET` · `PATCH` · `DELETE /api/reports/:id`                  | – / owner / owner or official | one report                                         |
| `POST /api/reports/:id/vote`                                 | user                          | up, down, or clear                                 |
| `GET` · `POST /api/alerts`                                   | – / official                  | read and broadcast                                 |
| `POST` · `DELETE /api/alerts/:id/dismiss`                    | user                          | per-person dismissal                               |
| `GET` · `POST /api/zones`, `PATCH` · `DELETE /api/zones/:id` | – / official                  | safe zones                                         |
| `GET /api/gauges`, `PATCH /api/gauges/:id`                   | – / official                  | river gauges and new observations                  |
| `POST /api/uploads`                                          | user                          | report photos (JPG/PNG, ≤5MB)                      |
| `GET /api/routes`                                            | –                             | evacuation routes (phase 2; returns an empty list) |

Validation failures answer 422 with `fields` keyed by field name, whose values
are dictionary keys — so a form renders the design's own error copy.

## The map

One basemap at every zoom: OSM's own rendering, via `tile.openstreetmap.org`,
capped at z19 — the deepest zoom where it still has real tiles over Pampanga.

The design mocked this up on Esri's Light Gray Canvas, which is a paler
backdrop, but that service publishes no imagery above z16 anywhere in the world
and answers deeper requests with a "Map data not yet available" placeholder.
Since the zooms past 16 are exactly where a reporter places a pin, the app uses
the layer that actually draws rivers, buildings, street names and the
corner-store landmarks people navigate by.

`tile.openstreetmap.org` is fine for development, but its usage policy covers
limited, non-commercial use. Before this serves the province, point `TILE_URL`
in `components/map/map-constants.ts` at your own tile server or a paid provider.
Note the URL order if you switch: OSM and CARTO use `{z}/{x}/{y}`, Esri's ArcGIS
services use `{z}/{y}/{x}`.

## Realtime

`server.ts` boots Next and attaches Socket.io to the same HTTP server on `/ws`.
Route handlers reach the io instance through `globalThis` (`lib/realtime/registry.ts`);
a shared import would not work, because the custom server runs through `tsx`
while route handlers come out of the Next bundle — two module graphs in one
process.

Every socket joins a `province` room, plus an `lgu:<slug>` room when the viewer
narrows scope. Writes broadcast `report:created|updated|deleted|voted`,
`alert:created`, `zone:created|updated|deleted` and `gauge:updated`. Payloads
never carry viewer-specific fields (`myVote`, `isOwner`, `dismissed`) — clients
reconcile those against their own session.

Do not add a route under `/ws`: engine.io claims that path by prefix, and a
matching App Router route makes Next close the upgrade before the handshake.

## Offline

Reports written with no connection are parked in `localStorage` and flushed as
soon as the browser reports it is back online. Each carries a `clientId` so a
retry cannot file the same report twice.

## Conventions

- Component styling lives in a CSS Module beside the component, written in plain
  CSS against the `--fw-*` tokens. `@apply` inside a module is a build error in
  Tailwind v4 without a `@reference`, so the codebase does not use it.
- Server Components by default; `"use client"` only where state or effects are
  genuinely needed.
- `react-hooks/set-state-in-effect` is an error here — subscribe to external
  state with `useSyncExternalStore` (see `hooks/use-online.ts`).
- Every user-visible string comes from `lib/i18n/dictionary.ts`, which carries
  the design's English and Tagalog copy verbatim.

## Checks

```bash
bun run typecheck
bun run lint
bun run build
```
