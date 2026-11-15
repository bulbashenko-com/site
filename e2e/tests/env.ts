// Where the suite runs. Defaults match staging (bulbashenko.dev, the auth-staging namespace's admin APIs).
const env = (name: string, fallback: string) => process.env[name] || fallback

export const DOMAIN = env("E2E_DOMAIN", "bulbashenko.dev")
/** Where DOMAIN and *.DOMAIN are served: the browser connects here (Traefik's in-cluster Service). */
export const EDGE = env("E2E_EDGE", "traefik.kube-system.svc.cluster.local")
export const KRATOS_ADMIN = env("E2E_KRATOS_ADMIN", "http://kratos:4434")
export const KETO_WRITE = env("E2E_KETO_WRITE", "http://keto:4467")
export const MEDIA = env("E2E_MEDIA_URL", `https://media.${DOMAIN}`)
/** The commit this suite was built from (image build arg); the site must report the same in /api/health. */
export const REVISION = env("E2E_REVISION", "")

/** The site under test (a local run can point this at http://localhost:3000). */
export const SITE = env("E2E_SITE", `https://${DOMAIN}`)
export const AUTH = `https://auth.${DOMAIN}`
