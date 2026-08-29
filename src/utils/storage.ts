import { ClassConfig } from "../types/timetable";
import { TickerConfigItem } from "../types/market";

const CLASS_STORAGE_KEY = "class";
const NAME_STORAGE_KEY = "chunggwa-name";
const FINANCE_TICKERS_STORAGE_KEY = "custom_finance_tickers";

export const DEFAULT_FINANCE_TICKERS: TickerConfigItem[] = [
  { name: "코스피", symbol: "KOSPI", code: "KOSPI", unit: "pt" },
  { name: "나스닥", symbol: "NASDAQ", code: "NAS@IXIC", unit: "pt" },
  { name: "원/달러 환율", symbol: "USD/KRW", code: "FX_USDKRW", unit: "원" }
];

export function getSavedClass(): ClassConfig {
  try {
    const raw = localStorage.getItem(CLASS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.g && parsed?.c) {
        return { g: String(parsed.g) as any, c: String(parsed.c) as any };
      }
    }
  } catch (e) {
    console.error("Failed to load saved class:", e);
  }
  return { g: "1", c: "1" };
}

export function setSavedClass(cfg: ClassConfig): void {
  localStorage.setItem(CLASS_STORAGE_KEY, JSON.stringify(cfg));
}

export function getSavedName(): string | null {
  return localStorage.getItem(NAME_STORAGE_KEY);
}

export function setSavedName(name: string): void {
  localStorage.setItem(NAME_STORAGE_KEY, name.trim());
}

export function getSavedTickers(): TickerConfigItem[] {
  try {
    const raw = localStorage.getItem(FINANCE_TICKERS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.slice(0, 3);
      }
    }
  } catch (e) {
    console.error("Failed to load saved tickers:", e);
  }
  return [...DEFAULT_FINANCE_TICKERS];
}

export function setSavedTickers(tickers: TickerConfigItem[]): void {
  const validList = tickers.slice(0, 3);
  localStorage.setItem(FINANCE_TICKERS_STORAGE_KEY, JSON.stringify(validList));
}

export function resetSavedTickers(): void {
  localStorage.setItem(FINANCE_TICKERS_STORAGE_KEY, JSON.stringify(DEFAULT_FINANCE_TICKERS));
}
