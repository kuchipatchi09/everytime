import { TickerConfigItem } from "../types/market";
import { DayOfWeek } from "../types/timetable";

export const APP_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbxanKwIuGMmw15-sipt57hB8A8B5f73CNEhwAgau5Aweg_Hhw1OBkF7WwDMGlvP3RQXrA/exec";

export const OPENWEATHER_API_KEY = "3e6298fcd99d3906fcfa480b13bee36c";

export const NEIS_API_KEY = "eb38b586f6af486b9fa46bf786d629d3";
export const NEIS_OFFICE_CODE = "N10";
export const NEIS_SCHOOL_CODE = "8140071";

export const GONGJU_LAT = 36.446;
export const GONGJU_LON = 127.119;

export const DAYS: DayOfWeek[] = ["월", "화", "수", "목", "금"];

export const TICKER_ITEMS: TickerConfigItem[] = [
  { name: "코스피", symbol: "KOSPI", code: "KOSPI", unit: "pt" },
  { name: "코스닥", symbol: "KOSDAQ", code: "KOSDAQ", unit: "pt" },
  { name: "나스닥", symbol: "NASDAQ", code: "NAS@IXIC", unit: "pt" },
  { name: "S&P 500", symbol: "S&P500", code: "SP500", unit: "pt" },
  { name: "원/달러", symbol: "USD/KRW", code: "FX_USDKRW", unit: "원" }
];
