// Conexao SSE com o backend para atualizacao em tempo-real (<1s) do painel de
// escala. Camada ADITIVA: se cair, o polling de versao (~2s) cobre.
//
// Usa fetch (nao EventSource) para mandar o token no header Authorization. E
// conecta DIRETO no backend (Fly), nao via proxy /api do Vercel — o proxy faz
// buffering de streams (testado), entao o SSE nao chega. A CSP do front libera
// connect-src para este host.

import { handleSessionExpired } from '../api/client'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'
// Em dev a API ja e absoluta (localhost:8000) e serve SSE direto. Em prod a API
// e o proxy "/api" (buffering) — entao vamos direto no Fly.
const SSE_BASE = API.startsWith('http') ? API : 'https://sistema-exclusiva.fly.dev'

export interface ScheduleEvent {
  unit?: string | null
  schedule_date?: string | null
}

// Abre o stream e chama onChange a cada evento. Retorna uma funcao para encerrar.
export function openScheduleStream(onChange: (ev: ScheduleEvent) => void): () => void {
  let closed = false
  let controller: AbortController | null = null
  let attempt = 0

  const connect = async () => {
    if (closed) return
    controller = new AbortController()
    const token = localStorage.getItem('token')
    try {
      const res = await fetch(`${SSE_BASE}/schedule/events`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        signal: controller.signal,
        cache: 'no-store',
      })
      if (res.status === 401 || res.status === 403) {
        // Token morto/sem permissao: reconectar nao resolve — pararia de
        // martelar o backend com retries infinitos. Encerra o stream e dispara
        // o fluxo padrao de sessao expirada (limpa credenciais + /login).
        closed = true
        handleSessionExpired()
        return
      }
      if (!res.ok || !res.body) throw new Error(`SSE ${res.status}`)
      attempt = 0
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      while (!closed) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        // Eventos SSE sao separados por linha em branco. Comentarios (": ...")
        // e keep-alives sao ignorados (nao tem linha "data:").
        const parts = buffer.split('\n\n')
        buffer = parts.pop() || ''
        for (const part of parts) {
          const dataLine = part.split('\n').find((l) => l.startsWith('data:'))
          if (!dataLine) continue
          try {
            onChange(JSON.parse(dataLine.slice(5).trim()))
          } catch {
            // payload inesperado: ignora
          }
        }
      }
    } catch {
      // queda/erro de rede: reconecta com backoff abaixo
    } finally {
      if (!closed) {
        attempt = Math.min(attempt + 1, 6)
        setTimeout(connect, 1000 * attempt) // 1s,2s,...,6s
      }
    }
  }

  connect()
  return () => {
    closed = true
    try {
      controller?.abort()
    } catch {
      // ignora
    }
  }
}
