interface Env {
  // Cloudflare bindings
}

function parseCookies(cookieStr: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!cookieStr) return cookies;
  for (const pair of cookieStr.split(";")) {
    const [key, ...rest] = pair.trim().split("=");
    if (key) cookies[key.trim()] = rest.join("=");
  }
  return cookies;
}

/**
 * JWT 페이로드를 파싱하여 exp 등 클레임을 확인합니다.
 * 서명 검증 없이 페이로드만 디코딩합니다.
 */
function parseJwtPayload(token: string): Record<string, any> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const pad = base64.length % 4;
    const padded = pad ? base64 + "=".repeat(4 - pad) : base64;
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

export const onRequestGet = async (context: { request: Request; env: Env }) => {
  const cookies = parseCookies(context.request.headers.get("Cookie") || "");
  const token = cookies["session_token"];
  const uid = cookies["session_uid"];
  const email = cookies["session_email"];

  if (!uid && !token) {
    return new Response(JSON.stringify({ authenticated: false }), {
      status: 401,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    });
  }

  // Firebase ID Token 만료 여부 확인
  const decodedToken = decodeURIComponent(token || "");
  const jwtPayload = parseJwtPayload(decodedToken);
  const now = Math.floor(Date.now() / 1000);

  if (jwtPayload?.exp && jwtPayload.exp < now) {
    // 토큰이 만료됨 → 클라이언트에 재인증 필요 신호 전달
    return new Response(
      JSON.stringify({
        authenticated: false,
        tokenExpired: true,
        uid: decodeURIComponent(uid || ""),
        email: decodeURIComponent(email || ""),
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      }
    );
  }

  return new Response(
    JSON.stringify({
      authenticated: true,
      token: decodedToken,
      uid: decodeURIComponent(uid || ""),
      email: decodeURIComponent(email || ""),
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    }
  );
};
