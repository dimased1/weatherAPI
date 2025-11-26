# Friendly Weather Forecast API
**Instant • Any city • Russian + English • Cloudflare Workers**

Fast, warm, human-like weather forecasts for any city in the world, served instantly from the edge.

## Tech Stack
- **Platform** — Cloudflare Workers (edge execution, no cold starts)
- **AI** — OpenAI `gpt-4o-mini` (generates friendly, natural-sounding text)
- **Weather data** — WeatherAPI.com (current weather + hourly forecast)
- **Caching** — Cloudflare Workers KV (instant responses after first request)

## Features
- Works with any city name or coordinates (`?city=55.7558,37.6173`)
- Two languages: Russian (`ru` — default) and English (`eng`)
- Default city (Edinburgh) automatically refreshed every 2 hours via Cloudflare cron
- All other cities generated on first request → cached for ~2 hours
- Returns two timestamps: human-readable + ISO 8601 (UTC)

### Example usage (after your own deploy)
https://your-worker.workers.dev/
https://your-worker.workers.dev/?city=Москва
https://your-worker.workers.dev/?city=London&lang=eng
https://your-worker.workers.dev/?city=55.7558,37.6173&lang=ru
text### JSON response example
```json
{
  "forecast": "Добрый вечер! Сегодня в Москве прохладно, −2 °C, ощущается как −7 °C из-за ветра…",
  "city": "Moscow",
  "updated": "26 ноя 19:15",
  "updated_iso": "2025-11-26T16:15:42.000Z"
}
Setup & Deployment
1. Create KV namespace
Bashwrangler kv:namespace create WEATHER_KV
wrangler kv:namespace create WEATHER_KV --preview=false
Add to wrangler.toml:
toml[[kv_namespaces]]
binding = "KV"                     # ← MUST be exactly "KV" — used in code as env.KV
id = "your-production-id-here"
preview_id = "your-preview-id-here"
2. Add secrets (required!)
Bashwrangler secret put WEATHER_KEY       # ← your key from https://www.weatherapi.com
wrangler secret put OPENAI_API_KEY    # ← your OpenAI key (gpt-4o-mini works perfectly)
3. Enable cron — every 2 hours
In wrangler.toml:
tomltriggers = { crons = ["0 */2 * * *"] }   # every even hour UTC: 00:00, 02:00, 04:00…
4. Deploy
Bashwrangler deploy
Your personal, private weather API is now live and uses only your own keys and limits.

Русский раздел
Дружелюбный прогноз погоды
Cloudflare Workers + OpenAI gpt-4o-mini + WeatherAPI.com
Что используется

Cloudflare Workers — мгновенные ответы по всему миру
OpenAI gpt-4o-mini — тёплый, живой текст прогноза
WeatherAPI.com — точные текущие данные и почасовой прогноз
Cloudflare KV — кэширование (после первого запроса ответ < 50 мс)

Возможности

Любой город мира или координаты
Русский (по умолчанию) и английский языки
Эдинбург обновляется автоматически каждые 2 часа
Все остальные города — генерируются по первому запросу, потом из кэша

Настройка (обязательно!)

Создать KV и привязать как binding = "KV"
Добавить секреты:Bashwrangler secret put WEATHER_KEY
wrangler secret put OPENAI_API_KEY
Включить крон каждые 2 часа
Выполнить wrangler deploy

Готово — твой личный погодный API работает только на твоих ключах и лимитах.
