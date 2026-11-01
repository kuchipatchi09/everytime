import { GONGJU_LAT, GONGJU_LON, OPENWEATHER_API_KEY } from "../constants/config";
import { WeatherResponse } from "../types/weather";

let cachedWeather: WeatherResponse | null = null;
let lastWeatherFetchTime = 0;
const WEATHER_CACHE_TTL = 10 * 60 * 1000; // 10분

export function getCachedWeather(): WeatherResponse | null {
  if (cachedWeather && Date.now() - lastWeatherFetchTime < WEATHER_CACHE_TTL) {
    return cachedWeather;
  }
  return cachedWeather; // 유효기간이 약간 지났더라도 스켈레톤 깜빡임 방지용으로 우선 반환
}

export async function fetchCurrentWeather(force = false): Promise<WeatherResponse> {
  const now = Date.now();
  if (!force && cachedWeather && now - lastWeatherFetchTime < WEATHER_CACHE_TTL) {
    return cachedWeather;
  }

  const url = `https://api.openweathermap.org/data/2.5/weather?lat=${GONGJU_LAT}&lon=${GONGJU_LON}&appid=${OPENWEATHER_API_KEY}&units=metric&lang=kr`;
  const res = await fetch(url);
  if (!res.ok) {
    if (cachedWeather) return cachedWeather;
    throw new Error(`OpenWeather API error: ${res.status}`);
  }

  const data: WeatherResponse = await res.json();
  cachedWeather = data;
  lastWeatherFetchTime = now;
  return data;
}
