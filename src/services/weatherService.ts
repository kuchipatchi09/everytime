import { GONGJU_LAT, GONGJU_LON, OPENWEATHER_API_KEY } from "../constants/config";
import { WeatherResponse } from "../types/weather";

let cachedWeather: WeatherResponse | null = null;
let lastWeatherFetchTime = 0;
const WEATHER_CACHE_TTL = 10 * 60 * 1000; // 10분

const weatherListeners: Array<(weather: WeatherResponse) => void> = [];
let autoRefreshTimer: number | null = null;

export function onWeatherUpdate(callback: (weather: WeatherResponse) => void): () => void {
  weatherListeners.push(callback);
  if (cachedWeather) {
    callback(cachedWeather);
  }
  return () => {
    const idx = weatherListeners.indexOf(callback);
    if (idx !== -1) weatherListeners.splice(idx, 1);
  };
}

function notifyWeatherListeners(data: WeatherResponse): void {
  for (const listener of weatherListeners) {
    try {
      listener(data);
    } catch (err) {
      console.warn("날씨 리스너 콜백 에러:", err);
    }
  }
}

export function startWeatherAutoRefresh(): void {
  if (autoRefreshTimer !== null) return;
  autoRefreshTimer = window.setInterval(async () => {
    try {
      if (!document.hidden) {
        await fetchCurrentWeather(true);
      }
    } catch (e) {
      console.warn("자동 날씨 갱신 실패:", e);
    }
  }, WEATHER_CACHE_TTL);
}

export function stopWeatherAutoRefresh(): void {
  if (autoRefreshTimer !== null) {
    clearInterval(autoRefreshTimer);
    autoRefreshTimer = null;
  }
}

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
  notifyWeatherListeners(data);
  return data;
}
