import axios, { type AxiosRequestConfig, type AxiosResponse } from 'axios'
import { demoAdapter } from './demo'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000',
  timeout: 30000,
  // Envia o cookie HttpOnly de refresh (mesma origem via proxy /api).
  withCredentials: true,
})

// Single promise shared across all concurrent 401s in the same tab.
let refreshPromise: Promise<string> | null = null

if (import.meta.env.VITE_DEMO_MODE === 'true') {
  api.defaults.adapter = demoAdapter
}

api.interceptors.request.use(cfg => {
  const token = localStorage.getItem('token')
  if (token) cfg.headers.Authorization = `Bearer ${token}`
  return cfg
})

// Mesmo conjunto de chaves do logout() (store/auth.ts) — antes limpava so 3 e
// deixava userId/userName/hasFullAccess/mustChangePassword etc. orfaos no
// localStorage apos sessao expirada.
const AUTH_KEYS = [
  'token',
  'refreshToken',
  'role',
  'userId',
  'userName',
  'displayName',
  'photoUrl',
  'userUnit',
  'userUnits',
  'hasFullAccess',
  'mustChangePassword',
] as const

function clearAuth() {
  for (const key of AUTH_KEYS) localStorage.removeItem(key)
}

// Fluxo padrao de sessao expirada: limpa credenciais e volta para o login.
// Exportado para outras camadas (ex.: stream SSE) reutilizarem o mesmo
// comportamento sem duplicar logica.
export function handleSessionExpired() {
  clearAuth()
  if (!window.location.pathname.startsWith('/login')) {
    window.location.href = '/login'
  }
}

export function apiErrorMessage(err: any, fallback: string): string {
  const status = err?.response?.status
  const detail = err?.response?.data?.detail

  if (typeof detail === 'string') {
    if (detail.includes('Troca de senha obrigatoria')) {
      return 'Senha temporaria: defina uma nova senha antes de acessar escala e ocorrencias.'
    }
    if (detail.includes('Sem permissao')) {
      return 'Seu perfil nao tem permissao para esta unidade. Peca ao administrador para revisar suas unidades.'
    }
    return detail
  }

  if (status === 403) {
    return 'Acesso bloqueado para este perfil. Verifique senha temporaria, cargo e unidade cadastrada.'
  }
  if (status === 401) {
    return 'Sessao expirada. Entre novamente.'
  }
  if (!status) {
    return 'Sem conexao com o servidor. Verifique sua internet e tente novamente.'
  }

  return fallback
}

// Revoga a sessao server-side e limpa o cookie de refresh (best-effort).
export async function revokeSession(): Promise<void> {
  try {
    await axios.post(`${api.defaults.baseURL}/auth/logout`, null, {
      withCredentials: true,
      timeout: 8000,
    })
  } catch {
    // ignora falhas — o cliente descarta o access token de qualquer forma
  }
}

// O refresh token vive em cookie HttpOnly; o navegador o envia automaticamente.
// Timeout curto: se o /auth/refresh engasgar, as requisicoes aguardando a
// Promise compartilhada falham rapido em vez de pendurar a tela em
// "Carregando dados..." para sempre.
async function doRefresh(): Promise<string> {
  const res = await axios.post(
    `${api.defaults.baseURL}/auth/refresh`,
    null,
    { withCredentials: true, timeout: 10000 },
  )
  localStorage.setItem('token', res.data.access_token)
  return res.data.access_token
}

// Endpoints de autenticacao: um 401 aqui significa "credencial/codigo errado",
// nao "sessao expirada" — nunca tentar refresh nem redirecionar; o erro precisa
// propagar para o useAuth exibir a mensagem (ex.: "CPF ou senha invalidos").
const AUTH_EXEMPT_PATHS = ['/auth/login', '/auth/mfa/verify', '/auth/refresh']

function isAuthExempt(url: string | undefined): boolean {
  if (!url) return false
  return AUTH_EXEMPT_PATHS.some(path => url.includes(path))
}

api.interceptors.response.use(
  res => res,
  async err => {
    const original = err.config

    // 403 = conta inativa ou must_change_password — não tentar refresh
    if (err.response?.status === 403) {
      // Senha temporaria: funil para a tela de troca (rede de seguranca caso
      // o guard de rota nao tenha capturado, ex.: estado antigo em cache).
      const detail = err.response?.data?.detail
      if (
        typeof detail === 'string' &&
        detail.includes('Troca de senha obrigatoria') &&
        !window.location.pathname.startsWith('/change-password')
      ) {
        localStorage.setItem('mustChangePassword', 'true')
        window.location.href = '/change-password'
      }
      return Promise.reject(err)
    }

    if (err.response?.status === 401 && !original?._retry && !isAuthExempt(original?.url)) {
      original._retry = true

      // Deduplicate: se outra requisição já iniciou o refresh, aguarda a mesma Promise
      if (!refreshPromise) {
        refreshPromise = doRefresh().finally(() => { refreshPromise = null })
      }

      try {
        const newToken = await refreshPromise
        original.headers.Authorization = `Bearer ${newToken}`
        return api(original)
      } catch {
        handleSessionExpired()
        return Promise.reject(err)
      }
    }

    return Promise.reject(err)
  },
)

// ── Dedupe de GETs idênticos em voo ─────────────────────────────────────────
// O dashboard dispara o mesmo GET por varias fontes concorrentes (intervalo de
// polling, push SSE, botao Atualizar). Enquanto uma requisicao identica ainda
// esta pendente, reutiliza a MESMA Promise em vez de abrir outra conexao —
// sem mudar a semantica dos dados (todos os chamadores recebem a resposta
// fresca da rede).
const inflightGets = new Map<string, Promise<AxiosResponse<unknown>>>()

export function dedupedGet<T = unknown>(
  url: string,
  config?: AxiosRequestConfig,
): Promise<AxiosResponse<T>> {
  const key = `${url}::${JSON.stringify(config?.params ?? null)}`
  const existing = inflightGets.get(key)
  if (existing) return existing as Promise<AxiosResponse<T>>

  const promise = api.get<T>(url, config).finally(() => {
    inflightGets.delete(key)
  })
  inflightGets.set(key, promise as Promise<AxiosResponse<unknown>>)
  return promise
}

export default api
