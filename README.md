# bulbashenko.com

Personal website and blog of Aleksandr Albekov — live at **[bulbashenko.com](https://bulbashenko.com)**.

A retro terminal-styled single page with a CRT filter and an animated ASCII skull background, plus a small admin panel for editing everything on it.

## Features

- Profile, blog posts (Markdown), projects, gallery (pictures and videos), files for download (any size) and CV in English, Russian and Slovak.
- Admin panel at `/admin`: content editing, captions, order and visibility of media, active session management. Sign-in goes through the single sign-on at `auth.bulbashenko.com` ([bulbashenko/auth](https://github.com/bulbashenko/auth)); members of the `site-admins` group get in.
- ASCII skull background drawn live with WebGL2 in the active palette (`src/components/public/background`); the skull under the pointer glitches. Browsers without WebGL2, or too slow to keep up, get the plain background.
- Dynamic Open Graph image, sitemap and robots.

## Stack

| Layer | Technology |
| --- | --- |
| App | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4 |
| Data | PostgreSQL 17 via Prisma 7 |
| Media | Nextcloud (Team folder `Site`, uploaded there, streamed by the app) |
| Hosting | k3s cluster on Hetzner Cloud, managed by Flux from [bulbashenko-com/infra](https://github.com/bulbashenko-com/infra), behind Cloudflare Tunnel |
| Mail | Stalwart, self-hosted for `@bulbashenko.com` |
| CI/CD | GitHub Actions (checks, images) → GHCR → pin in infra `dev` (staging) → release PR → Flux (production) |

## Local development

Requirements: Node.js 22+ and Docker.

```sh
docker compose up -d postgres            # local Postgres on :5432
cat > .env <<'EOF'
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/bulbashenko
JWT_SECRET=dev-secret-change-me
OIDC_ISSUER=https://auth.bulbashenko.com
OIDC_CLIENT_ID=bulbashenko-site
OIDC_CLIENT_SECRET=<the site's client secret>
EOF
npm install
npm run setup                            # apply prisma/migrations and seed default content
npm run dev                              # http://localhost:3000
```

The `bulbashenko-site` client also accepts `http://localhost:3000/api/auth/oidc/callback`, so local sign-in works against the real provider. To work fully offline, run [bulbashenko/auth](https://github.com/bulbashenko/auth) locally and point `OIDC_ISSUER` at it.

Gallery and files come from a Nextcloud: `docker compose up -d` also starts one, and
`sh scripts/nextcloud-dev-setup.sh --fixtures` prepares it (user `site`, Team folder `Site`, sample files) and prints
the `NEXTCLOUD_*` lines for `.env`. Without them the gallery and files are empty. Details: [docs/deployment.md](docs/deployment.md#media).

## Deployment

Every pull request runs `check` (lint, typecheck, migrations vs schema, audit) and `build`; both must pass to merge into `main`. A merge into `main` builds the images and pins them in infra's `dev` branch: within about ten minutes the change runs on staging (`https://bulbashenko.dev`, mesh only), where a smoke suite (`e2e/`) checks it. Production gets it with the next release PR in infra. The whole flow, timings, rollback and where to watch it are in **[infra docs/workflow.md](https://github.com/bulbashenko-com/infra/blob/dev/docs/workflow.md)**; what concerns only the site (environment, secrets, schema changes) is in **[docs/deployment.md](docs/deployment.md)**.

## License

[MIT](LICENSE)
