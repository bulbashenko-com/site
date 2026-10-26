# Deployment

Production runs in the k3s cluster `hel1`, managed by Flux from [bulbashenko-com/infra](https://github.com/bulbashenko-com/infra). This repo builds the image; infra decides which image runs. Cluster-wide topics (nodes, mesh, backups, monitoring, labels) are in the infra README. This page covers only what concerns the site.

## Overview

| Piece | Where |
| --- | --- |
| App | Deployment `site` in namespace `site` (`infra/apps/production/site/site.yaml`), Next.js standalone on port 3000, 1 replica, read-only root filesystem |
| Public traffic | Cloudflare → Cloudflare Tunnel → Traefik (entry point `web`) → Service `site`. `www.` redirects to the apex (Middleware `www-to-apex`) |
| Image | `ghcr.io/bulbashenko-com/site:<commit sha>`, built by `.github/workflows/deploy.yml` |
| Database | CloudNativePG cluster `pg` in namespace `data` (`pg-rw.data.svc`), database and role of the site. WAL archiving, daily base backups and the off-site copy are set up in infra |
| Media | Garage in namespace `data`, bucket `media`, served publicly at `https://media.bulbashenko.com`. The app writes through `http://garage.data.svc.cluster.local:3900` |
| Admin sign-in | Ory Hydra at `https://auth.bulbashenko.com`, client `bulbashenko-site` (defined in [bulbashenko-com/auth](https://github.com/bulbashenko-com/auth), group `site-admins`) |
| DNS / CDN | Cloudflare zone `bulbashenko.com`, records in `infra/terraform/dns.tf` (OpenTofu) |

## Deploying

```
push to main ─► deploy.yml: build + push ghcr.io/bulbashenko-com/site:<sha>
             └► promote job ─► infra opens/updates PR deploy/site (pins newTag = <sha>)
                                └► owner merges ─► Flux rolls the Deployment
```

- Merging the `deploy/site` PR is the deploy, closing it skips the commit. A newer push updates the same PR.
- By hand, from infra: `just promote site [sha]`.
- Roll back: promote the older sha (or revert the deploy commit in infra).
- `:latest` is pushed too but is not what production runs; the tag in `infra/apps/production/site/kustomization.yaml` is.

## Environment

Plain values are in `site.yaml`:

| Variable | Value |
| --- | --- |
| `S3_ENDPOINT` | `http://garage.data.svc.cluster.local:3900` |
| `S3_BUCKET` | `media` |
| `MEDIA_PUBLIC_URL` | `https://media.bulbashenko.com` |
| `SKULL_MANIFEST_URL` | `https://media.bulbashenko.com/skull/current.json` |
| `NEXT_PUBLIC_SITE_URL` | `https://bulbashenko.com` |
| `OIDC_ISSUER`, `OIDC_CLIENT_ID` | `https://auth.bulbashenko.com`, `bulbashenko-site` |

Secrets are in the Secret `site` (`infra/apps/production/site/secret.sops.yaml`, edit with `sops`):

| Key | Notes |
| --- | --- |
| `DATABASE_URL` | `postgresql://…@pg-rw.data.svc.cluster.local:5432/…?sslmode=verify-full&sslrootcert=/etc/internal-ca/ca.crt`. The server certificate comes from the cluster's internal CA; trust-manager puts that CA into every namespace as ConfigMap `internal-ca`, and the pod mounts it at `/etc/internal-ca` |
| `JWT_SECRET` | Signs the admin session cookie and the short-lived sign-in flow cookie |
| `OIDC_CLIENT_SECRET` | Same value as `OIDC_SITE_CLIENT_SECRET` in the auth Secret |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | Garage key limited to the `media` bucket |

Env from a Secret is read only at pod start. After changing the Secret, bump the annotation `bulbashenko.com/secret-revision` in `site.yaml` in the same PR so the pod restarts.

`NEXT_PUBLIC_SITE_URL` and `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` are also inlined at build time from GitHub repository variables (Docker build args).

## GitHub configuration

- `deploy.yml` pushes to GHCR with `GITHUB_TOKEN`; the `promote` job calls `bulbashenko-com/infra/.github/workflows/request-promote.yml` with the inherited secrets.
- `skull-background.yml` (weekly fallback render of the background into the `media` bucket) uses secrets `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` (Garage key `ci-skull`, `media` only) and variables `S3_ENDPOINT` (public `https://s3.bulbashenko.com`), `S3_BUCKET`, `MEDIA_PUBLIC_URL`.
- Variables for the build: `NEXT_PUBLIC_SITE_URL`, optionally `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION`.
- The GHCR package is public, so the cluster pulls it without credentials.

## Schema changes

The project uses `prisma db push` and has no migration files. Postgres is reachable only inside the cluster, so the owner runs the push through a port-forward (the AI's read-only kubeconfig cannot port-forward):

```sh
kubectl -n data get configmap internal-ca -o jsonpath='{.data.ca\.crt}' > /tmp/internal-ca.crt
kubectl -n data port-forward svc/pg-rw 55434:5432
# verify-ca: through the port-forward the host is localhost, which is not in the certificate.
DATABASE_URL='postgresql://<site role>:<password>@localhost:55434/<db>?sslmode=verify-ca&sslrootcert=/tmp/internal-ca.crt' npx prisma db push
```

Push the schema before merging the deploy PR whose code needs it.

## Local production check

```sh
docker build -t bulbashenko .
docker compose up -d postgres
docker run --rm --network host -e DATABASE_URL=postgresql://postgres:postgres@localhost:5432/bulbashenko -e JWT_SECRET=dev bulbashenko
```
