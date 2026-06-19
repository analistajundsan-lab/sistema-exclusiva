import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuthStore } from "./store/auth";
import { useInactivityTimer } from "./hooks/useInactivityTimer";
import { Login } from "./pages/Login";
import { ForgotPassword } from "./pages/ForgotPassword";
import { ResetPassword } from "./pages/ResetPassword";
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
import { Safety } from "./pages/Safety";
import { PublicSafetyChecklist } from "./pages/PublicSafetyChecklist";
import { SSTDashboard } from "./pages/SSTDashboard";
import { SSTSinistros } from "./pages/SSTSinistros";
import { SSTOcorrencias } from "./pages/SSTOcorrencias";
import { SSTLiberacao } from "./pages/SSTLiberacao";
import { SSTSaude } from "./pages/SSTSaude";
import { SSTChecklistView } from "./pages/SSTChecklistView";
import { SSTMobile } from "./pages/SSTMobile";

function InactivityGuard({ children }: { children: React.ReactNode }) {
  useInactivityTimer()
  return <>{children}</>
}

const SST_ROLES = ['admin', 'tecnico_seguranca', 'engenheiro_seguranca']

// Página inicial de cada cargo (para onde redirecionar quando não tem acesso).
const HOME_BY_ROLE: Record<string, string> = {
  admin: '/',
  analista: '/on-call',
  plantonista: '/on-call',
  tecnico_seguranca: '/sst/sinistros',
  engenheiro_seguranca: '/sst',
}

function homeFor(role: string | null, hasFullAccess: boolean): string {
  if (hasFullAccess) return '/'
  return HOME_BY_ROLE[role || ''] || '/on-call'
}

// Só exige token (sem o funil de troca de senha) — usado na própria tela de
// troca de senha para evitar loop de redirecionamento.
function AuthOnlyRoute({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token);
  if (!token) return <Navigate to="/login" replace />;
  return <InactivityGuard>{children}</InactivityGuard>;
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token);
  const mustChange = useAuthStore((s) => s.mustChangePassword);
  if (!token) return <Navigate to="/login" replace />;
  // Senha temporária: enquanto não trocar, todo o app fica bloqueado (funil).
  if (mustChange) return <Navigate to="/change-password" replace />;
  return <InactivityGuard>{children}</InactivityGuard>;
}

// Guard genérico por cargo. Admin/super (hasFullAccess) sempre passa.
function RoleRoute({ allow, children }: { allow: string[]; children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token);
  const role = useAuthStore((s) => s.role);
  const hasFullAccess = useAuthStore((s) => s.hasFullAccess);
  const mustChange = useAuthStore((s) => s.mustChangePassword);
  if (!token) return <Navigate to="/login" replace />;
  if (mustChange) return <Navigate to="/change-password" replace />;
  if (!hasFullAccess && !allow.includes(role || '')) {
    return <Navigate to={homeFor(role, hasFullAccess)} replace />;
  }
  return <InactivityGuard>{children}</InactivityGuard>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  return <RoleRoute allow={['admin']}>{children}</RoleRoute>;
}

// Redireciona para a home do cargo logado (rota raiz curinga / fallback).
function HomeRedirect() {
  const token = useAuthStore((s) => s.token);
  const role = useAuthStore((s) => s.role);
  const hasFullAccess = useAuthStore((s) => s.hasFullAccess);
  const mustChange = useAuthStore((s) => s.mustChangePassword);
  if (!token) return <Navigate to="/login" replace />;
  if (mustChange) return <Navigate to="/change-password" replace />;
  return <Navigate to={homeFor(role, hasFullAccess)} replace />;
}


export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/v/:token" element={<PublicSafetyChecklist />} />
        <Route path="/change-password" element={<AuthOnlyRoute><ChangePassword /></AuthOnlyRoute>} />
        <Route path="/" element={<AdminRoute><Dashboard /></AdminRoute>} />
        {/* ── Operacional ── */}
        <Route path="/on-call" element={<RoleRoute allow={['admin', 'analista', 'plantonista']}><OnCall /></RoleRoute>} />
        <Route path="/incidents" element={<RoleRoute allow={['admin', 'analista', 'plantonista']}><Incidents /></RoleRoute>} />
        <Route path="/schedule" element={<RoleRoute allow={['admin', 'analista', 'plantonista']}><Schedule /></RoleRoute>} />
        <Route path="/consulta" element={<RoleRoute allow={['admin', 'plantonista']}><Consulta /></RoleRoute>} />
        <Route path="/vistoria" element={<RoleRoute allow={['admin', 'analista']}><ChecklistConsulta /></RoleRoute>} />
        <Route path="/vistoria/novo" element={<RoleRoute allow={['admin', 'analista']}><ChecklistNovo /></RoleRoute>} />
        <Route path="/checklist" element={<RoleRoute allow={['admin', 'analista']}><Safety /></RoleRoute>} />
        <Route path="/checklist/novo" element={<Navigate to="/vistoria/novo" replace />} />
        {/* ── SST ── */}
        <Route path="/sst" element={<RoleRoute allow={['admin', 'engenheiro_seguranca']}><SSTDashboard /></RoleRoute>} />
        <Route path="/sst/mobile" element={<RoleRoute allow={SST_ROLES}><SSTMobile /></RoleRoute>} />
        <Route path="/sst/sinistros" element={<RoleRoute allow={SST_ROLES}><SSTSinistros /></RoleRoute>} />
        <Route path="/sst/ocorrencias" element={<RoleRoute allow={SST_ROLES}><SSTOcorrencias /></RoleRoute>} />
        <Route path="/sst/liberacao" element={<RoleRoute allow={SST_ROLES}><SSTLiberacao /></RoleRoute>} />
        <Route path="/sst/saude" element={<RoleRoute allow={SST_ROLES}><SSTSaude /></RoleRoute>} />
        <Route path="/sst/checklist" element={<RoleRoute allow={SST_ROLES}><SSTChecklistView /></RoleRoute>} />
        {/* ── Administração ── */}
        <Route path="/audit" element={<AdminRoute><Audit /></AdminRoute>} />
        <Route path="/users" element={<AdminRoute><Users /></AdminRoute>} />
        {/* ── Comum a qualquer logado ── */}
        <Route path="/swaps" element={<ProtectedRoute><Swaps /></ProtectedRoute>} />
        <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
        <Route path="*" element={<HomeRedirect />} />
      </Routes>
    </BrowserRouter>
  );
}
