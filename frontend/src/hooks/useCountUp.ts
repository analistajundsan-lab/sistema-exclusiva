import { useEffect, useRef, useState } from 'react'

/**
 * Animated count-up. Eases a numeric value from 0 → target on mount
 * (easeOutCubic, ~750ms). Non-numeric targets pass through unchanged.
 * Respects prefers-reduced-motion and snaps to target if rAF is throttled
 * (background tab), so the value is never left stuck below the target.
 */
export function useCountUp(target: number | string, enabled = true): number | string {
  const numeric = typeof target === 'number' && Number.isFinite(target)
  const [val, setVal] = useState<number | string>(numeric && enabled ? 0 : target)
  const rafRef = useRef(0)

  useEffect(() => {
    if (!numeric || !enabled) {
      setVal(target)
      return
    }
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) {
      setVal(target)
      return
    }

    const dur = 750
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / dur)
      const eased = 1 - Math.pow(1 - t, 3) // easeOutCubic
      setVal(Math.round((target as number) * eased))
      if (t < 1) rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    // Safety net: snap to target if rAF never resolves (throttled/background tab).
    const safety = window.setTimeout(() => setVal(target), 900)
    return () => {
      cancelAnimationFrame(rafRef.current)
      window.clearTimeout(safety)
    }
  }, [target, numeric, enabled])

  return numeric ? val : target
}
