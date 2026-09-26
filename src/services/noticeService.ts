import { APP_SCRIPT_URL } from "../constants/config";
import { NoticeResponse, Post } from "../types/notice";

export async function fetchNotices(): Promise<Post[]> {
  try {
    const res = await fetch(`${APP_SCRIPT_URL}?action=getPosts`, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });

    if (!res.ok) throw new Error(`Notice fetch failed: ${res.status}`);
    const data = await res.json();

    if (Array.isArray(data)) {
      return data;
    }
    if (data && Array.isArray(data.posts)) {
      return data.posts;
    }
    return [];
  } catch (error) {
    console.error("fetchNotices error:", error);
    throw error;
  }
}

export async function createNotice(
  category: string,
  title: string,
  content: string,
  author = "관리자"
): Promise<boolean> {
  const payload = {
    action: "addPost",
    category,
    title,
    content,
    author,
  };

  try {
    // Google Apps Script는 text/plain POST를 보낼 때 CORS preflight(OPTIONS) 없이 원활히 수신합니다.
    const res = await fetch(APP_SCRIPT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      // POST 실패 시 GET 쿼리스트링 폴백 시도
      const params = new URLSearchParams(payload);
      const fallbackRes = await fetch(`${APP_SCRIPT_URL}?${params.toString()}`);
      if (!fallbackRes.ok) throw new Error(`Fallback failed: ${fallbackRes.status}`);
      const fallbackData = await fallbackRes.json();
      return Boolean(fallbackData.success);
    }

    const data: NoticeResponse = await res.json();
    return Boolean(data.success);
  } catch (error) {
    console.error("createNotice error:", error);
    // URLSearchParams fallback
    try {
      const params = new URLSearchParams(payload);
      const fallbackRes = await fetch(`${APP_SCRIPT_URL}?${params.toString()}`);
      const fallbackData = await fallbackRes.json();
      return Boolean(fallbackData.success);
    } catch (e) {
      console.error("createNotice fallback error:", e);
      return false;
    }
  }
}
