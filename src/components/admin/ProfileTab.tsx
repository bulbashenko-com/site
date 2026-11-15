"use client";

import { useState, useEffect } from "react";
import type { MediaItemData, ProfileData, SkillCategory } from "@/types";
import { fetchJson } from "@/lib/fetch-json";
import { cn } from "@/lib/cn";
import { Button, Input, Textarea, Label, SectionHeader } from "@/components/ui";
import a from "./admin.module.css";

type Lang = "en" | "ru" | "sk";

export function ProfileTab() {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [saved, setSaved] = useState(false);
  const [bioLang, setBioLang] = useState<Lang>("en");
  const [titleLang, setTitleLang] = useState<Lang>("en");
  const [skillInput, setSkillInput] = useState<Record<number, string>>({});
  const [newCat, setNewCat] = useState("");
  const [pictures, setPictures] = useState<MediaItemData[] | null>(null);

  useEffect(() => {
    fetch("/api/profile").then((r) => r.json()).then(setProfile);
  }, []);

  async function choosePhoto() {
    const list = await fetchJson<{ items: MediaItemData[] }>("/api/media/all");
    setPictures(list?.items.filter((i) => i.section === "GALLERY" && i.kind === "IMAGE") ?? []);
  }

  if (!profile) return <div className={a.empty}>Loading...</div>;

  function upd<K extends keyof ProfileData>(k: K, v: ProfileData[K]) {
    setProfile((p) => p ? { ...p, [k]: v } : p);
  }

  async function save() {
    await fetch("/api/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(profile),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  }

  // The photo is a gallery picture (it may be hidden from the gallery itself); saved at once.
  async function setPhoto(photoMediaId: string | null) {
    const res = await fetch("/api/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...profile, photoMediaId }),
    });
    if (!res.ok) return;
    setProfile(await res.json());
    setPictures(null);
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  }

  const skills = (profile.skills || []) as SkillCategory[];

  function addCat() {
    if (!newCat.trim()) return;
    upd("skills", [...skills, { cat: newCat.trim(), items: [] }]);
    setNewCat("");
  }

  function delCat(i: number) {
    upd("skills", skills.filter((_, j) => j !== i));
  }

  function addItem(ci: number) {
    const v = (skillInput[ci] || "").trim();
    if (!v) return;
    const s = [...skills];
    s[ci] = { ...s[ci], items: [...s[ci].items, v] };
    upd("skills", s);
    setSkillInput((x) => ({ ...x, [ci]: "" }));
  }

  function delItem(ci: number, ii: number) {
    const s = [...skills];
    s[ci] = { ...s[ci], items: s[ci].items.filter((_, j) => j !== ii) };
    upd("skills", s);
  }

  return (
    <div>
      <div className={a.tabHeader}>
        <SectionHeader variant="admin">PROFILE</SectionHeader>
        <Button variant="primary" onClick={save}>{saved ? "SAVED ✓" : "SAVE PROFILE"}</Button>
      </div>

      <div className={a.formSection}>
        <div className={a.formSectionTitle}>PERSONAL INFO</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <Label>FULL NAME</Label>
            <Input value={profile.name || ""} onChange={(e) => upd("name", e.target.value)} />
          </div>
          <div>
            <Label>LOCATION</Label>
            <Input value={profile.location || ""} onChange={(e) => upd("location", e.target.value)} />
          </div>
          <div>
            <Label>BIRTHDAY (YYYY-MM-DD)</Label>
            <Input value={profile.birthday || ""} onChange={(e) => upd("birthday", e.target.value)} />
          </div>
        </div>
      </div>

      <div className={a.formSection}>
        <div className={a.formSectionTitle}>TITLE & BIO</div>
        <div className={a.langTabs}>
          {(["en","ru","sk"] as Lang[]).map((l) => (
            <button key={l} className={cn(a.langTab, titleLang === l && a.active)} onClick={() => setTitleLang(l)}>
              {l.toUpperCase()}
            </button>
          ))}
        </div>
        <Input
          style={{ marginTop: 0 }}
          value={(titleLang === "ru" ? profile.titleRu : titleLang === "sk" ? profile.titleSk : profile.titleEn) || ""}
          onChange={(e) => upd(titleLang === "ru" ? "titleRu" : titleLang === "sk" ? "titleSk" : "titleEn", e.target.value)}
          placeholder="Job title"
        />
        <div className={a.langTabs} style={{ marginTop: 14 }}>
          {(["en","ru","sk"] as Lang[]).map((l) => (
            <button key={l} className={cn(a.langTab, bioLang === l && a.active)} onClick={() => setBioLang(l)}>
              {l.toUpperCase()}
            </button>
          ))}
        </div>
        <Textarea
          style={{ marginTop: 0, minHeight: 80 }}
          value={(bioLang === "ru" ? profile.bioRu : bioLang === "sk" ? profile.bioSk : profile.bioEn) || ""}
          onChange={(e) => upd(bioLang === "ru" ? "bioRu" : bioLang === "sk" ? "bioSk" : "bioEn", e.target.value)}
          placeholder="Short bio..."
        />
      </div>

      <div className={a.formSection}>
        <div className={a.formSectionTitle}>CONTACT LINKS</div>
        <div style={{ marginBottom: 12 }}>
          <Label>EMAIL (несколько — через запятую)</Label>
          <Input
            value={profile.email || ""}
            onChange={(e) => upd("email", e.target.value)}
            placeholder="a@example.com, b@example.com"
          />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {(["github","telegram","linkedin"] as const).map((k) => (
            <div key={k}>
              <Label>{k.toUpperCase()}</Label>
              <Input value={profile[k] || ""} onChange={(e) => upd(k, e.target.value)} />
            </div>
          ))}
        </div>
      </div>

      <div className={a.formSection}>
        <div className={a.formSectionTitle}>PHOTO</div>
        <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
          {profile.photo && (
            <img src={profile.photo} alt="profile" style={{ width: 80, height: 80, objectFit: "cover", border: "1px solid var(--g4)" }} />
          )}
          <div>
            <Button size="sm" onClick={choosePhoto}>CHOOSE FROM GALLERY</Button>
            {profile.photo && (
              <Button size="sm" variant="danger" onClick={() => setPhoto(null)} style={{ marginTop: 8, display: "block" }}>
                REMOVE
              </Button>
            )}
          </div>
        </div>
        {pictures && (
          pictures.length === 0
            ? <div className={a.empty}>No pictures in the gallery yet: upload one to the Gallery folder in Nextcloud (it can stay hidden).</div>
            : <div className={a.galleryGrid}>
                {pictures.map((p) => (
                  <button
                    key={p.id}
                    className={cn(a.galleryItem, p.hidden && a.mediaHidden)}
                    style={{ cursor: "pointer", padding: 0, outline: p.id === profile.photoMediaId ? "2px solid var(--g1)" : undefined }}
                    onClick={() => setPhoto(p.id)}
                    title={p.name}
                  >
                    <img src={p.thumb ?? p.url} alt={p.name} />
                  </button>
                ))}
              </div>
        )}
      </div>

      <div className={a.formSection}>
        <div className={a.formSectionTitle}>SKILLS</div>
        {skills.map((cat, ci) => (
          <div className={a.skillCatBlock} key={ci}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span style={{ fontFamily: "var(--fw)", fontSize: 16, color: "var(--g3)", letterSpacing: "2px" }}>
                {cat.cat.toUpperCase()}
              </span>
              <Button size="sm" variant="danger" onClick={() => delCat(ci)}>DEL CAT</Button>
            </div>
            {cat.items.map((item, ii) => (
              <div className={a.skillItemRow} key={ii}>
                <span>{item}</span>
                <button
                  style={{ background: "none", border: "none", color: "#d06060", cursor: "pointer", fontSize: 14, padding: "0 4px" }}
                  onClick={() => delItem(ci, ii)}
                >×</button>
              </div>
            ))}
            <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
              <Input
                style={{ flex: 1 }}
                value={skillInput[ci] || ""}
                onChange={(e) => setSkillInput((x) => ({ ...x, [ci]: e.target.value }))}
                placeholder="New skill item"
                onKeyDown={(e) => e.key === "Enter" && addItem(ci)}
              />
              <Button size="sm" onClick={() => addItem(ci)}>ADD</Button>
            </div>
          </div>
        ))}
        <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
          <Input
            style={{ flex: 1 }}
            value={newCat}
            onChange={(e) => setNewCat(e.target.value)}
            placeholder="New category name"
            onKeyDown={(e) => e.key === "Enter" && addCat()}
          />
          <Button onClick={addCat}>+ CATEGORY</Button>
        </div>
      </div>
    </div>
  );
}
