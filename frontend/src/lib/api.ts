import { AppConfig } from '@/config/app.config'
import type { AuthResponse, SessionUser } from '@/models/session'

const ACCESS_TOKEN_KEY = AppConfig.JWT_STORAGE_KEY
const REFRESH_TOKEN_KEY = `${AppConfig.JWT_STORAGE_KEY}:refresh`

export class ApiError extends Error {
  statusCode: number

  constructor(message: string, statusCode = 0) {
    super(message)
    this.name = 'ApiError'
    this.statusCode = statusCode
  }
}

const readJson = async <T>(response: Response): Promise<T> => {
  const text = await response.text()
  return text ? JSON.parse(text) as T : ({} as T)
}

const isFormData = (value: unknown): value is FormData => typeof FormData !== 'undefined' && value instanceof FormData

const refreshSession = async () => {
  const refreshToken = window.localStorage.getItem(REFRESH_TOKEN_KEY)
  if (!refreshToken) return false

  const response = await fetch(`${AppConfig.API_BASE_URL}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  })

  const payload = await readJson<AuthResponse>(response)
  if (!response.ok) return false

  window.localStorage.setItem(ACCESS_TOKEN_KEY, payload.accessToken)
  window.localStorage.setItem(REFRESH_TOKEN_KEY, payload.refreshToken)
  return true
}

const request = async <T>(path: string, options: RequestInit = {}, skipAuth = false, retried = false): Promise<T> => {
  const headers: Record<string, string> = {}

  if (!(options.body && isFormData(options.body))) {
    headers['Content-Type'] = 'application/json'
  }

  if (options.headers && !(options.headers instanceof Headers)) {
    Object.assign(headers, options.headers as Record<string, string>)
  }

  if (!skipAuth) {
    const token = window.localStorage.getItem(ACCESS_TOKEN_KEY)
    if (token) {
      headers.Authorization = `Bearer ${token}`
    }
  }

  const response = await fetch(`${AppConfig.API_BASE_URL}${path}`, {
    ...options,
    headers,
  })

  const payload = await readJson<Record<string, unknown>>(response)

  if (response.status === 401 && !skipAuth && !retried && await refreshSession()) {
    return request<T>(path, options, skipAuth, true)
  }

  if (!response.ok) {
    throw new ApiError(String(payload.message || payload.error || 'Request failed'), response.status)
  }

  return payload as T
}

export const api = {
  get: <T>(path: string) => request<T>(path, { method: 'GET' }),
  post: <T>(path: string, body?: unknown, skipAuth = false) => request<T>(path, {
    method: 'POST',
    body: body === undefined || isFormData(body) ? body as BodyInit | undefined : JSON.stringify(body),
  }, skipAuth),
  put: <T>(path: string, body?: unknown) => request<T>(path, {
    method: 'PUT',
    body: body === undefined || isFormData(body) ? body as BodyInit | undefined : JSON.stringify(body),
  }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, {
    method: 'PATCH',
    body: body === undefined || isFormData(body) ? body as BodyInit | undefined : JSON.stringify(body),
  }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  auth: {
    login: (email: string, password: string, remember = false) => request<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password, remember }),
    }, true),
    register: (payload: { username: string; email: string; password: string; firstName: string; lastName: string; company?: string }) => request<AuthResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    }, true),
    refresh: (refreshToken: string) => request<AuthResponse>('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    }, true),
    profile: () => request<SessionUser>('/auth/profile'),
    logout: () => request<{ success: boolean }>('/auth/logout', { method: 'POST' }),
  },
}

export const authStorage = {
  accessTokenKey: ACCESS_TOKEN_KEY,
  refreshTokenKey: REFRESH_TOKEN_KEY,
}
