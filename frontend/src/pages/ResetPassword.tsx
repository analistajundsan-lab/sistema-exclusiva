import { useState } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import api from '../api/client'
import { validatePasswordPolicy, extractApiError } from './ChangePassword'
import { Lock, Eye, EyeOff, Building2, AlertCircle, CheckCircle2, ArrowLeft } from 'lucide-react'

export function ResetPassword() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') || ''
  const navigate = useNavigate()

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    const policyError = validatePasswordPolicy(password)
    if (policyError) {
      setError(policyError)
      return
    }
    if (password !== confirm) {
      setError('As senhas não coincidem.')
      return
    }

    setLoading(true)
    try {
      await api.post('/auth/password-reset', { token, new_password: password })
      setDone(true)
      setTimeout(() => navigate('/login'), 2500)
    } catch (err: any) {
      const status = err?.response?.status
      if (status === 400 || status === 422) {
        setError(extractApiError(err, 'Token inválido ou expirado. Solicite um novo link.'))
      } else {
        setError('Não foi possível redefinir a senha. Tente novamente.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-brand-700 rounded-2xl mb-4">
            <Building2 className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-extrabold text-gray-900 dark:text-gray-100">Sistema Exclusiva</h1>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 p-8">
          {done ? (
            <div className="text-center">
              <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-4" />
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">Senha redefinida</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Sua senha foi alterada com sucesso. Redirecionando para o login...
              </p>
            </div>
          ) : !token ? (
            <div className="text-center">
              <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">Link inválido</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Este link de redefinição é inválido. Solicite um novo.
              </p>
              <Link to="/forgot-password" className="inline-flex items-center gap-1.5 mt-6 text-sm font-medium text-brand-700 dark:text-brand-400 hover:underline">
                <ArrowLeft className="w-4 h-4" /> Solicitar novo link
              </Link>
            </div>
          ) : (
            <>
              <div className="mb-6">
                <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Redefinir senha</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  Mínimo 8 caracteres, com maiúscula, minúscula, número e caractere especial.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 block">Nova senha</label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none">
                      <Lock className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                    </span>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="••••••••••••"
                      className="bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 rounded-xl pl-10 pr-11 py-3 text-sm w-full focus:outline-none focus:ring-2 focus:ring-brand-500"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(v => !v)}
                      className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-gray-400 hover:text-gray-600"
                      tabIndex={-1}
                      aria-label={showPassword ? 'Esconder senha' : 'Mostrar senha'}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 block">Confirmar senha</label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none">
                      <Lock className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                    </span>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={confirm}
                      onChange={e => setConfirm(e.target.value)}
                      placeholder="••••••••••••"
                      className="bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 rounded-xl pl-10 pr-4 py-3 text-sm w-full focus:outline-none focus:ring-2 focus:ring-brand-500"
                      required
                    />
                  </div>
                </div>

                {error && (
                  <div className="flex items-start gap-2.5 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 rounded-xl px-4 py-3 text-sm">
                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-brand-700 hover:bg-brand-800 text-white rounded-xl px-4 py-3 font-semibold text-sm transition-all disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {loading ? 'Salvando...' : 'Redefinir senha'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
