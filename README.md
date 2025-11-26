# 📡 Forecast Worker  
A friendly weather forecast API powered by **Cloudflare Workers**, **KV Storage**, **WeatherAPI.com**, and **OpenAI**.

---

# 🧩 How It Works — Short Overview

1. **Real weather data** is fetched from WeatherAPI.com  
2. **This data is sent to OpenAI (gpt-4o-mini)**, which generates a warm, human-friendly forecast text (2–3 paragraphs)  
3. **The generated forecast is saved in Cloudflare KV**  
4. **Any request instantly returns the stored forecast** (no need to call WeatherAPI/OpenAI again)  
5. **Default city (Edinburgh) is refreshed every 2 hours** using Cloudflare Cron  

This makes the API **fast**, **affordable**, and capable of handling heavy request loads.

---

# ✨ Features
- 🌍 Works with **any city name or coordinates** (`?city=55.7558,37.6173`)
- 🈳 Two languages: **Russian (`ru`, default)** and **English (`eng`)**
- 🏙 Default city **Edinburgh** auto-refreshes every 2 hours
- ⚡ Other cities: generated on first request → cached for ~2 hours
- 🕒 Response includes **two timestamps**: human-readable + ISO 8601 (UTC)
- 🤖 Forecast text created by **OpenAI gpt-4o-mini**
- ☁️ Weather from **WeatherAPI.com**
- 🧥 Clothing advice and warnings about rapid changes
- 🌙 Nighttime logic: advice for tomorrow

---

# 🛠️ Tech Stack
- Cloudflare Workers  
- Cloudflare KV  
- WeatherAPI.com  
- OpenAI API  
- Cloudflare Cron  

---

# 🌐 API Endpoint

```
GET https://<your-worker>.workers.dev/?city=<name>&lang=<ru|eng>
```

### Parameters

| Parameter | Description | Default |
|----------|-------------|---------|
| `city`   | City name or coordinates | Edinburgh |
| `lang`   | Language: `ru` or `eng` | ru |

---

# 📦 Example Request

```
https://edinburgh-forecast.workers.dev/?city=London&lang=eng
```

---

# 📘 Full Example Response (Morning in London)

```json
{
  "forecast": "Good morning! Today is Wednesday, November 26, and London greets you with a cool start — around 7°C, feeling closer to 5°C due to the light breeze from the west. Skies are mostly cloudy, but the air remains crisp and pleasant for a morning walk.\n\nToward the afternoon the temperature will rise slightly, and no significant rainfall is expected based on the early-hour forecast. A light jacket or a warm sweater will be enough, especially if you're out before noon. Keep an umbrella nearby just in case — London's weather can turn quickly even on quieter days.\n\nHave a smooth and cozy start to your day, and take a moment to enjoy the calm morning atmosphere.",
  "city": "London",
  "updated": "26 Nov 08:12",
  "updated_iso": "2025-11-26T08:12:00.000Z"
}
```

---

# 🔒 Security

- City names sanitized using a safe Unicode regex  
- KV key injection impossible  
- Clean JSON output  
- Secrets added via:

```
wrangler secret put WEATHER_KEY
wrangler secret put OPENAI_API_KEY
```

---

# 🚀 Installation & Deployment

### 1. Add KV Namespace to `wrangler.toml`

```toml
[[kv_namespaces]]
binding = "KV"
id = "your-kv-id"
```

### 2. Add secrets

```
wrangler secret put WEATHER_KEY
wrangler secret put OPENAI_API_KEY
```

### 3. Deploy

```
wrangler deploy
```

---

---

# 🇷🇺 Русская версия README

# 📡 Forecast Worker  
Удобный API прогноза погоды на базе **Cloudflare Workers**, **KV Storage**, **WeatherAPI.com** и **OpenAI**.

---

# 🧩 Краткая логика работы

1. **Получаем реальные данные погоды** из WeatherAPI.com (текущие условия + прогноз на сегодня).  
2. **Отправляем эти данные в OpenAI (gpt-4o-mini)**, который создаёт тёплый, дружелюбный текст прогноза (2–3 абзаца).  
3. **Сохраняем текст в Cloudflare KV**, чтобы отвечать мгновенно.  
4. **При запросе выдаём прогноз из KV без задержек**.  
5. **Эдинбург обновляется автоматически каждые 2 часа** с помощью Cloudflare Cron.

API получается быстрым, надёжным и недорогим.

---

# ✨ Возможности
- 🌍 Любые города и координаты (`?city=55.7558,37.6173`)  
- 🈳 Два языка: **русский (ru)** и **английский (eng)**  
- 🏙 Автообновление Эдинбурга каждые 2 часа  
- ⚡ Все остальные города кэшируются ~2 часа  
- 🕒 Два формата времени: удобочитаемое + ISO 8601 UTC  
- 🤖 Текст пишет **OpenAI gpt-4o-mini**  
- ☁️ Погодные данные — **WeatherAPI.com**  
- 🧥 Советы по одежде и предупреждения  
- 🌙 Если сейчас ночь — рекомендации на завтра  

---

# 🌐 REST API

```
GET https://<your-worker>.workers.dev/?city=<имя>&lang=<ru|eng>
```

---

# 📘 Пример ответа (утро в Лондоне)

```json
{
  "forecast": "Доброе утро! Сегодня среда, 26 ноября. Утро в Лондоне прохладное — около 7°C, ощущается как 5°C из-за лёгкого западного ветра. Небо в основном облачное, но воздух свежий и приятный для утренней прогулки.\n\nК дню температура немного повысится, значительных осадков не ожидается по утреннему прогнозу. Лёгкая куртка или тёплый свитер будут в самый раз, особенно до полудня. Держите зонт под рукой на случай внезапного дождя — погода в Лондоне может быстро меняться.\n\nХорошего и уютного начала дня, найдите минутку насладиться спокойным утром.",
  "city": "London",
  "updated": "26 ноя 08:12",
  "updated_iso": "2025-11-26T08:12:00.000Z"
}
```

---

# 🔧 Установка и деплой

### 1. Добавить KV в `wrangler.toml`

```toml
[[kv_namespaces]]
binding = "KV"
id = "your-kv-id"
```

### 2. Добавить секреты

```
wrangler secret put WEATHER_KEY
wrangler secret put OPENAI_API_KEY
```

### 3. Деплой

```
wrangler deploy
```
