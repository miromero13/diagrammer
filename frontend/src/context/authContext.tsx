import { createContext, useEffect, useState, type ReactNode } from 'react'

import { AppConfig } from '@/config/app.config'
import { api, authStorage } from '@/lib/api'
import type { AuthStatus, SessionUser } from '@/models/session'

type AuthContextValue = {
  status: AuthStatus
  user: SessionUser | null
  error: string | null
  login: (email: string, password: string, remember?: boolean) => Promise<void>
  register: (payload: { username: string; email: string; password: string; firstName: string; lastName: string; company?: string }) => Promise<void>
  logout: () => Promise<void>
  refreshSession: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue>({} as AuthContextValue)

const setStoredTokens = (accessToken: string, refreshToken: string) => {
  window.localStorage.setItem(authStorage.accessTokenKey, accessToken)
  window.localStorage.setItem(authStorage.refreshTokenKey, refreshToken)
}

const clearStoredTokens = () => {
  window.localStorage.removeItem(authStorage.accessTokenKey)
  window.localStorage.removeItem(authStorage.refreshTokenKey)
}

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [status, setStatus] = useState<AuthStatus>('loading')
  const [user, setUser] = useState<SessionUser | null>(null)
  const [error, setError] = useState<string | null>(null)

  const applySession = (sessionUser: SessionUser, accessToken: string, refreshToken: string) => {
    setStoredTokens(accessToken, refreshToken)
    setUser(sessionUser)
    setStatus('authenticated')
    setError(null)
  }

  const refreshSession = async () => {
    const refreshToken = window.localStorage.getItem(authStorage.refreshTokenKey)
    if (!refreshToken) {
      setUser(null)
      setStatus('unauthenticated')
      return
    }

    const response = await api.auth.refresh(refreshToken)
    applySession(response.user, response.accessToken, response.refreshToken)
  }

  useEffect(() => {
    const bootstrap = async () => {
      const accessToken = window.localStorage.getItem(AppConfig.JWT_STORAGE_KEY)
      if (!accessToken) {
        setStatus('unauthenticated')
        setUser(null)
        return
      }

      try {
        const profile = await api.auth.profile()
        setUser(profile)
        setStatus('authenticated')
      } catch {
        try {
          await refreshSession()
        } catch {
          clearStoredTokens()
          setUser(null)
          setStatus('unauthenticated')
        }
      }
    }

    void bootstrap()
  }, [])

  const login = async (email: string, password: string, remember = false) => {
    const response = await api.auth.login(email, password, remember)
    applySession(response.user, response.accessToken, response.refreshToken)
  }

  const register = async (payload: { username: string; email: string; password: string; firstName: string; lastName: string; company?: string }) => {
    const response = await api.auth.register(payload)
    applySession(response.user, response.accessToken, response.refreshToken)
  }

  const logout = async () => {
    try {
      await api.auth.logout()
    } finally {
      clearStoredTokens()
      setUser(null)
      setStatus('unauthenticated')
    }
  }

  return (
    <AuthContext.Provider value={{ status, user, error, login, register, logout, refreshSession }}>
      {children}
    </AuthContext.Provider>
  )
}
