// /api/weather.js
// Погода для Эдинбурга с красивым голосовым прогнозом через GPT-4o-mini
// Работает на Vercel без кэширования (обновляется каждый запрос)

const CITY = "Edinburgh";

const PROMPTS = {
  ru: (weatherData) => `
Представь, что ты — очень дружелюбный русскоязычный голосовой помощник. 
Используя только этот JSON с погодой (${JSON.stringify(weatherData)}), сделай:
1. Укажи сегодняшнюю дату и день недели.
2. Приветствие по времени суток (утро/день/вечер/ночь).
3. Короткий тёплый прогноз: температура, осадки, ветер, ощущается.
4. Совет по одежде и маленький добрый совет на день.
Всё на русском, один связный текст, 2–3 абзаца, максимум 70 слов.
`.trim(),

  eng: (weatherData) => `
You are a super friendly English-speaking weather voice assistant.
Using only the provided JSON (${JSON.stringify(weatherData)}):
1. Include today’s date and weekday.
2. Start with a time-of-day greeting (morning, afternoon, evening).
3. Give a short, kind daily forecast: temperature, precipitation, wind, feels-like.
4. Suggest what to wear and add a tiny positive tip for the day.
Answer in natural English, 2–3 paragraphs, warm and caring tone.
`.trim(),
};

export default async function handler(req, res) {
  // Отключаем любой кэш Vercel/CDN раз и навсегда
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("Surrogate-Control", "no-store");

  try {
    const WEATHER_KEY = process.env.WEATHER_KEY;
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

    if (!WEATHER_KEY || !OPENAI_API_KEY) {
      return res.status(500).json({ error: "Missing API keys (WEATHER_KEY or OPENAI_API_KEY)" });
    }

    const language = req.query.lang === "eng" ? "eng" : "ru"; // по умолчанию русский

    const weatherData = await fetchWeatherData(WEATHER_KEY);
    const forecast = await generateForecast(OPENAI_API_KEY, weatherData, language);

    return res.status(200).json({ forecast });
  } catch (err) {
    console.error("Ошибка в /api/weather:", err);
    return res.status(500).json({ error: "Не удалось получить прогноз" });
  }
}

async function fetchWeatherData(apiKey) {
  const url = `https://api.weatherapi.com/v1/forecast.json?key=${apiKey}&q=${encodeURIComponent(
    CITY
  )}&days=1&aqi=no&alerts=no&lang=ru`;

  const response = await fetch(url, { next: { revalidate: 0 } }); // ещё один предохранитель от кэша

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`WeatherAPI ${response.status}: ${text}`);
  }

  const data = await response.json();

  return {
    location: data.location,
    current: data.current,
    forecast: data.forecast.forecastday[0],
  };
}

async function generateForecast(apiKey, weatherData, language) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type: "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.7,
      max_completion_tokens: 500,
      messages: [
        {
          role: "system",
          content: language === "ru"
            ? "Ты самый добрый и заботливый русскоязычный погодный помощник."
            : "You are the kindest and most caring English weather voice assistant.",
        },
        {
          role: "user",
          content: PROMPTS[language](weatherData),
        },
      ],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI API error ${response.status}: ${text}`);
  }

  const json = await response.json();
  return json.choices?.[0]?.message?.content?.trim() || "Прогноз временно недоступен";
}

// Это важно для Vercel — указываем, что функция динамическая и не должна кэшироваться
export const config = {
  api: {
    // Отключаем bodyParser (не нужен) и включаем внешние запросы
    bodyParser: false,
  },
  // Самый надёжный способ сказать Vercel: НЕ КЭШИРУЙ ЭТУ ФУНКЦИЮ НИКОГДА
  runtime: "nodejs18.x", // или nodejs20.x
  // Если используешь Edge Runtime — удали эту строку и оставь только Node.js
};
