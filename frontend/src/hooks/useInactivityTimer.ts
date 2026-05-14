import { useEffect, useRef } from 'react'
import { useAuthStore } from '../store/auth'

export function useInactivityTimer() {
  const lastActivity = useRef<number>(Date.now())
  const timerId = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    const isMobile =
      navigator.maxTouchPoints > 0 ||
      window.matchMedia('(pointer: coarse)').matches

    const timeout = isMobile ? 7_200_000 : 3_600_000

    const updateActivity = () => {
      lastActivity.current = Date.now()
    }

    const events = [
      'mousemove',
      'keydown',
      'click',
      'scroll',
      'touchstart',
      'touchmove',
    ] as const

    events.forEach((event) =>
      document.addEventListener(event, updateActivity)
    )

    timerId.current = setInterval(() => {
      if (Date.now() - lastActivity.current >= timeout) {
        useAuthStore.getState().logout()
        window.location.href = '/login'
      }
    }, 30_000)

    return () => {
      events.forEach((event) =>
        document.removeEventListener(event, updateActivity)
      )
      if (timerId.current !== null) {
        clearInterval(timerId.current)
      }
    }
  }, [])
}
