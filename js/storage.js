import { CONFIG } from './config.js?v=groq4';

const KEYS = {
  apiKey: 'weathermap.apiKey',
  openaiKey: 'weathermap.openaiKey',
  favorites: 'weathermap.favorites',
  prefs: 'weathermap.prefs',
};

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function remove(key) {
  try {
    localStorage.removeItem(key);
  } catch {

  }
}

export const getStoredApiKey = () => read(KEYS.apiKey, '');
export const setStoredApiKey = (key) => write(KEYS.apiKey, key.trim());
export const clearStoredApiKey = () => remove(KEYS.apiKey);
export const getStoredOpenAiKey = () => read(KEYS.openaiKey, '');
export const setStoredOpenAiKey = (key) => write(KEYS.openaiKey, key.trim());
export const clearStoredOpenAiKey = () => remove(KEYS.openaiKey);

const DEFAULT_PREFS = { unit: 'metric', format: 'json', theme: null };

export function getPrefs() {
  return { ...DEFAULT_PREFS, ...read(KEYS.prefs, {}) };
}

export function setPref(name, value) {
  write(KEYS.prefs, { ...getPrefs(), [name]: value });
}

export const favoriteId = (lat, lon) => `${lat.toFixed(3)},${lon.toFixed(3)}`;

export function getFavorites() {
  const list = read(KEYS.favorites, []);
  return Array.isArray(list) ? list : [];
}

export function isFavorite(id) {
  return getFavorites().some((f) => f.id === id);
}

export function toggleFavorite(place) {
  const list = getFavorites();
  const index = list.findIndex((f) => f.id === place.id);
  if (index >= 0) {
    list.splice(index, 1);
    write(KEYS.favorites, list);
    return false;
  }
  list.unshift(place);
  write(KEYS.favorites, list.slice(0, CONFIG.maxFavorites));
  return true;
}

export function removeFavorite(id) {
  write(KEYS.favorites, getFavorites().filter((f) => f.id !== id));
}
