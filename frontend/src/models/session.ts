export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated'

export interface SessionUser {
  id: string
  username: string
  email: string
  firstName: string
  lastName: string
  role: string
  avatarUrl?: string | null
  company?: string | null
}

export interface AuthResponse {
  user: SessionUser
  accessToken: string
  refreshToken: string
  expiresIn: string
}
