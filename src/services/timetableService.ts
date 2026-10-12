import { DEFAULT_TIMETABLE } from "../constants/timetable";
import { ClassNumber, GradeNumber, SchoolTimetable, WeeklyTimetable } from "../types/timetable";

const STORAGE_KEY_TIMETABLE = "comcigan_timetable_cache_v1";
const STORAGE_KEY_TIMESTAMP = "comcigan_timetable_time_v1";
const CLIENT_CACHE_TTL_MS = 5 * 60 * 1000; // 5분 클라이언트 캐시

let memoryTimetable: SchoolTimetable | null = null;
let lastFetchTime: number = 0;
let isLiveSynced: boolean = false;

export interface TimetableResult {
  timetable: SchoolTimetable;
  isLive: boolean;
  updatedAt?: string;
  isFallback: boolean;
}

/**
 * 로컬 스토리지에 캐시된 시간표 로드
 */
function getStoredTimetable(): { timetable: SchoolTimetable; time: number } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_TIMETABLE);
    const timeStr = localStorage.getItem(STORAGE_KEY_TIMESTAMP);
    if (raw && timeStr) {
      const parsed = JSON.parse(raw);
      const time = Number(timeStr);
      if (parsed && typeof parsed === "object") {
        return { timetable: parsed, time };
      }
    }
  } catch {
    // Ignore storage parse error
  }
  return null;
}

/**
 * 실시간 시간표 저장
 */
function saveStoredTimetable(timetable: SchoolTimetable, time: number): void {
  try {
    localStorage.setItem(STORAGE_KEY_TIMETABLE, JSON.stringify(timetable));
    localStorage.setItem(STORAGE_KEY_TIMESTAMP, String(time));
  } catch {
    // Ignore storage quota error
  }
}

/**
 * 전교 실시간 시간표를 조회합니다.
 * 컴시간 서버 -> 클라우드 캐시 -> 로컬스토리지 캐시 -> DEFAULT_TIMETABLE 순으로 폴백됩니다.
 */
export async function fetchSchoolTimetable(forceRefresh = false): Promise<TimetableResult> {
  const now = Date.now();

  // 1. 메모리 캐시 유효 시 즉시 반환
  if (!forceRefresh && memoryTimetable && now - lastFetchTime < CLIENT_CACHE_TTL_MS) {
    return {
      timetable: memoryTimetable,
      isLive: isLiveSynced,
      updatedAt: new Date(lastFetchTime).toISOString(),
      isFallback: false,
    };
  }

  // 2. 로컬 스토리지 캐시 확인 (강제 새로고침이 아닌 경우)
  if (!forceRefresh && !memoryTimetable) {
    const stored = getStoredTimetable();
    if (stored && now - stored.time < CLIENT_CACHE_TTL_MS) {
      memoryTimetable = stored.timetable;
      lastFetchTime = stored.time;
      isLiveSynced = true;
      return {
        timetable: stored.timetable,
        isLive: true,
        updatedAt: new Date(stored.time).toISOString(),
        isFallback: false,
      };
    }
  }

  // 3. API 요청 (/api/timetable)
  try {
    const res = await fetch("/api/timetable", {
      cache: forceRefresh ? "no-store" : "default",
    });

    if (res.ok) {
      const data = await res.json();
      if (data && data.success && data.timetable) {
        memoryTimetable = data.timetable as SchoolTimetable;
        lastFetchTime = now;
        isLiveSynced = true;
        saveStoredTimetable(memoryTimetable, now);

        return {
          timetable: memoryTimetable,
          isLive: true,
          updatedAt: data.updatedAt || new Date(now).toISOString(),
          isFallback: Boolean(data.fallback),
        };
      }
    }
  } catch (err) {
    console.warn("컴시간 실시간 시간표 조회 실패, 로컬 캐시/기본 시간표로 대체합니다:", err);
  }

  // 4. 네트워크 실패 시 로컬 스토리지의 지난 캐시 사용
  const stored = getStoredTimetable();
  if (stored) {
    memoryTimetable = stored.timetable;
    lastFetchTime = stored.time;
    return {
      timetable: stored.timetable,
      isLive: false,
      updatedAt: new Date(stored.time).toISOString(),
      isFallback: true,
    };
  }

  // 5. 최후의 수단: DEFAULT_TIMETABLE 폴백
  memoryTimetable = DEFAULT_TIMETABLE;
  return {
    timetable: DEFAULT_TIMETABLE,
    isLive: false,
    isFallback: true,
  };
}

/**
 * 특정 학년/반의 주간 시간표 반환 (동기적 폴백 지원)
 */
export function getClassTimetableSync(g: GradeNumber, c: ClassNumber): WeeklyTimetable {
  if (memoryTimetable && memoryTimetable[g] && memoryTimetable[g][c]) {
    return memoryTimetable[g][c];
  }
  const stored = getStoredTimetable();
  if (stored && stored.timetable[g] && stored.timetable[g][c]) {
    return stored.timetable[g][c];
  }
  return DEFAULT_TIMETABLE[g][c];
}
