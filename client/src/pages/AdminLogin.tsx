import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiFetch, setAdminToken } from "../api/client";
import { LegalFooter } from "../layout/LegalLayout";

export default function AdminLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const inputClass =
    "w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20";

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      const data = await apiFetch<{ token: string }>("/api/auth/admin/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      setAdminToken(data.token);
      navigate("/admin");
    } catch (ex: unknown) {
      setErr(ex instanceof Error ? ex.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-950 p-4">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_120%_80%_at_50%_-20%,rgba(16,185,129,0.25),transparent)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_80%_80%,rgba(59,130,246,0.12),transparent)]" />

      <div className="relative w-full max-w-md">
        <div className="rounded-3xl border border-white/10 bg-white/95 p-8 shadow-2xl shadow-black/20 backdrop-blur-xl sm:p-10">
          <div className="text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-600">Console</p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">Admin sign in</h1>
            <p className="mt-1 text-sm text-slate-600">Platform operators only</p>
          </div>

          <form onSubmit={onSubmit} className="mt-8 space-y-5">
            <div>
              <label htmlFor="admin-email" className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
                Email
              </label>
              <input
                id="admin-email"
                type="email"
                required
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={`${inputClass} mt-2`}
              />
            </div>
            <div>
              <label htmlFor="admin-password" className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
                Password
              </label>
              <input
                id="admin-password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`${inputClass} mt-2`}
              />
            </div>
            {err && (
              <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800 ring-1 ring-rose-200/80">
                {err}
              </div>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-slate-900 py-3 text-sm font-semibold text-white shadow-lg shadow-slate-900/25 transition hover:bg-slate-800 disabled:opacity-60"
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <p className="mt-8 text-center text-sm text-slate-600">
            <Link to="/login" className="font-medium text-brand-600 transition hover:text-brand-700">
              Vendor login →
            </Link>
          </p>
          <div className="mt-6 border-t border-slate-100 pt-4">
            <LegalFooter />
          </div>
        </div>
      </div>
    </div>
  );
}
