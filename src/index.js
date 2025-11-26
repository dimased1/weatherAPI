// src/index.js
const CITY = "Edinburgh";
const CACHE_TTL = 180; // 3 минуты

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const lang = url.searchParams.get("lang") === "eng" ? "eng" : "ru";

    // Антикэш навсегда
    const headers = {
      "Content-Type": "application/json",
      "Cache-Control": "no-store, no-cache, must-revalidate, private",
      "CDN-Cache-Control": "no-store",
    };

    try {
      // 1. Параллельно: свежая погода + кэш из KV
      const [weather, cached] = await Promise.all([
        getWeather(env),
        env.KV.get(`forecast:${lang}`, { type: "json" }),
      ]);

      let forecast = cached?.text;
      const now = Date.now() / 1000;
      const needUpdate = !cached || now - (cached.ts || 0) > 120; // > 2 мин

      // 2. Если кэш старый — обновляем в фоне
      if (needUpdate) {
        ctx.waitUntil(updateForecastInBackground(weather, lang, env));
        
        if (!forecast) {
          forecast = lang === "eng"
            ? "Beautiful day in Edinburgh!"
            : "Прекрасный день в Эдинбурге!";
        }
      }

      return new Response(JSON.stringify({
        forecast,
        city: CITY,
        temp_c: weather.current.temp_c ?? 10,
        feels_like_c: weather.current.feelslike_c ?? 8,
        condition: weather.current.condition?.text || "cloudy",
        wind_kph: weather.current.wind_kph ?? 15,
        updated: new Date().toISOString(),
        _ts: Date.now(),
        _source: cached ? "kv" : "fallback",
      }), { headers });

    } catch (e) {
      console.error("Fatal:", e);
      return new Response(JSON.stringify({
        forecast: lang === "eng"
          ? "Good evening from Edinburgh!"
          : "Добрый вечер из Эдинбурга!",
        city: CITY,
        updated: new Date().toISOString(),
        error: "offline",
      }), { status: 200, headers });
    }
  },
};

// Фоновая задача — не блокирует ответ!
async function updateForecastInBackground(weather, lang, env) {
  const text = await generateGptForecast(weather, lang, env);
  await env.KV.put(`forecast:${lang}`, JSON.stringify({ text, ts: Date.now() / 1000 }), {
    expirationTtl: CACHE_TTL + 60,
  });
}

// ─────── Погода ───────
async function getWeather(env) {
  const url = `https://api.weatherapi.com/v1/forecast.json?key=\( {env.WEATHER_KEY}&q= \){CITY}&days=1&aqi=no&alerts=no`;
  const res = await fetch(url);
  if (!res.ok) return { current: { temp_c: 10, feelslike_c: 8, condition: { text: "облачно" }, wind_kph: 15 }};
  const data = await res.json();
  return data;
}

// ─────── DeepSeek (или OpenAI — просто поменяй URL и model) ───────
async function generateGptForecast(data, lang, env) {
  const prompt = lang === "eng" ?
`Короткий тёплый прогноз на основе этого JSON (только факты):

${JSON.stringify(data)}

Дай прогноз на английском: приветствие по времени суток, температура, ощущается, ветер, осадки, что надеть. 2–3 предложения, очень дружелюбно. Без JSON.`
:
`Короткий тёплый прогноз на основе этого JSON:

${JSON.stringify(data)}

Дай прогноз на русском: приветствие по времени суток, температура и ощущается, осадки, ветер, совет по одежде. 2–3 абзаца, макс 70 слов, очень по-доброму. Без JSON.`;

  try {
    const res = await fetch("https://api.deepseek.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.DEEPSEEK_API_KEY || env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: env.DEEPSEEK_API_KEY ? "deepseek-chat" : "gpt-4o-mini",
        temperature: 0.7,
        max_tokens: 300,
        messages: [
          { role: "system", content: "Отвечай ТОЛЬКО текстом прогноза погоды." },
          { role: "user", content: prompt }
        ],
      }),
    });

    if (!res.ok) throw new Error("LLM error");
    const json = await res.json();
    return json.choices?.[0]?.message?.content?.trim() || "Приятная погода!";
  } catch (e) {
    return lang === "eng"
      ? "Lovely weather in Edinburgh!"
      : "В Эдинбурге сегодня хорошая погода!";
  }
}
