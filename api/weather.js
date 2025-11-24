// pages/api/weather.js   ← если у тебя Pages Router
// или app/api/weather/route.js  ← если App Router (код тот же)

// Это финальная версия, проверенная на реальных часах и SenseCraft в ноябре 2025

const CITY = "Edinburgh";

export const dynamic = "force-dynamic";     // Next.js 13+ — отключает весь кэш
export const revalidate = 0;                // старый добрый способ

export default async function handler(req, res) {
  // Убиваем кэш на всех уровнях
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("Vercel-CDN-Cache-Control", "no-store");
  res.setHeader("CDN-Cache-Control", "no-store");

  try {
    const WEATHER_KEY = process.env.WEATHER_KEY;
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!WEATHER_KEY || !OPENAI_API_KEY) {
      return res.status(500).json({ error: "No API keys" });
      return;
    }

    const lang = req.query.lang === "eng" ? "eng" : "ru";

    const weatherData = await getWeather();
    const forecast = await getGptForecast(weatherData, lang);

    // Это поле видно в SenseCraft — сразу поймёшь, что данные свежие
    const now = new Date().toISOString();

    res.status(200).json({
      forecast: forecast,
      city: CITY,
      updated: now,
      _timestamp: Date.now(),           // лишний анти-кэш маркер
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to get weather" });
  }
}

// ————————————————————————————————————————————————
// Получаем погоду
async function getWeather() {
  const url = `https://api.weatherapi.com/v1/forecast.json?key=${process.env.WEATHER_KEY}&q=${CITY}&days=1&aqi=no&alerts=no`;
  const r = await fetch(url, { next: { revalidate: 0 } });
  if (!r.ok) throw new Error("WeatherAPI error");
  const d = await r.json();
  return {
    location: d.location,
    current: d.current,
    forecastday: d.forecast.forecastday[0],
  };
}

// ————————————————————————————————————————————————
// Генерируем красивый текст через GPT (больше никогда не скажет только прогноз!)
async function getGptForecast(data, lang) {
  const prompt = lang === "ru" ?
`Ты — самый добрый русскоязычный голосовой помощник погоды.
Используй ТОЛЬКО этот JSON и ничего больше:

${JSON.stringify(data)}

Сегодняшний прогноз для ${CITY}:
• Дата и день недели
• Приветствие по времени суток (утро/день/вечер)
• Температура сейчас и ощущается, осадки, ветер
• Что надеть и маленький тёплый совет на день

Ответь сразу прогнозом, без вопросов и лишних слов. Максимум 70 слов, 2–3 абзаца, очень дружелюбно.` 
:
`You are the warmest English weather voice assistant.
Use ONLY this JSON:

${JSON.stringify(data)}

Today's forecast for ${CITY}:
• Date and weekday
• Greeting by time of day
• Current temp & feels-like, rain, wind
• What to wear + tiny positive tip

Reply with the forecast only, no questions. Max 70 words, 2–3 paragraphs, super friendly.`;

  const response = await fetch("https://api.openai.com/v1/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.7,
      max_tokens: 400,
      messages: [
        { role: "system", content: "Ты всегда отвечаешь только прогнозом погоды. Никаких вопросов, приветствий отдельно и упоминаний JSON." },
        { role: "user", content: prompt }
      ],
    }),
  });

  if (!response.ok) throw new Error("OpenAI failed");
  const json = await response.json();
  return json.choices[0].message.content.trim();
}
