import { create } from 'zustand'
import api, { revokeSession } from '../api/client'

// A foto de perfil NAO vem mais no UserResponse (/auth/me etc.) — sai de
// UserProfile e e buscada separadamente em /auth/me/photo (ver fetchPhoto).
interface UserProfile {
  id: number
  name: string
  display_name: string | null
  unit: string | null
  units: string | null
  has_full_access?: boolean
  must_change_password?: boolean
}

interface AuthState {
  token: string | null
  refreshToken: string | null
  role: string | null
  userId: number | null
  userName: string | null
  displayName: string | null
  photoUrl: string | null
  userUnit: string | null
  userUnits: string[] | null
  hasFullAccess: boolean
  mustChangePassword: boolean
  setAuth: (token: string, role: string, refreshToken?: string) => void
  setUserProfile: (profile: UserProfile) => void
  setPhotoUrl: (url: string | null) => void
  fetchPhoto: () => Promise<void>
  setMustChangePassword: (v: boolean) => void
  logout: () => void
}

const parseUnits = (raw: string | null): string[] | null => {
  if (!raw) return null
  const parts = raw.split(',').map(s => s.trim()).filter(Boolean)
  return parts.length > 0 ? parts : null
}

// Foto propria: buscada UMA vez por sessao em GET /auth/me/photo. O endpoint
// responde com ETag/Cache-Control — o cache HTTP do navegador cuida da
// revalidacao; NUNCA persistir a foto (base64 pesado) em localStorage.
let photoFetched = false
let photoFetchPromise: Promise<void> | null = null

export const useAuthStore = create<AuthState>((set) => ({
  token: localStorage.getItem('token'),
  refreshToken: localStorage.getItem('refreshToken'),
  role: localStorage.getItem('role'),
  userId: localStorage.getItem('userId') ? Number(localStorage.getItem('userId')) : null,
  userName: localStorage.getItem('userName'),
  displayName: localStorage.getItem('displayName'),
  photoUrl: null,
  userUnit: localStorage.getItem('userUnit'),
  userUnits: parseUnits(localStorage.getItem('userUnits')),
  hasFullAccess: localStorage.getItem('hasFullAccess') === 'true',
  mustChangePassword: localStorage.getItem('mustChangePassword') === 'true',
  setAuth: (token, role, refreshToken) => {
    localStorage.setItem('token', token)
    localStorage.setItem('role', role)
    if (refreshToken) localStorage.setItem('refreshToken', refreshToken)
    set({ token, role, refreshToken: refreshToken || localStorage.getItem('refreshToken') })
  },
  setUserProfile: (profile) => {
    localStorage.setItem('userId', String(profile.id))
    localStorage.setItem('userName', profile.name || '')
    localStorage.setItem('displayName', profile.display_name || '')
    localStorage.setItem('userUnit', profile.unit || '')
    localStorage.setItem('userUnits', profile.units || '')
    localStorage.setItem('hasFullAccess', profile.has_full_access ? 'true' : 'false')
    localStorage.setItem('mustChangePassword', profile.must_change_password ? 'true' : 'false')
    set({
      userId: profile.id,
      userName: profile.name,
      displayName: profile.display_name,
      userUnit: profile.unit,
      userUnits: parseUnits(profile.units),
      hasFullAccess: !!profile.has_full_access,
      mustChangePassword: !!profile.must_change_password,
    })
  },
  // Atualizacao local apos salvar o perfil (o PATCH /auth/profile nao ecoa
  // mais a foto na resposta — a fonte da verdade e o que foi enviado).
  setPhotoUrl: (url) => set({ photoUrl: url }),
  fetchPhoto: async () => {
    if (photoFetched) return
    if (!localStorage.getItem('token')) return
    // Dedupe: Layout monta a cada navegacao; so uma requisicao em voo.
    if (!photoFetchPromise) {
      photoFetchPromise = api
        .get<{ photo_url: string | null }>('/auth/me/photo')
        .then((res) => {
          photoFetched = true
          set({ photoUrl: res.data.photo_url })
        })
        .catch(() => {
          // Falha (ex.: 503 de banco fora): avatar fica nas iniciais; a
          // proxima montagem do Layout tenta de novo (no maximo 1 req extra
          // por navegacao, deduplicada).
        })
        .finally(() => {
          photoFetchPromise = null
        })
    }
    await photoFetchPromise
  },
  setMustChangePassword: (v) => {
    localStorage.setItem('mustChangePassword', v ? 'true' : 'false')
    set({ mustChangePassword: v })
  },
  logout: () => {
    // Revoga a sessao no servidor antes de limpar (best-effort).
    void revokeSession()
    photoFetched = false
    photoFetchPromise = null
    localStorage.removeItem('token')
    localStorage.removeItem('refreshToken')
    localStorage.removeItem('role')
    localStorage.removeItem('userId')
    localStorage.removeItem('userName')
    localStorage.removeItem('displayName')
    // Chave legado: versoes antigas persistiam a foto no localStorage.
    localStorage.removeItem('photoUrl')
    localStorage.removeItem('userUnit')
    localStorage.removeItem('userUnits')
    localStorage.removeItem('hasFullAccess')
    localStorage.removeItem('mustChangePassword')
    set({
      token: null,
      refreshToken: null,
      role: null,
      userId: null,
      userName: null,
      displayName: null,
      photoUrl: null,
      userUnit: null,
      userUnits: null,
      hasFullAccess: false,
      mustChangePassword: false,
    })
  },
}))
