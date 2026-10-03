interface Env {
  // Cloudflare bindings
}

/**
 * POST /api/auth-callback (cnsh.life 백엔드)
 * 
 * login.knoblab.xyz에서 전달된 ticket을 수신하여 중앙 인증 서버에서 검증하고 로컬 세션을 발급합니다.
 * (하드코딩 키 제거 및 중앙 /api/verify-sso-ticket을 통한 D1 Nonce 1회 원자적 소비 검증)
 */
export const onRequestPost = async (context: { request: Request; env: Env }) => {
  try {
    const formData = await context.request.formData();
    const ticket = formData.get("ticket") as string | null;

    if (!ticket || typeof ticket !== "string") {
      return new Response("인증 티켓(ticket)이 누락되었습니다.", {
        status: 400,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    // 1. 요청 Origin 판별 (로컬 환경 지원 및 운영 환경 https://cnsh.life 매칭)
    const requestUrl = new URL(context.request.url);
    const isLocal = requestUrl.hostname === "localhost" || requestUrl.hostname === "127.0.0.1";
    const targetOrigin = isLocal ? requestUrl.origin : "https://cnsh.life";

    // 2. 중앙 인증 서버(https://login.knoblab.xyz/api/verify-sso-ticket)로 티켓 검증 위임
    let verifiedUser: { valid: boolean; uid: string; email: string; emailVerified?: boolean } | null = null;
    try {
      const verifyRes = await fetch("https://login.knoblab.xyz/api/verify-sso-ticket", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Origin": targetOrigin,
        },
        body: JSON.stringify({
          ticket,
          targetOrigin,
        }),
      });

      if (verifyRes.ok) {
        const data = (await verifyRes.json()) as {
          valid?: boolean;
          uid?: string;
          email?: string;
          emailVerified?: boolean;
        };
        if (data?.valid && data?.uid) {
          verifiedUser = {
            valid: true,
            uid: data.uid,
            email: data.email || "",
            emailVerified: data.emailVerified === true,
          };
        }
      } else {
        console.warn("[SSO] 중앙 서버 검증 실패 HTTP 상태:", verifyRes.status);
      }
    } catch (fetchErr) {
      console.error("[SSO] 중앙 검증 네트워크 오류:", fetchErr);
    }

    if (!verifiedUser || !verifiedUser.uid) {
      return new Response("유효하지 않거나 이미 사용/만료된 인증 티켓입니다.", {
        status: 401,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    const { uid, email, emailVerified } = verifiedUser;

    // 3. cnsh.life 자체 도메인 세션 쿠키 발급 (7일 유효: 604800초)
    const cookieOpts = "Path=/; Max-Age=604800; HttpOnly; Secure; SameSite=Lax";
    const headers = new Headers();
    headers.append("Set-Cookie", `session_uid=${encodeURIComponent(uid)}; ${cookieOpts}`);
    headers.append("Set-Cookie", `session_email=${encodeURIComponent(email || "")}; ${cookieOpts}`);
    headers.append(
      "Set-Cookie",
      `session_email_verified=${emailVerified ? "true" : "false"}; ${cookieOpts}`
    );
    // 구 버전 session_token 쿠키 파기
    headers.append(
      "Set-Cookie",
      "session_token=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Lax"
    );

    // 4. 서비스 메인 또는 원래 가려던 페이지로 302 리다이렉트
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
