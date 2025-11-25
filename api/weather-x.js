// pages/api/weather-x.js
// Этот файл ловит ВСЁ, что приходит на /api/weather-x, /api/weather-x/123, /api/weather-x/{{random}} и т.д.

export const config = {
  api: {
    externalResolver: true,
  },
};

// Просто перенаправляем на твой рабочий weather.js
import handler from "./weather.js";

export default handler;
