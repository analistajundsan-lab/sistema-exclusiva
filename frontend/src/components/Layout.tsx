import { ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

export function Layout({ children }: { children: ReactNode }) {
  const { logout, role } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const navLink = (to: string, label: string) => {
    const active = location.pathname === to
    return (
      <Link
        to={to}
        className={`text-sm px-3 py-1 rounded transition-colors ${active
          ? 'bg-white/20 text-white font-semibold'
          : 'hover:text-blue-200 text-blue-100'
        }`}
      >
        {label}
      </Link>
    )
  }

  return (
    <div className="min-h-screen bg-gray-100 pb-20 md:pb-0">
      <nav className="bg-blue-800 text-white px-3 md:px-6 py-3 shadow">
        <div className="flex items-center justify-between gap-3">
          <span className="font-bold text-base md:text-lg">Sistema Exclusiva</span>
          <div className="flex items-center gap-2">
            <span className="text-xs text-blue-200 capitalize hidden sm:inline">{role}</span>
            <button onClick={handleLogout} className="text-sm hover:text-blue-200 border border-blue-600 px-3 py-2 rounded">
              Sair
            </button>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-1 overflow-x-auto pb-1">
          {navLink('/', 'Dashboard')}
          {navLink('/schedule', 'Escala')}
          {navLink('/on-call', 'Plantao')}
          {navLink('/incidents', 'Ocorrencias')}
          {navLink('/swaps', 'Trocas')}
          {role === 'admin' && navLink('/audit', 'Auditoria')}
          {role === 'admin' && navLink('/users', 'Usuarios')}
        </div>
      </nav>
      <main className="p-3 md:p-6">{children}</main>
    </div>
  )
}
