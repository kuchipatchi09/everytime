import { APP_SCRIPT_URL } from "../constants/config";
import { NoticeResponse, Post } from "../types/notice";

export async function fetchNotices(): Promise<Post[]> {
  const res = await fetch(`${APP_SCRIPT_URL}?action=getPosts`);
  if (!res.ok) throw new Error(`Notice fetch failed: ${res.status}`);
  const data: NoticeResponse = await res.json();
  return data.posts || [];
}

export async function createNotice(
  category: string,
  title: string,
  content: string
): Promise<boolean> {
  const body = new URLSearchParams({
    action: "addPost",
    category,
    title,
    content,
  });

  const res = await fetch(APP_SCRIPT_URL, {
    method: "POST",
    body,
  });

  if (!res.ok) throw new Error(`Notice creation failed: ${res.status}`);
  const data = await res.json();
  return Boolean(data.success);
}
