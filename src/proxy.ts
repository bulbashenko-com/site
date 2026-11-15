import { NextRequest, NextResponse } from "next/server";
import { jwtVerify, SignJWT } from "jose";
import { prisma } from "@/lib/db";

const COOKIE_NAME = "bul_session";
const JWT_ALG = "HS256";
const SESSION_MAX_AGE = 60 * 60; // 1 hour in seconds
const LAST_SEEN_UPDATE_INTERVAL = 5 * 60 * 1000; // update DB at most every 5 min

function getSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET env var is not set");
  return new TextEncoder().encode(secret);
}

async function isAuthenticated(req: NextRequest): Promise<string | null> {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret(), { algorithms: [JWT_ALG] });
    const sid = typeof payload.sid === "string" ? payload.sid : null;
    if (!sid) return null;

    // Verify session is still active in DB (allows immediate remote logout)
    const session = await prisma.session.findUnique({ where: { id: sid }, select: { id: true, lastSeen: true } });
    if (!session) return null;

    return sid;
  } catch {
    return null;
  }
}

async function refreshSession(sid: string, res: NextResponse): Promise<void> {
  const newToken = await new SignJWT({ admin: true, sid })
    .setProtectedHeader({ alg: JWT_ALG })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(getSecret());

  res.cookies.set(COOKIE_NAME, newToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });

  // Throttle lastSeen writes to avoid a DB hit on every single request
  await prisma.session.updateMany({
    where: {
      id: sid,
      lastSeen: { lt: new Date(Date.now() - LAST_SEEN_UPDATE_INTERVAL) },
    },
    data: { lastSeen: new Date() },
  });
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/admin/login")) {
    const sid = await isAuthenticated(req);
    if (sid) return NextResponse.redirect(new URL("/admin", req.url));
    return NextResponse.next();
  }

  if (pathname.startsWith("/admin")) {
    const sid = await isAuthenticated(req);
    if (!sid) return NextResponse.redirect(new URL("/admin/login", req.url));
    const res = NextResponse.next();
    await refreshSession(sid, res);
    return res;
  }

  if (pathname.startsWith("/api/")) {
    const isAuthEndpoint =
      pathname === "/api/auth/oidc/login" ||
      pathname === "/api/auth/oidc/callback";
    // Probes and the staging smoke test: says whether the database answers and which build runs, nothing else.
    const isHealth = pathname === "/api/health";

    const isPublicGet =
      req.method === "GET" &&
      (pathname.startsWith("/api/posts") ||
        pathname.startsWith("/api/projects") ||
        pathname.startsWith("/api/profile") ||
        pathname.startsWith("/api/cv") ||
        pathname.startsWith("/api/gallery"));

    if (!isAuthEndpoint && !isPublicGet && !isHealth) {
      const sid = await isAuthenticated(req);
      if (!sid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      const res = NextResponse.next();
      await refreshSession(sid, res);
      return res;
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/api/:path*"],
};
