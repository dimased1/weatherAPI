// src/index.js
// Friendly Weather Forecast Worker
// Any city • Russian + English • Instant from KV • Updated every 2 hours

const DEFAULT_CITY = "Edinburgh";
const UPDATE_INTERVAL = 2 * 60 * 60;        // 2 hours in seconds
const CACHE_BUFFER = 20 * 60;               // extra cache time (20 min)

export default {
  // HTTP requests — always instant
  async fetch(request, env) {
    const url = new URL(request.url);

    // User-defined city and language
    const rawCity = url.searchParams.get("city")?.trim();
    const city = rawCity ? sanitizeCity(rawCity) : DEFAULT_CITY;
    const lang = url.searchParams.get("lang") === "eng" ? "eng" : "ru";

    const cacheKey = `forecast:${city}:${lang}`;
    const cached = await env.KV.get(cacheKey, { type: "json" });

    // Cache hit → instant response
    if (cached?.text && cached?.ts) {
      return formatResponse(cached.text, city, cached.ts);
    }

    // Cache miss → generate once (first request after expiry/deploy)
    const weather = await getWeather(city, env);
    const forecast = await getGptForecast(weather, lang, env);

    const payload = {
      text: forecast,
      ts: Date.now() / 1000,
    };

    await env.KV.put(cacheKey, JSON.stringify(payload), {
      expirationTtl: UPDATE_INTERVAL + CACHE_BUFFER,
    });

    return formatResponse(forecast, city, payload.ts);
  },

  // Cron: every 2 hours → keep default city fresh
  async scheduled(event, env, ctx) {
    ctx.waitUntil(updateDefaultCityForecasts(env));
  },
};

// Background: refresh Edinburgh (ru + eng) every 2 hours
async function updateDefaultCityForecasts(env) {
  const weather = await getWeather(DEFAULT_CITY, env);

  await Promise.all(
    ["ru", "eng"].map(async (lang) => {
      const forecast = await getGptForecast(weather, lang, env);
      const payload = { text: forecast, ts: Date.now() / 1000 };
      await env.KV.put(`forecast:${DEFAULT_CITY}:${lang}`, JSON.stringify(payload), {
        expirationTtl: UPDATE_INTERVAL + 15 * 60,
      });
    })
  );
}

// WeatherAPI.com → current + today forecast
async function getWeather(city, env) {
  const url = `https://api.weatherapi.com/v1/forecast.json?key=${env.WEATHER_KEY}&q=${encodeURIComponent(city)}&days=1&aqi=no&alerts=no`;

  try {
    const res = await fetch(url, { timeout: 10000 });
    if (!res.ok) throw new Error(`WeatherAPI ${res.status}`);
    const data = await res.json();

    return {
      location: data.location,
      current: data.current,
      forecastday: data.forecast.forecastday[0],
    };
  } catch (err) {
    console.error(`Weather failed for "${city}":`, err.message);
    return {
      current: {
        temp_c: 10,
        feelslike_c: 8,
        condition: { text: "cloudy" },
        wind_kph: 12,
        precip_mm: 0,
      },
    };
  }
}

// OpenAI → warm human-like forecast
async function getGptForecast(weatherData, lang, env) {
  const isEng = lang === "eng";

  const prompt = isEng
    ? `Write a short, warm, friendly weather forecast in clear, natural English (2–3 paragraphs, 70–100 words total).
       Greeting by time of day, today's full date and weekday, current temperature + feels-like, wind, precipitation.
       Check hourly forecast for significant changes. Important - give advice on clothing. And in case of sudden weather changes, let them know. If it's nighttime now, give advice for tomorrow. If there's space, you can just give some good advice in general.  
       Data: ${JSON.stringify(weatherData)}`
    : `Короткий тёплый прогноз погоды на русском (2–3 абзаца, 70–100 слов).
       Приветствие по времени суток, сегодня: день недели(сейчас 2025 год) и число, температура и «ощущается», ветер, осадки. Используй °C и км/час.
       Посмотри почасовой прогноз — будут ли резкие изменения. Важно - дай совет по одежде. И в случае резких перепадов погоды сообщи об этом. Если сейчас ночь, дай совет на завтра. Если есть место - можешь дать просто хороший совет в общем. 
       Данные: ${JSON.stringify(weatherData)}`;

  const systemMessage = isEng
    ? "You are a kind meteorologist. Reply ONLY with the forecast text in natural English. No JSON, no code, no explanations."
    : "Ты — добрый метеоролог. Отвечай ТОЛЬКО текстом прогноза на русском языке. Никакого JSON, кода и пояснений.";

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
        max_tokens: 300,
        messages: [
          { role: "system", content: systemMessage },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!res.ok) throw new Error(`OpenAI ${res.status}`);
    const json = await res.json();
    return json.choices?.[0]?.message?.content?.trim() || fallbackForecast(lang);
  } catch (err) {
    console.error("OpenAI failed:", err.message);
    return fallbackForecast(lang);
  }
}

// Security: prevent KV key injection
function sanitizeCity(str) {
  return str.replace(/[^\p{L}\p{N}\s,-]/gu, "").slice(0, 100) || DEFAULT_CITY;
}

// Fallback text if everything is down
function fallbackForecast(lang) {
  return lang === "eng"
    ? "Lovely weather today — enjoy your day!"
    : "Хорошая погода сегодня — улыбайтесь!";
}

// Final JSON response with two date formats
function formatResponse(forecastText, city, timestamp) {
  const date = new Date(timestamp * 1000);

  const updatedHuman = date.toLocaleString("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).replace(/(\d+) (\w+)\.?, (\d{2}:\d{2})/, "$1 $2 $3"); // → "26 ноя 14:37"

  const updatedIso = date.toISOString(); // → "2025-11-26T14:37:21.000Z"

  return new Response(
    JSON.stringify({
      forecast: forecastText,
      city,
      updated: updatedHuman,      // для людей
      updated_iso: updatedIso,    // для машин, логов, API
    }, null, 2),
    {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
      },
    }
  );
}
