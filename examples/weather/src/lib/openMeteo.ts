/**
 * Open-Meteo, reached from inside a Ganju tool.
 *
 * Free, no account and no key — which is why it is the first example. Both hosts
 * it answers on (`geocoding-api.open-meteo.com` and `api.open-meteo.com`) are
 * covered by the single `open-meteo.com` entry in `allowedHosts`, because an
 * entry allows the host and every subdomain beneath it.
 */

const GEOCODING = 'https://geocoding-api.open-meteo.com/v1/search';
const FORECAST = 'https://api.open-meteo.com/v1/forecast';

export interface Place {
  name: string;
  country?: string;
  latitude: number;
  longitude: number;
  timezone: string;
}

const getJson = async <T>(url: string, what: string): Promise<T> => {
  const response = await fetch(url, {
    headers: { accept: 'application/json' }
  });
  if (!response.ok) {
    throw new Error(`Open-Meteo answered ${response.status} for ${what}`);
  }
  return (await response.json()) as T;
};

/** Turn a city name into coordinates. The best match wins. */
export const findPlace = async (city: string): Promise<Place> => {
  const url = `${GEOCODING}?name=${encodeURIComponent(city)}&count=1&format=json`;
  const body = await getJson<{ results?: Place[] }>(url, `"${city}"`);

  const place = body.results?.[0];
  if (!place) throw new Error(`No place called "${city}" was found`);
  return place;
};

export interface Forecast {
  current: {
    time: string;
    temperature_2m: number;
    apparent_temperature: number;
    relative_humidity_2m: number;
    wind_speed_10m: number;
    weather_code: number;
  };
  daily: {
    time: string[];
    weather_code: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_probability_max: Array<number | null>;
  };
}

/**
 * Current conditions plus a daily forecast, in one request.
 *
 * `timezone=auto` makes every date and time come back in the place's own local
 * time, so "today" means today where the weather is, not where the server is.
 */
export const fetchForecast = (
  place: Place,
  days: number
): Promise<Forecast> => {
  const params = new URLSearchParams({
    latitude: String(place.latitude),
    longitude: String(place.longitude),
    current:
      'temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code',
    daily:
      'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
    timezone: 'auto',
    forecast_days: String(days)
  });
  return getJson<Forecast>(`${FORECAST}?${params}`, place.name);
};

/** WMO weather codes, as Open-Meteo reports them, in words. */
const CONDITIONS: Record<number, string> = {
  0: 'Clear sky',
  1: 'Mainly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Fog',
  48: 'Freezing fog',
  51: 'Light drizzle',
  53: 'Drizzle',
  55: 'Heavy drizzle',
  56: 'Freezing drizzle',
  57: 'Heavy freezing drizzle',
  61: 'Light rain',
  63: 'Rain',
  65: 'Heavy rain',
  66: 'Freezing rain',
  67: 'Heavy freezing rain',
  71: 'Light snow',
  73: 'Snow',
  75: 'Heavy snow',
  77: 'Snow grains',
  80: 'Light showers',
  81: 'Showers',
  82: 'Violent showers',
  85: 'Snow showers',
  86: 'Heavy snow showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm with hail',
  99: 'Thunderstorm with heavy hail'
};

export const describe = (code: number): string =>
  CONDITIONS[code] ?? `Unknown (code ${code})`;
