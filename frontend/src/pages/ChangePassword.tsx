import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Layout } from '../components/Layout'
import api from '../api/client'
import { useAuthStore } from '../store/auth'
import { Eye, EyeOff, Lock, AlertCircle, ArrowLeft } from 'lucide-react'

// Regra de senha (espelha a politica do backend): min 8, com maiuscula,
// minuscula, numero e caractere especial.
export function validatePasswordPolicy(password: string): string | null {
  if (password.length < 8) return 'A senha deve ter pelo menos 8 caracteres.'
  if (!/[A-Z]/.test(password)) return 'A senha deve conter pelo menos uma letra maiúscula.'
  if (!/[a-z]/.test(password)) return 'A senha deve conter pelo menos uma letra minúscula.'
  if (!/[0-9]/.test(password)) return 'A senha deve conter pelo menos um número.'
  if (!/[^A-Za-z0-9]/.test(password)) return 'A senha deve conter pelo menos um caractere especial.'
  return null
}

// Extrai uma mensagem legivel de um erro de API (o detail de um 422 do
// FastAPI vem como array de objetos — renderiza-lo direto quebra o React).
export function extractApiError(e: any, fallback: string): string {
  const detail = e?.response?.data?.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    const msg = detail.map((d: any) => d?.msg).filter(Boolean).join('. ')
    if (msg) return msg
  }
  return fallback
}

// Password strength helpers
function getStrength(password: string): number {
  let score = 0
  if (password.length >= 8) score++
  if (password.length >= 12) score++
  if (/[A-Z]/.test(password)) score++
  if (/[0-9]/.test(password)) score++
  if (/[^A-Za-z0-9]/.test(password)) score++
  return score // 0-5
}

function StrengthBar({ password }: { password: string }) {
  if (!password) return null
  const score = getStrength(password)
  const levels = [
    { min: 0, label: 'Muito fraca', color: 'bg-red-500' },
    { min: 1, label: 'Fraca', color: 'bg-orange-400' },
    { min: 2, label: 'Razoável', color: 'bg-yellow-400' },
    { min: 3, label: 'Boa', color: 'bg-lime-500' },
    { min: 4, label: 'Forte', color: 'bg-green-500' },
    { min: 5, label: 'Muito forte', color: 'bg-emerald-600' },
  ]
  const level = levels[Math.min(score, levels.length - 1)]

  return (
    <div className="mt-2 space-y-1.5">
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map(i => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
              i <= score ? level.color : 'bg-gray-200 dark:bg-gray-600'
            }`}
          />
        ))}
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400">{level.label}</p>
    </div>
  )
}

function PasswordField({
  label,
  value,
  onChange,
  placeholder,
  show,
  onToggle,
  children,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  show: boolean
  onToggle: () => void
  children?: React.ReactNode
}) {
  return (
    <div>
      <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 block">{label}</label>
      <div className="relative">
        <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none">
          <Lock className="w-4 h-4 text-gray-400 dark:text-gray-500" />
        </span>
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder || '••••••••'}
          className="bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 rounded-xl pl-10 pr-11 py-3 text-sm w-full focus:outline-none focus:ring-2 focus:ring-brand-500 dark:focus:ring-brand-400 placeholder:text-gray-400 dark:placeholder:text-gray-500 transition-shadow"
          minLength={value ? 8 : undefined}
          required
        />
        <button
          type="button"
          onClick={onToggle}
          tabIndex={-1}
          className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 transition-colors"
          aria-label={show ? 'Esconder senha' : 'Mostrar senha'}
        >
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
      {children}
    </div>
  )
}

export function ChangePassword() {
  const navigate = useNavigate()
  const setMustChangePassword = useAuthStore(s => s.setMustChangePassword)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [show, setShow] = useState({ current: false, new: false, confirm: false })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const toggle = (field: keyof typeof show) =>
    setShow(s => ({ ...s, [field]: !s[field] }))

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    const policyError = validatePasswordPolicy(newPassword)
    if (policyError) {
      setError(policyError)
      return
    }
    if (newPassword !== confirmPassword) {
      setError('As senhas não conferem.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      await api.post('/auth/change-password', {
        current_password: currentPassword,
        new_password: newPassword,
      })
      // Libera o funil: o usuario ja pode acessar o resto do app.
      setMustChangePassword(false)
      navigate('/')
    } catch (e: any) {
      setError(extractApiError(e, 'Erro ao alterar senha.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Layout>
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          {/* Back link */}
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 mb-6 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Voltar
          </button>

          {/* Card */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 p-8">
            {/* Header */}
            <div className="flex flex-col items-center mb-8">
              <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-brand-50 dark:bg-brand-900/30 border border-brand-100 dark:border-brand-800 mb-4">
                <Lock className="w-7 h-7 text-brand-700 dark:text-brand-400" />
              </div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Definir nova senha</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1.5 text-center">
                Senha temporária detectada. Defina sua senha antes de continuar.
              </p>
            </div>

            <form onSubmit={submit} className="space-y-5">
              <PasswordField
                label="Senha atual"
                value={currentPassword}
                onChange={setCurrentPassword}
                show={show.current}
                onToggle={() => toggle('current')}
              />

              <PasswordField
                label="Nova senha"
                value={newPassword}
                onChange={setNewPassword}
                show={show.new}
                onToggle={() => toggle('new')}
              >
                <StrengthBar password={newPassword} />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5">
                  Mínimo 8 caracteres, com maiúscula, minúscula, número e caractere especial.
                </p>
              </PasswordField>

              <PasswordField
                label="Confirmar nova senha"
                value={confirmPassword}
                onChange={setConfirmPassword}
                show={show.confirm}
                onToggle={() => toggle('confirm')}
              >
                {confirmPassword && newPassword && confirmPassword !== newPassword && (
                  <p className="text-xs text-red-500 mt-1.5">As senhas não conferem.</p>
                )}
                {confirmPassword && newPassword && confirmPassword === newPassword && (
                  <p className="text-xs text-green-600 dark:text-green-400 mt-1.5">Senhas conferem.</p>
                )}
              </PasswordField>

              {error && (
                <div className="flex items-start gap-2.5 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 rounded-xl px-4 py-3 text-sm">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-brand-700 hover:bg-brand-800 dark:bg-brand-600 dark:hover:bg-brand-500 text-white rounded-xl px-4 py-3 font-semibold text-sm transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-2"
              >
                {loading ? (
                  <>
                    <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Salvando...
                  </>
                ) : (
                  'Salvar nova senha'
                )}
              </button>
            </form>
          </div>
        </div>
      </div>
    </Layout>
  )
}
