import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { setToken } from "../api/client";

const nav = [
  { to: "/", label: "Dashboard", end: true },
  { to: "/customers", label: "Customers" },
  { to: "/import", label: "Import CSV" },
  { to: "/fields", label: "Custom fields" },
  { to: "/groups", label: "Groups" },
  { to: "/campaign", label: "Send messages" },
  { to: "/templates", label: "Templates" },
  { to: "/reminders", label: "Reminders" },
  { to: "/settings", label: "Account" },
];

export default function AppShell() {
  const navigate = useNavigate();

  function logout() {
    setToken(null);
    navigate("/login");
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      <aside className="bg-slate-900 text-white md:w-56 shrink-0">
        <div className="p-4 border-b border-slate-700">
          <div className="text-lg font-semibold tracking-tight">WhatsApp CRM</div>
          <p className="text-xs text-slate-400 mt-1">Reminders & messaging</p>
        </div>
        <nav className="p-2 flex md:flex-col gap-1 overflow-x-auto md:overflow-visible">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap ${
                  isActive ? "bg-brand-600 text-white" : "text-slate-300 hover:bg-slate-800"
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto p-3 hidden md:block">
          <button
            type="button"
            onClick={logout}
            className="w-full rounded-lg border border-slate-600 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800"
          >
            Log out
          </button>
        </div>
      </aside>
      <main className="flex-1 p-4 md:p-8 max-w-6xl w-full mx-auto">
        <Outlet />
      </main>
    </div>
  );
}
