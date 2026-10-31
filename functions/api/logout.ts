// functions/api/logout.ts
// cnsh.life (cnsh-eta) 세션 쿠키 일괄 파기 핸들러

interface Env {
  // Cloudflare bindings
}

const clearSession = () => {
  const clearOpts = "Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Lax";
  const headers = new Headers({
    "Content-Type": "application/json",
    "Cache-Control": "no-store, no-cache, must-revalidate",
  });
  headers.append("Set-Cookie", `session_token=; ${clearOpts}`);
  headers.append("Set-Cookie", `session_uid=; ${clearOpts}`);
  headers.append("Set-Cookie", `session_email=; ${clearOpts}`);
  headers.append("Set-Cookie", `session_email_verified=; ${clearOpts}`);
  headers.append("Set-Cookie", `session_sig=; ${clearOpts}`);

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers,
  });
};

export const onRequestPost = async () => {
  return clearSession();
};

export const onRequestGet = async () => {
  return clearSession();
};
