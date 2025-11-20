// /api/weather.js

export default async function handler(req, res) {
  try {
    const WEATHER_KEY = process.env.WEATHER_KEY;
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    const city = "Edinburgh";

    if (!WEATHER_KEY || !OPENAI_API_KEY) {
      return res.status(500).json({ error: "Не настроены API-ключи" });
    }

    // 1. Запрашиваем прогноз с WeatherAPI
    // Используем days=1, чтобы получить прогноз на сегодня (и почасовой прогноз внутри)
    const weatherUrl = `https://api.weatherapi.com/v1/forecast.json?key=${WEATHER_KEY}&q=${encodeURIComponent(city)}&days=1&lang=ru&aqi=no&alerts=no`;
    const weatherResp = await fetch(weatherUrl);
    if (!weatherResp.ok) {
      const text = await weatherResp.text();
      throw new Error(`Ошибка WeatherAPI: ${weatherResp.status} — ${text}`);
    }
    const weatherData = await weatherResp.json();

    // 2. Извлекаем данные для прогноза
    const location = weatherData.location; // информация о месте
    const forecastDay = weatherData.forecast.forecastday?.[0];
    if (!forecastDay) {
      throw new Error("Нет данных прогнозного дня от WeatherAPI");
    }

    const hours = forecastDay.hour; // массив почасовых данных
    const dayInfo = forecastDay.day; // дневные агрегированные данные

    // 3. Формируем prompt для OpenAI
    const localtime = location.localtime; // строка вроде "2025-11-20 14:00"
    const dateObj = new Date(localtime);
    const dayNames = ["воскресенье","понедельник","вторник","среда","четверг","пятница","суббота"];
    const dayName = dayNames[dateObj.getDay()];
    const dateString = `${dateObj.getDate()} ${dateObj.toLocaleString("ru‑RU", { month: "long" })}`;

    // Определение приветствия
    const hourNow = dateObj.getHours();
    let greet = "Добрый день";
    if (hourNow < 12) greet = "Доброе утро";
    else if (hourNow >= 18) greet = "Добрый вечер";

    // Подготовим основные погодные характеристики для передачи модели
    const summaryForAI = {
      location: {
        name: location.name,
        region: location.region,
        country: location.country,
      },
      current: weatherData.current, // текущее состояние (температура, ветер, осадки и т.п.)
      day: {
        // дневные обобщённые данные
        maxtemp_c: dayInfo.maxtemp_c,
        mintemp_c: dayInfo.mintemp_c,
        avgtemp_c: dayInfo.avgtemp_c,
        totalprecip_mm: dayInfo.totalprecip_mm,
        condition: dayInfo.condition, // условие (текстовое описание)
      },
      hours: hours.map(h => ({
        time: h.time,
        temp_c: h.temp_c,
        condition: h.condition,
        chance_of_rain: h.chance_of_rain,
        wind_kph: h.wind_kph,
      })),
    };

    const prompt = `
Составь дружелюбный прогноз для города ${location.name}, ${location.country}.
Приветствие: ${greet}.
Дата: ${dateString}, ${dayName}.
Вот погодные данные: ${JSON.stringify(summaryForAI, null, 2)}.

Напиши:
- краткое описание текущей погоды,
- что ожидается в течение дня (температура, осадки),
- совет, какую одежду взять и нужен ли зонт,
- дружелюбный тон, как от человека.
`;

    // 4. Отправляем запрос в OpenAI Chat API
    const openaiResp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-5.1-nano", // или другая модель, если у тебя другая
        messages: [
          { role: "system", content: "Ты — дружелюбный помощник, который даёт прогноз погоды простым языком." },
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
    const summary = openaiData.choices?.[0]?.message?.content;

    if (!summary) {
      throw new Error("OpenAI вернул пустой прогноз");
    }

    // 5. Отправляем результат клиенту
    return res.status(200).json({ forecast: summary });

  } catch (err) {
    console.error("Ошибка в /api/weather:", err);
    return res.status(500).json({ error: err.message });
  }
}
