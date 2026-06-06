import { create } from 'zustand'
import { revokeSession } from '../api/client'

interface UserProfile {
  id: number
  name: string
  display_name: string | null
  photo_url: string | null
  unit: string | null
  units: string | null
  has_full_access?: boolean
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
  setAuth: (token: string, role: string, refreshToken?: string) => void
  setUserProfile: (profile: UserProfile) => void
  logout: () => void
}

const parseUnits = (raw: string | null): string[] | null => {
  if (!raw) return null
  const parts = raw.split(',').map(s => s.trim()).filter(Boolean)
  return parts.length > 0 ? parts : null
}

export const useAuthStore = create<AuthState>((set) => ({
  token: localStorage.getItem('token'),
  refreshToken: localStorage.getItem('refreshToken'),
  role: localStorage.getItem('role'),
  userId: localStorage.getItem('userId') ? Number(localStorage.getItem('userId')) : null,
  userName: localStorage.getItem('userName'),
  displayName: localStorage.getItem('displayName'),
  photoUrl: localStorage.getItem('photoUrl'),
  userUnit: localStorage.getItem('userUnit'),
  userUnits: parseUnits(localStorage.getItem('userUnits')),
  hasFullAccess: localStorage.getItem('hasFullAccess') === 'true',
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
    localStorage.setItem('photoUrl', profile.photo_url || '')
    localStorage.setItem('userUnit', profile.unit || '')
    localStorage.setItem('userUnits', profile.units || '')
    localStorage.setItem('hasFullAccess', profile.has_full_access ? 'true' : 'false')
    set({
      userId: profile.id,
      userName: profile.name,
      displayName: profile.display_name,
      photoUrl: profile.photo_url,
      userUnit: profile.unit,
      userUnits: parseUnits(profile.units),
      hasFullAccess: !!profile.has_full_access,
    })
  },
  logout: () => {
    // Revoga a sessao no servidor antes de limpar (best-effort).
    void revokeSession()
    localStorage.removeItem('token')
    localStorage.removeItem('refreshToken')
    localStorage.removeItem('role')
    localStorage.removeItem('userId')
    localStorage.removeItem('userName')
    localStorage.removeItem('displayName')
    localStorage.removeItem('photoUrl')
    localStorage.removeItem('userUnit')
    localStorage.removeItem('userUnits')
    localStorage.removeItem('hasFullAccess')
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
    })
  },
}))
