/**
 * Resolve backend API base URLs with safe production defaults.
 */

const isDev = import.meta.env.DEV;

const normalizeUrl = (value) => String(value || '').trim();

export const isLoopbackUrl = (value) => {
  const url = normalizeUrl(value);
  if (!url) return false;
  return /^(https?:\/\/)?(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|::1)(:|\/|$)/i.test(url);
};

const resolveBaseUrl = (envValue, devFallback) => {
  const normalized = normalizeUrl(envValue);
  if (normalized) {
    if (!isDev && isLoopbackUrl(normalized)) {
      return '';
    }
    return normalized.replace(/\/$/, '');
  }

  if (isDev) {
    return String(devFallback || '').replace(/\/$/, '');
  }

  return '';
};

export const API_BASE_URL = resolveBaseUrl(
  import.meta.env.VITE_API_URL,
  'http://localhost:3000/api'
);

export const CLIENTS_API_BASE_URL = resolveBaseUrl(
  import.meta.env.VITE_CLIENTS_API_URL,
  'http://localhost:3000/api/clients'
);

export const buildApiUrl = (baseUrl, path = '') => {
  if (!baseUrl) return '';
  if (!path) return baseUrl;

  if (String(path).startsWith('?')) {
    return `${baseUrl}${path}`;
  }

  const normalizedPath = String(path || '').replace(/^\//, '');
  return `${baseUrl}/${normalizedPath}`;
};
