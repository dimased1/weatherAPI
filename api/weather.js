// /api/weather.js
// Простая версия без хранилища - генерирует прогноз по запросу

const CITY = "Edinburgh";

const PROMPTS = {
  ru: (weatherData) => `
Представь, что ты — дружелюбный голосовой помощник, сообщающий прогноз погоды человеку простым, тёплым и заботливым языком. Используй переданный JSON-объект с погодными данными (${JSON.stringify(weatherData)}), чтобы:

1. Определить дату и день недели и включить их в текст прогноза.
2. Начать сообщение с приветствия, соответствующего времени суток (например, 'Доброе утро', 'Добрый день', 'Добрый вечер').
3. Составить развёрнутый и приятный прогноз на день, включая температуру в градусах Цельсия, осадки, скорость ветра в метрах в секунду или километрах в час, влажность и другие важные особенности.
4. Дать совет по выбору одежды в зависимости от погоды.
5. Упомянуть, если ожидаются изменения в погоде в течение дня (например, дождь после обеда или похолодание к вечеру).

ВАЖНО: Используй только метрическую систему измерений (градусы Цельсия, км/ч, мм осадков). Выведи результат как связный и заботливый текст на русском языке объёмом 2-3 абзаца.
`.trim(),

  eng: (weatherData) => `
Imagine you are a friendly voice assistant telling someone about the weather forecast in a simple, warm, and caring manner. Use the provided JSON weather data (${JSON.stringify(weatherData)}) to:

1. Determine the date and day of the week and include them in the forecast.
2. Start with a greeting appropriate for the time of day (e.g., 'Good morning', 'Good afternoon', 'Good evening').
3. Create a detailed and pleasant forecast for the day, including temperature in degrees Celsius, precipitation, wind speed in meters per second or kilometers per hour, humidity, and other important features.
4. Give advice on choosing clothing based on the weather.
5. Mention if there are expected changes in weather during the day (e.g., rain in the afternoon or cooling in the evening).

IMPORTANT: Use only metric system measurements (Celsius, km/h, mm of precipitation). Output the result as one coherent and caring text in English, 2-3 paragraphs long.
`.trim()
};

export default async function handler(req, res) {
  try {
    const { WEATHER_KEY, OPENAI_API_KEY } = process.env;

    if (!WEATHER_KEY || !OPENAI_API_KEY) {
      return res.status(500).json({ 
        error: "API keys are not configured" 
      });
    }

    const language = req.query.lang || 'ru';
    
    if (!PROMPTS[language]) {
      return res.status(400).json({ 
        error: `Unsupported language: ${language}. Available: ru, eng` 
      });
    }

    // Получаем свежие данные о погоде
    const weatherData = await fetchWeatherData(WEATHER_KEY);
    
    // Генерируем прогноз
    const forecast = await generateForecast(OPENAI_API_KEY, weatherData, language);
    
    // Формируем ответ
    const now = new Date();
    const response = {
      forecast,
      lastUpdated: formatDate(now),
      timestamp: now.getTime(),
      language
    };

    return res.status(200).json(response);

  } catch (err) {
    console.error("Ошибка в /api/weather:", err);
    return res.status(500).json({ 
      error: err.message || "An unexpected error occurred" 
    });
  }
}

/**
 * Получает часовые данные о погоде из WeatherAPI
 */
async function fetchWeatherData(apiKey) {
  const url = `https://api.weatherapi.com/v1/forecast.json?key=${apiKey}&q=${encodeURIComponent(CITY)}&days=1&aqi=no&alerts=no`;
  
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

/**
 * Генерирует текст прогноза с помощью GPT-5 Nano
 */
async function generateForecast(apiKey, weatherData, language) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: "gpt-5-nano",
      messages: [
        { 
          role: "system", 
          content: "You are a friendly weather assistant who provides forecasts in a warm and caring manner." 
        },
        { 
          role: "user", 
          content: PROMPTS[language](weatherData) 
        }
      ],
      max_completion_tokens: 500
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API error: ${response.status} — ${errorText}`);
  }

  const data = await response.json();
  
  return data.choices?.[0]?.message?.content || "Weather forecast is unavailable";
}

/**
 * Форматирует дату в формат "20.11 в 15:00"
 */
function formatDate(date) {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  
  return `${day}.${month} в ${hours}:${minutes}`;
}
