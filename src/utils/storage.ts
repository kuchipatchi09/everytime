import { ClassConfig } from "../types/timetable";

const CLASS_STORAGE_KEY = "class";
const NAME_STORAGE_KEY = "chunggwa-name";

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
