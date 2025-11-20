// index.js - Minimal Vercel serverless function (Node.js / ESM)
export default async function handler(req, res) {
  try {
    const WEATHER_KEY = process.env.WEATHER_KEY;
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    const city = "Edinburgh";

    // 1. Fetch hourly weather
    const weatherResp = await fetch(`https://api.weatherapi.com/v1/forecast.json?key=${WEATHER_KEY}&q=${city}&hours=24&lang=ru`);
    const weatherData = await weatherResp.json();

    const localTime = weatherData?.location?.localtime;
    const hourData = weatherData?.forecast?.forecastday?.[0]?.hour;

    // Determine greeting based on hour
    const hourNow = new Date(localTime).getHours();
    let greet = "Добрый день";
    if (hourNow < 12) greet = "Доброе утро";
    else if (hourNow >= 18) greet = "Добрый вечер";

    // 2. Prepare prompt for OpenAI
    const prompt = `Сформируй дружелюбный прогноз для города ${city}. Приветствие: ${greet}. Дата и день недели: ${localTime}. Используй данные погоды: ${JSON.stringify(hourData)}. Дай советы по одежде и нужен ли зонт. Форматируй текст как теплое человеческое сообщение.`;

    // 3. Send to OpenAI GPT-5.1-nano
    const openaiResp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-5.1-nano",
        messages: [{ role: "user", content: prompt }]
      })
    });

    const openaiData = await openaiResp.json();
    const summary = openaiData?.choices?.[0]?.message?.content || "Нет прогноза";

    return res.status(200).json({ summary });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
