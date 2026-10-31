import { useCallback, useSyncExternalStore } from 'react'

export type Theme = 'light' | 'dark'

const THEME_STORAGE_KEY = 'theme'
const listeners = new Set<() => void>()

function getSnapshot(): Theme {
  if (typeof document === 'undefined') return 'dark'
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function setTheme(next: Theme) {
  if (typeof document === 'undefined') return
  document.documentElement.classList.toggle('dark', next === 'dark')
  try {
    localStorage.setItem(THEME_STORAGE_KEY, next)
  } catch {
    // Ignore storage quota / privacy mode errors
  }
  for (const listener of listeners) listener()
}

export function useTheme() {
  const theme = useSyncExternalStore<Theme>(subscribe, getSnapshot, () => 'dark')
  const toggleTheme = useCallback(() => {
    setTheme(getSnapshot() === 'dark' ? 'light' : 'dark')
  }, [])

  return { theme, setTheme, toggleTheme }
}
