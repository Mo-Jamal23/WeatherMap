# WeatherMap

**Repository:** https://github.com/Mo-Jamal23/WeatherMap
**Live demo:** https://mo-jamal23.github.io/WeatherMap/

-----

## Project Name

**WeatherMap

Course: Advanced Web Technologies, Course Project 2.

-----

## Description

WeatherMap is a single-page web application that shows live weather on an interactive map. The user types a place (a city, an address, a landmark or coordinates) and presses **Get Weather**. The app then:

1. Converts the place name to coordinates (geocoding).
1. Requests the current weather for those coordinates.
1. Moves the map smoothly to the location and drops a marker.
1. Opens an InfoWindow with the city name, temperature, weather icon, clouds, humidity and wind speed, with a **Share** button.

Everything runs asynchronously in the browser, and the page never reloads.

### Main features

- Search by city name or by coordinates (for example `15.5007, 32.5599`).
- Click anywhere on the map, or use **My Location**, to get the weather for that point.
- Loading spinner while requests are running, and friendly alert cards for errors (location not found, invalid API key, rate limit, network failure).
- Celsius and Fahrenheit toggle, and JSON and XML data source toggle.
- Share the weather (Web Share API or clipboard) and share buttons for Facebook, WhatsApp and X.
- Favorite cities saved in `localStorage` as quick-access buttons.
- Dark mode, responsive layout for mobile and desktop.
- AI Weather Assistant chat that answers weather questions using the live conditions on the map (optional, needs a free key).

-----

## Technologies

|Area        |Technology                                                                                |
|------------|------------------------------------------------------------------------------------------|
|Structure   |Semantic HTML5                                                                            |
|Styling     |CSS3 (custom properties, Flexbox, Grid, media queries), Google Fonts (Roboto, Roboto Slab)|
|Logic       |Vanilla JavaScript (ES6+ modules, `async/await`, Fetch API, Promises, `AbortController`)  |
|Map         |Leaflet.js 1.9.4 with OpenStreetMap tiles                                                 |
|Geocoding   |Nominatim (OpenStreetMap) API                                                             |
|Weather data|OpenWeatherMap Current Weather API (JSON and XML)                                         |
|AI assistant|Groq Chat Completions API (OpenAI-compatible)                                             |
|Browser APIs|Web Share, Clipboard, Geolocation, `localStorage`, `DOMParser`, History                   |
|Hosting     |GitHub Pages                                                                              |

No frameworks or libraries such as React, Vue, Angular or jQuery are used. HTML, CSS and JavaScript are kept in separate files, with no inline scripts or inline styles.

### Project structure

```
WeatherMap/
├── index.html
├── css/
│   └── style.css
├── js/
│   ├── app.js         Entry point and event listeners
│   ├── api.js         Fetch layer (Nominatim, OpenWeatherMap, Groq)
│   ├── map.js         Leaflet map, marker and fly animation
│   ├── ui.js          InfoWindow card, alerts, spinner, toasts
│   ├── chatbot.js     AI assistant panel
│   ├── storage.js     localStorage helpers
│   └── config.js      Constants and endpoints
├── assets/
│   └── favicon.svg
├
├── start.bat
└── README.md
```

-----

## How to run

### Option 1: Open the live demo

Open https://mo-jamal23.github.io/WeatherMap/ in a browser, then add your OpenWeatherMap key (see step 2 below).

### Option 2: Run locally

**1. Get the project**

```bash
git clone https://github.com/Mo-Jamal23/WeatherMap.git
cd WeatherMap
```

**2. Get a free OpenWeatherMap API key**

1. Sign up at https://home.openweathermap.org/users/sign_up.
1. Open the API keys page and copy the key.
1. A new key can take 10 minutes to 2 hours to activate. Until then the app shows an “Invalid API key” message.

**3. Start a local server** (ES modules do not work from `file://`)

```bash
# Python
python3 -m http.server 5500

# or Node.js
npx serve .
```

On Windows you can also double-click `start.bat`.

**4. Open the app**

Go to http://localhost:5500, click the Settings (gear) button in the header, paste the OpenWeatherMap key and click **Save**. The key is stored only in your browser’s `localStorage`. Then search for a place, for example `Port Sudan`.

### Optional: enable the AI assistant

1. Create a free key (no credit card) at https://console.groq.com/keys. It starts with `gsk_`.
1. Open Settings in the app, paste it in the AI assistant key field and click **Save**.
1. Click **Ask AI** and ask a question such as “What should I wear today?”.

### Notes

- Never commit API keys to the repository. This is a front-end-only app, so keys entered in the browser can be seen by anyone using the browser developer tools. Use free-tier keys only.
- Nominatim allows at most one request per second, and requests are only sent when the user presses the button.

-----

## Student Name

**Mohamed Jamal Ahmed

-----

## Credits

Weather data: OpenWeatherMap (CC BY-SA 4.0). Map data: OpenStreetMap contributors (ODbL). Geocoding: Nominatim.