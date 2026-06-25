import { useEffect, useRef, useState } from 'react'
import { RefreshCw, X } from 'lucide-react'

// Aviso "Nova versao disponivel": detecta quando um bundle novo foi publicado
// comparando o hash do script de entrada do index.html servido com o que ESTA
// rodando nesta aba. Puro frontend, sem backend. Inerte em dev (sem hash).

function entryHashFromDoc(): string | null {
  const scripts = Array.from(document.querySelectorAll('script[src]')) as HTMLScriptElement[]
  for (const s of scripts) {
    const m = s.src.match(/\/assets\/index-([\w-]+)\.js/)
    if (m) return m[1]
  }
  return null
}

function entryHashFromHtml(html: string): string | null {
  const m = html.match(/\/assets\/index-([\w-]+)\.js/)
  return m ? m[1] : null
}

const POLL_MS = 90_000

export function UpdateBanner() {
  const running = useRef<string | null>(entryHashFromDoc())
  const [available, setAvailable] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    // Sem hash de entrada (dev server) -> nada a checar.
    if (!running.current) return
    let stopped = false

    const check = async () => {
      if (stopped || document.hidden) return
      try {
        const res = await fetch(`/?_v=${Date.now()}`, { cache: 'no-store' })
        if (!res.ok) return
        const latest = entryHashFromHtml(await res.text())
        if (latest && latest !== running.current) setAvailable(true)
      } catch {
        // offline / falha de rede: ignora, tenta de novo no proximo ciclo
      }
    }

    const id = window.setInterval(check, POLL_MS)
    const onVisible = () => { if (!document.hidden) check() }
    document.addEventListener('visibilitychange', onVisible)
    check() // checa ao montar (pega deploy feito enquanto a aba ja estava aberta)

    return () => {
      stopped = true
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  if (!available || dismissed) return null

  return (
    <div className="fixed inset-x-0 bottom-20 z-40 flex justify-center px-4 md:bottom-6 pointer-events-none">
      <div className="pointer-events-auto flex items-center gap-3 rounded-2xl border border-brand-200 bg-white/95 px-4 py-3 shadow-modal backdrop-blur dark:border-brand-700 dark:bg-gray-800/95">
        <RefreshCw size={18} className="shrink-0 text-brand-600 dark:text-brand-400" />
        <p className="text-sm text-gray-700 dark:text-gray-200">Nova versão disponível.</p>
        <button onClick={() => window.location.reload()} className="btn-primary px-3 py-1.5 text-sm">
          Atualizar
        </button>
        <button
          onClick={() => setDismissed(true)}
          className="text-gray-400 transition-colors hover:text-gray-600 dark:hover:text-gray-200"
          title="Agora não"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  )
}
