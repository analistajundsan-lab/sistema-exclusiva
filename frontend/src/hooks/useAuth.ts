import { useState } from 'react'
import api from '../api/client'
import { useAuthStore } from '../store/auth'

export function useAuth() {
  const { token, role, setAuth, setUserProfile, logout } = useAuthStore()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Aplica os tokens recebidos: guarda access token, carrega o perfil.
  const applyAccessToken = async (accessToken: string) => {
    const payload = JSON.parse(atob(accessToken.split('.')[1]))
    setAuth(accessToken, payload.role || 'operator')
    const me = await api.get('/auth/me')
    setUserProfile({
      id: me.data.id,
      name: me.data.name,
      display_name: me.data.display_name,
      photo_url: me.data.photo_url,
      unit: me.data.unit,
      units: me.data.units,
      has_full_access: me.data.has_full_access,
    })
    return { ok: true, mustChangePassword: !!me.data.must_change_password }
  }

  const login = async (cpf: string, password: string) => {
    setLoading(true)
    setError(null)
    try {
      const res = await api.post('/auth/login', { cpf, password })
      // refresh token vive em cookie HttpOnly — nao persistir no localStorage
      if (res.data.mfa_required) {
        return {
          ok: false,
          mustChangePassword: false,
          mfaRequired: true,
          mfaToken: res.data.mfa_token as string,
        }
      }
      const result = await applyAccessToken(res.data.access_token)
      return { ...result, mfaRequired: false }
    } catch (err: any) {
      const status = err?.response?.status
      const detail = err?.response?.data?.detail

      if (status === 403) {
        setError('Usuário inativo. Entre em contato com o administrador.')
      } else if (status === 429) {
        setError('Muitas tentativas. Aguarde 1 minuto e tente novamente.')
      } else if (status === 401) {
        setError('CPF ou senha inválidos.')
      } else if (!status) {
        setError('Sem conexão com o servidor. Verifique sua internet.')
      } else {
        setError(detail || 'Erro ao fazer login. Tente novamente.')
      }
      return { ok: false, mustChangePassword: false, mfaRequired: false }
    } finally {
      setLoading(false)
    }
  }

  const verifyMfa = async (mfaToken: string, code: string) => {
    setLoading(true)
    setError(null)
    try {
      const res = await api.post('/auth/mfa/verify', { mfa_token: mfaToken, code })
      return await applyAccessToken(res.data.access_token)
    } catch (err: any) {
      const status = err?.response?.status
      if (status === 401) {
        setError('Código inválido ou expirado. Tente novamente.')
      } else if (!status) {
        setError('Sem conexão com o servidor. Verifique sua internet.')
      } else {
        setError('Não foi possível validar o código. Tente novamente.')
      }
      return { ok: false, mustChangePassword: false }
    } finally {
      setLoading(false)
    }
  }

  return { token, role, login, verifyMfa, logout, loading, error, isAuthenticated: !!token }
}
