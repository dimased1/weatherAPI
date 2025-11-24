// /api/weather.js
// Погода в Эдинбурге + голосовой прогноз от GPT-4o-mini
// 100% без кэша Vercel, всегда свежие данные

const CITY = "Edinburgh";

// ПРОМПТЫ — теперь просто строки, а не функции (это и было причиной ошибки!)
const PROMPTS = {
  ru: `
Ты — самый добрый русскоязычный голосовой помощник. 
Используя ТОЛЬКО этот JSON с погодой: {WEATHER_JSON}

Сделай короткий тёплый прогноз на сегодня:
— Укажи дату и день недели
— Приветствие по времени суток
— Температура, осадки, ветер, ощущается как
— Совет по одежде + маленький добрый совет на день

Один связный текст на русском, 2–3 абзаца, до 70 слов, очень дружелюбно.
`.trim(),

  eng: `
You are the kindest English-speaking weather voice assistant.
Using ONLY this weather JSON: {WEATHER_JSON}

Give a short, warm daily forecast:
— Include today’s date and weekday
— Greeting based on time of day
— Temperature, precipitation, wind, feels-like
— Clothing advice + tiny positive tip

Natural English, 2–3 paragraphs, super friendly tone.
`.trim(),
};

export const dynamic = "force-dynamic"; // Vercel: НЕ КЭШИРУЙ НИКОГДА
export const revalidate = 0;

export default async function handler(req, res) {
  // Полностью убираем любой кэш Vercel, Cloudflare и всех прокси
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("Vercel-CDN-Cache-Control", "no-store");
  res.setHeader("CDN-Cache-Control", "no-store");
  res.setHeader("Vary", "*"); // на всякий случай

  try {
    const WEATHER_KEY = process.env.WEATHER_KEY;
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

    if (!WEATHER_KEY || !OPENAI_API_KEY) {
      return res.status(500).json({ error: "API keys not configured" });
    }

    const lang = req.query.lang === "eng" ? "eng" : "ru";

    const weatherData = await fetchWeatherData(WEATHER_KEY);

    // ← ВАЖНО: вставляем JSON прямо в промпт как строку
    const prompt = PROMPTS[lang].replace("{WEATHER_JSON}", JSON.stringify(weatherData));

    const forecast = await generateForecast(OPENAI_API_KEY, prompt, lang, prompt);

    res.setHeader("X-Updated-At", new Date().toISOString());

    return res.status(200).json({
      forecast,
      city: CITY,
      updated: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Weather API error:", error);
    return res.status(500).json({ error: "Не удалось получить прогноз погоды" });
  }
}

async function fetchWeatherData(key) {
  const url = `https://api.weatherapi.com/v1/forecast.json?key=${key}&q=${encodeURIComponent(CITY)}&days=1&aqi=no&alerts=no`;
  const res = await fetch(url);

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`WeatherAPI ${res.status}: ${text}`);
  }

  const data = await res.json();
  return {
    location: data.location,
    current: data.current,
    forecast: data.forecast.forecastday[0],
  };
}

async function generateForecast(apiKey, language, prompt) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.8,
      max_tokens: 500,
      messages: [
        {
          role: "system",
          content: language === "ru"
            ? "Ты самый заботливый русскоязычный погодный помощник в мире."
            : "You are the most caring English weather voice assistant.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI error ${res.status}: ${text}`);
  }

  const json = await res.json();
  return json.choices[0]?.message?.content?.trim() || "Прогноз временно недоступен";
}
