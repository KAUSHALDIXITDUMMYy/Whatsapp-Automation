import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiFetch, setToken } from "../api/client";
import { LegalFooter } from "../layout/LegalLayout";

export default function Signup() {
  const navigate = useNavigate();
  const [company_name, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      const data = await apiFetch<{ token: string }>("/api/auth/vendor/register", {
        method: "POST",
        body: JSON.stringify({ company_name, email, password }),
      });
      setToken(data.token);
      navigate("/");
    } catch (ex: unknown) {
      setErr(ex instanceof Error ? ex.message : "Signup failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-brand-50 to-slate-100">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-200 p-8">
        <h1 className="text-2xl font-bold text-slate-900">Create vendor account</h1>
        <p className="text-sm text-slate-600 mt-1">Start managing customers on WhatsApp</p>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700">Business name</label>
            <input
              required
              value={company_name}
              onChange={(e) => setCompany(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Password (min 8)</label>
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 outline-none"
            />
          </div>
          {err && <p className="text-sm text-red-600">{err}</p>}
          <p className="text-xs text-slate-500 leading-relaxed">
            By creating an account, you agree to our{" "}
            <Link to="/terms" className="text-brand-700 hover:underline">
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link to="/privacy" className="text-brand-700 hover:underline">
              Privacy Policy
            </Link>
            .
          </p>
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-brand-600 text-white py-2.5 font-medium hover:bg-brand-700 disabled:opacity-60"
          >
            {loading ? "Creating…" : "Create account"}
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-slate-600">
          Already have an account?{" "}
          <Link to="/login" className="text-brand-700 font-medium hover:underline">
            Sign in
          </Link>
        </p>
        <div className="mt-6 pt-4 border-t border-slate-100">
          <LegalFooter />
        </div>
      </div>
    </div>
  );
}
