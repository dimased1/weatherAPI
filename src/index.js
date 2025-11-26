// src/index.js — твой старый код, но теперь на Cloudflare Workers с KV
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
      // 1. Параллельно: свежая погода + кэш из KV
      const [weather, cached] = await Promise.all([
        getWeather(env),
        env.KV.get(`forecast:${lang}`, { type: "json" }),
      ]);

      let forecast = cached?.text;

      // 2. Если кэша нет или он старый — запускаем GPT в фоне
      if (!cached || Date.now() / 1000 - (cached.ts || 0) > 120) {
        ctx.waitUntil(updateGptInBackground(weather, lang, env));

        // На первый запрос — даём красивую заглушку (как у тебя было)
        if (!forecast) {
          const hour = new Date().getHours();
          forecast = lang === "eng"
            ? `Good \( {hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening"}! It's currently \){hour < 18 ? "mild" : "cool"} in Edinburgh. Dress warm and have a wonderful day!`
            : `Добрый \( {hour < 12 ? "утро" : hour < 18 ? "день" : "вечер"}! В Эдинбурге сейчас \){hour < 18 ? "прохладно" : "холодно"}. Одевайтесь тепло и отличного вам дня!`;
        }
      }

      return new Response(JSON.stringify({
        forecast,
        city: CITY,
        updated: new Date().toISOString(),
        _ts: Date.now(),
      }), { headers });

    } catch (error) {
      console.error("FATAL:", error);

      const hour = new Date().getHours();
      const fallback = lang === "eng"
        ? `Good evening! It's currently ${hour < 18 ? "mild" : "cool"} in Edinburgh. Dress warm and have a wonderful day!`
        : `Добрый вечер! В Эдинбурге сейчас ${hour < 18 ? "прохладно" : "холодно"}. Одевайтесь тепло и отличного вам дня!`;

      return new Response(JSON.stringify({
        forecast: fallback,
        city: CITY,
        updated: new Date().toISOString(),
        error: "gpt_temp_offline",
      }), { status: 200, headers });
    }
  },
};

// ─────── Фоновая задача: обновляем GPT и пишем в KV ───────
async function updateGptInBackground(weather, lang, env) {
  const forecast = await getGptForecast(weather, lang, env);
  await env.KV.put(`forecast:${lang}`, JSON.stringify({
    text: forecast,
    ts: Date.now() / 1000
  }), { expirationTtl: CACHE_TTL + 60 });
}

// ─────── Получаем погоду (точно как у тебя) ───────
async function getWeather(env) {
  const url = `https://api.weatherapi.com/v1/forecast.json?key=\( {env.WEATHER_KEY}&q= \){CITY}&days=1&aqi=no&alerts=no`;
  const r = await fetch(url, { cache: "no-store" });

  if (!r.ok) {
    return { current: { temp_c: 10, feelslike_c: 8, condition: { text: "облачно" }, wind_kph: 15 } };
  }

  const d = await r.json();
  return {
    location: d.location,
    current: d.current,
    forecastday: d.forecast.forecastday[0],
  };
}

// ─────── GPT-прогноз (твой оригинальный, без изменений) ───────
async function getGptForecast(data, lang = "ru", env) {
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
        "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
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
}      }

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
