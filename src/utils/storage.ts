import { ClassConfig } from "../types/timetable";
import { TickerConfigItem } from "../types/market";

const CLASS_STORAGE_KEY = "class";
const STUDENT_NUM_STORAGE_KEY = "student_num";
const NAME_STORAGE_KEY = "chunggwa-name";
const FINANCE_TICKERS_STORAGE_KEY = "custom_finance_tickers";
const TERMS_STORAGE_KEY = "asterisk_agreed_terms";
const PRIVACY_STORAGE_KEY = "asterisk_agreed_privacy";
const AGREED_AT_STORAGE_KEY = "asterisk_agreed_at";

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

const SKY_BG_STORAGE_KEY = "asterisk_sky_bg_enabled";
const SKY_PERF_STORAGE_KEY = "asterisk_sky_perf_enabled";

export function getSavedSkyBg(): boolean {
  const val = localStorage.getItem(SKY_BG_STORAGE_KEY);
  return val !== null ? val === "true" : true; // 기본값: 활성화
}

export function setSavedSkyBg(enabled: boolean): void {
  localStorage.setItem(SKY_BG_STORAGE_KEY, String(enabled));
}

export function getSavedSkyPerf(): boolean {
  return localStorage.getItem(SKY_PERF_STORAGE_KEY) === "true";
}

export function setSavedSkyPerf(enabled: boolean): void {
  localStorage.setItem(SKY_PERF_STORAGE_KEY, String(enabled));
}

const SKY_TIME_OFFSET_STORAGE_KEY = "asterisk_sky_time_offset";
const SKY_CLOUDS_STORAGE_KEY = "asterisk_sky_clouds";

export function getSavedSkyClouds(): boolean {
  const val = localStorage.getItem(SKY_CLOUDS_STORAGE_KEY);
  return val !== null ? val === "true" : true; // 기본값: 활성화
}

export function setSavedSkyClouds(enabled: boolean): void {
  localStorage.setItem(SKY_CLOUDS_STORAGE_KEY, String(enabled));
}

export function getSavedSkyTimeOffset(): number {
  const val = localStorage.getItem(SKY_TIME_OFFSET_STORAGE_KEY);
  return val !== null ? Number(val) : 0; // 기본값 0 (현재 실시간)
}

export function setSavedSkyTimeOffset(offset: number): void {
  localStorage.setItem(SKY_TIME_OFFSET_STORAGE_KEY, String(offset));
}

export function getSavedStudentNum(): number | null {
  try {
    const raw = localStorage.getItem(STUDENT_NUM_STORAGE_KEY);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

export function setSavedStudentNum(num: number | null): void {
  try {
    if (num && Number.isFinite(num) && num > 0) {
      localStorage.setItem(STUDENT_NUM_STORAGE_KEY, String(num));
    } else {
      localStorage.removeItem(STUDENT_NUM_STORAGE_KEY);
    }
  } catch {
    // Ignore storage errors
  }
}

export function hasAgreedTerms(): boolean {
  try {
    const terms = localStorage.getItem(TERMS_STORAGE_KEY) === "true";
    const privacy = localStorage.getItem(PRIVACY_STORAGE_KEY) === "true";
    return terms && privacy;
  } catch {
    return false;
  }
}

export function getAgreedAt(): number | null {
  try {
    const saved = localStorage.getItem(AGREED_AT_STORAGE_KEY);
    if (!saved) return null;
    const n = Number(saved);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

export function setTermsAgreement(agreedTerms: boolean, agreedPrivacy: boolean): void {
  const agreedAt = agreedTerms && agreedPrivacy ? Date.now() : null;
  try {
    localStorage.setItem(TERMS_STORAGE_KEY, String(agreedTerms));
    localStorage.setItem(PRIVACY_STORAGE_KEY, String(agreedPrivacy));
    if (agreedAt) {
      localStorage.setItem(AGREED_AT_STORAGE_KEY, String(agreedAt));
    } else {
      localStorage.removeItem(AGREED_AT_STORAGE_KEY);
    }
  } catch {
    // Ignore storage errors
  }
}


