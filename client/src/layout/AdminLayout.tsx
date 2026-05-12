import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { setAdminToken } from "../api/client";
import { AdminShellBg } from "../pages/admin/shared";

const links = [
  { to: "/admin", label: "Dashboard" },
  { to: "/admin/vendors", label: "Vendors" },
  { to: "/admin/expiring", label: "Expiring" },
  { to: "/admin/templates", label: "Templates" },
];

export default function AdminLayout() {
  const navigate = useNavigate();

  function logout() {
    setAdminToken(null);
    navigate("/admin/login");
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-white to-emerald-50/40">
      <AdminShellBg />
      <div className="relative flex min-h-screen">
        <aside className="hidden w-56 shrink-0 flex-col border-r border-slate-200/80 bg-white/80 py-6 backdrop-blur-md lg:flex xl:w-64">
          <div className="px-4 pb-6">
            <p className="text-xs font-semibold uppercase tracking-widest text-brand-600">Console</p>
            <p className="mt-1 font-semibold text-slate-900">Admin</p>
          </div>
          <nav className="flex flex-col gap-1 px-3">
            {links.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/admin"}
                className={({ isActive }) =>
                  `rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                    isActive ? "bg-brand-50 text-brand-800 ring-1 ring-brand-100" : "text-slate-600 hover:bg-slate-50"
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="mt-auto border-t border-slate-100 px-3 pt-4">
            <button
              type="button"
              onClick={logout}
              className="w-full rounded-xl px-3 py-2.5 text-left text-sm font-medium text-slate-600 hover:bg-rose-50 hover:text-rose-800"
            >
              Log out
            </button>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-200/80 bg-white/90 px-4 py-3 backdrop-blur lg:hidden">
            <span className="text-sm font-semibold text-slate-900">Admin</span>
            <button type="button" onClick={logout} className="text-sm font-medium text-slate-600 hover:text-rose-700">
              Log out
            </button>
          </header>
          <div className="flex gap-1 overflow-x-auto border-b border-slate-200/60 bg-white/60 px-3 py-2 lg:hidden">
            {links.map((item) => (
              <NavLink
                key={`m-${item.to}`}
                to={item.to}
                end={item.to === "/admin"}
                className={({ isActive }) =>
                  `shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${
                    isActive ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-700"
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </div>

          <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:py-10">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}
