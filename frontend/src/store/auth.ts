import { create } from 'zustand'

interface AuthState {
  token: string | null
  refreshToken: string | null
  role: string | null
  setAuth: (token: string, role: string, refreshToken?: string) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  token: localStorage.getItem('token'),
  refreshToken: localStorage.getItem('refreshToken'),
  role: localStorage.getItem('role'),
  setAuth: (token, role, refreshToken) => {
    localStorage.setItem('token', token)
    localStorage.setItem('role', role)
    if (refreshToken) localStorage.setItem('refreshToken', refreshToken)
    set({ token, role, refreshToken: refreshToken || localStorage.getItem('refreshToken') })
  },
  logout: () => {
    localStorage.removeItem('token')
    localStorage.removeItem('refreshToken')
    localStorage.removeItem('role')
    set({ token: null, refreshToken: null, role: null })
  },
}))
