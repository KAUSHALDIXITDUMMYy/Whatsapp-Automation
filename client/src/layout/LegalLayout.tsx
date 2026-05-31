import { Link } from "react-router-dom";
import type { ReactNode } from "react";

type LegalLayoutProps = {
  title: string;
  lastUpdated: string;
  children: ReactNode;
};

export default function LegalLayout({ title, lastUpdated, children }: LegalLayoutProps) {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4 sm:px-6">
          <Link to="/login" className="text-lg font-semibold text-slate-900 hover:text-brand-700">
            Cable CRM
          </Link>
          <nav className="flex gap-4 text-sm">
            <Link to="/terms" className="text-slate-600 hover:text-brand-700">
              Terms
            </Link>
            <Link to="/privacy" className="text-slate-600 hover:text-brand-700">
              Privacy
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <h1 className="text-3xl font-bold text-slate-900">{title}</h1>
        <p className="mt-2 text-sm text-slate-500">Last updated: {lastUpdated}</p>
        <article className="mt-8 space-y-6 text-slate-700 [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-slate-900 [&_h3]:mt-4 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-slate-900 [&_p]:leading-relaxed [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5">
          {children}
        </article>
      </main>

      <footer className="border-t border-slate-200 bg-white py-6">
        <LegalFooter />
      </footer>
    </div>
  );
}

export function LegalFooter() {
  return (
    <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-center gap-x-4 gap-y-2 px-4 text-center text-sm text-slate-600">
      <Link to="/terms" className="hover:text-brand-700 hover:underline">
        Terms of Service
      </Link>
      <span className="text-slate-300">·</span>
      <Link to="/privacy" className="hover:text-brand-700 hover:underline">
        Privacy Policy
      </Link>
      <span className="text-slate-300">·</span>
      <Link to="/login" className="hover:text-brand-700 hover:underline">
        Vendor login
      </Link>
    </div>
  );
}
