import { MyStockResponse, StudentStockSubmission } from "../types/studentStock";
import { getFreshIdToken } from "./firebaseAuth";

const STORAGE_KEY_API_BASE_URL = "student_stock_api_base_url";
export const DEFAULT_API_BASE_URL = "https://student-stock-api.wodnjs.workers.dev";

export function getApiBaseUrl(): string {
  const saved = localStorage.getItem(STORAGE_KEY_API_BASE_URL);
  if (saved && saved.trim()) {
    return saved.trim().replace(/\/+$/, "");
  }
  return DEFAULT_API_BASE_URL;
}

export function setApiBaseUrl(url: string): void {
  localStorage.setItem(STORAGE_KEY_API_BASE_URL, url.trim().replace(/\/+$/, ""));
}

/**
 * 기존 저장된 내 주식 티커 및 학생 정보 조회 (GET /my-stock)
 * 항상 최신 Firebase ID Token을 가져와 헤더에 포함합니다.
 */
export async function fetchMyStock(explicitToken?: string): Promise<MyStockResponse | null> {
  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}/my-stock`;

  const token = explicitToken || (await getFreshIdToken());

  let res = await fetch(url, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    }
  });

  if (res.status === 401) {
    throw new Error("AUTH_EXPIRED: 인증 세션이 만료되었습니다.");
  }

  if (res.status === 404) {
    // 아직 제출한 적이 없는 경우
    return null;
  }

  if (!res.ok) {
    const errorText = await res.text().catch(() => "");
    throw new Error(`데이터 조회 실패 (${res.status}): ${errorText || res.statusText}`);
  }

  const data = await res.json();
  return data;
}

/**
 * 학생 정보 및 주식 티커 3개 저장 및 수정 (POST /submit)
 * 항상 최신 Firebase ID Token을 가져와 헤더에 포함합니다.
 */
export async function submitStudentStock(
  data: StudentStockSubmission,
  explicitToken?: string
): Promise<{ success: boolean; message?: string }> {
  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}/submit`;

  const token = explicitToken || (await getFreshIdToken());

  let res = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(data)
  });

  if (res.status === 401) {
    throw new Error("AUTH_EXPIRED: 인증 세션이 만료되었습니다.");
  }

  if (!res.ok) {
    const errorText = await res.text().catch(() => "");
    throw new Error(`저장 실패 (${res.status}): ${errorText || res.statusText}`);
  }

  const result = await res.json().catch(() => ({ success: true }));
  return result;
}

