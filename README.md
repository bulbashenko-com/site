# bulbashenko.com

Personal website and blog of Aleksandr Albekov — live at **[bulbashenko.com](https://bulbashenko.com)**.

A retro terminal-styled single page with a CRT filter and an animated ASCII skull background, plus a small admin panel for editing everything on it.

## Features

- Profile, blog posts (Markdown), projects, gallery and CV in English, Russian and Slovak.
- Admin panel at `/admin`: content editing, image uploads, active session management. Sign-in goes through the single sign-on at `auth.bulbashenko.com` ([bulbashenko/auth](https://github.com/bulbashenko/auth)); members of the `site-admins` group get in.
- ASCII skull background drawn live with WebGL2 in the active palette (`src/components/public/background`); the skull under the pointer glitches. Browsers without WebGL2, or too slow to keep up, get a weekly video of the same scene, rendered in GitHub Actions with Playwright and ffmpeg (`scripts/skull-render`).
- Dynamic Open Graph image, sitemap and robots.

## Stack

| Layer | Technology |
| --- | --- |
| App | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4 |
| Data | PostgreSQL 17 via Prisma 7 |
| Media | Garage (S3-compatible object storage) |
| Hosting | k3s cluster on Hetzner Cloud, managed by Flux from [bulbashenko-com/infra](https://github.com/bulbashenko-com/infra), behind Cloudflare Tunnel |
| Mail | Stalwart, self-hosted for `@bulbashenko.com` |
| CI/CD | GitHub Actions → GHCR → deploy PR in infra → Flux |

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
npm run setup                            # create the schema and seed default content
npm run dev                              # http://localhost:3000
```

The `bulbashenko-site` client also accepts `http://localhost:3000/api/auth/oidc/callback`, so local sign-in works against the real provider. To work fully offline, run [bulbashenko/auth](https://github.com/bulbashenko/auth) locally and point `OIDC_ISSUER` at it.

Without the S3 variables, uploads are stored in `public/uploads/`.

## Deployment

Pushing to `main` builds a Docker image in GitHub Actions, pushes it to `ghcr.io/bulbashenko-com/site:<sha>` and opens the deploy PR `deploy/site` in infra; merging it deploys. Environment, secrets, schema changes and the deploy flow are in **[docs/deployment.md](docs/deployment.md)**.

## License

[MIT](LICENSE)
