import { FormEvent, useEffect, useState } from "react";
import { apiFetch } from "../api/client";

type Group = {
  id: string;
  name: string;
  filters: { tags?: string[]; tag_mode?: string; custom_fields?: Record<string, string> };
};

export default function GroupsPage() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [name, setName] = useState("");
  const [tags, setTags] = useState("");
  const [cfKey, setCfKey] = useState("");
  const [cfVal, setCfVal] = useState("");
  const [preview, setPreview] = useState<Record<string, number>>({});
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    const d = await apiFetch<{ groups: Group[] }>("/api/groups");
    setGroups(d.groups);
  }

  useEffect(() => {
    void load().catch((e) => setErr(e instanceof Error ? e.message : "Failed"));
  }, []);

  async function add(e: FormEvent) {
    e.preventDefault();
    const filters: Group["filters"] = {};
    const tagList = tags
      .split(/[,;]/)
      .map((t) => t.trim())
      .filter(Boolean);
    if (tagList.length) {
      filters.tags = tagList;
      filters.tag_mode = "any";
    }
    if (cfKey.trim() && cfVal.trim()) filters.custom_fields = { [cfKey.trim()]: cfVal.trim() };
    try {
      await apiFetch("/api/groups", {
        method: "POST",
        body: JSON.stringify({ name, filters }),
      });
      setName("");
      setTags("");
      setCfKey("");
      setCfVal("");
      await load();
    } catch (ex: unknown) {
      setErr(ex instanceof Error ? ex.message : "Save failed");
    }
  }

  async function previewCount(id: string) {
    try {
      const d = await apiFetch<{ count: number }>(`/api/groups/${id}/preview`);
      setPreview((p) => ({ ...p, [id]: d.count }));
    } catch {
      /* ignore */
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this group?")) return;
    await apiFetch(`/api/groups/${id}`, { method: "DELETE" });
    await load();
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Dynamic groups</h1>
      <p className="text-slate-600 text-sm mt-1">
        Saved filter presets for campaigns. Tags match any listed tag; optional exact custom field match.
      </p>

      <form onSubmit={add} className="mt-6 max-w-xl space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="font-semibold text-slate-800">New group</h2>
        <div>
          <label className="block text-xs font-medium text-slate-600">Name</label>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600">Tags (comma-separated, match any)</label>
          <input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs font-medium text-slate-600">Custom field key</label>
            <input value={cfKey} onChange={(e) => setCfKey(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600">Value</label>
            <input value={cfVal} onChange={(e) => setCfVal(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
        </div>
        {err && <p className="text-sm text-red-600">{err}</p>}
        <button type="submit" className="rounded-lg bg-brand-600 text-white px-4 py-2 text-sm font-medium">
          Save group
        </button>
      </form>

      <div className="mt-8 space-y-3">
        {groups.map((g) => (
          <div key={g.id} className="rounded-xl border border-slate-200 bg-white p-4 flex flex-wrap justify-between gap-3">
            <div>
              <div className="font-semibold">{g.name}</div>
              <pre className="text-xs text-slate-600 mt-2 whitespace-pre-wrap">{JSON.stringify(g.filters, null, 2)}</pre>
              {preview[g.id] != null && (
                <p className="text-xs text-brand-700 mt-2">Matching customers: {preview[g.id]}</p>
              )}
            </div>
            <div className="flex gap-2 items-start">
              <button
                type="button"
                className="text-sm text-brand-700 hover:underline"
                onClick={() => void previewCount(g.id)}
              >
                Preview count
              </button>
              <button type="button" className="text-sm text-red-600 hover:underline" onClick={() => void remove(g.id)}>
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
