// /api/weather.js
import fs from 'fs';
import path from 'path';

const CITY = "Edinburgh";
const CACHE_FILE = '/tmp/weather_cache.json';
const CACHE_DURATION = 2 * 60 * 60 * 1000; // 2 часа в миллисекундах

const PROMPT = (weatherData) => `
Представь, что ты — дружелюбный голосовой помощник. Используя переданный JSON с погодой (${JSON.stringify(weatherData)}), сделай следующее: 
1. Укажи дату и день недели. 
2. Начни с приветствия по времени суток. 
3. Составь короткий, тёплый прогноз: температура, осадки, ветер и важные особенности, метрические. 
4. Дай совет по одежде и при желании небольшой дневной совет. 
Выведи один связный дружелюбный текст по-русски, подели на смысловые абзацы, до 120 слов.
`.trim();

export default async function handler(req, res) {
  try {
    const language = req.query.lang || 'ru';
    
    if (language !== 'ru') {
      return res.status(400).json({
        error: `Неподдерживаемый язык: ${language}. Доступен только: ru`
      });
    }

    // Проверяем кеш
    const cached = readCache();
    const now = Date.now();
    
    if (cached && (now - cached.timestamp) < CACHE_DURATION) {
      // Кеш актуален, возвращаем
      return res.status(200).json({
        forecast: cached.forecast,
        generatedAt: cached.generatedAt
      });
    }

    // Кеш устарел или отсутствует, генерируем новый прогноз
    const WEATHER_KEY = process.env.WEATHER_KEY;
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

    if (!WEATHER_KEY || !OPENAI_API_KEY) {
      return res.status(500).json({ error: "API ключи не настроены" });
    }

    const weatherData = await fetchWeatherData(WEATHER_KEY);
    const forecast = await generateForecast(OPENAI_API_KEY, weatherData);
    const generatedAt = formatDateTime(new Date());

    // Сохраняем в кеш
    writeCache({
      forecast,
      generatedAt,
      timestamp: now
    });

    return res.status(200).json({ forecast, generatedAt });
  } catch (err) {
    console.error("Ошибка в /api/weather:", err);
    return res.status(500).json({
      error: err.message || "Произошла неожиданная ошибка"
    });
  }
}

function readCache() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const data = fs.readFileSync(CACHE_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error("Ошибка чтения кеша:", err);
  }
  return null;
}

function writeCache(data) {
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(data), 'utf8');
  } catch (err) {
    console.error("Ошибка записи кеша:", err);
  }
}

async function fetchWeatherData(apiKey) {
  const url = `https://api.weatherapi.com/v1/forecast.json?key=${apiKey}&q=${encodeURIComponent(CITY)}&days=1&aqi=no&alerts=no`;
  const response = await fetch(url);
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`WeatherAPI ошибка: ${response.status} — ${errorText}`);
  }
  const data = await response.json();
  return {
    location: data.location,
    current: data.current,
    forecast: data.forecast.forecastday[0]
  };
}

async function generateForecast(apiKey, weatherData) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "Ты дружелюбный и заботливый погодный помощник."
        },
        {
          role: "user",
          content: PROMPT(weatherData)
        }
      ],
      max_completion_tokens: 500
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API ошибка: ${response.status} — ${errorText}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content?.trim() || "Прогноз недоступен";
}

function formatDateTime(date) {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${day}.${month} ${hours}:${minutes}`;
}
