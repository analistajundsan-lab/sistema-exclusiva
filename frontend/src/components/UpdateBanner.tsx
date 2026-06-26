import { useEffect, useRef, useState } from 'react'
import { RefreshCw } from 'lucide-react'

// Auto-atualizacao: detecta quando um bundle novo foi publicado (compara o hash
// do script de entrada do index.html servido com o que ESTA rodando na aba) e
// RECARREGA sozinho — sem ninguem clicar. Trava de seguranca: nao recarrega se o
// usuario esta digitando (input/select/textarea focado) ou com um modal aberto
// (ex.: registrando ocorrencia, marcado com [data-modal-open]); nesses casos
// mostra um banner discreto e tenta de novo quando ficar seguro.

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

function userIsBusy(): boolean {
  const ae = document.activeElement as HTMLElement | null
  if (ae) {
    if (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.tagName === 'SELECT' || ae.isContentEditable) {
      return true
    }
  }
  // Modal aberto (ex.: registro de ocorrencia) — nao recarrega no meio.
  return !!document.querySelector('[data-modal-open]')
}

const POLL_MS = 15_000

export function UpdateBanner() {
  const running = useRef<string | null>(entryHashFromDoc())
  const pending = useRef(false) // nova versao detectada, aguardando recarregar
  const [showBanner, setShowBanner] = useState(false)

  useEffect(() => {
    // Sem hash de entrada (dev server) -> nada a checar.
    if (!running.current) return
    let stopped = false

    const reloadIfSafe = () => {
      if (stopped || !pending.current) return
      if (userIsBusy()) {
        setShowBanner(true) // ocupado: oferece o botao manual e tenta de novo depois
        return
      }
      window.location.reload()
    }

    const tick = async () => {
      if (stopped) return
      if (!pending.current) {
        try {
          const res = await fetch(`/?_v=${Date.now()}`, { cache: 'no-store' })
          if (res.ok) {
            const latest = entryHashFromHtml(await res.text())
            if (latest && latest !== running.current) pending.current = true
          }
        } catch {
          // offline / falha: ignora, tenta no proximo ciclo
        }
      }
      reloadIfSafe()
    }

    const id = window.setInterval(tick, POLL_MS)
    const onVisible = () => { if (!document.hidden) tick() }
    // Ao sair de um campo / fechar algo, reavalia se ja da pra recarregar.
    const onBlur = () => window.setTimeout(reloadIfSafe, 150)
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('blur', onBlur, true)
    tick()

    return () => {
      stopped = true
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('blur', onBlur, true)
    }
  }, [])

  if (!showBanner) return null

  return (
    <div className="fixed inset-x-0 bottom-20 z-40 flex justify-center px-4 md:bottom-6 pointer-events-none">
      <div className="pointer-events-auto flex items-center gap-3 rounded-2xl border border-brand-200 bg-white/95 px-4 py-3 shadow-modal backdrop-blur dark:border-brand-700 dark:bg-gray-800/95">
        <RefreshCw size={18} className="shrink-0 text-brand-600 dark:text-brand-400" />
        <p className="text-sm text-gray-700 dark:text-gray-200">Nova versão disponível.</p>
        <button onClick={() => window.location.reload()} className="btn-primary px-3 py-1.5 text-sm">
          Atualizar
        </button>
      </div>
    </div>
  )
}
