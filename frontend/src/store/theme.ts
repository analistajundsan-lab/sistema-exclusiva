import { create } from 'zustand'

interface ThemeState {
  dark: boolean
  toggle: () => void
}

const applyTheme = (dark: boolean) => {
  if (dark) {
    document.documentElement.classList.add('dark')
  } else {
    document.documentElement.classList.remove('dark')
  }
}

// Initialize on module load
const savedTheme = localStorage.getItem('theme')
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
const initialDark = savedTheme ? savedTheme === 'dark' : prefersDark
applyTheme(initialDark)

export const useThemeStore = create<ThemeState>((set) => ({
  dark: initialDark,
  toggle: () =>
    set((state) => {
      const next = !state.dark
      localStorage.setItem('theme', next ? 'dark' : 'light')
      applyTheme(next)
      return { dark: next }
    }),
}))
