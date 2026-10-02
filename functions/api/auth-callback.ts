interface Env {
  // Cloudflare bindings
}

/**
 * POST /api/auth-callback (cnsh.life 백엔드)
 * 
 * login.knoblab.xyz에서 전달된 ticket을 수신하고, 중앙 인증 센터에 검증을 요청합니다.
 */
export const onRequestPost = async (context: { request: Request; env: Env }) => {
  try {
    const formData = await context.request.formData();
    const ticket = formData.get("ticket") as string | null;

    if (!ticket) {
      return new Response("인증 티켓(ticket)이 누락되었습니다.", {
        status: 400,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    // 1. Knoblab Auth 중앙 서버에 SSO 티켓 검증 요청
    const requestOrigin = new URL(context.request.url).origin;
    const originHeader = requestOrigin.includes("cnsh.life") ? requestOrigin : "https://cnsh.life";

    const verifyRes = await fetch("https://login.knoblab.xyz/api/verify-sso-ticket", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Origin": originHeader,
      },
      body: JSON.stringify({
        ticket,
        targetOrigin: "https://cnsh.life",
      }),
    });

    if (!verifyRes.ok) {
      return new Response("유효하지 않거나 이미 사용/만료된 인증 티켓입니다.", {
        status: 401,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    const { valid, uid, email } = (await verifyRes.json()) as {
      valid?: boolean;
      uid?: string;
      email?: string;
    };

    if (!valid || !uid) {
      return new Response("티켓 검증 실패", {
        status: 401,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    // 2. cnsh.life 자체 도메인 세션 쿠키 발급 (7일 유효: 604800초)
    const cookieOpts = "Path=/; Max-Age=604800; HttpOnly; Secure; SameSite=Lax";
    const headers = new Headers();
    headers.append("Set-Cookie", `session_uid=${encodeURIComponent(uid)}; ${cookieOpts}`);
    headers.append("Set-Cookie", `session_email=${encodeURIComponent(email || "")}; ${cookieOpts}`);
    // 구 버전 session_token 쿠키 파기
    headers.append(
      "Set-Cookie",
      "session_token=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Lax"
    );

    // 3. 서비스 메인 또는 원래 가려던 페이지로 302 리다이렉트
    headers.set("Location", "/");
    return new Response(null, { status: 302, headers });
  } catch (err: any) {
    return new Response(`오류 발생: ${err.message}`, {
      status: 500,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
};

export const onRequestGet = async () => {
  return new Response(null, {
    status: 302,
    headers: { Location: "/" },
  });
};
