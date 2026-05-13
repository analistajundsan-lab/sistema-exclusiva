import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { formatCpf } from '../utils/cpf'

export function Login() {
  const [cpf, setCpf] = useState('')
  const [password, setPassword] = useState('')
  const { login, loading, error } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const result = await login(cpf, password)
    if (result.ok) navigate(result.mustChangePassword ? '/change-password' : '/')
  }

  return (
    <div className="min-h-screen bg-blue-900 flex items-center justify-center">
      <div className="bg-white rounded-lg shadow-xl p-8 w-full max-w-sm">
        <h1 className="text-2xl font-bold text-center mb-2 text-blue-900">Sistema Exclusiva</h1>
        <p className="text-center text-gray-500 text-sm mb-6">Central operacional de escala, trocas e ocorrencias</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">CPF</label>
            <input
              type="text"
              value={cpf}
              onChange={e => setCpf(formatCpf(e.target.value))}
              placeholder="000.000.000-00"
              inputMode="numeric"
              maxLength={14}
              className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Senha</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          {error && <p className="text-red-600 text-sm text-center">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-800 text-white py-2 rounded hover:bg-blue-900 disabled:opacity-50 text-sm font-medium"
          >
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  )
}
