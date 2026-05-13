import { create } from 'zustand'

interface UserProfile {
  id: number
  name: string
  display_name: string | null
  photo_url: string | null
  unit: string | null
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
  setAuth: (token: string, role: string, refreshToken?: string) => void
  setUserProfile: (profile: UserProfile) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  token: localStorage.getItem('token'),
  refreshToken: localStorage.getItem('refreshToken'),
  role: localStorage.getItem('role'),
  userId: null,
  userName: null,
  displayName: null,
  photoUrl: null,
  userUnit: null,
  setAuth: (token, role, refreshToken) => {
    localStorage.setItem('token', token)
    localStorage.setItem('role', role)
    if (refreshToken) localStorage.setItem('refreshToken', refreshToken)
    set({ token, role, refreshToken: refreshToken || localStorage.getItem('refreshToken') })
  },
  setUserProfile: (profile) => {
    set({
      userId: profile.id,
      userName: profile.name,
      displayName: profile.display_name,
      photoUrl: profile.photo_url,
      userUnit: profile.unit,
    })
  },
  logout: () => {
    localStorage.removeItem('token')
    localStorage.removeItem('refreshToken')
    localStorage.removeItem('role')
    set({
      token: null,
      refreshToken: null,
      role: null,
      userId: null,
      userName: null,
      displayName: null,
      photoUrl: null,
      userUnit: null,
    })
  },
}))
