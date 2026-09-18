# weather

Current conditions and a 7-day forecast for any city, from
[Open-Meteo](https://open-meteo.com). No account, no key, no setup, so it's
the one to deploy first.

| Tool | What it does |
| --- | --- |
| `current-weather` | Conditions, temperature, feels-like, humidity and wind right now |
| `weather-forecast` | Highs, lows and chance of rain for 1–7 days |

## What it shows

- **`fetch` through the outbound screen.** Every request a tool makes leaves
  through the platform, which checks the host against `allowedHosts`. The one
  entry, `open-meteo.com`, also covers `api.open-meteo.com` and
  `geocoding-api.open-meteo.com`, because an entry allows its subdomains too.
- **Input and output schemas.** `days` is bounded to 1–7 in `ganju.json`, so
  the model can't ask for 30. The output schema turns the result into
  structured data for MCP clients.
- **Leaving out a missing field, never setting it to `null`.** An output schema
  has no nullable type, so `country` is omitted when the geocoder has none.
- **Two tools sharing one helper module.**

## Run it

```bash
ganju link
ganju test current-weather --input '{"city":"Bogotá"}'
ganju test weather-forecast --input '{"city":"Lisbon","days":5}'
ganju deploy
```

## Files

```
ganju.json               two tools, allowedHosts: ["open-meteo.com"]
src/currentWeather.ts    current-weather
src/weatherForecast.ts   weather-forecast
src/lib/openMeteo.ts     geocoding, the forecast request, weather codes in words
```
