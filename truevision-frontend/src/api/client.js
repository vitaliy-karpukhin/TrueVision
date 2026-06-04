import axios from 'axios';
import { cacheGet, cacheSet } from '../utils/cache';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  config.headers['ngrok-skip-browser-warning'] = 'true';
  return config;
});

// Cached GET — returns cached data immediately, refreshes in background if stale
export async function cachedGet(url, { bgRefresh = false } = {}) {
  const cached = cacheGet(url);
  if (cached) {
    if (bgRefresh) api.get(url).then(r => cacheSet(url, r.data)).catch(() => {});
    return cached;
  }
  const { data } = await api.get(url);
  cacheSet(url, data);
  return data;
}

// Keep Railway alive — ping every 4 minutes so the dyno doesn't sleep
let _ping = null;
export function startKeepAlive() {
  if (_ping) return;
  _ping = setInterval(() => {
    api.get('/health').catch(() => {});
  }, 4 * 60 * 1000);
}

export default api;
