interface Env {
  SESSION_SECRET?: string;
}

const DEFAULT_SHARED_SECRET = "knoblab_shared_sso_secret_2026_default_prod";

/**
 * SSO Ticket을 외부 HTTP 호출 없이 암호학적(HMAC-SHA256)으로 즉시 검증합니다.
 * Cloudflare Bot Fight Mode / WAF Challenge 차단을 완벽히 우회하고 0ms로 검증합니다.
 */
async function verifySsoTicketLocally(ticket: string, secret?: string) {
  try {
    const parts = ticket.split(".");
    if (parts.length !== 2) return null;
    const [payloadB64, sigHex] = parts;
    if (!payloadB64 || !sigHex || sigHex.length % 2 !== 0) return null;

    const effectiveSecret = secret || DEFAULT_SHARED_SECRET;
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      enc.encode(effectiveSecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );

    const sigBytes = new Uint8Array(
      sigHex.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) || []
    );

    const isValid = await crypto.subtle.verify("HMAC", key, sigBytes, enc.encode(payloadB64));
    if (!isValid) {
      console.warn("[SSO Local Verification] HMAC signature mismatch");
      return null;
    }

    const jsonStr = decodeURIComponent(escape(atob(payloadB64)));
    const payload = JSON.parse(jsonStr);

    if (!payload.exp || Date.now() > payload.exp) {
      console.warn("[SSO Local Verification] Ticket expired");
      return null;
    }
    if (!payload.uid) return null;

    return {
      valid: true,
      uid: payload.uid,
      email: payload.email || "",
    };
  } catch (e) {
    console.error("[SSO Local Verification Error]", e);
    return null;
  }
}

/**
 * POST /api/auth-callback (cnsh.life 백엔드)
 * 
 * login.knoblab.xyz에서 전달된 ticket을 수신하여 검증하고 로컬 세션을 발급합니다.
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

    // 1. 로컬 HMAC-SHA256 암호학적 직접 검증 (Cloudflare WAF / Bot 차단 회피 및 초고속 검증)
    let verifiedUser = await verifySsoTicketLocally(ticket, context.env?.SESSION_SECRET);

    // 2. 로컬 검증 실패 시 중앙 서버 API 호출 시도 (Fallback)
    if (!verifiedUser) {
      const requestOrigin = new URL(context.request.url).origin;
      const originHeader = requestOrigin.includes("cnsh.life") ? requestOrigin : "https://cnsh.life";

      try {
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

        if (verifyRes.ok) {
          const data = (await verifyRes.json()) as { valid?: boolean; uid?: string; email?: string };
          if (data.valid && data.uid) {
            verifiedUser = { valid: true, uid: data.uid, email: data.email || "" };
          }
        } else {
          console.warn("[SSO Central API Fallback Status]", verifyRes.status);
        }
      } catch (fetchErr) {
        console.warn("[SSO Central API Fallback Error]", fetchErr);
      }
    }

    if (!verifiedUser || !verifiedUser.uid) {
      return new Response("유효하지 않거나 이미 사용/만료된 인증 티켓입니다.", {
        status: 401,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    const { uid, email } = verifiedUser;

    // 3. cnsh.life 자체 도메인 세션 쿠키 발급 (7일 유효: 604800초)
    const cookieOpts = "Path=/; Max-Age=604800; HttpOnly; Secure; SameSite=Lax";
    const headers = new Headers();
    headers.append("Set-Cookie", `session_uid=${encodeURIComponent(uid)}; ${cookieOpts}`);
    headers.append("Set-Cookie", `session_email=${encodeURIComponent(email || "")}; ${cookieOpts}`);
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
