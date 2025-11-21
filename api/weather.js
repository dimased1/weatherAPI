// /api/weather.js

const CITY = "Edinburgh";

const PROMPTS = {
  ru: (weatherData) => `
Представь, что ты — дружелюбный голосовой помощник. Используя переданный JSON с погодой (${JSON.stringify(weatherData)}), сделай следующее:
1. Укажи дату и день недели.
2. Начни с приветствия по времени суток.
3. Составь короткий, тёплый прогноз: температура, осадки, ветер и важные особенности, только в метрических единицах.
4. Дай совет по одежде и при желании небольшой дневной совет.
Выведи один связный текст по-русски, 80–100 слов, 1–2 абзаца.
`.trim(),

  eng: (weatherData) => `
Imagine you're a friendly voice assistant. Using the provided weather JSON (${JSON.stringify(weatherData)}), do this:
1. Mention the date and day of the week.
2. Start with a greeting based on time of day.
3. Give a warm, simple forecast: temperature, precipitation, wind, key features — metric only.
4. Give brief clothing advice and note any changes during the day.
Write 2–3 paragraphs, friendly tone.
`.trim()
};


export default async function handler(req, res) {
  try {
    const WEATHER_KEY = process.env.WEATHER_KEY;
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

    if (!WEATHER_KEY || !OPENAI_API_KEY) {
      return res.status(500).json({ error: "API keys are not configured" });
    }

    const language = req.query.lang || "ru";
    if (!PROMPTS[language]) {
      return res.status(400).json({ error: `Unsupported language: ${language}` });
    }

    const weatherData = await fetchWeatherData(WEATHER_KEY);
    const forecast = await generateForecast(OPENAI_API_KEY, weatherData, language);

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
async function generateForecast(openaiKey, weatherData, language) {
  const systemPrompt = "You are a warm, friendly weather assistant who writes clear human-friendly forecasts.";
  const userPrompt = PROMPTS[language](weatherData);

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
      max_output_tokens: 600,       // важно — иначе модель выдаёт только reasoning
      temperature: 0.7
    })
  });

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.status} — ${await response.text()}`);
  }

  const data = await response.json();

  // ---- Responses API (новый формат) ----
  if (typeof data.output_text === "string" && data.output_text.trim().length > 0) {
    return data.output_text.trim();
  }

  // fallback на случай нестандартных ответов
  if (Array.isArray(data.output) && data.output.length > 0) {
    if (typeof data.output[0].text === "string") {
      return data.output[0].text.trim();
    }
  }

  throw new Error("OpenAI API returned no text output.");
}
