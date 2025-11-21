// /api/weather.js

const CITY = "Edinburgh";

const PROMPTS = {
  ru: (weatherData) => `
Представь, что ты — дружелюбный голосовой помощник. Используя переданный JSON с погодой (${JSON.stringify(weatherData)}), сделай следующее:

1. Укажи дату и день недели.
2. Начни с приветствия по времени суток.
3. Составь короткий, тёплый прогноз: температура, осадки, ветер и важные особенности, только в метрических единицах.
4. Дай совет по одежде и при желании небольшой дневной совет.
Выведи один связный текст по-русски в дружелюбном стиле, подели на абзацы, до 80-100 слов. Без эмоджи.
`.trim(),

  eng: (weatherData) => `
Imagine that you are a friendly voice assistant who gives weather forecasts to people in simple, kind language. Use the provided JSON weather data (${JSON.stringify(weatherData)}) to:

1. Determine the date and day of the week and include them in the forecast text.
2. Begin the message with a greeting appropriate to the time of day (e.g., 'Good morning,' 'Good afternoon,' 'Good evening.')
3. Provide a brief and pleasant forecast for the day, including temperature, precipitation, wind, and other important factors. However, avoid going into too much detail. Use only degrees and metric units.
4. Provide clothing advice based on the weather.
5. Mention if changes in the weather are expected during the day (e.g., rain in the afternoon or a cooler temperature in the evening).

Express the result as a single, coherent text in english, 2-3 paragraphs long.
`.trim()
};

export default async function handler(req, res) {
  try {
    const WEATHER_KEY = process.env.WEATHER_KEY;
    const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;

    // Проверка наличия API-ключей
    if (!WEATHER_KEY || !DEEPSEEK_API_KEY) {
      return res.status(500).json({ 
        error: "API keys are not configured" 
      });
    }

    // Получение языка из параметров запроса (по умолчанию ru)
    const language = req.query.lang || 'ru';
    
    if (!PROMPTS[language]) {
      return res.status(400).json({ 
        error: `Unsupported language: ${language}. Available: ru, eng` 
      });
    }

    // Получение часовых данных о погоде
    const weatherData = await fetchWeatherData(WEATHER_KEY);

    // Генерация прогноза с помощью DeepSeek
    const forecast = await generateForecast(DEEPSEEK_API_KEY, weatherData, language);

    // Получаем текущую дату и время
    const lastUpdated = new Date().toISOString();

    return res.status(200).json({ 
      forecast,
      lastUpdated
    });

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
    throw new Error(
      `WeatherAPI error: ${response.status} — ${errorText}`
    );
  }

  const data = await response.json();

  // Возвращаем структурированные данные с часовым прогнозом
  return {
    location: data.location,
    current: data.current,
    forecast: data.forecast.forecastday[0]
  };
}

/**
 * Генерирует текст прогноза с помощью DeepSeek
 */
async function generateForecast(apiKey, weatherData, language) {
  const response = await fetch("https://api.deepseek.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages: [
        { 
          role: "system", 
          content: "You are a friendly weather assistant who provides forecasts in a warm and caring manner." 
        },
        { 
          role: "user", 
          content: PROMPTS[language](weatherData) 
        }
      ]
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `DeepSeek API error: ${response.status} — ${errorText}`
    );
  }

  const data = await response.json();
  
  return data.choices?.[0]?.message?.content || "Weather forecast is unavailable";
}
