import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Dashboard from "./pages/Dashboard";
import Customers from "./pages/Customers";
import CustomerForm from "./pages/CustomerForm";
import ImportCsv from "./pages/ImportCsv";
import Campaign from "./pages/Campaign";
import Reminders from "./pages/Reminders";
import AdminLogin from "./pages/AdminLogin";
import AdminLayout from "./layout/AdminLayout";
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminVendors from "./pages/admin/AdminVendors";
import AdminVendorDetail from "./pages/admin/AdminVendorDetail";
import AdminExpiring from "./pages/admin/AdminExpiring";
import AdminTemplates from "./pages/admin/AdminTemplates";
import AppShell from "./layout/AppShell";
import FieldsPage from "./pages/FieldsPage";
import GroupsPage from "./pages/GroupsPage";
import Settings from "./pages/Settings";
import Templates from "./pages/Templates";

function VendorGate() {
  const tok = localStorage.getItem("wa_crm_token");
  if (!tok) return <Navigate to="/login" replace />;
  return <AppShell />;
}

function AdminGate() {
  const tok = localStorage.getItem("wa_crm_admin_token");
  if (!tok) return <Navigate to="/admin/login" replace />;
  return <Outlet />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/admin/login" element={<AdminLogin />} />

      <Route path="/" element={<VendorGate />}>
        <Route index element={<Dashboard />} />
        <Route path="customers" element={<Customers />} />
        <Route path="customers/new" element={<CustomerForm />} />
        <Route path="customers/:id" element={<CustomerForm />} />
        <Route path="import" element={<ImportCsv />} />
        <Route path="fields" element={<FieldsPage />} />
        <Route path="groups" element={<GroupsPage />} />
        <Route path="campaign" element={<Campaign />} />
        <Route path="templates" element={<Templates />} />
        <Route path="reminders" element={<Reminders />} />
        <Route path="settings" element={<Settings />} />
      </Route>

      <Route path="/admin" element={<AdminGate />}>
        <Route element={<AdminLayout />}>
          <Route index element={<AdminDashboard />} />
          <Route path="vendors" element={<AdminVendors />} />
          <Route path="vendors/:id" element={<AdminVendorDetail />} />
          <Route path="expiring" element={<AdminExpiring />} />
          <Route path="templates" element={<AdminTemplates />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
