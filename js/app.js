import { OPENWEATHER_API_KEY } from './config.js?v=groq4';
import { AppError, geocode, reverseGeocode, getWeather, isAbort, degToCompass, parseCoordinates } from './api.js?v=groq4';
import * as mapView from './map.js?v=groq4';
import * as ui from './ui.js?v=groq4';
import * as store from './storage.js?v=groq4';
import { initChatbot } from './chatbot.js?v=groq4';

const dom = {
  form: document.querySelector('#searchForm'),
  input: document.querySelector('#locationInput'),
  locateBtn: document.querySelector('#locateBtn'),
  settingsBtn: document.querySelector('#settingsBtn'),
  themeToggle: document.querySelector('#themeToggle'),
  dialog: document.querySelector('#settingsDialog'),
  settingsForm: document.querySelector('#settingsForm'),
  keyInput: document.querySelector('#apiKeyInput'),
  aiKeyInput: document.querySelector('#openaiKeyInput'),
  clearAiKeyBtn: document.querySelector('#clearAiKeyBtn'),
  showKey: document.querySelector('#showKey'),
  clearKeyBtn: document.querySelector('#clearKeyBtn'),
  cancelKeyBtn: document.querySelector('#cancelKeyBtn'),
};

const prefs = store.getPrefs();

const state = {
  unit: prefs.unit,
  format: prefs.format,
  place: null,
  wx: null,
  controller: null,
};

const apiKey = () => store.getStoredApiKey() || OPENWEATHER_API_KEY;

function beginRequest() {
  state.controller?.abort();
  state.controller = new AbortController();
  return state.controller.signal;
}

function reportError(err) {
  if (isAbort(err)) return;

  if (err instanceof AppError) {
    console.warn(`[WeatherMap] ${err.title}: ${err.message}`);
    const needsKey = err.code === 'no-key' || err.code === 'auth';
    ui.showAlert({
      level: err.level,
      title: err.title,
      message: err.message,
      action: needsKey ? { label: 'Add API key', onClick: openSettings } : undefined,
    });
  } else {
    console.error(err);
    ui.showAlert({ title: 'Something went wrong', message: 'An unexpected error occurred. Please try again.' });
  }
}

function errorCard(place, err) {
  return ui.el('article', { className: 'wx-card' }, [
    ui.el('h3', { className: 'wx-place', text: place?.name ?? 'Selected location' }),
    ui.el('p', { className: 'wx-sub', text: place?.region ?? '' }),
    ui.el('p', { className: 'wx-desc', text: `⚠️ ${err.title ?? 'Weather unavailable'}` }),
  ]);
}

function cardActions() {
  const { place, wx } = state;
  const lat = place?.lat ?? wx.lat;
  const lon = place?.lng ?? wx.lon;
  const id = store.favoriteId(lat, lon);
  return {
    isFavorite: store.isFavorite(id),
    onShare: () => shareWeather(),
    onCopy: () => copyWeather(),
    onFacebook: () => shareTo('facebook'),
    onWhatsApp: () => shareTo('whatsapp'),
    onTwitter: () => shareTo('twitter'),
    onToggleFavorite: () => {
      const nowFav = store.toggleFavorite({ id, name: ui.placeTitle(place, wx), lat, lon });
      refreshFavorites();
      ui.toast(nowFav ? '★ Added to favorites' : 'Removed from favorites');
      return nowFav;
    },
  };
}

const renderCard = () => ui.buildWeatherCard(state.place, state.wx, state.unit, cardActions());

async function showWeatherAt(lat, lng, place, signal, { keepZoom = false, urlQuery } = {}) {
  ui.setLoaderText('Fetching current weather…');

  const [weatherResult] = await Promise.allSettled([
    getWeather(lat, lng, apiKey(), { format: state.format, signal }),
    mapView.flyTo(lat, lng, { keepZoom }),
  ]);
  if (signal.aborted) return;

  if (weatherResult.status === 'rejected') {
    const err = weatherResult.reason;
    if (isAbort(err)) return;
    mapView.showMarker(lat, lng, errorCard(place, err));
    throw err;
  }

  state.place = { ...(place ?? {}), lat, lng };
  state.wx = weatherResult.value;
  mapView.showMarker(lat, lng, renderCard());
  updateUrl(urlQuery ?? place?.name ?? ui.placeTitle(place, state.wx));
}

async function run(label, task) {
  const signal = beginRequest();
  ui.clearAlerts();
  ui.setBusy(true);
  ui.showLoader(label);
  try {
    await task(signal);
  } catch (err) {
    reportError(err);
  } finally {
    ui.hideLoader();

    if (!signal.aborted || state.controller?.signal === signal) ui.setBusy(false);
  }
}

function searchLocation(query) {
  return run(`Finding “${query}”…`, async (signal) => {
    const location = await geocode(query, { signal });
    await showWeatherAt(location.lat, location.lng, location, signal);
  });
}

function weatherAtPoint(lat, lng, { keepZoom = true, label = 'Looking up this spot…' } = {}) {
  return run(label, async (signal) => {
    const place = await reverseGeocode(lat, lng, { signal });
    await showWeatherAt(lat, lng, place, signal, { keepZoom, urlQuery: `${lat.toFixed(5)},${lng.toFixed(5)}` });
  });
}

function submitQuery(query) {
  const point = parseCoordinates(query);
  if (!point) return searchLocation(query);
  return weatherAtPoint(point.lat, point.lng, {
    keepZoom: false,
    label: `Looking up ${point.lat.toFixed(4)}, ${point.lng.toFixed(4)}…`,
  });
}

function getBrowserPosition() {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new AppError('Geolocation unsupported', 'Your browser cannot share its location.', { level: 'warning' }));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(pos.coords),
      (err) => {
        const messages = {
          1: 'Location permission was denied. Allow it in your browser settings, or search by name instead.',
          2: 'Your position could not be determined. Try searching by name.',
          3: 'Getting your position took too long. Please try again.',
        };
        reject(new AppError('Location unavailable', messages[err.code] ?? err.message, { level: 'warning' }));
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    );
  });
}

function locateUser() {
  return run('Getting your location…', async (signal) => {
    const { latitude, longitude } = await getBrowserPosition();
    if (signal.aborted) return;
    ui.setLoaderText('Looking up your area…');
    const place = await reverseGeocode(latitude, longitude, { signal });
    await showWeatherAt(latitude, longitude, place, signal, { urlQuery: `${latitude.toFixed(5)},${longitude.toFixed(5)}` });
  });
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {

    const area = ui.el('textarea', { className: 'visually-hidden', readonly: '' });
    area.value = text;
    document.body.append(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  }
}

function shareLink() {
  const { wx, place } = state;
  const lat = place?.lat ?? wx.lat;
  const lon = place?.lng ?? wx.lon;
  return wx.cityId
    ? `https://openweathermap.org/city/${wx.cityId}`
    : `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=11/${lat}/${lon}`;
}

async function copyWeather() {
  const ok = await copyText(ui.shareText(state.place, state.wx, state.unit));
  ui.toast(ok ? '📋 Weather copied to clipboard' : 'Copy failed — your browser blocked clipboard access');
}

async function shareWeather() {
  const text = ui.shareText(state.place, state.wx, state.unit);
  const payload = { title: `Weather in ${ui.placeTitle(state.place, state.wx)}`, text, url: shareLink() };

  if (navigator.share && (!navigator.canShare || navigator.canShare(payload))) {
    try {
      await navigator.share(payload);
      return;
    } catch (err) {
      if (err.name === 'AbortError') return;
    }
  }
  await copyWeather();
}

async function shareTo(network) {
  const text = ui.shareText(state.place, state.wx, state.unit);
  const url = shareLink();
  const targets = {

    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}&quote=${encodeURIComponent(text)}`,
    whatsapp: `https://wa.me/?text=${encodeURIComponent(`${text}\n${url}`)}`,
    twitter: `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`,
  };

  if (network === 'facebook') {
    const copied = await copyText(text);
    if (copied) ui.toast('Weather text copied — paste it into your Facebook post');
  }
  window.open(targets[network], '_blank', 'noopener,width=640,height=560');
}

function refreshFavorites() {
  ui.renderFavorites(store.getFavorites(), {
    onSelect: (fav) => {
      dom.input.value = fav.name;
      weatherAtPoint(fav.lat, fav.lon, { keepZoom: false, label: `Loading ${fav.name}…` });
    },
    onRemove: (fav) => {
      store.removeFavorite(fav.id);
      refreshFavorites();
      if (state.wx && store.favoriteId(state.wx.lat, state.wx.lon) === fav.id) mapView.updatePopup(renderCard());
      ui.toast(`Removed ${fav.name}`);
    },
  });
}

function updateUrl(query) {
  if (!query) return;
  const hash = `#q=${encodeURIComponent(query)}`;
  if (location.hash !== hash) history.replaceState(null, '', hash);
}

function queryFromUrl() {
  const params = new URLSearchParams(location.hash.slice(1));
  return params.get('q')?.trim() || '';
}

function showSettings(focusTarget) {
  dom.keyInput.value = store.getStoredApiKey() || OPENWEATHER_API_KEY;
  dom.aiKeyInput.value = store.getStoredOpenAiKey();
  dom.showKey.checked = false;
  dom.keyInput.type = 'password';
  dom.aiKeyInput.type = 'password';
  dom.dialog.showModal();
  focusTarget.focus();
}

const openSettings = () => showSettings(dom.keyInput);
const openAiSettings = () => showSettings(dom.aiKeyInput);

function weatherContext() {
  const { place, wx, unit } = state;
  if (!wx) return '';
  const wind = Number.isFinite(wx.windMs) ? `${wx.windMs.toFixed(1)} m/s from ${degToCompass(wx.windDeg)}` : 'n/a';
  return [
    `Location: ${ui.placeTitle(place, wx)}${wx.country ? `, ${wx.country}` : ''}`,
    `Conditions: ${wx.description}`,
    `Temperature: ${ui.tempLabel(wx.tempC, unit)} (feels like ${ui.tempLabel(wx.feelsC, unit)}, min ${ui.tempLabel(wx.minC, unit)}, max ${ui.tempLabel(wx.maxC, unit)})`,
    `Humidity: ${wx.humidity ?? 'n/a'}%`,
    `Cloud cover: ${wx.clouds ?? 'n/a'}%`,
    `Wind: ${wind}`,
    `Pressure: ${wx.pressure ?? 'n/a'} hPa`,
  ].join('\n');
}

function bindSettings() {
  dom.settingsBtn.addEventListener('click', openSettings);
  dom.cancelKeyBtn.addEventListener('click', () => dom.dialog.close());
  dom.showKey.addEventListener('change', () => {
    const type = dom.showKey.checked ? 'text' : 'password';
    dom.keyInput.type = type;
    dom.aiKeyInput.type = type;
  });
  dom.clearKeyBtn.addEventListener('click', () => {
    store.clearStoredApiKey();
    dom.keyInput.value = '';
    ui.toast('Saved weather key removed');
  });
  dom.clearAiKeyBtn.addEventListener('click', () => {
    store.clearStoredOpenAiKey();
    dom.aiKeyInput.value = '';
    ui.toast('Saved AI key removed');
  });
  dom.settingsForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const weatherKey = dom.keyInput.value.trim();
    const aiKey = dom.aiKeyInput.value.trim();

    if (weatherKey && !/^[a-f0-9]{32}$/i.test(weatherKey)) {
      ui.flagInvalidInput(dom.keyInput);
      ui.toast('An OpenWeatherMap key is 32 hexadecimal characters');
      return;
    }
    if (aiKey && !/^[\w-]{20,}$/.test(aiKey)) {
      ui.flagInvalidInput(dom.aiKeyInput);
      ui.toast('That AI key looks invalid. Paste it exactly as provided');
      return;
    }

    const saved = [];
    if (weatherKey) {
      store.setStoredApiKey(weatherKey);
      saved.push('Weather');
    }
    if (aiKey) {
      store.setStoredOpenAiKey(aiKey);
      saved.push('AI assistant');
    }
    dom.dialog.close();
    if (!saved.length) return;

    ui.clearAlerts();
    ui.showAlert({ level: 'success', title: 'API key saved', message: `${saved.join(' and ')} key saved.` });

    const pending = dom.input.value.trim();
    if (weatherKey && pending) submitQuery(pending);
  });
}

function bindToolbar() {
  document.querySelectorAll('.seg-btn[data-unit]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.unit = btn.dataset.unit;
      store.setPref('unit', state.unit);
      ui.setSegment('unit', state.unit);
      if (state.wx) mapView.updatePopup(renderCard());
    });
  });

  document.querySelectorAll('.seg-btn[data-format]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (state.format === btn.dataset.format) return;
      state.format = btn.dataset.format;
      store.setPref('format', state.format);
      ui.setSegment('format', state.format);
      if (state.wx) {
        const { lat, lon } = state.wx;
        const place = state.place;
        run(`Reloading as ${state.format.toUpperCase()}…`, async (signal) => {
          await showWeatherAt(lat, lon, place, signal, { keepZoom: true });
          ui.toast(`Weather parsed from ${state.format.toUpperCase()}`);
        });
      }
    });
  });

  dom.themeToggle.addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    ui.applyTheme(next);
    store.setPref('theme', next);
  });

  document.addEventListener('keydown', (event) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName);
    if (event.key === '/' && !typing && !dom.dialog.open) {
      event.preventDefault();
      dom.input.focus();
      dom.input.select();
    }
  });
}

function init() {

  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  ui.applyTheme(prefs.theme ?? (prefersDark ? 'dark' : 'light'));
  ui.setSegment('unit', state.unit);
  ui.setSegment('format', state.format);

  try {
    mapView.initMap('map');
    mapView.onMapClick((lat, lng) => weatherAtPoint(lat, lng));
  } catch (err) {
    console.error(err);
    ui.showAlert({
      title: 'Map failed to load',
      message: 'The map library could not be loaded. Check your internet connection and reload the page.',
    });
  }

  dom.form.addEventListener('submit', (event) => {
    event.preventDefault();
    const query = dom.input.value.trim();
    if (query.length < 2) {
      ui.flagInvalidInput(dom.input);
      ui.showAlert({ level: 'warning', title: 'Enter a location', message: 'Type a city, address or landmark (at least 2 characters).', timeout: 5000 });
      return;
    }
    dom.input.classList.remove('is-invalid');
    submitQuery(query);
  });
  dom.input.addEventListener('input', () => dom.input.classList.remove('is-invalid'));
  dom.locateBtn.addEventListener('click', locateUser);

  bindSettings();
  initChatbot({ getContext: weatherContext, getApiKey: store.getStoredOpenAiKey, openAiSettings });
  bindToolbar();
  refreshFavorites();

  if (!apiKey()) {
    ui.showAlert({
      level: 'info',
      title: 'One-time setup',
      message: 'WeatherMap needs a free OpenWeatherMap API key to show weather data.',
      action: { label: 'Add API key', onClick: openSettings },
      timeout: 0,
    });
  }

  const initialQuery = queryFromUrl();
  if (initialQuery) {
    dom.input.value = initialQuery;
    submitQuery(initialQuery);
  }

  window.addEventListener('hashchange', () => {
    const query = queryFromUrl();
    if (query && query !== dom.input.value.trim()) {
      dom.input.value = query;
      submitQuery(query);
    }
  });
}

init();
