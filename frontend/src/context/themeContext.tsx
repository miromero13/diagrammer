import { type ReactNode, createContext, useLayoutEffect, useMemo } from 'react'
import { useStorageTheme } from '../hooks'
import { type ThemeContextState } from '../models/theme-context.model'
import { AppConfig } from '@/config/app.config'

export const ThemeContext = createContext<ThemeContextState>({} as ThemeContextState)

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const [theme, setTheme] = useStorageTheme('theme', AppConfig.DEFAULT_THEME)

  useLayoutEffect(() => {
    document.documentElement.classList.remove('light', 'dark')
    document.documentElement.classList.add(theme)
    document.documentElement.style.colorScheme = theme
  }, [theme])

  function toggleTheme() {
    if (theme === 'light') setTheme('dark')
    else setTheme('light')
  }

  const value = useMemo(() => ({ theme, toggleTheme }), [theme])

  return <ThemeContext.Provider value={value}> {children} </ThemeContext.Provider>
}
