"use client";

import { useState, useEffect } from "react";
import type { ProjectData } from "@/types";
import { cn } from "@/lib/cn";
import { Button, Card, CardHeader, CardTitle, CardSub, CardActions, Input, Textarea, Label, SectionHeader, Tag } from "@/components/ui";
import { fetchJson } from "@/lib/fetch-json";
import a from "./admin.module.css";

type Lang = "en" | "ru" | "sk";

function genId() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36); }

export function ProjectsTab() {
  const [projects, setProjects] = useState<ProjectData[]>([]);
  const [editing, setEditing] = useState<ProjectData | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const data = await fetchJson<ProjectData[]>("/api/projects");
    if (data) setProjects(data);
    setLoading(false);
  }

  // Initial load: `loading` already starts true, state is set only once the response is in.
  useEffect(() => {
    let active = true;
    fetchJson<ProjectData[]>("/api/projects").then((data) => {
      if (!active) return;
      if (data) setProjects(data);
      setLoading(false);
    });
    return () => { active = false; };
  }, []);

  async function del(id: string) {
    if (!confirm("Delete this project?")) return;
    await fetch(`/api/projects/${id}`, { method: "DELETE" });
    load();
  }

  async function save(proj: ProjectData) {
    const isNew = !projects.find((p) => p.id === proj.id);
    await fetch(isNew ? "/api/projects" : `/api/projects/${proj.id}`, {
      method: isNew ? "POST" : "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(proj),
    });
    setEditing(null);
    load();
  }

  if (editing) return <ProjectEditor proj={editing} onSave={save} onCancel={() => setEditing(null)} />;

  return (
    <div>
      <div className={a.tabHeader}>
        <SectionHeader variant="admin">PROJECTS</SectionHeader>
        <Button
          variant="primary"
          onClick={() => setEditing({ id: genId(), name: "", nameRu: "", nameSk: "", desc: "", descRu: "", descSk: "", stack: [], github: "", url: "", order: 0 })}
        >
          + NEW PROJECT
        </Button>
      </div>
      {loading && <div className={a.empty}>Loading...</div>}
      {!loading && !projects.length && <div className={a.empty}>No projects yet.</div>}
      {projects.map((p) => (
        <Card variant="admin" key={p.id}>
          <CardHeader>
            <div>
              <CardTitle>{p.name || "(unnamed)"}</CardTitle>
              <CardSub>{(p.stack || []).join(" · ")}</CardSub>
            </div>
            <CardActions>
              <Button size="sm" onClick={() => setEditing(p)}>EDIT</Button>
              <Button size="sm" variant="danger" onClick={() => del(p.id)}>DEL</Button>
            </CardActions>
          </CardHeader>
        </Card>
      ))}
    </div>
  );
}

function ProjectEditor({ proj, onSave, onCancel }: {
  proj: ProjectData;
  onSave: (p: ProjectData) => void;
  onCancel: () => void;
}) {
  const [nameLang, setNameLang] = useState<Lang>("en");
  const [descLang, setDescLang] = useState<Lang>("en");
  const [name, setName]         = useState(proj.name || "");
  const [nameRu, setNameRu]     = useState(proj.nameRu || "");
  const [nameSk, setNameSk]     = useState(proj.nameSk || "");
  const [desc, setDesc]         = useState(proj.desc || "");
  const [descRu, setDescRu]     = useState(proj.descRu || "");
  const [descSk, setDescSk]     = useState(proj.descSk || "");
  const [stackRaw, setStackRaw] = useState((proj.stack || []).join(", "));
  const [github, setGithub]     = useState(proj.github || "");
  const [url, setUrl]           = useState(proj.url || "");

  const nameValue = nameLang === "ru" ? nameRu : nameLang === "sk" ? nameSk : name;
  const descValue = descLang === "ru" ? descRu : descLang === "sk" ? descSk : desc;

  function setNameValue(v: string) {
    if (nameLang === "ru") setNameRu(v);
    else if (nameLang === "sk") setNameSk(v);
    else setName(v);
  }

  function setDescValue(v: string) {
    if (descLang === "ru") setDescRu(v);
    else if (descLang === "sk") setDescSk(v);
    else setDesc(v);
  }

  function save() {
    onSave({
      ...proj,
      name, nameRu: nameRu || null, nameSk: nameSk || null,
      desc: desc || null, descRu: descRu || null, descSk: descSk || null,
      stack: stackRaw.split(",").map((s) => s.trim()).filter(Boolean),
      github: github || null,
      url: url || null,
    });
  }

  return (
    <div>
      <div className={a.tabHeader}>
        <SectionHeader variant="admin">{proj.name ? "EDIT PROJECT" : "NEW PROJECT"}</SectionHeader>
        <div style={{ display: "flex", gap: 8 }}>
          <Button onClick={onCancel}>CANCEL</Button>
          <Button variant="primary" onClick={save}>SAVE</Button>
        </div>
      </div>

      <Label>PROJECT NAME</Label>
      <div className={a.langTabs}>
        {(["en","ru","sk"] as Lang[]).map((l) => (
          <button key={l} className={cn(a.langTab, nameLang === l && a.active)} onClick={() => setNameLang(l)}>
            {l.toUpperCase()}
          </button>
        ))}
      </div>
      <Input
        style={{ marginTop: 0 }}
        value={nameValue}
        onChange={(e) => setNameValue(e.target.value)}
        placeholder={nameLang === "en" ? "My Awesome Project" : nameLang === "ru" ? "Мой проект" : "Môj projekt"}
      />

      <Label style={{ marginTop: 14 }}>DESCRIPTION</Label>
      <div className={a.langTabs}>
        {(["en","ru","sk"] as Lang[]).map((l) => (
          <button key={l} className={cn(a.langTab, descLang === l && a.active)} onClick={() => setDescLang(l)}>
            {l.toUpperCase()}
          </button>
        ))}
      </div>
      <Textarea
        style={{ marginTop: 0, minHeight: 88 }}
        value={descValue}
        onChange={(e) => setDescValue(e.target.value)}
        placeholder={descLang === "en" ? "Project description..." : descLang === "ru" ? "Описание проекта..." : "Popis projektu..."}
      />

      <Label>STACK (comma separated)</Label>
      <Input value={stackRaw} onChange={(e) => setStackRaw(e.target.value)} placeholder="Docker, Kubernetes, Python" />
      <Label>GITHUB URL</Label>
      <Input value={github} onChange={(e) => setGithub(e.target.value)} placeholder="https://github.com/..." />
      <Label>LIVE URL</Label>
      <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." />
    </div>
  );
}
