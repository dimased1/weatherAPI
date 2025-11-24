// pages/api/weather.js  (или app/api/weather/route.js — работает в обоих)

const CITY = "Edinburgh";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function handler(req, res) {
  // Убиваем любой кэш навсегда
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.setHeader("Vercel-CDN-Cache-Control", "no-store");
  res.setHeader("CDN-Cache-Control", "no-store");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");

  try {
    const weather = await getWeather();
    const forecast = await getGptForecast(weather, req.query.lang);

    res.status(200).json({
      forecast,
      city: CITY,
      updated: new Date().toISOString(),
      _ts: Date.now(),                    // для SenseCraft — 100% антикэш
    });

  } catch (error) {
    console.error("FATAL:", error.message);

    // Даже если всё рухнуло — часы получат хоть что-то валидное и не упадут
    const fallback = req.query.lang === "eng"
      ? `Good evening! It's currently ${new Date().getHours() < 18 ? "mild" : "cool"} in Edinburgh. Dress warm and have a wonderful day!`
      : `Добрый вечер! В Эдинбурге сейчас ${new Date().getHours() < 18 ? "прохладно" : "холодно"}. Одевайтесь тепло и отличного вам дня!`;

    res.status(200).json({
      forecast: fallback,
      city: CITY,
      updated: new Date().toISOString(),
      error: "gpt_temp_offline",
    // ← часы всё равно покажут текст
    });
  }
}

// ─────── Получаем погоду ───────
async function getWeather() {
  const url = `https://api.weatherapi.com/v1/forecast.json?key=${process.env.WEATHER_KEY}&q=${CITY}&days=1&aqi=no&alerts=no`;
  const r = await fetch(url, { cache: "no-store" });

  if (!r.ok) {
    // Если даже погода не грузится — даём хотя бы текущее время
    return { current: { temp_c: 10, feelslike_c: 8, condition: { text: "облачно" }, wind_kph: 15 } };
  }

  const d = await r.json();
  return {
    location: d.location,
    current: d.current,
    forecastday: d.forecast.forecastday[0],
  };
}

// ─────── GPT-прогноз (с тройной защитой от падения) ───────
async function getGptForecast(data, lang = "ru") {
  const prompt = lang === "eng" ?
`Короткий тёплый прогноз на основе этого JSON (только факты из JSON):

${JSON.stringify(data)}

Просто дай прогноз на английском: приветствие по времени суток, температура, ощущается, ветер, осадки, что надеть. 2–3 предложения, очень дружелюбно. Без вопросов и без JSON в ответе.`
:
`Короткий тёплый прогноз на основе этого JSON:

${JSON.stringify(data)}

Дай прогноз на русском: приветствие по времени суток, температура и ощущается, осадки, ветер, совет по одежде. 2–3 абзаца, максимум 70 слов, очень по-доброму. Без вопросов и без упоминания JSON.`;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.7,
        max_tokens: 300,
        messages: [
          { role: "system", content: "Ты отвечаешь ТОЛЬКО прогнозом погоды. Никаких вопросов, никакого JSON, никаких лишних слов." },
          { role: "user", content: prompt }
        ],
      }),
    });

    if (!response.ok) throw new Error(`OpenAI ${response.status}`);

    const json = await response.json();
    return json.choices?.[0]?.message?.content?.trim() || "Приятная погода сегодня!";

  } catch (e) {
    console.error("GPT упал, возвращаем заглушку");
    return lang === "eng"
      ? "It’s a lovely day in Edinburgh! Stay warm and smile!"
      : "В Эдинбурге сегодня прекрасная погода! Улыбнитесь и оденьтесь по погоде";
  }
}
