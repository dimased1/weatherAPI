// src/index.js
const CITY = "Edinburgh";
const UPDATE_INTERVAL = 300 * 60; // 30 минут в секундах

export default {
  // Обычные HTTP-запросы — всегда мгновенные (берём из KV)
  async fetch(request, env) {
    const url = new URL(request.url);
    const lang = url.searchParams.get("lang") === "eng" ? "eng" : "ru";

    let cached = await env.KV.get(`forecast:${lang}`, { type: "json" });

    // Если кэша ещё нет вообще — делаем первый прогноз синхронно (только один раз после деплоя)
    if (!cached) {
      const weather = await getWeather(env);
      const forecast = await getGptForecast(weather, lang, env);

      const payload = {
        text: forecast,
        ts: Date.now() / 1000,
      };

      await env.KV.put(`forecast:${lang}`, JSON.stringify(payload), {
        expirationTtl: UPDATE_INTERVAL + 900, // +5 минут на всякий случай
      });

      return new Response(
        JSON.stringify({
          forecast,
          city: CITY,
          updated: new Date().toISOString(),
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    // Кэш есть — отдаём мгновенно
    return new Response(
      JSON.stringify({
        forecast: cached.text,
        city: CITY,
        updated: new Date(cached.ts * 1000).toISOString(),
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  },

  // Cron каждые 30 минут — обновляет прогнозы для ru и eng
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(updateBothForecasts(env));
  },
};

async function updateBothForecasts(env) {
  const weather = await getWeather(env);

  const tasks = ["ru", "eng"].map(async (lang) => {
    const forecast = await getGptForecast(weather, lang, env);
    await env.KV.put(
      `forecast:${lang}`,
      JSON.stringify({ text: forecast, ts: Date.now() / 1000 }),
      { expirationTtl: UPDATE_INTERVAL + 300 }
    );
  });

  await Promise.all(tasks);
}

// ─────── Погода ───────
async function getWeather(env) {
  const url = `https://api.weatherapi.com/v1/forecast.json?key=${env.WEATHER_KEY}&q=${CITY}&days=1&aqi=no&alerts=no`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error();
    const data = await res.json();
    return {
      location: data.location,
      current: data.current,
      forecastday: data.forecast.forecastday[0],
    };
  } catch {
    return { current: { temp_c: 10, feelslike_c: 8, condition: { text: "облачно" }, wind_kph: 15 } };
  }
}

// ─────── GPT ───────
async function getGptForecast(data, lang, env) {
  const prompt =
    lang === "eng"
      ? `A brief, friendly weather forecast in Russian (2–3 paragraphs, 70 to 100 words). Greeting according to the time of day, today's date (day of the week), temperature + feels like, wind, precipitation. Check the hourly forecast to see if there will be any significant changes. Write some advice on what to wear. If you wish, you can add some useful advice.\n\n${JSON.stringify(data)}`
      : `Короткий добрый прогноз погоды на русском (2–3 абзаца предложения, от 70 до 100 слов). Приветствие по времени суток, сегодняшний день(число день недели) температура + ощущается, ветер, осадки. Посмотри часовой прогноз, не будут ли сильных изменений. Напиши совет что надеть. Если есть желание - какой то полезный совет.\n\n${JSON.stringify(data)}`;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.7,
        max_tokens: 250,
        messages: [
          { role: "system", content: "Отвечай только текстом прогноза. Никаких вопросов, кода и JSON." },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!res.ok) throw new Error(res.status);

    const json = await res.json();
    return json.choices?.[0]?.message?.content?.trim() || (lang === "eng" ? "Lovely weather today!" : "Прекрасная погода!");
  } catch (e) {
    console.error("GPT error:", e);
    return lang === "eng"
      ? "Beautiful day in Edinburgh — stay cosy!"
      : "В Эдинбурге хорошая погода — одевайтесь тепло и улыбайтесь!";
  }
}
