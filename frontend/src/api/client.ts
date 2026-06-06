import axios from 'axios'
import { demoAdapter } from './demo'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000',
  timeout: 30000,
})

// Single promise shared across all concurrent 401s in the same tab.
// Cross-tab: the other tab will pick up the new token from localStorage on retry.
let refreshPromise: Promise<string> | null = null

if (import.meta.env.VITE_DEMO_MODE === 'true') {
  api.defaults.adapter = demoAdapter
}

api.interceptors.request.use(cfg => {
  const token = localStorage.getItem('token')
  if (token) cfg.headers.Authorization = `Bearer ${token}`
  return cfg
})

function clearAuth() {
  localStorage.removeItem('token')
  localStorage.removeItem('refreshToken')
  localStorage.removeItem('role')
}

// Revoga a sessao server-side (refresh token) no backend. Best-effort:
// usa axios cru para nao sofrer override do Authorization pelo interceptor.
export async function revokeSession(): Promise<void> {
  const refreshToken = localStorage.getItem('refreshToken')
  if (!refreshToken) return
  try {
    await axios.post(`${api.defaults.baseURL}/auth/logout`, null, {
      headers: { Authorization: `Bearer ${refreshToken}` },
      timeout: 8000,
    })
  } catch {
    // ignora falhas — o cliente descarta os tokens de qualquer forma
  }
}

async function doRefresh(): Promise<string> {
  const refreshToken = localStorage.getItem('refreshToken')
  if (!refreshToken) throw new Error('no_refresh_token')
  const res = await axios.post(
    `${api.defaults.baseURL}/auth/refresh`,
    null,
    { headers: { Authorization: `Bearer ${refreshToken}` } },
  )
  localStorage.setItem('token', res.data.access_token)
  localStorage.setItem('refreshToken', res.data.refresh_token)
  return res.data.access_token
}

api.interceptors.response.use(
  res => res,
  async err => {
    const original = err.config

    // 403 = conta inativa ou must_change_password — não tentar refresh
    if (err.response?.status === 403) {
      return Promise.reject(err)
    }

    if (err.response?.status === 401 && !original?._retry) {
      original._retry = true

      const refreshToken = localStorage.getItem('refreshToken')
      if (!refreshToken) {
        clearAuth()
        window.location.href = '/login'
        return Promise.reject(err)
      }

      // Deduplicate: se outra requisição já iniciou o refresh, aguarda a mesma Promise
      if (!refreshPromise) {
        refreshPromise = doRefresh().finally(() => { refreshPromise = null })
      }

      try {
        const newToken = await refreshPromise
        original.headers.Authorization = `Bearer ${newToken}`
        return api(original)
      } catch {
        clearAuth()
        window.location.href = '/login'
        return Promise.reject(err)
      }
    }

    return Promise.reject(err)
  },
)

export default api
