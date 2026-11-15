"use client";

import { useState, useEffect } from "react";
import type { PostData } from "@/types";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/cn";
import { Button, Card, CardHeader, CardTitle, CardSub, CardActions, Badge, Input, Textarea, Label, SectionHeader } from "@/components/ui";
import { fetchJson } from "@/lib/fetch-json";
import a from "./admin.module.css";

type Lang = "en" | "ru" | "sk";

const MONTHS = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
const pad = (x: number) => String(x).padStart(2, "0");
function fmtDate(s: string) {
  if (!s) return "";
  const d = new Date(s + "T12:00:00");
  return `${pad(d.getDate())} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}
function genId() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36); }

export function PostsTab() {
  const [posts, setPosts] = useState<PostData[]>([]);
  const [editing, setEditing] = useState<PostData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const id = setInterval(() => {
      fetch("/api/auth/keepalive").catch(() => undefined);
    }, 30 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  async function load() {
    setLoading(true);
    const data = await fetchJson<PostData[]>("/api/posts?all=1");
    if (data) setPosts(data);
    setLoading(false);
  }

  // Initial load: `loading` already starts true, state is set only once the response is in.
  useEffect(() => {
    let active = true;
    fetchJson<PostData[]>("/api/posts?all=1").then((data) => {
      if (!active) return;
      if (data) setPosts(data);
      setLoading(false);
    });
    return () => { active = false; };
  }, []);

  async function deletePost(id: string) {
    if (!confirm("Delete this post?")) return;
    await fetch(`/api/posts/${id}`, { method: "DELETE" });
    load();
  }

  async function savePost(post: PostData) {
    const isNew = !posts.find((p) => p.id === post.id);
    await fetch(isNew ? "/api/posts" : `/api/posts/${post.id}`, {
      method: isNew ? "POST" : "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(post),
    });
    setEditing(null);
    load();
  }

  if (editing !== null) {
    return <PostEditor post={editing} onSave={savePost} onCancel={() => setEditing(null)} />;
  }

  const sorted = [...posts].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <div>
      <div className={a.tabHeader}>
        <SectionHeader variant="admin">POSTS</SectionHeader>
        <Button
          variant="primary"
          onClick={() => setEditing({
            id: genId(), title: "", titleRu: "", titleSk: "",
            content: "", contentRu: "", contentSk: "",
            date: new Date().toISOString().slice(0, 10),
            tags: [], published: false, createdAt: "", updatedAt: "",
          })}
        >
          + NEW POST
        </Button>
      </div>
      {loading && <div className={a.empty}>Loading...</div>}
      {!loading && !sorted.length && <div className={a.empty}>No posts yet. Create your first post.</div>}
      {sorted.map((p) => (
        <Card variant="admin" key={p.id}>
          <CardHeader>
            <div>
              <CardTitle>{p.title || "(untitled)"}</CardTitle>
              <CardSub>
                {fmtDate(p.date)}&nbsp;
                <Badge variant={p.published ? "published" : "default"}>
                  {p.published ? "PUBLISHED" : "DRAFT"}
                </Badge>
                {(p.tags || []).map((t) => <Badge key={t} style={{ marginLeft: 4 }}>{t}</Badge>)}
                {(p.titleRu || p.contentRu) && <Badge style={{ marginLeft: 4 }}>RU</Badge>}
                {(p.titleSk || p.contentSk) && <Badge style={{ marginLeft: 4 }}>SK</Badge>}
              </CardSub>
            </div>
            <CardActions>
              <Button size="sm" onClick={() => setEditing(p)}>EDIT</Button>
              <Button size="sm" variant="danger" onClick={() => deletePost(p.id)}>DEL</Button>
            </CardActions>
          </CardHeader>
        </Card>
      ))}
    </div>
  );
}

// ── POST EDITOR ────────────────────────────────────────────────────────────

function PostEditor({ post, onSave, onCancel }: {
  post: PostData;
  onSave: (p: PostData) => void;
  onCancel: () => void;
}) {
  const [title, setTitle]         = useState(post.title);
  const [titleRu, setTitleRu]     = useState(post.titleRu || "");
  const [titleSk, setTitleSk]     = useState(post.titleSk || "");
  const [content, setContent]     = useState(post.content);
  const [contentRu, setContentRu] = useState(post.contentRu || "");
  const [contentSk, setContentSk] = useState(post.contentSk || "");
  const [date, setDate]           = useState(post.date);
  const [tags, setTags]           = useState((post.tags || []).join(", "));
  const [published, setPublished] = useState(post.published);
  const [langTab, setLangTab]     = useState<Lang>("en");
  const [viewTab, setViewTab]     = useState<"edit" | "preview">("edit");

  const currentTitle   = langTab === "ru" ? titleRu   : langTab === "sk" ? titleSk   : title;
  const currentContent = langTab === "ru" ? contentRu : langTab === "sk" ? contentSk : content;

  function setCurrentTitle(v: string) {
    if (langTab === "ru") setTitleRu(v);
    else if (langTab === "sk") setTitleSk(v);
    else setTitle(v);
  }

  function setCurrentContent(v: string) {
    if (langTab === "ru") setContentRu(v);
    else if (langTab === "sk") setContentSk(v);
    else setContent(v);
  }

  function save() {
    onSave({
      ...post,
      title, titleRu: titleRu || null, titleSk: titleSk || null,
      content, contentRu: contentRu || null, contentSk: contentSk || null,
      date,
      tags: tags.split(",").map((s) => s.trim()).filter(Boolean),
      published,
    });
  }

  return (
    <div>
      <div className={a.tabHeader}>
        <SectionHeader variant="admin">{post.title ? "EDIT POST" : "NEW POST"}</SectionHeader>
        <div style={{ display: "flex", gap: 8 }}>
          <Button onClick={onCancel}>CANCEL</Button>
          <Button variant="primary" onClick={save}>SAVE POST</Button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 160px 1fr auto", gap: 12, alignItems: "end", marginBottom: 14 }}>
        <div>
          <Label>TITLE (EN)</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Post title" />
        </div>
        <div>
          <Label>DATE</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <Label>TAGS (comma sep.)</Label>
          <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="devops, linux" />
        </div>
        <div>
          <label
            className={a.publishedLabel}
            style={{ color: published ? "var(--g1)" : "var(--g3)" }}
          >
            <input type="checkbox" checked={published} onChange={(e) => setPublished(e.target.checked)} />
            PUBLISHED
          </label>
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div className={a.langTabs} style={{ marginTop: 0 }}>
          {(["en","ru","sk"] as Lang[]).map((l) => (
            <button key={l} className={cn(a.langTab, langTab === l && a.active)} onClick={() => setLangTab(l)}>
              {l.toUpperCase()}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {(["edit","preview"] as const).map((k) => (
            <button key={k} className={cn(a.langTab, viewTab === k && a.active)} onClick={() => setViewTab(k)}>
              {k.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {langTab !== "en" && (
        <div style={{ marginTop: 6 }}>
          <Label>TITLE ({langTab.toUpperCase()})</Label>
          <Input
            value={currentTitle}
            onChange={(e) => setCurrentTitle(e.target.value)}
            placeholder={`Title in ${langTab.toUpperCase()} (leave empty to fall back to EN)`}
          />
        </div>
      )}

      {viewTab === "edit" ? (
        <Textarea
          value={currentContent}
          onChange={(e) => setCurrentContent(e.target.value)}
          style={{ minHeight: 420, marginTop: 6 }}
          placeholder={
            langTab === "en"
              ? "Write your post in Markdown..."
              : `Content in ${langTab.toUpperCase()} — leave empty to show EN version`
          }
        />
      ) : (
        <div className={a.editorPreview} style={{ minHeight: 420, border: "1px solid var(--g4)", marginTop: 6 }}>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {currentContent || (langTab !== "en" ? content : "*No content yet*")}
          </ReactMarkdown>
        </div>
      )}
    </div>
  );
}
