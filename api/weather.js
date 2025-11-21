// /api/weather.js

const CITY = "Edinburgh";

const PROMPT_RU = (weatherData) => `
Представь, что ты — дружелюбный голосовой помощник. Используя переданный JSON с погодой (${JSON.stringify(weatherData)}), сделай следующее:
1. Укажи дату и день недели.
2. Начни с приветствия по времени суток.
3. Составь короткий, тёплый прогноз: температура, осадки, ветер и важные особенности, только в метрических единицах.
4. Дай совет по одежде и при желании небольшой дневной совет.
Выведи один связный текст по-русски, 80–100 слов, 1–2 абзаца.
`.trim();

export default async function handler(req, res) {
  try {
    const WEATHER_KEY = process.env.WEATHER_KEY;
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

    if (!WEATHER_KEY || !OPENAI_API_KEY) {
      return res.status(500).json({ error: "API keys are not configured" });
    }

    const language = "ru";

    const weatherData = await fetchWeatherData(WEATHER_KEY);
    const forecast = await generateForecast(OPENAI_API_KEY, weatherData);

    const now = new Date();
    const lastUpdated = now.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

    return res.status(200).json({ forecast, lastUpdated });

  } catch (err) {
    console.error("Ошибка /api/weather:", err);
    return res.status(500).json({ error: err.message || "Unknown error" });
  }
}


// --- WEATHER API ---
async function fetchWeatherData(apiKey) {
  const url = `https://api.weatherapi.com/v1/forecast.json?key=${apiKey}&q=${encodeURIComponent(CITY)}&days=1&aqi=no&alerts=no`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`WeatherAPI error: ${response.status} — ${await response.text()}`);
  }

  const data = await response.json();

  return {
    location: data.location,
    current: data.current,
    forecast: data.forecast.forecastday[0]
  };
}


// --- GPT FORECAST ---
async function generateForecast(openaiKey, weatherData) {
  const systemPrompt = "Ты дружелюбный голосовой помощник, который пишет короткие и понятные прогнозы погоды на русском языке.";
  const userPrompt = PROMPT_RU(weatherData);

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${openaiKey}`
    },
    body: JSON.stringify({
      model: "gpt-5-nano",
      input: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      max_output_tokens: 2000
    })
  });

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.status} — ${await response.text()}`);
  }

  const data = await response.json();

  // Responses API 2025: основной текст всегда в output_text
  if (typeof data.output_text === "string" && data.output_text.trim().length > 0) {
    return data.output_text.trim();
  }

  throw new Error("OpenAI API вернул пустой текстовый прогноз.");
}
