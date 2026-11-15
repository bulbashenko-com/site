import * as oidc from "openid-client";
import { SignJWT, jwtVerify } from "jose";

// Sign-in goes through the SSO provider (Authelia at auth.bulbashenko.com, repo bulbashenko/auth).
// Only members of ADMIN_GROUP may enter the admin panel.
export const ADMIN_GROUP = "site-admins";
export const FLOW_COOKIE_NAME = "bul_oidc_flow";
export const FLOW_COOKIE_PATH = "/api/auth/oidc";
export const FLOW_COOKIE_MAX_AGE = 10 * 60; // seconds to finish signing in at the provider
const SCOPE = "openid profile email groups";

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} env var is not set`);
  return value;
}

// Absolute URL on the public site. Request URLs can't be used: behind the proxy they carry the bind address.
// SITE_URL is read at run time, so one image serves production and staging (bulbashenko.dev); NEXT_PUBLIC_SITE_URL
// cannot do that: Next.js inlines NEXT_PUBLIC_* at build time, server code included, which made staging send
// production's callback URL to its SSO.
export function siteUrl(path: string): URL {
  return new URL(path, process.env.SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000");
}

export function redirectUri(): string {
  return siteUrl("/api/auth/oidc/callback").toString();
}

let configPromise: Promise<oidc.Configuration> | null = null;

// Discovery is cached for the life of the process; a failed attempt is retried on the next request.
function getConfig(): Promise<oidc.Configuration> {
  configPromise ??= oidc
    .discovery(
      new URL(env("OIDC_ISSUER")),
      env("OIDC_CLIENT_ID"),
      undefined,
      oidc.ClientSecretBasic(env("OIDC_CLIENT_SECRET")),
    )
    .catch((err) => {
      configPromise = null;
      throw err;
    });
  return configPromise;
}

type Flow = { verifier: string; state: string; nonce: string };

function flowSecret(): Uint8Array {
  return new TextEncoder().encode(env("JWT_SECRET"));
}

// Starts a login: returns the provider URL and a signed cookie value that carries the PKCE verifier, state and nonce.
export async function beginLogin(): Promise<{ url: URL; flowToken: string }> {
  const config = await getConfig();
  const flow: Flow = {
    verifier: oidc.randomPKCECodeVerifier(),
    state: oidc.randomState(),
    nonce: oidc.randomNonce(),
  };
  const url = oidc.buildAuthorizationUrl(config, {
    redirect_uri: redirectUri(),
    scope: SCOPE,
    code_challenge: await oidc.calculatePKCECodeChallenge(flow.verifier),
    code_challenge_method: "S256",
    state: flow.state,
    nonce: flow.nonce,
  });
  const flowToken = await new SignJWT(flow)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${FLOW_COOKIE_MAX_AGE}s`)
    .sign(flowSecret());
  return { url, flowToken };
}

export type SignedInUser = { subject: string; username: string; groups: string[] };

// Finishes a login from the callback query string. Throws if the response, state, nonce or PKCE check fails.
export async function finishLogin(search: string, flowToken: string): Promise<SignedInUser> {
  const { payload } = await jwtVerify(flowToken, flowSecret(), { algorithms: ["HS256"] });
  const flow = payload as unknown as Flow;
  const config = await getConfig();

  // The callback is checked against the registered redirect URI, not the internal URL the request arrived on.
  const currentUrl = new URL(redirectUri());
  currentUrl.search = search;

  const tokens = await oidc.authorizationCodeGrant(config, currentUrl, {
    pkceCodeVerifier: flow.verifier,
    expectedState: flow.state,
    expectedNonce: flow.nonce,
    idTokenExpected: true,
  });
  const subject = tokens.claims()!.sub;
  const info = await oidc.fetchUserInfo(config, tokens.access_token, subject);
  const groups = Array.isArray(info.groups) ? info.groups.filter((g): g is string => typeof g === "string") : [];
  return { subject, username: info.preferred_username ?? subject, groups };
}
