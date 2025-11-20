// /api/weather.js
export default async function handler(req, res) {
  try {
    const WEATHER_KEY = process.env.WEATHER_KEY;
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    const city = "Edinburgh";

    if (!WEATHER_KEY || !OPENAI_API_KEY) {
      return res.status(500).json({ error: "Не настроены API-ключи" });
    }

    // 1. Запрашиваем прогноз на 2 дня с WeatherAPI
    const weatherResp = await fetch(`https://api.weatherapi.com/v1/forecast.json?key=${WEATHER_KEY}&q=${encodeURIComponent(city)}&days=2`);
    if (!weatherResp.ok) {
      const text = await weatherResp.text();
      throw new Error(`Ошибка WeatherAPI: ${weatherResp.status} — ${text}`);
    }
    const weatherData = await weatherResp.json();

    // 2. Отправляем весь JSON в OpenAI
    const prompt = `
Ты — дружелюбный прогноз погоды. На основе этих данных составь простой и тёплый текст для человека. Вытяни оттуда дату и день недели, тоже напиши. Посоветуй одежду на день, если есть какие то изменения погоды пиши. В начале предложения можешь поздароваться исходя от времени
Данные JSON: ${JSON.stringify(weatherData)}
`;

    const openaiResp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo",
        messages: [
          { role: "system", content: "Ты дружелюбный помощник, который пишет прогноз погоды простым языком." },
          { role: "user", content: prompt }
        ]
      })
    });

    if (!openaiResp.ok) {
      const text = await openaiResp.text();
      throw new Error(`Ошибка OpenAI: ${openaiResp.status} — ${text}`);
    }

    const openaiData = await openaiResp.json();
    const forecast = openaiData.choices?.[0]?.message?.content || "Нет прогноза";

    // 3. Возвращаем JSON с текстом
    return res.status(200).json({ forecast });

  } catch (err) {
    console.error("Ошибка в /api/weather:", err);
    return res.status(500).json({ error: err.message });
  }
}
