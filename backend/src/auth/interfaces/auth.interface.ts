export interface AuthI {
  email: string;
  password: string;
}

export interface AuthGoogleI {
  access_token: string;
}

export interface AuthTokenResult {
  role: string;
  sub: string;
  iat: number;
  exp: number;
}

export interface SendEmailI {
  email: string;
}

export interface ResetPasswordI {
  token: string;
  password: string;
}
