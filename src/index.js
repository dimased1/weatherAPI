// src/index.js — твой код, но теперь на Cloudflare Workers + KV (OpenAI, как ты просил)

const CITY = "Edinburgh";
const CACHE_TTL = 180; // 3 минуты

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const lang = url.searchParams.get("lang") === "eng" ? "eng" : "ru";

    const headers = {
      "Content-Type": "application/json",
      "Cache-Control": "no-store, no-cache, must-revalidate, private",
    };

    try {
      const [weather, cached] = await Promise.all([
        getWeather(env),
        env.KV.get(`forecast:${lang}`, { type: "json" }),
      ]);

      let forecast = cached?.text;

      // Если кэша нет или он старый — запускаем GPT в фоне
      if (!cached || Date.now() / 1000 - (cached?.ts || 0) > 120) {
        ctx.waitUntil(updateGptInBackground(weather, lang, env));

        // На первый запрос — красивая заглушка с приветствием по времени
        if (!forecast) {
          const hour = new Date().getHours();
          forecast =
            lang === "eng"
              ? `Good \( {hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening"}! It's currently \){hour < 18 ? "mild" : "cool"} in Edinburgh. Dress warm and have a wonderful day!`
              : `Добрый \( {hour < 12 ? "утро" : hour < 18 ? "день" : "вечер"}! В Эдинбурге сейчас \){hour < 18 ? "прохладно" : "холодно"}. Одевайтесь тепло и отличного вам дня!`;
        }
      }

      return new Response(
        JSON.stringify({
          forecast,
          city: CITY,
          updated: new Date().toISOString(),
          _ts: Date.now(),
        }),
        { headers }
      );
    } catch (error) {
      console.error("FATAL:", error);

      const hour = new Date().getHours();
      const fallback =
        lang === "eng"
          ? `Good evening! It's currently ${hour < 18 ? "mild" : "cool"} in Edinburgh. Dress warm and have a wonderful day!`
          : `Добрый вечер! В Эдинбурге сейчас ${hour < 18 ? "прохладно" : "холодно"}. Одевайтесь тепло и отличного вам дня!`;

      return new Response(
        JSON.stringify({
          forecast: fallback,
          city: CITY,
          updated: new Date().toISOString(),
          error: "gpt_temp_offline",
        }),
        { status: 200, headers }
      );
    }
  },
};

// Фоновая задача — не блокирует ответ
async function updateGptInBackground(weather, lang, env) {
  const forecast = await getGptForecast(weather, lang, env);
  await env.KV.put(
    `forecast:${lang}`,
    JSON.stringify({ text: forecast, ts: Date.now() / 1000 }),
    { expirationTtl: CACHE_TTL + 60 }
  );
}

// ─────── Погода (точно как у тебя) ───────
async function getWeather(env) {
  const url = `https://api.weatherapi.com/v1/forecast.json?key=\( {env.WEATHER_KEY}&q= \){CITY}&days=1&aqi=no&alerts=no`;
  const r = await fetch(url, { cache: "no-store" });

  if (!r.ok) {
    return {
      current: { temp_c: 10, feelslike_c: 8, condition: { text: "облачно" }, wind_kph: 15 },
    };
  }

  const d = await r.json();
  return {
    location: d.location,
    current: d.current,
    forecastday: d.forecast.forecastday[0],
  };
}

// ─────── OpenAI GPT-4o-mini (твой оригинальный код) ───────
async function getGptForecast(data, lang = "ru", env) {
  const prompt =
    lang === "eng"
      ? `Короткий тёплый прогноз на основе этого JSON (только факты из JSON):

${JSON.stringify(data)}

Просто дай прогноз на английском: приветствие по времени суток, температура, ощущается, ветер, осадки, что надеть. 2–3 предложения, очень дружелюбно. Без вопросов и без JSON в ответе.`
      : `Короткий тёплый прогноз на основе этого JSON:

${JSON.stringify(data)}

Дай прогноз на русском: приветствие по времени суток, температура и ощущается, осадки, ветер, совет по одежде. 2–3 абзаца, максимум 70 слов, очень по-доброму. Без вопросов и без упоминания JSON.`;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.7,
        max_tokens: 300,
        messages: [
          { role: "system", content: "Ты отвечаешь ТОЛЬКО прогнозом погоды. Никаких вопросов, никакого JSON, никаких лишних слов." },
          { role: "user", content: prompt },
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
