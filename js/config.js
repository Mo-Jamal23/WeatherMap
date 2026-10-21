export const OPENWEATHER_API_KEY = '';

export const CONFIG = Object.freeze({

  defaultCenter: [15.5007, 32.5599],
  defaultZoom: 6,
  searchZoom: 11,
  flyDuration: 1.6,

  tiles: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
  },

  endpoints: {
    geocode: 'https://nominatim.openstreetmap.org/search',
    reverse: 'https://nominatim.openstreetmap.org/reverse',
    weather: 'https://api.openweathermap.org/data/2.5/weather',
    chat: 'https://api.groq.com/openai/v1/chat/completions',
    icon: (code) => `https://openweathermap.org/img/wn/${code}@2x.png`,
    cityPage: (id) => `https://openweathermap.org/city/${id}`,
  },

  requestTimeoutMs: 12000,
  chatModels: [
    { id: 'openai/gpt-oss-20b', params: { reasoning_effort: 'low' } },
    { id: 'openai/gpt-oss-120b', params: { reasoning_effort: 'low' } },
    { id: 'llama-3.1-8b-instant', params: {} },
    { id: 'llama-3.3-70b-versatile', params: {} },
  ],
  chatMaxTokens: 1200,
  chatTimeoutMs: 30000,
  chatHistoryLimit: 10,
  maxFavorites: 10,
});
