const DAILY_FOCUS_STORAGE_KEY = "asterisk_daily_focus_seconds";
const CUSTOM_MINUTES_KEY = "asterisk_custom_timer_minutes";

export function getTodayKey(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function getTodayFocusSeconds(): number {
  try {
    const raw = localStorage.getItem(DAILY_FOCUS_STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      const today = getTodayKey();
      if (data?.date === today && typeof data.seconds === "number") {
        return data.seconds;
      }
    }
  } catch (e) {
    console.error("Failed to load daily focus time:", e);
  }
  return 0;
}

export function addFocusSeconds(sec: number): void {
  if (sec <= 0) return;
  const current = getTodayFocusSeconds();
  const updated = current + sec;
  try {
    localStorage.setItem(
      DAILY_FOCUS_STORAGE_KEY,
      JSON.stringify({
        date: getTodayKey(),
        seconds: updated,
      })
    );
  } catch (e) {
    console.error("Failed to save daily focus time:", e);
  }
}

export function resetTodayFocusTime(): void {
  localStorage.removeItem(DAILY_FOCUS_STORAGE_KEY);
}

export function getSavedCustomMinutes(): number {
  const val = localStorage.getItem(CUSTOM_MINUTES_KEY);
  if (val) {
    const num = parseInt(val, 10);
    if (!isNaN(num) && num > 0 && num <= 300) {
      return num;
    }
  }
  return 45;
}

export function setSavedCustomMinutes(min: number): void {
  localStorage.setItem(CUSTOM_MINUTES_KEY, String(min));
}

export function formatTimeFormatted(totalSec: number): string {
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;

  if (hours > 0) {
    return `${hours}시간 ${minutes}분`;
  }
  if (minutes > 0) {
    return `${minutes}분 ${seconds}초`;
  }
  return `${seconds}초`;
}
