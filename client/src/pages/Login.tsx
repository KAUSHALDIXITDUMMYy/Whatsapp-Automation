import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiFetch, setToken } from "../api/client";
import { LegalFooter } from "../layout/LegalLayout";

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      const data = await apiFetch<{ token: string }>("/api/auth/vendor/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      setToken(data.token);
      navigate("/");
    } catch (ex: unknown) {
      setErr(ex instanceof Error ? ex.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-brand-50 to-slate-100">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-200 p-8">
        <h1 className="text-2xl font-bold text-slate-900">Vendor login</h1>
        <p className="text-sm text-slate-600 mt-1">Business accounts only — sign in with the email you used at signup.</p>
        <p className="mt-3 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-900">
          <strong>Platform admin?</strong> Do not use this form. Open{" "}
          <Link to="/admin/login" className="font-semibold text-amber-950 underline">
            Admin login
          </Link>{" "}
          instead (different account database).
        </p>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 outline-none"
            />
          </div>
          {err && <p className="text-sm text-red-600">{err}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-brand-600 text-white py-2.5 font-medium hover:bg-brand-700 disabled:opacity-60"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-slate-600">
          New business?{" "}
          <Link to="/signup" className="text-brand-700 font-medium hover:underline">
            Create account
          </Link>
        </p>
        <p className="mt-2 text-center text-xs text-slate-500">
          <Link to="/admin/login" className="text-brand-700 font-medium hover:underline">
            Admin login (separate page)
          </Link>
        </p>
        <div className="mt-6 pt-4 border-t border-slate-100">
          <LegalFooter />
        </div>
      </div>
    </div>
  );
}
