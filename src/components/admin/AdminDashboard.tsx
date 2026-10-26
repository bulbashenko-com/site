"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import { PostsTab } from "./PostsTab";
import { ProjectsTab } from "./ProjectsTab";
import { ProfileTab } from "./ProfileTab";
import { CVTab } from "./CVTab";
import { GalleryTab } from "./GalleryTab";
import { SettingsTab } from "./SettingsTab";
import styles from "./AdminDashboard.module.css";

type Tab = "posts" | "projects" | "profile" | "cv" | "gallery" | "settings";

const TABS: [Tab, string][] = [
  ["posts",    "POSTS"],
  ["projects", "PROJECTS"],
  ["profile",  "PROFILE"],
  ["cv",       "CV"],
  ["gallery",  "GALLERY"],
  ["settings", "SETTINGS"],
];

export function AdminDashboard({ accountSettingsUrl }: { accountSettingsUrl: string }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("posts");

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/admin/login");
    router.refresh();
  }

  return (
    <div className={cn(styles.body, "admin-body")}>
      <div className={styles.topbar}>
        <span className={styles.logo}>BULBASHENKO.COM</span>
        <span className={styles.tag}>ADMIN PANEL</span>
      </div>
      <div className={styles.layout}>
        <div className={styles.sidebar}>
          <div className={styles.sidebarLabel}>ADMIN PANEL</div>
          {TABS.map(([k, l]) => (
            <button
              key={k}
              className={cn(styles.tabBtn, tab === k && styles.active)}
              onClick={() => setTab(k)}
            >
              {l}
            </button>
          ))}
          <hr className={styles.divider} />
          <a href="/" className={styles.sidebarLink}>← BACK TO SITE</a>
          <button className={styles.sidebarLink} onClick={logout}>LOGOUT</button>
        </div>
        <div className={styles.content}>
          {tab === "posts"    && <PostsTab />}
          {tab === "projects" && <ProjectsTab />}
          {tab === "profile"  && <ProfileTab />}
          {tab === "cv"       && <CVTab />}
          {tab === "gallery"  && <GalleryTab />}
          {tab === "settings" && <SettingsTab accountSettingsUrl={accountSettingsUrl} />}
        </div>
      </div>
    </div>
  );
}
