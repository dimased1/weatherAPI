import fetch from 'node-fetch';
import { InferenceClient } from "@huggingface/inference";

const DEFAULT_CITY = 'Edinburgh';

// ===== Получение погоды =====
async function fetchWeather(city, key) {
  const url = `https://api.weatherapi.com/v1/forecast.json?key=${encodeURIComponent(key)}&q=${encodeURIComponent(city)}&days=1&lang=ru`;
  const res = await fetch(url);
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`WeatherAPI error: ${res.status} ${txt}`);
  }
  return res.json();
}

// ===== Извлечение ключевых данных =====
function extractForecast(data) {
  const city = data.location?.name || '';
  const current = data.current || {};
  const forecastDay = data.forecast?.forecastday?.[0] || {};
  const day = forecastDay.day || {};
  const astro = forecastDay.astro || {};

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

// ===== Формируем текст для нейросети =====
function buildPrompt(obj) {
  return `
На основе этих данных о погоде составь дружелюбный прогноз для человека.
Добавь советы: что одеть и взять с собой (зонт, куртку и т.д.).
Сделай текст интересным и понятным.
Данные:
Город: ${obj.city}
Температура: ${obj.temp_c}°C
Ощущается как: ${obj.feelslike_c}°C
Влажность: ${obj.humidity}%
Ветер: ${obj.wind_kph} км/ч ${obj.wind_dir}
Вероятность осадков: ${obj.chance_of_rain}%
Условие: ${obj.condition}
Рассвет: ${obj.sunrise}
Закат: ${obj.sunset}
`;
}

// ===== Serverless handler =====
export default async function handler(req, res) {
  // ===== CORS =====
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  try {
    const city = req.query?.city || DEFAULT_CITY;
    const weatherKey = process.env.WEATHER_KEY;
    const hfToken = process.env.HF_API_TOKEN;

    if (!weatherKey) return res.status(500).json({ error: 'Missing WEATHER_KEY' });
    if (!hfToken) return res.status(500).json({ error: 'Missing HF_API_TOKEN' });

    // Получаем погоду
    const weatherData = await fetchWeather(city, weatherKey);
    const extracted = extractForecast(weatherData);
    const prompt = buildPrompt(extracted);

    // ===== HuggingFace Inference =====
    const client = new InferenceClient(hfToken);

    let hfOutput = '';
    try {
      const response = await client.textGeneration({
        model: "google/flan-t5-small",
        inputs: prompt,
        max_new_tokens: 80
      });

      hfOutput = response.generated_text || '';
    } catch (e) {
      console.error("HuggingFace error:", e);
      // fallback
      hfOutput = `Погода в ${extracted.city}: ${extracted.condition}. Температура ${extracted.temp_c}°C (ощущается как ${extracted.feelslike_c}°C). Влажность ${extracted.humidity}%. Ветер ${extracted.wind_kph} км/ч ${extracted.wind_dir}. Шанс осадков ${extracted.chance_of_rain}%. Рассвет ${extracted.sunrise}, закат ${extracted.sunset}.`;
    }

    res.setHeader('Content-Type', 'application/json');
    res.status(200).json({
      city: extracted.city,
      human_forecast: hfOutput.trim()
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String(err) });
  }
}
