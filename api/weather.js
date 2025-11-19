import fetch from 'node-fetch';
import OpenAI from 'openai';

const DEFAULT_CITY = 'Edinburgh';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

async function fetchWeather(city, key) {
  const url = `https://api.weatherapi.com/v1/forecast.json?key=${encodeURIComponent(key)}&q=${encodeURIComponent(city)}&days=1&lang=ru`;
  const res = await fetch(url);
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`WeatherAPI error: ${res.status} ${txt}`);
  }
  return res.json();
}

function extractForecast(data) {
  const city = data.location?.name || '';
  const current = data.current || {};
  const day = data.forecast?.forecastday?.[0]?.day || {};
  const astro = data.forecast?.forecastday?.[0]?.astro || {};

  return {
    city,
    temp_c: current.temp_c ?? null,
    feelslike_c: current.feelslike_c ?? null,
    humidity: current.humidity ?? null,
    wind_kph: current.wind_kph ?? null,
    wind_dir: current.wind_dir ?? '',
    chance_of_rain: day.daily_chance_of_rain ?? (current.precip_mm ? null : null),
    condition: current.condition?.text || day.condition?.text || '',
    sunrise: astro.sunrise || '',
    sunset: astro.sunset || ''
  };
}

function buildPrompt(forecast) {
  return `
Составь короткий, понятный и дружелюбный прогноз погоды для человека.
Добавь советы, что одеть и взять с собой.
Данные:
Город: ${forecast.city}
Температура: ${forecast.temp_c}°C (ощущается как ${forecast.feelslike_c}°C)
Влажность: ${forecast.humidity}%
Ветер: ${forecast.wind_kph} км/ч ${forecast.wind_dir}
Вероятность осадков: ${forecast.chance_of_rain}%
Условие: ${forecast.condition}
Рассвет: ${forecast.sunrise}, Закат: ${forecast.sunset}
`;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  try {
    const city = req.query?.city || DEFAULT_CITY;
    const weatherKey = process.env.WEATHER_KEY;
    if (!weatherKey) return res.status(500).json({ error: 'Missing WEATHER_KEY' });

    const forecastData = await fetchWeather(city, weatherKey);
    const forecast = extractForecast(forecastData);
    const prompt = buildPrompt(forecast);

    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
      max_tokens: 150
    });

    const humanForecast = completion.choices[0].message.content.trim();

    res.status(200).json({ city: forecast.city, human_forecast: humanForecast });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String(err) });
  }
}
