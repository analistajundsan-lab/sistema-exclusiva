import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Layout } from '../components/Layout'
import api from '../api/client'

export function ChangePassword() {
  const navigate = useNavigate()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (newPassword !== confirmPassword) {
      setError('As senhas nao conferem')
      return
    }
    setLoading(true)
    setError(null)
    try {
      await api.post('/auth/change-password', {
        current_password: currentPassword,
        new_password: newPassword,
      })
      navigate('/')
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Erro ao alterar senha')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Layout>
      <div className="max-w-md mx-auto bg-white rounded-lg shadow p-6">
        <h1 className="text-xl font-bold text-gray-800 mb-1">Definir nova senha</h1>
        <p className="text-sm text-gray-500 mb-5">Senha temporaria detectada. Defina sua senha antes de continuar.</p>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Senha atual</label>
            <input
              type="password"
              value={currentPassword}
              onChange={e => setCurrentPassword(e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Nova senha</label>
            <input
              type="password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm"
              minLength={8}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Confirmar nova senha</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm"
              minLength={8}
              required
            />
          </div>

          {error && <p className="text-red-600 text-sm bg-red-50 p-2 rounded">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-800 text-white py-2 rounded hover:bg-blue-900 disabled:opacity-50 text-sm font-medium"
          >
            {loading ? 'Salvando...' : 'Salvar senha'}
          </button>
        </form>
      </div>
    </Layout>
  )
}
