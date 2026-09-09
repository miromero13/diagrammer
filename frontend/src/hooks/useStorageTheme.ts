import { useEffect, useState } from 'react'
import { getStorage, setStorage } from '../utils'

function useStorageTheme(key: string, fallback: string): [string, React.Dispatch<React.SetStateAction<string>>] {
  const userPreference = typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches

  const [theme, setTheme] = useState<string>(
    getStorage(key) ?? (userPreference ? 'dark' : fallback)
  )

  useEffect(() => {
    setStorage(key, theme)
  }, [theme, key])

  return [theme, setTheme]
}

export { useStorageTheme }
