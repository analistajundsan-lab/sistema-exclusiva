import { useState } from 'react'
import api from '../api/client'
import { useAuthStore } from '../store/auth'

export function useAuth() {
  const { token, role, setAuth, setUserProfile, logout } = useAuthStore()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const login = async (cpf: string, password: string) => {
    setLoading(true)
    setError(null)
    try {
      const res = await api.post('/auth/login', { cpf, password })
      const payload = JSON.parse(atob(res.data.access_token.split('.')[1]))
      setAuth(res.data.access_token, payload.role || 'operator', res.data.refresh_token)
      const me = await api.get('/auth/me')
      setUserProfile({
        id: me.data.id,
        name: me.data.name,
        display_name: me.data.display_name,
        photo_url: me.data.photo_url,
        unit: me.data.unit,
        units: me.data.units,
      })
      return { ok: true, mustChangePassword: !!me.data.must_change_password }
    } catch {
      setError('CPF ou senha invalidos')
      return { ok: false, mustChangePassword: false }
    } finally {
      setLoading(false)
    }
  }

  return { token, role, login, logout, loading, error, isAuthenticated: !!token }
}
