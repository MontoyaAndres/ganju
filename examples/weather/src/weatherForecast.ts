import { defineTool } from '@ganju/sdk';

import { describe, fetchForecast, findPlace } from './lib/openMeteo';

/**
 * A day-by-day forecast for up to a week.
 *
 * Shares every helper with `current-weather`: one project deploys as one
 * script, so tools can import the same modules freely.
 */
export default defineTool<{ city: string; days?: number }>(
  async (input, ctx) => {
    const city = input.city.trim();
    if (!city) throw new Error('A city is required');

    // The input schema already bounds this to 1–7. Rounded because a schema
    // `number` also admits 2.5, and Open-Meteo does not.
    const days = Math.round(input.days ?? 3);

    const place = await findPlace(city);
    const { daily } = await fetchForecast(place, days);

    ctx.log(`${days}-day forecast for ${place.name}`);

    return {
      place: place.name,
      ...(place.country ? { country: place.country } : {}),
      days: daily.time.map((date, index) => {
        const rain = daily.precipitation_probability_max[index];
        return {
          date,
          conditions: describe(daily.weather_code[index]),
          highC: daily.temperature_2m_max[index],
          lowC: daily.temperature_2m_min[index],
          ...(typeof rain === 'number' ? { chanceOfRainPercent: rain } : {})
        };
      })
    };
  }
);
