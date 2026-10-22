import { CONFIG } from './config.js?v=groq4';

let map = null;
let activeMarker = null;

const markerIcon = () => L.divIcon({
  className: 'wx-marker',
  html: '<div class="wx-pin"></div><div class="wx-pulse"></div>',
  iconSize: [34, 44],
  iconAnchor: [17, 44],
  popupAnchor: [0, -44],
});

export function initMap(containerId) {
  if (typeof L === 'undefined') {
    throw new Error('Leaflet failed to load');
  }

  map = L.map(containerId, {
    center: CONFIG.defaultCenter,
    zoom: CONFIG.defaultZoom,
    worldCopyJump: true,
    zoomControl: true,
  });

  L.tileLayer(CONFIG.tiles.url, {
    attribution: CONFIG.tiles.attribution,
    maxZoom: CONFIG.tiles.maxZoom,
  }).addTo(map);

  L.control.scale({ imperial: false }).addTo(map);
  return map;
}

export function onMapClick(handler) {
  let popupWasOpen = false;
  map.on('preclick', () => { popupWasOpen = Boolean(activeMarker?.isPopupOpen()); });
  map.on('click', (e) => {
    if (popupWasOpen) return;
    handler(e.latlng.lat, e.latlng.lng);
  });
}

export function clearMarker() {
  if (activeMarker) {
    activeMarker.remove();
    activeMarker = null;
  }
}

export function flyTo(lat, lng, { keepZoom = false } = {}) {
  return new Promise((resolve) => {
    const zoom = keepZoom ? map.getZoom() : Math.max(map.getZoom(), CONFIG.searchZoom);
    const target = L.latLng(lat, lng);

    if (map.getCenter().distanceTo(target) < 5 && map.getZoom() === zoom) {
      resolve();
      return;
    }
    map.once('moveend', () => resolve());
    map.flyTo(target, zoom, { animate: true, duration: CONFIG.flyDuration });
  });
}

export function showMarker(lat, lng, popupContent) {
  clearMarker();
  activeMarker = L.marker([lat, lng], { icon: markerIcon(), riseOnHover: true, keyboard: true })
    .addTo(map)
    .bindPopup(popupContent, {
      className: 'wx-popup',
      maxWidth: 320,
      minWidth: 250,
      autoPanPadding: [30, 30],
      closeButton: true,
    });

  setTimeout(() => activeMarker?.openPopup(), 450);
  return activeMarker;
}

export function updatePopup(popupContent) {
  if (!activeMarker) return;
  activeMarker.setPopupContent(popupContent);
  if (!activeMarker.isPopupOpen()) activeMarker.openPopup();
}

export const hasMarker = () => activeMarker !== null;
