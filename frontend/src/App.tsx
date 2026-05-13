import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuthStore } from "./store/auth";
import { Login } from "./pages/Login";
import { Dashboard } from "./pages/Dashboard";
import { Incidents } from "./pages/Incidents";
import { Swaps } from "./pages/Swaps";
import { Users } from "./pages/Users";
import { Schedule } from "./pages/Schedule";
import { OnCall } from "./pages/OnCall";
import { Audit } from "./pages/Audit";
import { ChangePassword } from "./pages/ChangePassword"
import { Profile } from "./pages/Profile";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token);
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

const ADMIN_ROLES = ['admin']
const MANAGER_ROLES = ['admin', 'gerente', 'supervisao', 'supervisor']

function AdminRoute({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token);
  const role = useAuthStore((s) => s.role);
  if (!token) return <Navigate to="/login" replace />;
  if (!ADMIN_ROLES.includes(role || '')) return <Navigate to="/on-call" replace />;
  return <>{children}</>;
}

function ManagerRoute({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token);
  const role = useAuthStore((s) => s.role);
  if (!token) return <Navigate to="/login" replace />;
  if (!MANAGER_ROLES.includes(role || '')) return <Navigate to="/on-call" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/change-password" element={<ProtectedRoute><ChangePassword /></ProtectedRoute>} />
        <Route path="/" element={<AdminRoute><Dashboard /></AdminRoute>} />
        <Route path="/schedule" element={<ManagerRoute><Schedule /></ManagerRoute>} />
        <Route path="/on-call" element={<ProtectedRoute><OnCall /></ProtectedRoute>} />
        <Route path="/audit" element={<ManagerRoute><Audit /></ManagerRoute>} />
        <Route path="/incidents" element={<ProtectedRoute><Incidents /></ProtectedRoute>} />
        <Route path="/swaps" element={<ProtectedRoute><Swaps /></ProtectedRoute>} />
        <Route path="/users" element={<AdminRoute><Users /></AdminRoute>} />
        <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/on-call" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
