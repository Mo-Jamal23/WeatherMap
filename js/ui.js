import { CONFIG } from './config.js?v=groq4';
import { degToCompass } from './api.js?v=groq4';

const $ = (selector) => document.querySelector(selector);

const ICON_EMOJI = {
  '01': '☀️', '02': '⛅', '03': '☁️', '04': '☁️',
  '09': '🌧️', '10': '🌦️', '11': '⛈️', '13': '❄️', '50': '🌫️',
};

export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null) continue;
    if (key === 'text') node.textContent = value;
    else if (key === 'className') node.className = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2).toLowerCase(), value);
    else node.setAttribute(key, value);
  }
  for (const child of [].concat(children)) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

let pending = 0;

export function showLoader(text = 'Loading…') {
  pending += 1;
  $('#loaderText').textContent = text;
  $('#loader').hidden = false;
  $('#map').setAttribute('aria-busy', 'true');
}

export function setLoaderText(text) {
  $('#loaderText').textContent = text;
}

export function hideLoader() {
  pending = Math.max(0, pending - 1);
  if (pending === 0) {
    $('#loader').hidden = true;
    $('#map').removeAttribute('aria-busy');
  }
}

export function setBusy(isBusy) {
  $('#searchBtn').disabled = isBusy;
  $('#locateBtn').disabled = isBusy;
}

const ALERT_ICONS = { error: '⛔', warning: '⚠️', info: 'ℹ️', success: '✅' };

function dismissAlert(card) {
  if (!card.isConnected || card.classList.contains('is-leaving')) return;
  card.classList.add('is-leaving');
  card.addEventListener('animationend', () => card.remove(), { once: true });
}

export function clearAlerts() {
  $('#alerts').replaceChildren();
}

export function showAlert({ level = 'error', title, message, action, timeout }) {
  const card = el('div', { className: `alert alert--${level}`, role: level === 'error' ? 'alert' : 'status' }, [
    el('span', { className: 'alert-icon', 'aria-hidden': 'true', text: ALERT_ICONS[level] ?? 'ℹ️' }),
    el('div', { className: 'alert-content' }, [
      el('p', { className: 'alert-title', text: title }),
      el('p', { className: 'alert-msg', text: message }),
      action && el('button', {
        type: 'button',
        className: 'btn btn-primary alert-action',
        text: action.label,
        onClick: () => { dismissAlert(card); action.onClick(); },
      }),
    ]),
    el('button', { type: 'button', className: 'alert-close', 'aria-label': 'Dismiss', text: '×', onClick: () => dismissAlert(card) }),
  ]);

  $('#alerts').prepend(card);

  [...$('#alerts').children].slice(3).forEach((old) => old.remove());

  const ttl = timeout ?? (level === 'success' || level === 'info' ? 6000 : 0);
  if (ttl > 0) setTimeout(() => dismissAlert(card), ttl);
  return card;
}

let toastTimer;
export function toast(message) {
  const node = $('#toast');
  node.textContent = message;
  node.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { node.hidden = true; }, 2600);
}

export const toUnit = (celsius, unit) => (unit === 'imperial' ? (celsius * 9) / 5 + 32 : celsius);
export const tempLabel = (celsius, unit) =>
  (Number.isFinite(celsius) ? `${Math.round(toUnit(celsius, unit))}°${unit === 'imperial' ? 'F' : 'C'}` : '—');

function windLabel(ms, unit) {
  if (!Number.isFinite(ms)) return '—';
  return unit === 'imperial' ? `${(ms * 2.23694).toFixed(1)} mph` : `${ms.toFixed(1)} m/s · ${Math.round(ms * 3.6)} km/h`;
}

function localTime(date, offsetSeconds) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '—';
  return new Date(date.getTime() + offsetSeconds * 1000).toISOString().slice(11, 16);
}

export function placeTitle(place, wx) {
  const isCoarse = place?.precise === false;
  return (isCoarse && wx.stationName) || place?.name || wx.stationName || `${wx.lat.toFixed(2)}, ${wx.lon.toFixed(2)}`;
}

export function shareText(place, wx, unit) {
  const name = placeTitle(place, wx);
  const country = wx.country ? `, ${wx.country}` : '';
  return [
    `🌍 Weather in ${name}${country}: ${tempLabel(wx.tempC, unit)}, ${wx.description}`,
    `🌡 Feels like ${tempLabel(wx.feelsC, unit)} · 💧 Humidity ${wx.humidity ?? '—'}% · ☁️ Clouds ${wx.clouds ?? '—'}%`,
    `💨 Wind ${windLabel(wx.windMs, unit)} ${degToCompass(wx.windDeg)}`,
    '— shared from WeatherMap',
  ].join('\n');
}

export function buildWeatherCard(place, wx, unit, actions) {
  const isNight = wx.icon.endsWith('n');
  const title = placeTitle(place, wx);
  const pointLat = place?.lat ?? wx.lat;
  const pointLon = place?.lng ?? wx.lon;
  const subtitle = [place?.region || wx.country, `${pointLat.toFixed(4)}°, ${pointLon.toFixed(4)}°`]
    .filter(Boolean).join(' · ');

  const stat = (label, value) => el('div', { className: 'wx-stat' }, [el('dt', { text: label }), el('dd', { text: value })]);

  const favBtn = el('button', {
    type: 'button',
    className: `wx-btn wx-btn--fav${actions.isFavorite ? ' is-fav' : ''}`,
    'aria-pressed': String(actions.isFavorite),
    title: actions.isFavorite ? 'Remove from favorites' : 'Save to favorites',
    text: actions.isFavorite ? '★ Saved' : '☆ Save',
    onClick: () => {
      const nowFav = actions.onToggleFavorite();
      favBtn.classList.toggle('is-fav', nowFav);
      favBtn.setAttribute('aria-pressed', String(nowFav));
      favBtn.textContent = nowFav ? '★ Saved' : '☆ Save';
      favBtn.title = nowFav ? 'Remove from favorites' : 'Save to favorites';
    },
  });

  const iconImg = el('img', {
    className: 'wx-icon',
    src: CONFIG.endpoints.icon(wx.icon),
    alt: wx.description,
    width: '84',
    height: '84',
    onError: () => {
      iconImg.replaceWith(el('span', {
        className: 'wx-icon wx-icon--emoji',
        role: 'img',
        'aria-label': wx.description,
        text: ICON_EMOJI[wx.icon.slice(0, 2)] ?? '🌡️',
      }));
    },
  });

  return el('article', { className: `wx-card${isNight ? ' is-night' : ''}` }, [
    el('h3', { className: 'wx-place', text: title }),
    el('p', { className: 'wx-sub', text: subtitle }),

    el('div', { className: 'wx-main' }, [
      iconImg,
      el('span', { className: 'wx-temp' }, [
        Number.isFinite(wx.tempC) ? String(Math.round(toUnit(wx.tempC, unit))) : '—',
        el('sup', { text: unit === 'imperial' ? '°F' : '°C' }),
      ]),
    ]),
    el('p', { className: 'wx-desc' }, [
      wx.description,
      el('span', { className: 'wx-feels', text: ` · feels like ${tempLabel(wx.feelsC, unit)}` }),
    ]),

    el('dl', { className: 'wx-stats' }, [
      stat('☁️ Clouds', `${wx.clouds ?? '—'}%`),
      stat('💧 Humidity', `${wx.humidity ?? '—'}%`),
      stat('💨 Wind', `${windLabel(wx.windMs, unit)}`),
      stat('🧭 Direction', `${degToCompass(wx.windDeg)}${Number.isFinite(wx.windDeg) ? ` (${Math.round(wx.windDeg)}°)` : ''}`),
      stat('🌡 Min / Max', `${tempLabel(wx.minC, unit)} / ${tempLabel(wx.maxC, unit)}`),
      stat('⏲ Pressure', `${wx.pressure ?? '—'} hPa`),
    ]),

    el('div', { className: 'wx-sun' }, [
      el('span', { text: `🌅 Sunrise ${localTime(wx.sunrise, wx.timezone)}` }),
      el('span', { text: `🌇 Sunset ${localTime(wx.sunset, wx.timezone)}` }),
    ]),

    el('div', { className: 'wx-actions' }, [
      el('button', { type: 'button', className: 'wx-btn wx-btn--share', text: '🔗 Share', onClick: actions.onShare }),
      el('button', { type: 'button', className: 'wx-btn wx-btn--fb', text: 'facebook', title: 'Post to Facebook', onClick: actions.onFacebook }),
      el('button', { type: 'button', className: 'wx-btn', text: 'WhatsApp', onClick: actions.onWhatsApp }),
      el('button', { type: 'button', className: 'wx-btn', text: '𝕏', title: 'Post to X / Twitter', onClick: actions.onTwitter }),
      el('button', { type: 'button', className: 'wx-btn', text: '📋 Copy', title: 'Copy to clipboard', onClick: actions.onCopy }),
      favBtn,
    ]),

    el('p', {
      className: 'wx-meta',
      text: `Station: ${wx.stationName || 'n/a'} · Updated ${localTime(wx.updated, wx.timezone)} local · via ${wx.source}`,
    }),
  ]);
}

export function renderFavorites(favorites, { onSelect, onRemove }) {
  const list = $('#favoritesList');
  list.replaceChildren(
    ...favorites.map((fav) => el('li', { className: 'chip' }, [
      el('button', { type: 'button', className: 'chip-btn', title: `Show weather for ${fav.name}`, text: fav.name, onClick: () => onSelect(fav) }),
      el('button', { type: 'button', className: 'chip-remove', 'aria-label': `Remove ${fav.name} from favorites`, text: '×', onClick: () => onRemove(fav) }),
    ])),
  );
  $('#favoritesEmpty').hidden = favorites.length > 0;
}

export function setSegment(attr, value) {
  document.querySelectorAll(`.seg-btn[data-${attr}]`).forEach((btn) => {
    const active = btn.dataset[attr] === value;
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-pressed', String(active));
  });
}

export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  $('#themeToggle').textContent = theme === 'dark' ? '☀️' : '🌙';
}

export function flagInvalidInput(input) {
  input.classList.remove('is-invalid');
  void input.offsetWidth;
  input.classList.add('is-invalid');
  input.focus();
}
