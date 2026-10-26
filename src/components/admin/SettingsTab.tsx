"use client";

import { useState, useEffect, useCallback } from "react";
import { Button, Card, CardHeader, CardTitle, CardSub, CardActions, SectionHeader, Badge } from "@/components/ui";
import btn from "@/components/ui/Button.module.css";
import a from "./admin.module.css";


type SessionEntry = {
  id: string;
  createdAt: string;
  lastSeen: string;
  ip: string;
  userAgent: string;
  current: boolean;
};

function parseDevice(ua: string): string {
  if (!ua || ua === "unknown") return "Unknown device";
  if (/iPhone|iPad|iPod/.test(ua)) return "iOS";
  if (/Android/.test(ua)) return "Android";
  if (/Windows/.test(ua)) {
    if (/Edg\//.test(ua)) return "Edge / Windows";
    if (/Chrome/.test(ua)) return "Chrome / Windows";
    if (/Firefox/.test(ua)) return "Firefox / Windows";
    return "Windows";
  }
  if (/Macintosh/.test(ua)) {
    if (/Edg\//.test(ua)) return "Edge / macOS";
    if (/Chrome/.test(ua)) return "Chrome / macOS";
    if (/Firefox/.test(ua)) return "Firefox / macOS";
    if (/Safari/.test(ua)) return "Safari / macOS";
    return "macOS";
  }
  if (/Linux/.test(ua)) {
    if (/Chrome/.test(ua)) return "Chrome / Linux";
    if (/Firefox/.test(ua)) return "Firefox / Linux";
    return "Linux";
  }
  return "Unknown device";
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// Passwords, passkeys and 2FA live in the SSO account (bulbashenko-com/auth), not in this app; the page passes
// its settings URL, derived from OIDC_ISSUER.
export function SettingsTab({ accountSettingsUrl }: { accountSettingsUrl: string }) {
  const [sessions, setSessions]           = useState<SessionEntry[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);

  const loadSessions = useCallback(async () => {
    setSessionsLoading(true);
    const res = await fetch("/api/auth/sessions");
    if (res.ok) setSessions(await res.json());
    setSessionsLoading(false);
  }, []);

  useEffect(() => { loadSessions(); }, [loadSessions]);

  async function revokeSession(id: string) {
    await fetch(`/api/auth/sessions/${id}`, { method: "DELETE" });
    await loadSessions();
  }

  async function revokeOthers() {
    if (!confirm("Log out all other devices?")) return;
    await fetch("/api/auth/sessions", { method: "DELETE" });
    await loadSessions();
  }

  async function exportData() {
    const [profile, posts, projects, gallery, cv] = await Promise.all([
      fetch("/api/profile").then((r) => r.json()),
      fetch("/api/posts?all=1").then((r) => r.json()),
      fetch("/api/projects").then((r) => r.json()),
      fetch("/api/gallery").then((r) => r.json()),
      fetch("/api/cv").then((r) => r.json()),
    ]);
    const blob = new Blob([JSON.stringify({ profile, posts, projects, gallery, cv }, null, 2)], { type: "application/json" });
    const el = document.createElement("a");
    el.href = URL.createObjectURL(blob);
    el.download = "bulbashenko_data.json";
    el.click();
  }

  return (
    <div>
      <SectionHeader variant="admin">SETTINGS</SectionHeader>

      {/* ── SIGN-IN ── */}
      <div className={a.formSection}>
        <div className={a.formSectionTitle}>SIGN-IN</div>
        <div style={{ fontFamily: "var(--fw)", fontSize: 12, color: "var(--g3)", letterSpacing: "1px", marginBottom: 14, lineHeight: 1.7 }}>
          The admin panel uses the bulbashenko.com account. Passkeys, password and 2FA are managed there.
        </div>
        <a href={accountSettingsUrl} target="_blank" rel="noopener noreferrer" className={btn.btn} style={{ textDecoration: "none", display: "inline-block" }}>
          ACCOUNT SETTINGS ↗
        </a>
      </div>

      <hr className={a.separator} />

      {/* ── SESSIONS ── */}
      <div className={a.formSection}>
        <div className={a.formSectionTitle} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>ACTIVE SESSIONS</span>
          {sessions.filter((s) => !s.current).length > 0 && (
            <Button size="sm" variant="danger" onClick={revokeOthers} style={{ fontSize: 11 }}>LOG OUT OTHER DEVICES</Button>
          )}
        </div>
        {sessionsLoading && <div style={{ fontFamily: "var(--fw)", fontSize: 12, color: "var(--g3)", letterSpacing: "1px" }}>Loading...</div>}
        {!sessionsLoading && sessions.length === 0 && <div style={{ fontFamily: "var(--fw)", fontSize: 12, color: "var(--g3)", letterSpacing: "1px" }}>No active sessions.</div>}
        {sessions.map((s) => (
          <Card variant="admin" key={s.id} style={{ marginBottom: 8 }}>
            <CardHeader style={{ alignItems: "center" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                  <CardTitle style={{ fontSize: 13 }}>{parseDevice(s.userAgent)}</CardTitle>
                  {s.current && <Badge variant="published">THIS DEVICE</Badge>}
                </div>
                <CardSub>{s.ip} · Last seen {timeAgo(s.lastSeen)} · Logged in {timeAgo(s.createdAt)}</CardSub>
              </div>
              <CardActions>
                <Button size="sm" variant="danger" onClick={() => revokeSession(s.id)}>
                  {s.current ? "LOG OUT" : "REVOKE"}
                </Button>
              </CardActions>
            </CardHeader>
          </Card>
        ))}
      </div>

      <hr className={a.separator} />

      {/* ── EXPORT ── */}
      <div className={a.formSection}>
        <div className={a.formSectionTitle}>DATA EXPORT</div>
        <Button onClick={exportData}>EXPORT JSON</Button>
      </div>
    </div>
  );
}
