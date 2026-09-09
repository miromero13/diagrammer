import packageJson from '../../package.json' assert { type: 'json' }

const getEnv = (key: string, fallback: string) => import.meta.env[key] ?? fallback

export const AppConfig = {
  APP_NAME: getEnv('VITE_APP_NAME', packageJson.name),
  APP_VERSION: getEnv('VITE_APP_VERSION', packageJson.version),
  APP_DESCRIPTION: getEnv('VITE_APP_DESCRIPTION', 'Editor UML colaborativo'),
  APP_ENV: import.meta.env.MODE ?? 'development',
  API_BASE_URL: getEnv('VITE_API_BASE_URL', 'http://localhost:3001/api'),
  SOCKET_URL: getEnv('VITE_SOCKET_URL', 'http://localhost:3001'),
  JWT_STORAGE_KEY: getEnv('VITE_JWT_STORAGE_KEY', 'uml_token'),
  DEFAULT_THEME: getEnv('VITE_DEFAULT_THEME', 'light'),
  AUTO_SAVE_INTERVAL: Number(getEnv('VITE_AUTO_SAVE_INTERVAL', '30000')),
  LOCAL_STORAGE_PREFIX: getEnv('VITE_LOCAL_STORAGE_PREFIX', 'uml_diagram_'),
  MAX_LOCAL_DIAGRAMS: Number(getEnv('VITE_MAX_LOCAL_DIAGRAMS', '10')),
  DEFAULT_EXPORT_FORMAT: getEnv('VITE_DEFAULT_EXPORT_FORMAT', 'json'),
  SUPPORTED_EXPORT_FORMATS: getEnv('VITE_SUPPORTED_EXPORT_FORMATS', 'json,png,svg').split(','),
  COLLABORATION_ENABLED: getEnv('VITE_COLLABORATION_ENABLED', 'true') === 'true',
  SOCKET_RECONNECT_ATTEMPTS: Number(getEnv('VITE_SOCKET_RECONNECT_ATTEMPTS', '5')),
  SOCKET_RECONNECT_DELAY: Number(getEnv('VITE_SOCKET_RECONNECT_DELAY', '1000')),
}
