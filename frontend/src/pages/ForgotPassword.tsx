import { useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../api/client'
import { Mail, Building2, AlertCircle, CheckCircle2, ArrowLeft } from 'lucide-react'

export function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      await api.post('/auth/password-reset-request', { email })
      setSent(true)
    } catch (err: any) {
      if (err?.response?.status === 429) {
        setError('Muitas solicitações. Tente novamente em 1 hora.')
      } else {
        setError('Não foi possível concluir a solicitação. Tente novamente.')
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
          {sent ? (
            <div className="text-center">
              <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-4" />
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">Verifique seu e-mail</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Se o e-mail estiver cadastrado, enviaremos as instruções para redefinição de senha.
                O link expira em 30 minutos.
              </p>
              <Link to="/login" className="inline-flex items-center gap-1.5 mt-6 text-sm font-medium text-brand-700 dark:text-brand-400 hover:underline">
                <ArrowLeft className="w-4 h-4" /> Voltar para o login
              </Link>
            </div>
          ) : (
            <>
              <div className="mb-6">
                <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Esqueci minha senha</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  Informe seu e-mail para receber o link de redefinição.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 block">E-mail</label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none">
                      <Mail className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                    </span>
                    <input
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="voce@empresa.com.br"
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
                  {loading ? 'Enviando...' : 'Enviar link de redefinição'}
                </button>
              </form>

              <Link to="/login" className="flex items-center justify-center gap-1.5 mt-6 text-sm font-medium text-gray-500 dark:text-gray-400 hover:underline">
                <ArrowLeft className="w-4 h-4" /> Voltar para o login
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
