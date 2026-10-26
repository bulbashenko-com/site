import { getSessionFromRequest } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AdminDashboard } from "@/components/admin/AdminDashboard";

export default async function AdminPage() {
  const authed = await getSessionFromRequest();
  if (!authed) redirect("/admin/login");
  // Passwords, passkeys and 2FA live in the SSO account; its settings page is on the issuer's host
  // (auth.bulbashenko.com in production, auth.bulbashenko.dev in staging).
  const accountSettingsUrl = new URL("/settings", process.env.OIDC_ISSUER ?? "https://auth.bulbashenko.com").toString();
  return <AdminDashboard accountSettingsUrl={accountSettingsUrl} />;
}
