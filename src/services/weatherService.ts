import { GONGJU_LAT, GONGJU_LON, OPENWEATHER_API_KEY } from "../constants/config";
import { WeatherResponse } from "../types/weather";

export async function fetchCurrentWeather(): Promise<WeatherResponse> {
  const url = `https://api.openweathermap.org/data/2.5/weather?lat=${GONGJU_LAT}&lon=${GONGJU_LON}&appid=${OPENWEATHER_API_KEY}&units=metric&lang=kr&_=${Date.now()}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`OpenWeather API error: ${res.status}`);
  }
  return res.json();
}
