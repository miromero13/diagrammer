export const EnvConfig = () => ({
  APP_NAME: process.env.APP_NAME || 'Diagramador Backend',
  APP_PROD: process.env.APP_PROD || process.env.NODE_ENV === 'production',
  APP_VERSION: process.env.APP_VERSION || '1.0.0',
  PORT: process.env.PORT || 3001,

  APP_URL: process.env.APP_URL || `http://localhost:${process.env.PORT || 3001}`,
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:3000',

  DB_CONNECTION: process.env.DB_CONNECTION || 'postgres',
  DB_URL: process.env.DB_URL,
  DB_HOST: process.env.DB_HOST || 'localhost',
  DB_PORT: process.env.DB_PORT || 5432,
  DB_DATABASE: process.env.DB_DATABASE || process.env.DB_NAME || 'diagrammer_db',
  DB_USERNAME: process.env.DB_USERNAME || process.env.DB_USER || 'postgres',
  DB_PASSWORD: process.env.DB_PASSWORD || 'postgres',

  HASH_SALT: process.env.HASH_SALT || 12,
  JWT_AUTH: process.env.JWT_AUTH || process.env.JWT_SECRET || 'secret',
  JWT_RECOVERY: process.env.JWT_RECOVERY || process.env.JWT_REFRESH_SECRET || 'secret',

  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  GOOGLE_SECRET: process.env.GOOGLE_SECRET,

  MAILER_SERVICE: process.env.MAILER_SERVICE || 'gmail',
  MAILER_EMAIL: process.env.MAILER_EMAIL,
  MAILER_SECRET_KEY: process.env.MAILER_SECRET_KEY,
  MAILER_PORT: process.env.MAILER_PORT || 587,

  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  SOCKET_CORS_ORIGIN: process.env.SOCKET_CORS_ORIGIN || process.env.FRONTEND_URL || 'http://localhost:3000',
});
