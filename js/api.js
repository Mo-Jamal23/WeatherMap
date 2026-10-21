import { CONFIG } from './config.js?v=groq4';

export class AppError extends Error {
  constructor(title, message, { level = 'error', code = 'generic', cause } = {}) {
    super(message);
    this.name = 'AppError';
    this.title = title;
    this.level = level;
    this.code = code;
    if (cause) this.cause = cause;
  }
}

export const isAbort = (err) => err?.name === 'AbortError';

async function fetchWithTimeout(url, { signal, timeout = CONFIG.requestTimeoutMs, ...options } = {}) {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeout);
  const onOuterAbort = () => controller.abort();
  signal?.addEventListener('abort', onOuterAbort, { once: true });

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (timedOut) {
      throw new AppError('Request timed out', 'The server took too long to respond. Please try again.', {
        level: 'warning', code: 'timeout', cause: err,
      });
    }
    if (isAbort(err)) throw err;
    throw new AppError('Network error', 'Could not reach the server. Check your internet connection and try again.', {
      code: 'network', cause: err,
    });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onOuterAbort);
  }
}

function placeLabel(result) {
  const a = result.address ?? {};
  const name = result.name || a.city || a.town || a.village || a.hamlet || a.county || a.state
    || result.display_name?.split(',')[0] || 'Unknown place';
  const region = [a.state, a.country].filter((part) => part && part !== name).join(', ');
  return { name, region, countryCode: a.country_code?.toUpperCase() ?? '' };
}

export async function geocode(query, { signal } = {}) {
  const params = new URLSearchParams({
    q: query,
    format: 'jsonv2',
    limit: '1',
    addressdetails: '1',
    'accept-language': 'en',
  });

  const response = await fetchWithTimeout(`${CONFIG.endpoints.geocode}?${params}`, {
    signal,
    headers: { Accept: 'application/json' },
  });

  if (response.status === 429) {
    throw new AppError('Too many searches', 'The geocoding service is rate-limited. Wait a few seconds and try again.', {
      level: 'warning', code: 'rate-limit',
    });
  }
  if (!response.ok) {
    throw new AppError('Geocoding failed', `The location service returned an error (HTTP ${response.status}).`, {
      code: 'geocode-http',
    });
  }

  const results = await response.json();
  if (!Array.isArray(results) || results.length === 0) {
    throw new AppError('Location not found', `We couldn't find “${query}”. Check the spelling or try a nearby city.`, {
      level: 'warning', code: 'not-found',
    });
  }

  const best = results[0];
  return {
    lat: Number.parseFloat(best.lat),
    lng: Number.parseFloat(best.lon),
    displayName: best.display_name,
    ...placeLabel(best),
  };
}

const SETTLEMENT_KEYS = ['city', 'town', 'village', 'municipality', 'suburb', 'city_district', 'neighbourhood', 'hamlet'];
const AREA_KEYS = ['county', 'state_district', 'state'];

function reverseLabel(data) {
  const a = data.address ?? {};
  const settlementKey = SETTLEMENT_KEYS.find((key) => a[key]);
  const areaKey = AREA_KEYS.find((key) => a[key]);
  const name = a[settlementKey] ?? a[areaKey] ?? data.name ?? data.display_name?.split(',')[0] ?? 'Unknown place';
  const region = [a.state, a.country].filter((part) => part && part !== name).join(', ');
  return { name, region, countryCode: a.country_code?.toUpperCase() ?? '', precise: Boolean(settlementKey) };
}

export async function reverseGeocode(lat, lng, { signal } = {}) {
  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lng),
    format: 'jsonv2',
    zoom: '14',
    addressdetails: '1',
    'accept-language': 'en',
  });

  try {
    const response = await fetchWithTimeout(`${CONFIG.endpoints.reverse}?${params}`, { signal });
    if (!response.ok) return null;
    const data = await response.json();
    if (data.error) return null;
    return { displayName: data.display_name, ...reverseLabel(data) };
  } catch (err) {
    if (isAbort(err)) throw err;
    return null;
  }
}

const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
export const degToCompass = (deg) => (Number.isFinite(deg) ? COMPASS[Math.round(deg / 22.5) % 16] : '—');

async function weatherError(response) {
  let apiMessage = '';
  try {
    const body = await response.clone().json();
    apiMessage = body?.message ?? '';
  } catch {

  }

  switch (response.status) {
    case 401:
      return new AppError('Invalid API key',
        'OpenWeatherMap rejected the API key. Check it in ⚙️ Settings — new keys can take up to 2 hours to activate.',
        { code: 'auth' });
    case 404:
      return new AppError('Weather not available', 'OpenWeatherMap has no weather data for this location (404).', {
        level: 'warning', code: 'weather-404',
      });
    case 429:
      return new AppError('Rate limit reached', 'Too many weather requests (free tier: 60/minute). Please wait a moment.', {
        level: 'warning', code: 'rate-limit',
      });
    default:
      return new AppError('Weather service error',
        `OpenWeatherMap returned HTTP ${response.status}${apiMessage ? `: ${apiMessage}` : ''}.`,
        { code: 'weather-http' });
  }
}

function parseWeatherJson(d) {
  const w = d.weather?.[0] ?? {};
  return {
    source: 'JSON',
    cityId: d.id,
    stationName: d.name,
    country: d.sys?.country ?? '',
    lat: d.coord?.lat,
    lon: d.coord?.lon,
    tempC: d.main?.temp,
    feelsC: d.main?.feels_like,
    minC: d.main?.temp_min,
    maxC: d.main?.temp_max,
    humidity: d.main?.humidity,
    pressure: d.main?.pressure,
    clouds: d.clouds?.all,
    windMs: d.wind?.speed,
    windDeg: d.wind?.deg,
    visibility: d.visibility,
    description: w.description ?? 'n/a',
    icon: w.icon ?? '01d',
    sunrise: d.sys?.sunrise ? new Date(d.sys.sunrise * 1000) : null,
    sunset: d.sys?.sunset ? new Date(d.sys.sunset * 1000) : null,
    timezone: d.timezone ?? 0,
    updated: d.dt ? new Date(d.dt * 1000) : new Date(),
  };
}

function parseWeatherXml(text) {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.querySelector('parsererror')) {
    throw new AppError('Unreadable response', 'OpenWeatherMap returned XML that could not be parsed.', { code: 'xml' });
  }
  const attr = (selector, name) => doc.querySelector(selector)?.getAttribute(name) ?? null;
  const num = (selector, name = 'value') => {
    const v = Number.parseFloat(attr(selector, name));
    return Number.isFinite(v) ? v : undefined;
  };

  const utc = (value) => (value ? new Date(`${value}Z`) : null);

  return {
    source: 'XML',
    cityId: Number(attr('city', 'id')),
    stationName: attr('city', 'name') ?? '',
    country: doc.querySelector('city > country')?.textContent ?? '',
    lat: num('city > coord', 'lat'),
    lon: num('city > coord', 'lon'),
    tempC: num('temperature'),
    feelsC: num('feels_like'),
    minC: num('temperature', 'min'),
    maxC: num('temperature', 'max'),
    humidity: num('humidity'),
    pressure: num('pressure'),
    clouds: num('clouds'),
    windMs: num('wind > speed'),
    windDeg: num('wind > direction'),
    visibility: num('visibility'),
    description: attr('weather', 'value') ?? 'n/a',
    icon: attr('weather', 'icon') ?? '01d',
    sunrise: utc(attr('city > sun', 'rise')),
    sunset: utc(attr('city > sun', 'set')),
    timezone: Number(doc.querySelector('city > timezone')?.textContent ?? 0),
    updated: utc(attr('lastupdate', 'value')) ?? new Date(),
  };
}

export async function getWeather(lat, lon, apiKey, { format = 'json', signal } = {}) {
  if (!apiKey) {
    throw new AppError('API key required',
      'Add your free OpenWeatherMap API key to load weather data.',
      { level: 'info', code: 'no-key' });
  }

  const params = new URLSearchParams({
    lat: lat.toFixed(5),
    lon: lon.toFixed(5),
    appid: apiKey,
    units: 'metric',
  });
  if (format === 'xml') params.set('mode', 'xml');

  const response = await fetchWithTimeout(`${CONFIG.endpoints.weather}?${params}`, { signal });
  if (!response.ok) throw await weatherError(response);

  try {
    return format === 'xml' ? parseWeatherXml(await response.text()) : parseWeatherJson(await response.json());
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError('Unreadable response', 'The weather data could not be read. Please try again.', {
      code: 'parse', cause: err,
    });
  }
}

let activeModelIndex = 0;

export const activeChatModel = () => CONFIG.chatModels[activeModelIndex].id;

const MODEL_ERROR_CODES = ['model_not_found', 'model_decommissioned', 'model_terms_required'];

async function chatError(response, modelId) {
  let code = '';
  let apiMessage = '';
  try {
    const body = await response.clone().json();
    code = body?.error?.code ?? '';
    apiMessage = body?.error?.message ?? '';
  } catch {
    apiMessage = '';
  }
  const detail = apiMessage ? ` (${apiMessage})` : '';

  if (response.status === 401) {
    return new AppError('Invalid AI key',
      'The AI provider rejected the API key. Check it in ⚙️ Settings.',
      { code: 'ai-auth' });
  }
  if (response.status === 404 || MODEL_ERROR_CODES.includes(code)) {
    return new AppError('Model unavailable',
      `The model “${modelId}” cannot be used with this key.${detail}`,
      { code: 'ai-model' });
  }
  if (response.status === 429) {
    if (code === 'insufficient_quota') {
      return new AppError('AI quota exceeded',
        'This AI account has no remaining quota. Wait for it to reset or use another key.',
        { level: 'warning', code: 'ai-quota' });
    }
    return new AppError('Too many questions',
      `The AI provider is rate-limiting this key. Wait a moment and try again.${detail}`,
      { level: 'warning', code: 'ai-rate-limit' });
  }
  return new AppError('Assistant error',
    `The AI provider returned HTTP ${response.status}${detail}.`,
    { code: 'ai-http' });
}

async function readReply(response) {
  try {
    const data = await response.json();
    const text = data.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error('empty reply');
    return text;
  } catch (err) {
    throw new AppError('Unreadable response', 'The assistant reply could not be read. Please try again.', {
      code: 'ai-parse', cause: err,
    });
  }
}

export async function askAssistant(messages, apiKey, { signal } = {}) {
  if (!apiKey) {
    throw new AppError('AI key required',
      'Add your free AI API key in ⚙️ Settings to chat with the assistant.',
      { level: 'info', code: 'no-ai-key' });
  }

  let lastModelError = null;
  for (let i = activeModelIndex; i < CONFIG.chatModels.length; i += 1) {
    const { id, params } = CONFIG.chatModels[i];
    const response = await fetchWithTimeout(CONFIG.endpoints.chat, {
      signal,
      timeout: CONFIG.chatTimeoutMs,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: id,
        messages,
        max_tokens: CONFIG.chatMaxTokens,
        temperature: 0.6,
        ...params,
      }),
    });

    if (response.ok) {
      activeModelIndex = i;
      return readReply(response);
    }

    const error = await chatError(response, id);
    if (error.code !== 'ai-model') throw error;
    lastModelError = error;
  }

  throw new AppError('No AI model available',
    `None of the configured models could be used. ${lastModelError.message}`,
    { code: 'ai-model' });
}

const COORD_PART = String.raw`(?:([NSEW])\s*)?(-?\d+(?:\.\d+)?)\s*(?:°\s*(?:(\d+(?:\.\d+)?)\s*'\s*(?:(\d+(?:\.\d+)?)\s*"\s*)?)?)?\s*([NSEW])?`;
const COORD_PAIR = new RegExp(`^${COORD_PART}(?:\\s*[,;/]\\s*|\\s+)${COORD_PART}$`, 'i');

function partValue(hemiBefore, degrees, minutes, seconds, hemiAfter) {
  const hemi = (hemiBefore || hemiAfter || '').toUpperCase();
  const negative = degrees.startsWith('-');
  const magnitude = Math.abs(Number.parseFloat(degrees))
    + (minutes ? Number.parseFloat(minutes) / 60 : 0)
    + (seconds ? Number.parseFloat(seconds) / 3600 : 0);
  const value = hemi === 'S' || hemi === 'W' || negative ? -magnitude : magnitude;
  return { value, axis: hemi === 'N' || hemi === 'S' ? 'lat' : hemi === 'E' || hemi === 'W' ? 'lng' : null };
}

export function parseCoordinates(input) {
  const text = String(input ?? '')
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[،؛]/g, ',')
    .replace(/٫/g, '.')
    .replace(/[′’‘`]/g, "'")
    .replace(/[″”“]/g, '"')
    .replace(/\b(?:lat(?:itude)?|lon(?:g|gitude)?|lng)\s*[:=]?\s*/gi, '')
    .replace(/^[\s([]+|[\s)\]]+$/g, '');

  const match = COORD_PAIR.exec(text);
  if (!match) return null;

  const first = partValue(match[1], match[2], match[3], match[4], match[5]);
  const second = partValue(match[6], match[7], match[8], match[9], match[10]);

  let lat;
  let lng;
  if (first.axis && second.axis) {
    if (first.axis === second.axis) return null;
    [lat, lng] = first.axis === 'lat' ? [first.value, second.value] : [second.value, first.value];
  } else if (first.axis || second.axis) {
    const [tagged, other] = first.axis ? [first, second] : [second, first];
    [lat, lng] = tagged.axis === 'lat' ? [tagged.value, other.value] : [other.value, tagged.value];
  } else if (Math.abs(first.value) > 90 && Math.abs(second.value) <= 90) {
    [lat, lng] = [second.value, first.value];
  } else {
    [lat, lng] = [first.value, second.value];
  }

  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}
