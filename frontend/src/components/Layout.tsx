import { ReactNode, useState, useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, ClipboardCheck, AlertTriangle,
  Calendar, Shield, Users, LogOut, Sun, Moon,
  User, ChevronRight, Bus, Search, ClipboardList, Download, Heart, UserCheck, X, type LucideIcon,
} from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useAuthStore } from '../store/auth'
import { useThemeStore } from '../store/theme'
import { isIOS, isStandalone } from '../utils/push'

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  roles?: string[]
}

const SST_ROLES = ['admin', 'tecnico_seguranca', 'engenheiro_seguranca']

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, roles: ['admin'] },
  // ── Operacional ──
  { to: '/on-call', label: 'Confirmação de Escala', icon: ClipboardCheck, roles: ['admin', 'analista', 'plantonista'] },
  { to: '/incidents', label: 'Ocorrências', icon: AlertTriangle, roles: ['admin', 'analista', 'plantonista'] },
  { to: '/schedule', label: 'Escala', icon: Calendar, roles: ['admin', 'analista', 'plantonista'] },
  { to: '/consulta', label: 'Consulta', icon: Search, roles: ['admin', 'plantonista'] },
  { to: '/vistoria', label: 'Vistoria', icon: ClipboardList, roles: ['admin', 'analista'] },
  { to: '/checklist', label: 'Check-list', icon: ClipboardCheck, roles: ['admin', 'analista'] },
  // ── SST ──
  { to: '/sst', label: 'Cockpit SST', icon: Shield, roles: ['admin', 'engenheiro_seguranca'] },
  { to: '/sst/checklist', label: 'Check-list SST', icon: ClipboardList, roles: SST_ROLES },
  { to: '/sst/sinistros', label: 'Registro de Sinistros', icon: AlertTriangle, roles: SST_ROLES },
  { to: '/sst/ocorrencias', label: 'Ocorrências SST', icon: ClipboardList, roles: SST_ROLES },
  { to: '/sst/liberacao', label: 'Liberação de Condutor', icon: UserCheck, roles: SST_ROLES },
  { to: '/sst/saude', label: 'Saúde e Bem-Estar', icon: Heart, roles: SST_ROLES },
  // ── Administração ──
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
  // Banner "instale o app": o iPhone NUNCA dispara beforeinstallprompt e o
  // Chrome/Android dispara so quando quer — entao, sem o evento, mostramos as
  // instrucoes manuais. Dispensavel (fica guardado no aparelho).
  const [installBannerDismissed, setInstallBannerDismissed] = useState(
    () => localStorage.getItem('installBannerDismissed') === 'true'
  )

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

  const dismissInstallBanner = () => {
    localStorage.setItem('installBannerDismissed', 'true')
    setInstallBannerDismissed(true)
  }

  const showInstallBanner = !isStandalone() && !installed && !installBannerDismissed

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
    admin: 'Administrador',
    analista: 'Analista',
    plantonista: 'Tráfego',
    tecnico_seguranca: 'TST',
    engenheiro_seguranca: 'Engenheiro de Segurança',
    // cargos descontinuados (mantidos só para exibir cadastros legados)
    gerente: 'Gerente', supervisao: 'Supervisão',
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
      {/* min-w-0: sem isto, um filho largo (ex.: a tabela de Ocorrencias) faz a
          largura intrinseca "vazar" pela cadeia flex e estoura a viewport no
          celular — a pagina fica mais larga que a tela e o zoom quebra. Com
          min-w-0 o overflow-x-auto realmente contem o conteudo e a pagina
          sempre cabe na tela, em qualquer aparelho. */}
      <div className="flex-1 md:ml-60 flex flex-col min-h-screen min-w-0">

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

        {/* Banner "instale o app" (mobile). Tres variantes: botao nativo
            (quando o navegador disparou beforeinstallprompt), passo a passo do
            iPhone (Safari nao tem prompt programatico) e passo a passo do
            Android (quando o Chrome nao disparou o evento). */}
        {showInstallBanner && (
          <div className="md:hidden bg-brand-50 dark:bg-brand-900/20 border-b border-brand-200 dark:border-brand-800 px-4 py-3 flex items-start gap-2.5">
            <Download size={17} className="text-brand-600 dark:text-brand-400 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-brand-800 dark:text-brand-300">Instale o app no seu celular</p>
              {installPrompt ? (
                <button
                  onClick={handleInstall}
                  className="mt-1.5 flex items-center gap-1.5 bg-brand-700 hover:bg-brand-800 text-white px-3.5 py-2 rounded-xl text-xs font-semibold transition-all"
                >
                  <Download size={13} />
                  Instalar agora
                </button>
              ) : isIOS() ? (
                <p className="text-xs text-brand-700 dark:text-brand-400 mt-0.5">
                  Toque em <strong>Compartilhar</strong> (quadrado com seta, na barra do Safari) e depois em <strong>"Adicionar à Tela de Início"</strong>. O app fica na tela inicial, como um aplicativo normal.
                </p>
              ) : (
                <p className="text-xs text-brand-700 dark:text-brand-400 mt-0.5">
                  Toque no menu <strong>⋮</strong> (canto superior do navegador) e depois em <strong>"Instalar app"</strong> ou <strong>"Adicionar à tela inicial"</strong>.
                </p>
              )}
            </div>
            <button
              onClick={dismissInstallBanner}
              className="p-1 rounded-lg text-brand-400 hover:text-brand-600 dark:hover:text-brand-300 shrink-0"
              title="Dispensar"
            >
              <X size={16} />
            </button>
          </div>
        )}

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

        {/* Page content — re-mounts per route so it rises in on navigation */}
        <main className="flex-1 min-w-0 p-4 md:p-6 pb-24 md:pb-6">
          <div key={location.pathname} className="ex-anim-rise">
            {children}
          </div>
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
