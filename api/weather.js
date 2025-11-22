// /api/weather.js

const CITY = "Edinburgh";

const PROMPTS = {
  ru: (weatherData) => `
Представь, что ты — дружелюбный голосовой помощник. Используя переданный JSON с погодой (${JSON.stringify(weatherData)}), сделай следующее:
1. Укажи дату и день недели.
2. Начни с приветствия по времени суток.
3. Составь короткий, тёплый прогноз: температура, осадки, ветер и важные особенности, метрические.
4. Дай совет по одежде и при желании небольшой дневной совет.
Выведи один связный дружелюбный текст по-русски, подели на смысловые абзацы, до 120 слов.
`.trim(),
  eng: (weatherData) => `
Imagine that you are a friendly voice assistant who gives weather forecasts to people in simple, kind language. Use the provided JSON weather data (${JSON.stringify(weatherData)}) to:
1. Determine the date and day of the week and include them in the forecast text.
2. Begin the message with a greeting appropriate to the time of day.
3. Provide a brief and pleasant forecast for the day, including temperature, precipitation, wind, and other important factors. Use only metric units.
4. Provide clothing advice based on the weather.
5. Mention if changes in the weather are expected during the day.
Express the result as a single, coherent text in english, 2-3 paragraphs long.
`.trim()
};

// Глобальное хранилище в памяти (живёт пока живёт процесс)
let cachedForecast = {
  ru: null,
  eng: null,
  lastGeneratedAt: null, // timestamp
};

const WEATHER_KEY = process.env.WEATHER_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Форматирование времени как "22.11 22:00"
function formatTime(date) {
  const d = date.getDate().toString().padStart(2, '0');
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  const h = date.getHours().toString().padStart(2, '0');
  const min = date.getMinutes().toString().padStart(2, '0');
  return `${d}.${m} ${h}:${min}`;
}

// Основная функция генерации прогноза
async function updateForecast() {
  if (!WEATHER_KEY || !OPENAI_API_KEY) {
    console.error("API keys missing, skipping forecast update");
    return;
  }

  try {
    const weatherData = await fetchWeatherData();
    
    const [ruForecast, engForecast] = await Promise.all([
      generateForecast(weatherData, 'ru'),
      generateForecast(weatherData, 'eng')
    ]);

    cachedForecast = {
      ru: ruForecast,
      eng: engForecast,
      lastGeneratedAt: new Date()
    };

    console.log("Прогноз успешно обновлён:", formatTime(cachedForecast.lastGeneratedAt));
  } catch (err) {
    console.error("Ошибка при обновлении прогноза:", err);
  }
}

async function fetchWeatherData() {
  const url = `https://api.weatherapi.com/v1/forecast.json?key=${WEATHER_KEY}&q=${encodeURIComponent(CITY)}&days=1&aqi=no&alerts=no`;
  const response = await fetch(url);
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`WeatherAPI error: ${response.status} — ${errorText}`);
  }
  const data = await response.json();
  return {
    location: data.location,
    current: data.current,
    forecast: data.forecast.forecastday[0]
  };
}

async function generateForecast(weatherData, language) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "Ты дружелюбный и заботливый погодный помощник." },
        { role: "user", content: PROMPTS[language](weatherData) }
      ],
      max_completion_tokens: 500
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI error: ${response.status} — ${errorText}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content?.trim() || "Прогноз временно недоступен";
}

// === Автоматическое обновление каждые 2 часа ===
let isUpdating = false;

async function startAutoUpdate() {
  // Первый запуск сразу
  await updateForecast();

  // Затем каждые 2 часа (7200000 мс)
  setInterval(async () => {
    if (isUpdating) return;
    isUpdating = true;
    await updateForecast();
    isUpdating = false;
  }, 2 * 60 * 60 * 1000);
}

// Запускаем при старте модуля (один раз при деплое)
if (!global.__weatherUpdaterStarted) {
  global.__weatherUpdaterStarted = true;
  startAutoUpdate();
}

// === Обработчик API ===
export default async function handler(req, res) {
  const language = req.query.lang || 'ru';

  if (!PROMPTS[language]) {
    return res.status(400).json({
      error: `Unsupported language: ${language}. Available: ru, eng`
    });
  }

  // Если прогноз ещё не готов (редкий случай при холодном старте)
  if (!cachedForecast[language]) {
    res.setHeader('Cache-Control', 'no-cache');
    return res.status(503).json({
      forecast: "Прогноз генерируется, подождите 5–10 секунд и попробуйте снова...",
      lastGenerated: null
    });
  }

  const timeStr = cachedForecast.lastGeneratedAt
    ? formatTime(cachedForecast.lastGeneratedAt)
    : null;

  res.status(200).json({
    forecast: cachedForecast[language],
    lastGenerated: timeStr
  });
}
