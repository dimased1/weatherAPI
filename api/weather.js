// index.js - Minimal Vercel serverless function
// Fetch hourly weather from WeatherAPI and send brief summary to OpenAI GPT-5.1-nano

// /api/weather.js — endpoint
export default async function handler(req, res) {
  try {
    const WEATHER_KEY = process.env.WEATHER_KEY;
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

    const city = "Edinburgh";

    // Fetch hourly weather
    const weatherResp = await fetch(`https://api.weatherapi.com/v1/forecast.json?key=${WEATHER_KEY}&q=${city}&hours=24&lang=ru`);`);
    const weatherData = await weatherResp.json();

    const hour = weatherData?.forecast?.forecastday?.[0]?.hour?.[0];
    const localTime = weatherData?.location?.localtime;
    const hourData = weatherData?.forecast?.forecastday?.[0]?.hour;

    // Determine greeting based on hour
    const hourNow = new Date(localTime).getHours();
    let greet = "Добрый день";
    if (hourNow < 12) greet = "Доброе утро";
    else if (hourNow >= 18) greet = "Добрый вечер";

    const prompt = `Сформируй дружелюбный прогноз.
Город: ${city}.
Время: ${localTime}.
Приветствие должно быть: ${greet}.
Используй данные погоды: ${JSON.stringify(hourData)}.
Укажи:
- Приветствие
- Дату и день недели (локализуй по-русски)
- Текущую погоду
- Что ожидается позже сегодня
- Советы по одежде и нужен ли зонт
Формат — тёплый, простой, человечный.`;;

    // 2. Send to OpenAI GPT-5.1-nano
    const openaiResp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-5.1-nano",
        messages: [ { role: "user", content: prompt } ]
      })
    });

    const openaiData = await openaiResp.json();
    const summary = openaiData?.choices?.[0]?.message?.content || "No summary";

    return res.status(200).json({ summary });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
