// /api/weather.js
// Единый эндпоинт для получения прогнозов и автоматического обновления

const CITY = "Edinburgh";

const PROMPTS = {
  ru: (weatherData) => `
Представь, что ты — дружелюбный голосовой помощник, сообщающий прогноз погоды человеку простым, тёплым и заботливым языком. Используй переданный JSON-объект с погодными данными (${JSON.stringify(weatherData)}), чтобы:

1. Определить дату и день недели и включить их в текст прогноза.
2. Начать сообщение с приветствия, соответствующего времени суток (например, 'Доброе утро', 'Добрый день', 'Добрый вечер').
3. Составить краткий и приятный прогноз на день, включая температуру, осадки, ветер и другие важные особенности. Используй метрические системы и градусы. 
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

    // Проверяем, нужно ли обновить прогноз
    const updated = await checkAndUpdateForecast(WEATHER_KEY, OPENAI_API_KEY, language);

    // Получаем последний прогноз
    let latestForecast = await getLatestForecast(language);

    // Если прогноза всё ещё нет - создаём его принудительно
    if (!latestForecast) {
      const weatherData = await fetchWeatherData(WEATHER_KEY);
      const forecast = await generateForecast(OPENAI_API_KEY, weatherData, language);
      latestForecast = await saveForecast(forecast, language);
    }

    return res.status(200).json(latestForecast);

  } catch (err) {
    console.error("Ошибка в /api/weather:", err);
    return res.status(500).json({ 
      error: err.message || "An unexpected error occurred" 
    });
  }
}

/**
 * Проверяет, прошёл ли час с последнего обновления, и обновляет прогноз
 */
async function checkAndUpdateForecast(weatherKey, openaiKey, language) {
  try {
    const lastForecast = await getLatestForecast(language);
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;

    // Если прогноза нет или прошёл час - обновляем
    if (!lastForecast || (now - lastForecast.timestamp) >= oneHour) {
      const weatherData = await fetchWeatherData(weatherKey);
      const forecast = await generateForecast(openaiKey, weatherData, language);
      await saveForecast(forecast, language);
    }
  } catch (err) {
    console.error("Ошибка обновления прогноза:", err);
    // Не бросаем ошибку, чтобы вернуть старый прогноз если есть
  }
}

/**
 * Получает последний сохранённый прогноз
 */
async function getLatestForecast(language) {
  try {
    const prefix = `weather:${language}:`;
    const result = await window.storage.list(prefix, true);
    
    if (!result || !result.keys || result.keys.length === 0) {
      return null;
    }

    // Получаем все прогнозы
    const forecastPromises = result.keys.map(async (key) => {
      try {
        const data = await window.storage.get(key, true);
        return data ? JSON.parse(data.value) : null;
      } catch (err) {
        return null;
      }
    });

    const allForecasts = (await Promise.all(forecastPromises))
      .filter(f => f !== null);

    // Возвращаем самый свежий
    return allForecasts.sort((a, b) => b.timestamp - a.timestamp)[0] || null;

  } catch (err) {
    console.error("Ошибка получения прогноза:", err);
    return null;
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
      temperature: 0.7,
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
 * Сохраняет прогноз в storage
 */
async function saveForecast(forecast, language) {
  const now = new Date();
  const timestamp = now.getTime();
  const formattedDate = formatDate(now);
  
  const forecastData = {
    forecast,
    lastUpdated: formattedDate,
    timestamp,
    language
  };

  // Сохраняем с уникальным ключом по времени
  const key = `weather:${language}:${timestamp}`;
  await window.storage.set(key, JSON.stringify(forecastData), true);

  return forecastData;
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
