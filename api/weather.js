// /api/weather.js

const CITY = "Edinburgh";

const PROMPTS = {
  ru: (weatherData) => `
Представь, что ты — дружелюбный голосовой помощник. Используя переданный JSON с погодой (${JSON.stringify(weatherData)}), сделай следующее: 1. Укажи дату и день недели. 2. Начни с приветствия по времени суток. 3. Составь короткий, тёплый прогноз: температура, осадки, ветер и важные особенности, только в метрических единицах. 4. Дай совет по одежде и при желании небольшой дневной совет. Выведи один связный текст по-русски, можно в 1–2 абзацах, до 100 слов.
`.trim(),

  eng: (weatherData) => `
Imagine that you are a friendly voice assistant who gives weather forecasts to people in simple, kind language. Use the provided JSON weather data (${JSON.stringify(weatherData)}). 1. Include date and day of week. 2. Greet appropriately for the time of day. 3. Give a short, pleasant forecast: temperature, precipitation, wind, metric units only. 4. Provide clothing advice. Express in 2-3 paragraphs.
`.trim()
};

export default async function handler(req, res) {
  try {
    const WEATHER_KEY = process.env.WEATHER_KEY;
    const OPENAI_KEY = process.env.OPENAI_API_KEY;

    if (!WEATHER_KEY || !OPENAI_KEY) {
      return res.status(500).json({ error: "API keys are not configured" });
    }

    const language = req.query.lang || "ru";
    if (!PROMPTS[language]) {
      return res.status(400).json({ error: `Unsupported language: ${language}. Available: ru, eng` });
    }

    const weatherData = await fetchWeatherData(WEATHER_KEY);
    const forecast = await generateForecast(weatherData, language, OPENAI_KEY);

    return res.status(200).json({ forecast });

  } catch (err) {
    console.error("Ошибка в /api/weather:", err);
    return res.status(500).json({ error: err.message || "An unexpected error occurred" });
  }
}

async function fetchWeatherData(apiKey) {
  const url = `https://api.weatherapi.com/v1/forecast.json?key=${apiKey}&q=${encodeURIComponent(CITY)}&days=1&aqi=no&alerts=no`;
  const resp = await fetch(url);
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`WeatherAPI error: ${resp.status} — ${text}`);
  }
  const data = await resp.json();
  return {
    location: data.location,
    current: data.current,
    forecast: data.forecast.forecastday[0]
  };
}

async function generateForecast(weatherData, language, apiKey) {
  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: "gpt-5-mini", // ✅ без пакета, напрямую
      messages: [
        { role: "system", content: "You are a friendly weather assistant who provides forecasts in a warm and caring manner." },
        { role: "user", content: PROMPTS[language](weatherData) }
      ],
      temperature: 0.7,
      max_tokens: 200
    })
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`OpenAI API error: ${resp.status} — ${text}`);
  }

  const data = await resp.json();
  return data.choices?.[0]?.message?.content || "Weather forecast is unavailable";
}
