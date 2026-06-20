export type RuntimeMode = 'development' | 'test' | 'production';

export interface DreamStudioConfig {
  nodeEnv: RuntimeMode;
  databaseUrl: string;
  redisUrl: string;
  dreamstudioSecretKey: string;
  cookieSecret: string;
  appBaseUrl: string;
  appAllowedOrigins: string[];
  port: number;
  webPort: number;
  apiPort: number;
  localStorageRoot: string;
  logLevel: string;
  trustProxy: boolean;
  workerConcurrency: number;
}

const REQUIRED_ENV_KEYS = [
  'DATABASE_URL',
  'REDIS_URL',
  'DREAMSTUDIO_SECRET_KEY',
  'COOKIE_SECRET',
  'APP_BASE_URL',
] as const;

export function getEnv(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function getOptionalEnv(name: string, fallback: string): string {
  return process.env[name] && process.env[name] !== '' ? process.env[name] : fallback;
}

export function parseBoolean(value: string | undefined, fallback = false): boolean {
  if (value === undefined || value === '') {
    return fallback;
  }
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

export function parsePort(name: string, fallback: number): number {
  const rawValue = getOptionalEnv(name, String(fallback));
  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
    throw new Error(`Invalid port in ${name}: ${rawValue}`);
  }
  return parsed;
}

export function parseCsvEnv(name: string): string[] {
  const rawValue = process.env[name];
  if (!rawValue) {
    return [];
  }

  return rawValue
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

export function loadConfig(): DreamStudioConfig {
  for (const key of REQUIRED_ENV_KEYS) {
    getEnv(key);
  }

  return {
    nodeEnv: getOptionalEnv('NODE_ENV', 'development') as RuntimeMode,
    databaseUrl: getEnv('DATABASE_URL'),
    redisUrl: getEnv('REDIS_URL'),
    dreamstudioSecretKey: getEnv('DREAMSTUDIO_SECRET_KEY'),
    cookieSecret: getEnv('COOKIE_SECRET'),
    appBaseUrl: getEnv('APP_BASE_URL'),
    appAllowedOrigins: parseCsvEnv('APP_ALLOWED_ORIGINS'),
    port: parsePort('PORT', 3000),
    webPort: parsePort('WEB_PORT', 3000),
    apiPort: parsePort('API_PORT', 3001),
    localStorageRoot: getOptionalEnv('LOCAL_STORAGE_ROOT', '/data'),
    logLevel: getOptionalEnv('LOG_LEVEL', 'info'),
    trustProxy: parseBoolean(process.env.TRUST_PROXY, false),
    workerConcurrency: parsePort('WORKER_CONCURRENCY', 2),
  };
}

export function publicConfigSnapshot(config = loadConfig()) {
  return {
    node_env: config.nodeEnv,
    app_base_url: config.appBaseUrl,
    app_allowed_origins_count: config.appAllowedOrigins.length,
    api_port: config.apiPort,
    web_port: config.webPort,
    local_storage_root: config.localStorageRoot,
    log_level: config.logLevel,
    trust_proxy: config.trustProxy,
    worker_concurrency: config.workerConcurrency,
  };
}

export function isAllowedAppOrigin(origin: string, config = loadConfig()): boolean {
  const appUrl = new URL(config.appBaseUrl);
  const candidateUrl = new URL(origin);

  if (candidateUrl.origin === appUrl.origin) {
    return true;
  }

  if (config.appAllowedOrigins.some((allowedOrigin) => isSameOrigin(candidateUrl, allowedOrigin))) {
    return true;
  }

  if (
    !isLocalOrPrivateHostname(appUrl.hostname) ||
    !isLocalOrPrivateHostname(candidateUrl.hostname)
  ) {
    return false;
  }

  return normalizePort(candidateUrl) === normalizePort(appUrl);
}

function isSameOrigin(candidateUrl: URL, allowedOrigin: string): boolean {
  try {
    return candidateUrl.origin === new URL(allowedOrigin).origin;
  } catch {
    return false;
  }
}

function isLocalOrPrivateHostname(hostname: string): boolean {
  return isLocalHostname(hostname) || isPrivateIpv4(hostname);
}

function isLocalHostname(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '0.0.0.0' ||
    hostname === '[::1]' ||
    hostname === '::1'
  );
}

function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split('.').map((part) => Number.parseInt(part, 10));
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return false;
  }

  const [first, second] = parts;
  return (
    first === 10 ||
    first === 127 ||
    first === 0 ||
    (first === 169 && second === 254) ||
    (first === 192 && second === 168) ||
    (first === 172 && second >= 16 && second <= 31)
  );
}

function normalizePort(url: URL): string {
  if (url.port) {
    return url.port;
  }

  return url.protocol === 'https:' ? '443' : '80';
}
