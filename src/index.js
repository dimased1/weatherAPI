// src/index.js
// Weather Forecast Worker (Cloudflare Workers)
// Instantly serves friendly human-like forecasts for ANY city in Russian or English
// Powered by WeatherAPI.com + OpenAI gpt-4o-mini + Cloudflare KV caching
// Default city: Edinburgh | Update interval: every 2 hours

const DEFAULT_CITY = "Edinburgh";                 // Fallback and cron-updated city
const UPDATE_INTERVAL = 2 * 60 * 60;               // 2 hours in seconds
const CACHE_TTL_EXTRA = 20 * 60;                   // Extra cache time buffer (20 min)

/**
 * Main HTTP handler — always fast thanks to KV cache
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // User can override city and language via query params
    const rawCity = url.searchParams.get("city")?.trim();
    const city = rawCity && rawCity.length > 0
      ? sanitizeCity(rawCity)          // Basic protection against garbage input
      : DEFAULT_CITY;

    const lang = url.searchParams.get("lang") === "eng" ? "eng" : "ru";

    const cacheKey = `forecast:${city}:${lang}`;
    const cached = await env.KV.get(cacheKey, { type: "json" });

    // === CACHE HIT → instant response ===
    if (cached && cached.text && cached.ts) {
      return formatResponse(cached.text, city, cached.ts);
    }

    // === CACHE MISS → generate forecast synchronously (only once per city/lang) ===
    // This happens on first request after deploy or cache expiration
    const weather = await getWeather(city, env);
    const forecast = await getGptForecast(weather, lang, env);

    const payload = {
      text: forecast,
      ts: Date.now() / 1000,                   // Unix timestamp (seconds)
    };

    // Cache for ~2 hours + buffer
    await env.KV.put(cacheKey, JSON.stringify(payload), {
      expirationTtl: UPDATE_INTERVAL + CACHE_TTL_EXTRA,
    });

    return formatResponse(forecast, city, payload.ts);
  },

  /**
   * Cron trigger — runs every 2 hours
   * Keeps the default city (Edinburgh) always fresh and warm (no cold start for most users)
   */
  async scheduled(event, env, ctx) {
    ctx.waitUntil(updateDefaultCityForecasts(env));
  },
};

/**
 * Background task: refresh Edinburgh forecasts (ru + eng) every 2 hours
 * This is the only place where we proactively spend OpenAI tokens
 */
async function updateDefaultCityForecasts(env) {
  const weather = await getWeather(DEFAULT_CITY, env);

  const tasks = ["ru", "eng"].map(async (lang) => {
    const forecast = await getGptForecast(weather, lang, env);
    const payload = { text: forecast, ts: Date.now() / 1000 };
    const key = `forecast:${DEFAULT_CITY}:${lang}`;

    await env.KV.put(key, JSON.stringify(payload), {
      expirationTtl: UPDATE_INTERVAL + 15 * 60,
    });
  });

  await Promise.all(tasks);
}

/**
 * Fetch current + today forecast from WeatherAPI.com
 */
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
    console.error(`Weather fetch failed for "${city}":`, err.message);
    // Graceful fallback — never break the worker
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

/**
 * Generate friendly forecast text using OpenAI gpt-4o-mini
 */
async function getGptForecast(weatherData, lang, env) {
  const prompt = lang === "eng"
    ? `Short warm weather forecast (2–3 paragraphs, 70–100 words).
       Greetings according to the time of day in the selected city, today: day of the week and date, temperature and ‘feels like’,
       wind, precipitation. Check the hourly forecast — will there be any sudden changes? You can give advice for today, for tomorrow's weather if it is night now.
       Be sure to give advice on what to wear + one small useful tip if desired.
       Data: ${JSON.stringify(weatherData)}`
    : `Короткий тёплый прогноз погоды на русском (2–3 абзаца, 70–100 слов).
       Приветствие по времени суток в выбранном городе, сегодня: день недели и число, температура и «ощущается»,
       ветер, осадки. Посмотри почасовой прогноз — будут ли резкие изменения. Можно дать совет на день, на завтрашний день по погоде если сейчас ночь.
       Обязательно совет что надеть + по желанию один маленький полезный совет.
       Данные: ${JSON.stringify(weatherData)}`;

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
          { role: "system", content: "You are a kind meteorologist. Reply ONLY with the forecast text. No JSON, no code, no explanations." },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!res.ok) throw new Error(`OpenAI ${res.status}`);

    const json = await res.json();
    return json.choices?.[0]?.message?.content?.trim() || fallbackForecast(lang);
  } catch (err) {
    console.error("OpenAI request failed:", err.message);
    return fallbackForecast(lang);
  }
}

/**
 * Simple city name sanitization (prevent KV key injection)
 */
function sanitizeCity(str) {
  return str.replace(/[^\p{L}\p{N}\s,-]/gu, "").slice(0, 100);
}

/**
 * Fallback text if GPT is down
 */
function fallbackForecast(lang) {
  return lang === "eng"
    ? "Beautiful day ahead — dress comfortably and enjoy!"
    : "Хороший денёк — одевайтесь по погоде и улыбайтесь!";
}

/**
 * Format final JSON response with pretty Russian date
 */
function formatResponse(forecastText, city, timestamp) {
  const date = new Date(timestamp * 1000);
  const updated = date.toLocaleString("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).replace(/(\d+) (\w+)\.?, (\d{2}:\d{2})/, "$1 $2 $3"); // → "11 дек 22:00"

  return new Response(
    JSON.stringify({ forecast: forecastText, city, updated }, null, 2),
    {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
      },
    }
  );
}
