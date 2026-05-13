import axios from 'axios'
import { demoAdapter } from './demo'

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000' })
let refreshing = false

api.defaults.adapter = demoAdapter

api.interceptors.request.use(cfg => {
  const token = localStorage.getItem('token')
  if (token) cfg.headers.Authorization = `Bearer ${token}`
  return cfg
})

api.interceptors.response.use(
  res => res,
  async err => {
    const original = err.config
    if (err.response?.status === 401 && !original?._retry && !refreshing) {
      const refreshToken = localStorage.getItem('refreshToken')
      if (refreshToken) {
        try {
          refreshing = true
          original._retry = true
          const res = await axios.post(`${api.defaults.baseURL}/auth/refresh`, null, {
            headers: { Authorization: `Bearer ${refreshToken}` },
          })
          localStorage.setItem('token', res.data.access_token)
          localStorage.setItem('refreshToken', res.data.refresh_token)
          original.headers.Authorization = `Bearer ${res.data.access_token}`
          return api(original)
        } catch {
          localStorage.removeItem('token')
          localStorage.removeItem('refreshToken')
          localStorage.removeItem('role')
          window.location.href = '/login'
        } finally {
          refreshing = false
        }
      }
      localStorage.removeItem('token')
      localStorage.removeItem('refreshToken')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export default api
