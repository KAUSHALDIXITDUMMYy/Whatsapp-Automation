import { FormEvent, useEffect, useState } from "react";
import { apiFetch } from "../api/client";

type Me = {
  subscription_tier: string;
  subscription_expires_at: string | null;
  whatsapp_sender: string | null;
  limits: { basic_max_templates: number; template_count: number };
};

export default function Settings() {
  const [me, setMe] = useState<Me | null>(null);
  const [sender, setSender] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    void apiFetch<Me>("/api/profile/me")
      .then((d) => {
        setMe(d);
        setSender(d.whatsapp_sender ?? "");
      })
      .catch((e) => setErr(e instanceof Error ? e.message : "Failed to load"));
  }, []);

  async function saveSender(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    try {
      const d = await apiFetch<{ ok: boolean; whatsapp_sender: string | null }>("/api/profile/me", {
        method: "PATCH",
        body: JSON.stringify({ whatsapp_sender: sender.trim() || "" }),
      });
      setMsg("Saved.");
      setSender(d.whatsapp_sender ?? "");
    } catch (ex: unknown) {
      setErr(ex instanceof Error ? ex.message : "Save failed");
    }
  }

  if (!me && !err) return <p className="text-slate-600">Loading…</p>;

  const pro = me?.subscription_tier === "pro";

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-bold text-slate-900">Account & subscription</h1>
      <p className="text-slate-600 text-sm mt-1">Plan limits and Pro WhatsApp sender.</p>

      {err && <p className="text-red-600 text-sm mt-4">{err}</p>}

      {me && (
        <div className="mt-6 space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm text-sm">
          <div>
            <span className="text-slate-500">Plan</span>
            <div className="font-semibold capitalize text-slate-900">{me.subscription_tier}</div>
          </div>
          <div>
            <span className="text-slate-500">Renewal / expiry</span>
            <div className="text-slate-800">
              {me.subscription_expires_at
                ? new Date(me.subscription_expires_at).toLocaleString()
                : "No expiry set (active)"}
            </div>
          </div>
          <div>
            <span className="text-slate-500">Message templates</span>
            <div className="text-slate-800">
              {me.limits.template_count} saved
              {me.subscription_tier === "basic" && (
                <> (max {me.limits.basic_max_templates} on Basic)</>
              )}
            </div>
          </div>
        </div>
      )}

      {pro ? (
        <form onSubmit={saveSender} className="mt-8 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-5">
          <h2 className="font-semibold text-slate-800">WhatsApp sender (Pro)</h2>
          <p className="text-xs text-slate-600">
            E.164 number approved for WhatsApp on your Twilio account (same account as the platform). Example:{" "}
            <code className="bg-white px-1 rounded border">+14155238886</code>. Messages to customers will show this
            sender instead of the shared platform number.
          </p>
          <input
            value={sender}
            onChange={(e) => setSender(e.target.value)}
            placeholder="+15551234567"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
          />
          {msg && <p className="text-green-700 text-sm">{msg}</p>}
          {err && <p className="text-red-600 text-sm">{err}</p>}
          <button type="submit" className="rounded-lg bg-brand-600 text-white px-4 py-2 text-sm font-medium">
            Save sender
          </button>
        </form>
      ) : (
        <p className="mt-8 text-sm text-slate-600 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          Dedicated WhatsApp sender is available on <strong>Pro</strong>. Contact us to upgrade after payment.
        </p>
      )}
    </div>
  );
}
