import { ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useAuthStore } from '../store/auth'

export function Layout({ children }: { children: ReactNode }) {
  const { logout, role } = useAuth()
  const { userName, displayName, photoUrl } = useAuthStore()
  const navigate = useNavigate()
  const location = useLocation()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const displayLabel = displayName || userName || ''
  const initials = displayLabel
    .split(' ')
    .map((w: string) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || '?'

  const navLink = (to: string, label: string) => {
    const active = location.pathname === to
    return (
      <Link
        to={to}
        className={`text-sm px-3 py-1 rounded transition-colors ${active
          ? 'bg-white/20 text-white font-semibold'
          : 'hover:text-brand-200 text-brand-100'
        }`}
      >
        {label}
      </Link>
    )
  }

  return (
    <div className="min-h-screen bg-gray-100 pb-20 md:pb-0">
      <nav className="bg-brand-800 text-white px-3 md:px-6 py-3 shadow">
        <div className="flex items-center justify-between gap-3">
          <span className="font-bold text-base md:text-lg">Sistema Exclusiva</span>
          <div className="flex items-center gap-3">
            {displayLabel && (
              <span className="hidden sm:block text-sm text-brand-100">
                Olá, <strong>{displayLabel}</strong>
              </span>
            )}
            <Link to="/profile" className="flex-shrink-0" title="Meu perfil">
              {photoUrl ? (
                <img src={photoUrl} alt="Perfil" className="w-8 h-8 rounded-full object-cover border border-brand-300" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-brand-700 border border-brand-300 flex items-center justify-center text-white text-xs font-bold">
                  {initials}
                </div>
              )}
            </Link>
            <span className="text-xs text-brand-200 capitalize hidden sm:inline">{role}</span>
            <button onClick={handleLogout} className="text-sm hover:text-brand-200 border border-brand-700 px-3 py-2 rounded">
              Sair
            </button>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-1 overflow-x-auto pb-1">
          {role === 'admin' && navLink('/', 'Dashboard')}
          {navLink('/on-call', 'Confirmação')}
          {navLink('/incidents', 'Ocorrências')}
          {(role === 'admin' || role === 'gerente' || role === 'supervisao' || role === 'supervisor') && navLink('/schedule', 'Escala')}
          {(role === 'admin' || role === 'gerente') && navLink('/audit', 'Auditoria')}
          {role === 'admin' && navLink('/users', 'Usuários')}
        </div>
      </nav>
      <main className="p-3 md:p-6">{children}</main>
    </div>
  )
}
