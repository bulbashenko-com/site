# Deployment

Production runs in the k3s cluster `hel1`, managed by Flux from [bulbashenko-com/infra](https://github.com/bulbashenko-com/infra). This repo builds the image; infra decides which image runs. Cluster-wide topics (nodes, mesh, backups, monitoring, labels) are in the infra README. This page covers only what concerns the site.

## Overview

| Piece | Where |
| --- | --- |
| App | Deployment `site` in namespace `site` (`infra/apps/production/site/site.yaml`), Next.js standalone on port 3000, 1 replica, read-only root filesystem |
| Public traffic | Cloudflare → Cloudflare Tunnel → Traefik (entry point `web`) → Service `site`. `www.` redirects to the apex (Middleware `www-to-apex`) |
| Images | `ghcr.io/bulbashenko-com/{site,site-migrate,site-e2e}:<commit sha>`, built by `.github/workflows/image.yml` after `test` passes on `main` |
| Database | CloudNativePG cluster `pg` in namespace `data` (`pg-rw.data.svc`), database and role of the site. WAL archiving, daily base backups and the off-site copy are set up in infra |
| Media | Nextcloud Team folder `Site` (`Gallery/`, `Files/`), read by the app as the read-only user `site` over WebDAV (`http://nextcloud.nextcloud.svc.cluster.local:8080`). Served to visitors by the app itself at `https://media.bulbashenko.com/m/…`, a DNS-only host on hel1-edge (Traefik `websecure`), so video and large files never pass Cloudflare's proxy. See [Media](#media) |
| Admin sign-in | Ory Hydra at `https://auth.bulbashenko.com`, client `bulbashenko-site` (defined in [bulbashenko-com/auth](https://github.com/bulbashenko-com/auth), group `site-admins`) |
| DNS / CDN | Cloudflare zone `bulbashenko.com`, records in `infra/terraform/dns.tf` (OpenTofu) |

## Deploying

```
PR ─► test.yml (check, build; required) ─► merge to main ─► image.yml: site, site-migrate, site-e2e :<sha>
  └► infra pins <sha> on dev ─► staging (bulbashenko.dev): migrate, roll out, smoke suite (staging/site-e2e)
       └► release PR dev -> main in infra (owner merges) ─► production: migrate, roll out
```

- The full flow (timings, release, rollback, hotfix, notifications, where to watch) is in
  [infra docs/workflow.md](https://github.com/bulbashenko-com/infra/blob/dev/docs/workflow.md).
- The pod's init container `migrate` (image `site-migrate`, `scripts/migrate.mjs`) applies new migrations before the
  new version starts; the old pod keeps serving until the new one is ready. A failed migration leaves production on
  the old version and alerts in Telegram.
- `e2e/` is the smoke suite staging runs for every version (home page, languages, admin sign-in through the SSO,
  media). Its result `staging/site-e2e` is required to merge the release. Locally:
  `cd e2e && npm ci && E2E_SITE=http://localhost:3000 npx playwright test tests/01-home.spec.ts tests/02-lang.spec.ts`.
- `:latest` is pushed too but is not what runs; the pin in `infra/apps/base/site/kustomization.yaml` is.

## Environment

Plain values are in `site.yaml`:

| Variable | Value |
| --- | --- |
| `NEXTCLOUD_URL` | `http://nextcloud.nextcloud.svc.cluster.local:8080` |
| `NEXTCLOUD_PUBLIC_URL` | `https://cloud.bulbashenko.com` (links in the admin panel) |
| `NEXTCLOUD_USER`, `NEXTCLOUD_ROOT` | `site`, `Site` |
| `MEDIA_PUBLIC_URL` | `https://media.bulbashenko.com` |
| `NEXT_PUBLIC_SITE_URL` | `https://bulbashenko.com` |
| `OIDC_ISSUER`, `OIDC_CLIENT_ID` | `https://auth.bulbashenko.com`, `bulbashenko-site` |

Secrets are in the Secret `site` (`infra/apps/production/site/secret.sops.yaml`, edit with `sops`):

| Key | Notes |
| --- | --- |
| `DATABASE_URL` | `postgresql://…@pg-rw.data.svc.cluster.local:5432/…?sslmode=verify-full&sslrootcert=/etc/internal-ca/ca.crt`. The server certificate comes from the cluster's internal CA; trust-manager puts that CA into every namespace as ConfigMap `internal-ca`, and the pod mounts it at `/etc/internal-ca` |
| `JWT_SECRET` | Signs the admin session cookie and the short-lived sign-in flow cookie |
| `OIDC_CLIENT_SECRET` | Same value as `OIDC_SITE_CLIENT_SECRET` in the auth Secret |
| `NEXTCLOUD_PASSWORD` | Password of the Nextcloud user `site` (same value as `site-password` in the nextcloud Secret) |

Env from a Secret is read only at pod start. After changing the Secret, bump the annotation `bulbashenko.com/secret-revision` in `site.yaml` in the same PR so the pod restarts.

`NEXT_PUBLIC_SITE_URL` and `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` are also inlined at build time from GitHub repository variables (Docker build args).

## GitHub configuration

- `deploy.yml` pushes to GHCR with `GITHUB_TOKEN`; the `promote` job calls `bulbashenko-com/infra/.github/workflows/request-promote.yml` with the inherited secrets.
- Variables for the build: `NEXT_PUBLIC_SITE_URL`, optionally `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION`.
- The GHCR package is public, so the cluster pulls it without credentials.

## Schema changes

Prisma Migrate: every schema change comes with a migration file in `prisma/migrations`.

```sh
# edit prisma/schema.prisma, then (local Postgres from docker-compose.yml):
npx prisma migrate dev --name <what-changed>
```

- CI (`check`) fails if `prisma/schema.prisma` and the migrations differ.
- Deploys apply migrations automatically (init container `migrate`): staging when the pin lands on `dev`, production
  with the release. The staging refresh restores production's data and then migrates it to staging's version.
- After migrating, `migrate.mjs` checks that the database matches the schema exactly and fails otherwise (drift from a
  hand-made change); the log shows the difference.
- Keep migrations backward compatible with the running version (add, then use, then drop in a later release): during
  a rollout the old pod still serves on the new schema, and a rollback does not undo a migration.
- `0_init` is the baseline of the schema that `prisma db push` had created; on a database without migration history
  it is marked as applied instead of run.

## Local production check

```sh
docker build -t bulbashenko .
docker compose up -d postgres
docker run --rm --network host -e DATABASE_URL=postgresql://postgres:postgres@localhost:5432/bulbashenko -e JWT_SECRET=dev bulbashenko
```

## Media

The owner uploads in Nextcloud, never through the site: `Site/Gallery` (pictures and videos) and `Site/Files`
(anything, any size, subfolders become groups on the page). Nextcloud's chunked uploads stay under Cloudflare's
100 MB request limit, so file size is not limited anywhere.

- **Sync** (`src/lib/media-sync.ts`): at most once a minute (on a page render or `/api/media`), a depth-0 PROPFIND of
  the Team folder; Nextcloud changes the folder's etag whenever anything below it changes, so the full walk runs only
  then. Rows in `MediaItem` follow the files by Nextcloud's file id (renames and moves keep caption and order). The
  admin panel's SYNC runs it at once.
- **Serving** (`src/app/m/[id]/[name]/route.ts`): streams from Nextcloud with Range, ETag and 304 passed through, so
  video seeks and downloads resume; memory does not grow with file size. `Files/` is always a download. `?w=400|1600`
  is a preview from Nextcloud's preview API (images only). Hidden items answer 404, except the one used as the profile
  photo. Every response carries a sandbox CSP.
- **Host:** with `MEDIA_PUBLIC_URL` set, `/m/` answers only on that host (`src/proxy.ts`).
- **Locally:** `docker compose up -d`, then `sh scripts/nextcloud-dev-setup.sh --fixtures` (user `site`, the Team
  folder, sample files) and run the app with the env it prints. CI runs the same setup and `scripts/media-smoke.sh`
  (job `media` in `test.yml`).

