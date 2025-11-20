// /api/weather.js - исправленный для работы с OpenAI и WeatherAPI
export default async function handler(req, res) {
  try {
    const WEATHER_KEY = process.env.WEATHER_KEY;
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    const city = "Edinburgh";

    if (!WEATHER_KEY || !OPENAI_API_KEY) {
      return res.status(500).json({ error: "Не настроены API-ключи" });
    }

    // 1. Запрос к WeatherAPI без lang=ru
    const weatherUrl = `https://api.weatherapi.com/v1/forecast.json?key=${WEATHER_KEY}&q=${encodeURIComponent(city)}&days=1&aqi=no&alerts=no`;
    const weatherResp = await fetch(weatherUrl);
    if (!weatherResp.ok) {
      const text = await weatherResp.text();
      throw new Error(`Ошибка WeatherAPI: ${weatherResp.status} — ${text}`);
    }
    const weatherData = await weatherResp.json();

    const location = weatherData.location;
    const forecastDay = weatherData.forecast.forecastday?.[0];
    if (!forecastDay) throw new Error("Нет данных прогнозного дня от WeatherAPI");

    const hours = forecastDay.hour;
    const dayInfo = forecastDay.day;

    // 2. Дата, день недели и приветствие на русском
    const localtime = location.localtime;
    const dateObj = new Date(localtime);
    const dayNames = ["воскресенье","понедельник","вторник","среда","четверг","пятница","суббота"];
    const dayName = dayNames[dateObj.getDay()];
    const dateString = `${dateObj.getDate()} ${dateObj.toLocaleString("ru-RU", { month: "long" })}`;

    const hourNow = dateObj.getHours();
    let greet = "Добрый день";
    if (hourNow < 12) greet = "Доброе утро";
    else if (hourNow >= 18) greet = "Добрый вечер";

    // 3. Подготовка данных для AI
    const summaryForAI = {
      location: { name: location.name, region: location.region, country: location.country },
      current: weatherData.current,
      day: {
        maxtemp_c: dayInfo.maxtemp_c,
        mintemp_c: dayInfo.mintemp_c,
        avgtemp_c: dayInfo.avgtemp_c,
        totalprecip_mm: dayInfo.totalprecip_mm,
        condition: dayInfo.condition
      },
      hours: hours.map(h => ({ time: h.time, temp_c: h.temp_c, condition: h.condition, chance_of_rain: h.chance_of_rain, wind_kph: h.wind_kph }))
    };

    const prompt = `Составь дружелюбный прогноз для города ${location.name}, ${location.country}.
Приветствие: ${greet}.
Дата: ${dateString}, ${dayName}.
Используй данные погоды: ${JSON.stringify(summaryForAI, null, 2)}.
Напиши текущую погоду, прогноз на день и советы по одежде и зонту. Текст на русском, простой и дружелюбный.`;

    // 4. Запрос к OpenAI
    const openaiResp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: "gpt-5.1-nano",
        messages: [
          { role: "system", content: "Ты дружелюбный помощник, который пишет прогноз погоды простым языком." },
          { role: "user", content: prompt }
        ],
        temperature: 0.7
      })
    });

    if (!openaiResp.ok) {
      const text = await openaiResp.text();
      throw new Error(`Ошибка OpenAI: ${openaiResp.status} — ${text}`);
    }

    const openaiData = await openaiResp.json();
    const forecast = openaiData.choices?.[0]?.message?.content;
    if (!forecast) throw new Error("OpenAI вернул пустой прогноз");

    return res.status(200).json({ forecast });

  } catch (err) {
    console.error("Ошибка в /api/weather:", err);
    return res.status(500).json({ error: err.message });
  }
}
