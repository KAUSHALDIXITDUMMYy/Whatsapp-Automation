import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiFetch } from "../api/client";

export default function CustomerForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = !id || id === "new";

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [joiningDate, setJoiningDate] = useState("");
  const [rechargeDate, setRechargeDate] = useState<string | null>(null);
  const [tags, setTags] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(!isNew);

  useEffect(() => {
    if (isNew) return;
    let cancelled = false;
    (async () => {
      try {
        const c = await apiFetch<{
          name: string;
          phone: string;
          joining_date: string | null;
          recharge_date: string | null;
          tags: string[];
        }>(`/api/customers/${id}`);
        if (cancelled) return;
        setName(c.name);
        setPhone(c.phone);
        setJoiningDate(c.joining_date?.slice(0, 10) ?? "");
        setRechargeDate(c.recharge_date?.slice(0, 10) ?? null);
        setTags((c.tags ?? []).join(", "));
      } catch (e: unknown) {
        setErr(e instanceof Error ? e.message : "Load failed");
      } finally {
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, isNew]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    const tagList = tags
      .split(/[,;]/)
      .map((t) => t.trim())
      .filter(Boolean);
    const body = {
      name,
      phone,
      joining_date: joiningDate || null,
      tags: tagList,
      custom_fields: {},
    };
    try {
      if (isNew) {
        const r = await apiFetch<{ id: string; recharge_date?: string }>("/api/customers", {
          method: "POST",
          body: JSON.stringify(body),
        });
        if (r.recharge_date) setRechargeDate(r.recharge_date);
      } else {
        await apiFetch(`/api/customers/${id}`, { method: "PATCH", body: JSON.stringify(body) });
      }
      navigate("/customers");
    } catch (ex: unknown) {
      setErr(ex instanceof Error ? ex.message : "Save failed");
    }
  }

  async function markRentPaid() {
    if (!id || isNew) return;
    setErr(null);
    try {
      const r = await apiFetch<{ next_recharge_date: string }>(`/api/customers/${id}/mark-rent-paid`, {
        method: "POST",
      });
      setRechargeDate(r.next_recharge_date);
    } catch (ex: unknown) {
      setErr(ex instanceof Error ? ex.message : "Failed");
    }
  }

  async function remove() {
    if (!id || isNew) return;
    if (!confirm("Delete this subscriber?")) return;
    try {
      await apiFetch(`/api/customers/${id}`, { method: "DELETE" });
      navigate("/customers");
    } catch (ex: unknown) {
      setErr(ex instanceof Error ? ex.message : "Delete failed");
    }
  }

  if (loading) return <p className="text-slate-600">Loading…</p>;

  return (
    <div>
      <Link to="/customers" className="text-sm text-brand-700 hover:underline">
        ← Subscribers
      </Link>
      <h1 className="text-2xl font-bold text-slate-900 mt-4">
        {isNew ? "Add subscriber" : "Edit subscriber"}
      </h1>
      <p className="text-sm text-slate-600 mt-1">Standard fields only — same format as the import sheet.</p>

      <form onSubmit={onSubmit} className="mt-6 max-w-xl space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700">Subscriber name *</label>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">Mobile number *</label>
          <input
            required
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">Joining date *</label>
          <input
            required
            type="date"
            value={joiningDate}
            onChange={(e) => setJoiningDate(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        {rechargeDate && (
          <div className="rounded-lg bg-blue-50 border border-blue-200 px-3 py-2 text-sm text-blue-900">
            Next recharge due: <strong>{rechargeDate}</strong> (from joining date + billing cycle)
          </div>
        )}
        <div>
          <label className="block text-sm font-medium text-slate-700">Tags (optional)</label>
          <input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        {!isNew && (
          <button
            type="button"
            onClick={() => void markRentPaid()}
            className="rounded-lg border border-green-600 text-green-800 px-4 py-2 text-sm font-medium hover:bg-green-50"
          >
            Mark this period&apos;s rent received
          </button>
        )}

        {err && <p className="text-sm text-red-600">{err}</p>}

        <div className="flex gap-3">
          <button type="submit" className="rounded-lg bg-brand-600 text-white px-5 py-2 text-sm font-medium">
            Save
          </button>
          {!isNew && (
            <button
              type="button"
              onClick={() => void remove()}
              className="rounded-lg border border-red-300 text-red-700 px-5 py-2 text-sm"
            >
              Delete
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
