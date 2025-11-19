import fetch from 'node-fetch';

const DEFAULT_CITY = 'Edinburgh';

function safeHeader(token) {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// ===== Fetch погоды =====
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

// ===== Построение текста для нейросети =====
function buildHFInput(obj) {
  return `Город: ${obj.city}
Температура: ${obj.temp_c}°C
Ощущается как: ${obj.feelslike_c}°C
Влажность: ${obj.humidity}%
Ветер: ${obj.wind_kph} км/ч ${obj.wind_dir}
Вероятность осадков: ${obj.chance_of_rain}%
Условие: ${obj.condition}
Рассвет: ${obj.sunrise}
Закат: ${obj.sunset}`;
}

// ===== Вызов HuggingFace =====
async function callHuggingFace(text) {
  const url = 'https://api-inference.huggingface.co/models/google/flan-t5-large';
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...safeHeader(process.env.HF_API_TOKEN)
  };

  const body = JSON.stringify({
    inputs: `
На основе следующих данных о погоде, составь живой и дружелюбный прогноз для человека.
Добавь советы: что одеть, что взять с собой (зонт, куртку и т.д.).
Сделай текст интересным и понятным.
Данные:
${text}
    `
  });

  const res = await fetch(url, { method: 'POST', headers, body, timeout: 120000 });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`HuggingFace error: ${res.status} ${txt}`);
  }

  const ctype = res.headers.get('content-type') || '';
  if (ctype.includes('application/json')) {
    const json = await res.json();
    if (Array.isArray(json)) {
      if (json[0]?.generated_text) return json[0].generated_text;
      if (typeof json[0] === 'string') return json[0];
      return JSON.stringify(json);
    }
    if (json.generated_text) return json.generated_text;
    for (const k of Object.keys(json)) {
      if (typeof json[k] === 'string') return json[k];
    }
    return JSON.stringify(json);
  }

  return res.text();
}

// ===== Serverless handler =====
export default async function handler(req, res) {
  // ===== CORS =====
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    const city = req.query?.city || DEFAULT_CITY;
    const weatherKey = process.env.WEATHER_KEY;

    if (!weatherKey) {
      res.status(500).json({ error: 'Missing WEATHER_KEY environment variable' });
      return;
    }

    // ===== Получаем погоду =====
    const weatherData = await fetchWeather(city, weatherKey);
    const extracted = extractForecast(weatherData);
    const hfInput = buildHFInput(extracted);

    // ===== Генерация текста через нейросеть =====
    let hfOutput = '';
    try {
      hfOutput = await callHuggingFace(hfInput);
    } catch (e) {
      // fallback на обычный текст
      hfOutput = `Погода в ${extracted.city}: ${extracted.condition}. Температура ${extracted.temp_c}°C (ощущается как ${extracted.feelslike_c}°C). Влажность ${extracted.humidity}%. Ветер ${extracted.wind_kph} км/ч ${extracted.wind_dir}. Шанс осадков ${extracted.chance_of_rain}%. Рассвет ${extracted.sunrise}, закат ${extracted.sunset}.`;
    }

    res.setHeader('Content-Type', 'application/json');
    res.status(200).json({
      city: extracted.city || city,
      human_forecast: typeof hfOutput === 'string' ? hfOutput.trim() : JSON.stringify(hfOutput)
    });

  } catch (err) {
    res.status(500).json({ error: String(err?.message || err) });
  }
}
