@echo off
REM Serves WeatherMap on http://localhost:5500 and opens it in the default browser.
cd /d "%~dp0"
start "" http://localhost:5500
python -m http.server 5500
