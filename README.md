# 📡 Edinburgh Forecast Worker

A friendly weather forecast API powered by **Cloudflare Workers**, **KV
Storage**, **WeatherAPI.com**, and **OpenAI**.\
Provides warm, human-like forecasts for any city in **English 🇬🇧** or
**Russian 🇷🇺**.

------------------------------------------------------------------------

## ✨ Features

-   🌍 Any city supported (safe sanitization)\
-   ⚡ Instant responses via KV cache (2h + buffer)\
-   🤖 Uses **OpenAI gpt-4o-mini** for natural forecasts\
-   ☁️ Weather data from **WeatherAPI.com**\
-   🔁 Auto-refresh every 2 hours via Cron\
-   🧥 Clothing advice + warnings about sudden changes\
-   🌙 Nighttime logic: advice for tomorrow

------------------------------------------------------------------------

## 🛠️ Tech Stack

-   **Cloudflare Workers**\
-   **Cloudflare KV Storage**\
-   **OpenAI API**\
-   **WeatherAPI.com**\
-   **Cron Triggers**

------------------------------------------------------------------------

## 🌐 API Endpoint

    GET https://<your-worker>.workers.dev/?city=<name>&lang=<ru|eng>

### Parameters

  Name     Description     Default
  -------- --------------- -----------
  `city`   Any city name   Edinburgh
  `lang`   `ru` or `eng`   ru

### Example

    https://edinburgh-forecast.workers.dev/?city=London&lang=eng

------------------------------------------------------------------------

## 📦 Example Response

``` json
{
  "forecast": "Warm, human-like forecast…",
  "city": "London",
  "updated": "26 ноя 14:37",
  "updated_iso": "2025-11-26T14:37:21.000Z"
}
```

------------------------------------------------------------------------

## 🔧 How It Works

### 1. Request → KV Lookup

Instant if cached.

### 2. Cache Miss → WeatherAPI

Fetches current + daily forecast.

### 3. GPT Summary

Generates 2--3 paragraphs, 70--100 words, clothing tips, warnings.

### 4. KV Store

TTL = 2h + 20 min.

### 5. Cron

Refreshes Edinburgh (ru + eng) every 2 hours.

------------------------------------------------------------------------

## 🔒 Security

-   City sanitization prevents key injection\
-   No HTML --- pure JSON\
-   Secrets stored via:\

```{=html}
<!-- -->
```
    wrangler secret put WEATHER_KEY
    wrangler secret put OPENAI_API_KEY

------------------------------------------------------------------------

## 🚀 Installation & Deployment

### 1. KV Namespace in `wrangler.toml`

``` toml
[[kv_namespaces]]
binding = "KV"
id = "your-kv-id"
```

### 2. Add Secrets

    wrangler secret put WEATHER_KEY
    wrangler secret put OPENAI_API_KEY

### 3. Deploy

    wrangler deploy

------------------------------------------------------------------------

# 🇷🇺 Русская версия

# 📡 Edinburgh Forecast Worker

Дружелюбный API прогноза погоды на базе **Cloudflare Workers**, **KV**,
**WeatherAPI.com** и **OpenAI**.\
Создаёт естественные человеческие прогнозы для любого города на
**русском 🇷🇺** или **английском 🇬🇧**.

------------------------------------------------------------------------

## ✨ Возможности

-   🌍 Любой город\
-   ⚡ Мгновенные ответы из KV (2 часа + буфер)\
-   🤖 Генерация текста через **gpt-4o-mini**\
-   ☁️ Данные из WeatherAPI\
-   🔁 Автообновление каждые 2 часа\
-   🧥 Советы по одежде\
-   🌙 Логика для ночи: прогноз на завтра

------------------------------------------------------------------------

## 🌐 API

    GET https://<your-worker>.workers.dev/?city=<город>&lang=<ru|eng>

------------------------------------------------------------------------

## 🚀 Деплой

    wrangler deploy

------------------------------------------------------------------------

## 📁 Project Structure

    /
    ├─ wrangler.toml
    └─ src/index.js
