// /api/weather.js

const CITY = "Edinburgh";

const PROMPTS = {
  ru: (weatherData) => `
Представь, что ты — дружелюбный голосовой помощник, сообщающий прогноз погоды человеку простым, тёплым и заботливым языком. Используй переданный JSON-объект с погодными данными (${JSON.stringify(weatherData)}), чтобы:

1. Определить дату и день недели и включить их в текст прогноза.
2. Начать сообщение с приветствия, соответствующего времени суток (например, 'Доброе утро', 'Добрый день', 'Добрый вечер').
3. Составить краткий и приятный прогноз на день, включая температуру, осадки, ветер и другие важные особенности. Но не вдаваясь прям в сильные детали. Используй только градусы и метрические единицы. 
4. Дать совет по выбору одежды в зависимости от погоды.
5. Упомянуть, если ожидаются изменения в погоде в течение дня (например, дождь после обеда или похолодание к вечеру).

Выведи результат как один связный и заботливый текст на русском языке на 2-4 абзаца.
`.trim(),

  eng: (weatherData) => `
Imagine you are a friendly voice assistant telling someone about the weather forecast in a simple, warm, and caring manner. Use the provided JSON weather data (${JSON.stringify(weatherData)}) to:

1. Determine the date and day of the week and include them in the forecast.
2. Start with a greeting appropriate for the time of day (e.g., 'Good morning', 'Good afternoon', 'Good evening').
3. Create a brief and pleasant forecast for the day, including temperature, precipitation, wind, and other important features.
4. Give advice on choosing clothing based on the weather.
5. Mention if there are expected changes in weather during the day (e.g., rain in the afternoon or cooling in the evening).

Output the result as one coherent and caring text in English.
`.trim()

export default async function handler(req, res) {
  try {
    const { WEATHER_KEY, DEEPSEEK_API_KEY } = process.env;

    if (!WEATHER_KEY || !DEEPSEEK_API_KEY) {
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

    // Получение данных о погоде
    const weatherData = await fetchWeatherData(WEATHER_KEY);

    // Создаем краткую сводку вместо полного JSON
    const weatherSummary = createWeatherSummary(weatherData);

    // Генерация прогноза с помощью DeepSeek
    const forecast = await generateForecast(DEEPSEEK_API_KEY, weatherSummary, language);

    return res.status(200).json({ forecast });

  } catch (err) {
    console.error("Ошибка в /api/weather:", err);
    return res.status(500).json({ 
      error: err.message || "An unexpected error occurred" 
    });
  }
}

/**
 * Получает данные о погоде из WeatherAPI
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

  return await response.json();
}

/**
 * Создает краткую сводку погоды (меньше токенов)
 */
function createWeatherSummary(data) {
  const current = data.current;
  const forecast = data.forecast.forecastday[0];
  const day = forecast.day;
  const hour = new Date().getHours();
  
  // Определяем время суток
  let timeOfDay = 'day';
  if (hour >= 5 && hour < 12) timeOfDay = 'morning';
  else if (hour >= 12 && hour < 17) timeOfDay = 'afternoon';
  else if (hour >= 17 && hour < 22) timeOfDay = 'evening';
  else timeOfDay = 'night';

  return `Date: ${forecast.date}, ${timeOfDay}. Current: ${current.temp_c}°C, ${current.condition.text}. Day: min ${day.mintemp_c}°C, max ${day.maxtemp_c}°C. Rain chance: ${day.daily_chance_of_rain}%. Wind: ${current.wind_kph} km/h. Humidity: ${current.humidity}%.`;
}

/**
 * Генерирует текст прогноза с помощью DeepSeek
 */
async function generateForecast(apiKey, weatherSummary, language) {
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
          content: "You are a friendly weather assistant. Be brief and warm." 
        },
        { 
          role: "user", 
          content: PROMPTS[language](weatherSummary) 
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
