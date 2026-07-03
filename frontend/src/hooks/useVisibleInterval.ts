import { useEffect, useRef } from 'react'

/**
 * setInterval que só dispara enquanto a aba está VISÍVEL.
 *
 * Por quê: telas de operação ficam abertas o dia todo (e às vezes a noite
 * inteira em máquinas esquecidas). Um poll fixo continua batendo no backend
 * 24/7, o que mantém o banco (Neon) sempre "acordado" e consome a franquia.
 * Com este hook, quando a aba está oculta o callback NÃO roda — sem requests,
 * o banco pode suspender. Ao voltar a ficar visível, dispara uma vez na hora
 * para o operador ver dados frescos imediatamente.
 *
 * O callback é sempre o mais recente (via ref), então closures com estado/props
 * atuais funcionam sem recriar o intervalo.
 */
export function useVisibleInterval(callback: () => void, ms: number) {
  const cbRef = useRef(callback)
  cbRef.current = callback

  useEffect(() => {
    const tick = () => {
      if (!document.hidden) cbRef.current()
    }
    const id = window.setInterval(tick, ms)
    // Ao reabrir/voltar o foco na aba, atualiza na hora (não espera o próximo ciclo).
    const onVisible = () => {
      if (!document.hidden) cbRef.current()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [ms])
}
