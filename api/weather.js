// /api/weather.js
// Финальная версия — работает как часы, всегда свежий прогноз, без кэша

const CITY = "Edinburgh";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("Vercel-CDN-Cache-Control", "no-store");
  res.setHeader("CDN-Cache-Control", "no-store");

  try {
    const WEATHER_KEY = process.env.WEATHER_KEY;
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!WEATHER_KEY || !OPENAI_API_KEY) return res.status(500).json({ error: "No keys" });

    const lang = req.query.lang === "eng" ? "eng" : "ru";

    const weatherData = await fetchWeatherData(WEATHER_KEY);
    const forecast = await generateForecast(OPENAI_API_KEY, weatherData, lang);

    return res.status(200).json({
      forecast: forecast,
      city: CITY,
      updated: new Date().toISOString(),
    });

  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Failed" });
  }
}

async function fetchWeatherData(key) {
  const url = `https://api.weatherapi.com/v1/forecast.json?key=${key}&q=${CITY}&days=1&aqi=no&alerts=no`;
  const r = await fetch(url);
  if (!r.ok) throw new Error("WeatherAPI failed");
  const d = await r.json();
  return {
    location: d.location,
    current: d.current,
    forecastday: d.forecast.forecastday[0],
  };
}

async function generateForecast(apiKey, weatherData, lang) {
  // Самый надёжный промпт — жёстко фиксируем поведение модели
  const userPrompt = lang === "ru" ?
`Ты — голосовой погодный помощник. НИКОГДА не задавай вопросов и не здоровайся только по времени суток.
Твоя единственная задача — дать короткий тёплый прогноз на основе ЭТОГО JSON (и ничего больше):

${JSON.stringify(weatherData)}

Требования:
- Дата и день недели сегодня
- Приветствие (Доброе утро / Добрый день / Добрый вечер)
- Температура, ощущается, осадки, ветер
- Совет по одежде + маленький добрый совет
- Только русский язык, 2–3 абзаца, максимально 70 слов
- Никаких вопросов, никаких "как могу помочь", никаких упоминаний JSON

Сделай прогноз прямо сейчас:` :

`You are a weather voice assistant. NEVER ask questions or say "how can I help".
Your only job is to give a short warm forecast based on THIS JSON only:

${JSON.stringify(weatherData)}

Requirements:
- Today’s date + weekday
- Greeting by time of day (Good morning / Good afternoon / Good evening)
- Temperature, feels like, precipitation, wind
- Clothing tip + tiny positive advice
- Natural English, 2–3 paragraphs, max 70 words
- No questions, no mentions of JSON

Give the forecast now:`;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.7,
      max_tokens: 400,
      messages: [
        {
          role: "system",
          content: "Ты строго следуешь инструкциям и никогда не отклоняешься от задачи. Отвечай только прогнозом погоды — никаких лишних слов.",
        },
        {
          role: "user",
          content: userPrompt,
        },
      ],
    }),
  });

  const data = await response;
  if (!data.ok) {
    const t = await data.text();
    throw new Error("OpenAI: " + t);
  }
  const json = await data.json();
  return json.choices[0].message.content.trim();
}
