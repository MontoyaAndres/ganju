import { defineTool } from '@ganju/sdk';

import { describe, fetchForecast, findPlace } from './lib/openMeteo';

/**
 * The weather right now, in any city.
 *
 * Two requests: one to turn the name into coordinates, one for the weather at
 * those coordinates. Both go through the platform's outbound screen, which only
 * lets them out because `open-meteo.com` is in this project's `allowedHosts`.
 */
export default defineTool<{ city: string }>(async (input, ctx) => {
  const city = input.city.trim();
  if (!city) throw new Error('A city is required');

  const place = await findPlace(city);
  ctx.log(`${city} → ${place.name} (${place.latitude}, ${place.longitude})`);

  const { current } = await fetchForecast(place, 1);

  return {
    place: place.name,
    // Left out rather than set to null when missing: an output schema has no
    // "nullable", so `null` in a `string` field would fail the whole call.
    ...(place.country ? { country: place.country } : {}),
    conditions: describe(current.weather_code),
    temperatureC: current.temperature_2m,
    feelsLikeC: current.apparent_temperature,
    humidityPercent: current.relative_humidity_2m,
    windKmh: current.wind_speed_10m,
    localTime: current.time
  };
});
