// /api/weather.js
// Поведение как у любого нормального публичного API — всегда свежие данные

const CITY = "Edinburgh";

const PROMPTS = { /* твои промпты без изменений, оставляем как у тебя были */ };

export default async function handler(req, res) {
  // Самое главное — эти 3 строки заставляют Vercel вести себя как обычный публичный API
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  // Эта строка — секретное оружие. Vercel полностью отключает свой CDN кэш
  res.setHeader("Vercel-CDN-Cache-Control", "no-store");
  res.setHeader("CDN-Cache-Control", "no-store");

  // Дополнительно: делаем так, чтобы ответ отличался для разных клиентов
  // (некоторые умные прокси всё равно пытаются кэшировать, если ответ 100% одинаковый)
  res.setHeader("Vary", "User-Agent, Accept, Accept-Encoding");

  try {
    const WEATHER_KEY = process.env.WEATHER_KEY;
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

    if (!WEATHER_KEY || !OPENAI_API_KEY) {
      return res.status(500).json({ error: "API keys missing" });
    }

    const lang = req.query.lang === "eng" ? "eng" : "ru";

    const weatherData = await fetchWeatherData(WEATHER_KEY);
    const forecast = await generateForecast(OPENAI_API_KEY, weatherData, lang);

    // Ещё один финальный удар по кэшу — добавляем уникальный заголовок
    res.setHeader("X-Generated-At", new Date().toISOString());

    return res.status(200).json({ 
      forecast,
      updated: new Date().toISOString(),  // удобно для отладки на клиенте
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to fetch weather" });
  }
}

// === Остальные функции без изменений ===
async function fetchWeatherData(apiKey) {
  const url = `https://api.weatherapi.com/v1/forecast.json?key=${apiKey}&q=${CITY}&days=1&aqi=no&alerts=no`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("WeatherAPI error");
  const data = await res.json();
  return {
    location: data.location,
    current: data.current,
    forecast: data.forecast.forecastday[0],
  };
}

async function generateForecast(apiKey, weatherData, language) {
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
        { role: "system", content: "Ты самый добрый погодный помощник." },
        { role: "user", content: PROMPTS[language](weatherData) },
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI error: ${res.status} ${text}`);
  }

  const json = await res.json();
  return json.choices[0].message.content.trim();
}

// САМОЕ ВАЖНОЕ — эта строчка внизу файла
// Без неё Vercel всё равно может кэшировать на уровне Edge, даже с заголовками!
export const dynamic = "force-dynamic";     // Next.js 13+ App Router стиль
// Если ты на Pages Router — оставь эту строку тоже, она не повредит
export const revalidate = 0;                 // тоже помогает
