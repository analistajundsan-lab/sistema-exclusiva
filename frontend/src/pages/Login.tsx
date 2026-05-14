import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { formatCpf } from '../utils/cpf'
import { Eye, EyeOff, User, Lock, Building2, AlertCircle } from 'lucide-react'
import { BusIntro } from '../components/BusIntro'

export function Login() {
  const [cpf, setCpf] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [animDone, setAnimDone] = useState(false)
  const { login, loading, error } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const result = await login(cpf, password)
    if (result.ok) navigate(result.mustChangePassword ? '/change-password' : '/')
  }

  return (
    <>
      <BusIntro onDone={() => setAnimDone(true)} />
      <div className="min-h-screen flex" style={{ visibility: animDone ? 'visible' : 'hidden' }}>
      {/* Left panel — hidden on mobile */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-brand-900 to-brand-700 flex-col items-center justify-center p-12 relative overflow-hidden">
        {/* Decorative circles */}
        <div className="absolute -top-24 -left-24 w-96 h-96 rounded-full bg-white/5" />
        <div className="absolute -bottom-32 -right-16 w-80 h-80 rounded-full bg-white/5" />
        <div className="absolute top-1/3 right-8 w-40 h-40 rounded-full bg-white/5" />

        <div className="relative z-10 text-center">
          <div className="flex items-center justify-center w-20 h-20 bg-white/10 rounded-2xl mb-8 mx-auto border border-white/20">
            <Building2 className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-4xl font-extrabold text-white tracking-tight mb-3">
            Sistema Exclusiva
          </h1>
          <p className="text-brand-200 text-lg leading-relaxed max-w-xs mx-auto">
            Central operacional de escala, trocas e ocorrências
          </p>

          <div className="mt-12 grid grid-cols-3 gap-4 text-center">
            {[
              { label: 'Escalas', desc: 'Gestão de plantão' },
              { label: 'Trocas', desc: 'Solicitações ágeis' },
              { label: 'Ocorrências', desc: 'Registro unificado' },
            ].map(item => (
              <div key={item.label} className="bg-white/10 rounded-xl p-3 border border-white/10">
                <p className="text-white font-semibold text-sm">{item.label}</p>
                <p className="text-brand-300 text-xs mt-0.5">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-6 py-12">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="lg:hidden text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-brand-700 rounded-2xl mb-4">
              <Building2 className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-extrabold text-gray-900 dark:text-gray-100">Sistema Exclusiva</h1>
            <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Central operacional</p>
          </div>

          {/* Card */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 p-8">
            <div className="mb-6">
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Bem-vindo</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Entre com seu CPF e senha para continuar</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* CPF */}
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 block">
                  CPF
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none">
                    <User className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                  </span>
                  <input
                    type="text"
                    value={cpf}
                    onChange={e => setCpf(formatCpf(e.target.value))}
                    placeholder="000.000.000-00"
                    inputMode="numeric"
                    maxLength={14}
                    className="bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 rounded-xl pl-10 pr-4 py-3 text-sm w-full focus:outline-none focus:ring-2 focus:ring-brand-500 dark:focus:ring-brand-400 placeholder:text-gray-400 dark:placeholder:text-gray-500 transition-shadow"
                    required
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 block">
                  Senha
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none">
                    <Lock className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                  </span>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 rounded-xl pl-10 pr-11 py-3 text-sm w-full focus:outline-none focus:ring-2 focus:ring-brand-500 dark:focus:ring-brand-400 placeholder:text-gray-400 dark:placeholder:text-gray-500 transition-shadow"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 transition-colors"
                    tabIndex={-1}
                    aria-label={showPassword ? 'Esconder senha' : 'Mostrar senha'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Error */}
              {error && (
                <div className="flex items-start gap-2.5 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 rounded-xl px-4 py-3 text-sm">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-brand-700 hover:bg-brand-800 dark:bg-brand-600 dark:hover:bg-brand-500 text-white rounded-xl px-4 py-3 font-semibold text-sm transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Entrando...
                  </>
                ) : (
                  'Entrar'
                )}
              </button>
            </form>
          </div>

          <p className="text-center text-xs text-gray-400 dark:text-gray-600 mt-6">
            Exclusiva Segurança Patrimonial &copy; {new Date().getFullYear()}
          </p>
        </div>
      </div>
    </div>
    </>
  )
}
