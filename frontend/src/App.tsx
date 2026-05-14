import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuthStore } from "./store/auth";
import { useInactivityTimer } from "./hooks/useInactivityTimer";
import { Login } from "./pages/Login";
import { Dashboard } from "./pages/Dashboard";
import { Incidents } from "./pages/Incidents";
import { Swaps } from "./pages/Swaps";
import { Users } from "./pages/Users";
import { Schedule } from "./pages/Schedule";
import { OnCall } from "./pages/OnCall";
import { Audit } from "./pages/Audit";
import { Consulta } from "./pages/Consulta";
import { ChangePassword } from "./pages/ChangePassword"
import { Profile } from "./pages/Profile";
import { ChecklistConsulta } from "./pages/ChecklistConsulta";
import { ChecklistNovo } from "./pages/ChecklistNovo";

function InactivityGuard({ children }: { children: React.ReactNode }) {
  useInactivityTimer()
  return <>{children}</>
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token);
  if (!token) return <Navigate to="/login" replace />;
  return <InactivityGuard>{children}</InactivityGuard>;
}

const ADMIN_ROLES = ['admin']

function AdminRoute({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token);
  const role = useAuthStore((s) => s.role);
  if (!token) return <Navigate to="/login" replace />;
  if (!ADMIN_ROLES.includes(role || '')) return <Navigate to="/on-call" replace />;
  return <InactivityGuard>{children}</InactivityGuard>;
}


export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/change-password" element={<ProtectedRoute><ChangePassword /></ProtectedRoute>} />
        <Route path="/" element={<AdminRoute><Dashboard /></AdminRoute>} />
        <Route path="/schedule" element={<ProtectedRoute><Schedule /></ProtectedRoute>} />
        <Route path="/on-call" element={<ProtectedRoute><OnCall /></ProtectedRoute>} />
        <Route path="/audit" element={<AdminRoute><Audit /></AdminRoute>} />
        <Route path="/consulta" element={<ProtectedRoute><Consulta /></ProtectedRoute>} />
        <Route path="/incidents" element={<ProtectedRoute><Incidents /></ProtectedRoute>} />
        <Route path="/swaps" element={<ProtectedRoute><Swaps /></ProtectedRoute>} />
        <Route path="/users" element={<AdminRoute><Users /></AdminRoute>} />
        <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
        <Route path="/checklist" element={<ProtectedRoute><ChecklistConsulta /></ProtectedRoute>} />
        <Route path="/checklist/novo" element={<ProtectedRoute><ChecklistNovo /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/on-call" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
