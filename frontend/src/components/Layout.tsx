import { ReactNode, useState, useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, ClipboardCheck, AlertTriangle,
  Calendar, Shield, Users, LogOut, Sun, Moon,
  User, ChevronRight, Bus, Search, ClipboardList, Download, type LucideIcon,
} from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useAuthStore } from '../store/auth'
import { useThemeStore } from '../store/theme'

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  roles?: string[]
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, roles: ['admin'] },
  { to: '/on-call', label: 'Confirmação', icon: ClipboardCheck },
  { to: '/incidents', label: 'Ocorrências', icon: AlertTriangle },
  { to: '/schedule', label: 'Escala', icon: Calendar, roles: ['admin', 'gerente', 'supervisao', 'supervisor', 'plantonista', 'analista'] },
  { to: '/consulta', label: 'Consulta', icon: Search },
  { to: '/vistoria', label: 'Vistoria', icon: ClipboardList, roles: ['admin', 'analista'] },
  { to: '/checklist', label: 'Check-list ST', icon: ClipboardCheck, roles: ['admin', 'gerente', 'supervisao', 'tecnico_seguranca'] },
  { to: '/audit', label: 'Auditoria', icon: Shield, roles: ['admin'] },
  { to: '/users', label: 'Usuários', icon: Users, roles: ['admin'] },
]

export function Layout({ children }: { children: ReactNode }) {
  const { logout, role } = useAuth()
  const { userName, displayName, photoUrl, hasFullAccess } = useAuthStore()
  const { dark, toggle } = useThemeStore()
  const navigate = useNavigate()
  const location = useLocation()

  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(false)

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault()
      setInstallPrompt(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', handler)
    window.addEventListener('appinstalled', () => setInstalled(true))
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const handleInstall = async () => {
    if (!installPrompt) return
    installPrompt.prompt()
    const { outcome } = await installPrompt.userChoice
    if (outcome === 'accepted') setInstallPrompt(null)
  }

  const handleLogout = () => { logout(); navigate('/login') }

  const displayLabel = displayName || userName || ''
  const initials = displayLabel
    .split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2) || '?'

  const visibleNav = NAV_ITEMS.filter(item =>
    hasFullAccess || !item.roles || item.roles.includes(role || '')
  )

  const isActive = (to: string) =>
    to === '/' ? location.pathname === '/' : location.pathname.startsWith(to)

  const roleLabel: Record<string, string> = {
    admin: 'Administrador', gerente: 'Gerente', supervisao: 'Supervisão',
    analista: 'Analista', plantonista: 'Plantonista',
    tecnico_seguranca: 'Seguranca do Trabalho',
    supervisor: 'Supervisor', operator: 'Operador',
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex">

      {/* ── Sidebar (desktop) ── */}
      <aside className="hidden md:flex md:flex-col md:w-60 md:fixed md:inset-y-0 md:z-30">
        <div className="flex flex-col h-full bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800">

          {/* Logo */}
          <div className="flex items-center gap-2.5 px-5 py-5 border-b border-gray-100 dark:border-gray-800">
            <div className="w-8 h-8 rounded-xl bg-brand-700 flex items-center justify-center flex-shrink-0">
              <Bus size={16} className="text-white" />
            </div>
            <div>
              <p className="text-sm font-bold text-gray-900 dark:text-gray-100 leading-tight">Sistema Exclusiva</p>
              <p className="text-[10px] text-gray-400 dark:text-gray-500 leading-tight">Operacional</p>
            </div>
          </div>

          {/* Nav links */}
          <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
            {visibleNav.map(({ to, label, icon: Icon }) => (
              <Link
                key={to}
                to={to}
                className={isActive(to) ? 'nav-link-active' : 'nav-link'}
              >
                <Icon size={18} />
                <span>{label}</span>
                {isActive(to) && <ChevronRight size={14} className="ml-auto opacity-60" />}
              </Link>
            ))}
          </nav>

          {/* User panel */}
          <div className="px-3 py-4 border-t border-gray-100 dark:border-gray-800 space-y-1">
            {/* Theme toggle */}
            <button
              onClick={toggle}
              className="nav-link w-full"
              title={dark ? 'Mudar para claro' : 'Mudar para escuro'}
            >
              {dark ? <Sun size={18} /> : <Moon size={18} />}
              <span>{dark ? 'Tema Claro' : 'Tema Escuro'}</span>
            </button>

            {/* Profile link */}
            <Link to="/profile" className="nav-link">
              {photoUrl ? (
                <img src={photoUrl} alt="" className="w-5 h-5 rounded-full object-cover" />
              ) : (
                <User size={18} />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate leading-tight">
                  {displayLabel || 'Meu perfil'}
                </p>
                <p className="text-[11px] text-gray-400 dark:text-gray-500 leading-tight">
                  {roleLabel[role || ''] || role || ''}
                </p>
              </div>
            </Link>

            {/* Logout */}
            <button onClick={handleLogout} className="nav-link w-full text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20">
              <LogOut size={18} />
              <span>Sair</span>
            </button>
          </div>
        </div>
      </aside>

      {/* ── Main area ── */}
      <div className="flex-1 md:ml-60 flex flex-col min-h-screen">

        {/* Top bar (mobile) */}
        <header className="md:hidden sticky top-0 z-20 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-brand-700 flex items-center justify-center">
                <Bus size={14} className="text-white" />
              </div>
              <span className="text-sm font-bold text-gray-900 dark:text-gray-100">Exclusiva</span>
            </div>
            <div className="flex items-center gap-2">
              {installPrompt && !installed && (
                <button
                  onClick={handleInstall}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-brand-700 text-white text-xs font-semibold"
                  title="Instalar app no celular"
                >
                  <Download size={14} />
                  <span>Instalar</span>
                </button>
              )}
              <button
                onClick={toggle}
                className="p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                title={dark ? 'Tema claro' : 'Tema escuro'}
              >
                {dark ? <Sun size={18} /> : <Moon size={18} />}
              </button>
              <Link to="/profile" className="flex items-center gap-1.5">
                {photoUrl ? (
                  <img src={photoUrl} alt="" className="w-8 h-8 rounded-full object-cover border-2 border-brand-200" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-brand-700 flex items-center justify-center text-white text-xs font-bold">
                    {initials}
                  </div>
                )}
              </Link>
            </div>
          </div>
        </header>

        {/* Top bar (desktop) */}
        <header className="hidden md:flex items-center justify-between px-6 py-4 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
          <div>
            <h2 className="text-sm font-medium text-gray-500 dark:text-gray-400">
              Olá, <span className="font-semibold text-gray-800 dark:text-gray-200">{displayLabel || 'usuário'}</span>
            </h2>
          </div>
          <div className="flex items-center gap-3">
            <Link
              to="/profile"
              className="flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              {photoUrl ? (
                <img src={photoUrl} alt="" className="w-7 h-7 rounded-full object-cover border border-gray-200 dark:border-gray-700" />
              ) : (
                <div className="w-7 h-7 rounded-full bg-brand-700 flex items-center justify-center text-white text-xs font-bold">
                  {initials}
                </div>
              )}
              <span className="text-sm text-gray-600 dark:text-gray-400">{roleLabel[role || ''] || role}</span>
            </Link>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-4 md:p-6 pb-24 md:pb-6">
          {children}
        </main>
      </div>

      {/* ── Bottom tab bar (mobile only) ── */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800">
        <div className="flex items-stretch overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {visibleNav.map(({ to, label, icon: Icon }) => {
            const active = isActive(to)
            return (
              <Link
                key={to}
                to={to}
                className={`relative [flex:1_0_60px] flex flex-col items-center justify-center gap-0.5 py-2.5 text-[10px] font-medium transition-colors ${
                  active
                    ? 'text-brand-700 dark:text-brand-400'
                    : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'
                }`}
              >
                <Icon size={20} className={active ? 'text-brand-700 dark:text-brand-400' : ''} />
                <span className="leading-tight">{label.split(' ')[0]}</span>
                {active && (
                  <span className="absolute bottom-0 w-6 h-0.5 bg-brand-700 dark:bg-brand-400 rounded-t-full" />
                )}
              </Link>
            )
          })}
          {/* Logout at the end on mobile */}
          <button
            onClick={handleLogout}
            className="[flex:1_0_60px] flex flex-col items-center justify-center gap-0.5 py-2.5 text-[10px] font-medium text-gray-400 dark:text-gray-500"
          >
            <LogOut size={20} />
            <span>Sair</span>
          </button>
        </div>
      </nav>
    </div>
  )
}
