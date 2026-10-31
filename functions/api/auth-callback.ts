// functions/api/auth-callback.ts
// cnsh.life (cnsh-eta) SSO Ticket Callback 및 세션 발급 핸들러

interface Env {
  SSO_TICKET_SECRET?: string;
  SESSION_SECRET?: string;
  AUTH_CENTER?: string;
}

// HMAC-SHA256 서명 검증 헬퍼 (Web Crypto API)
async function verifyHmacSha256(data: string, signature: string, secret?: string): Promise<boolean> {
  if (!secret) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );

  let rawSig: Uint8Array;
  if (/^[0-9a-f]{64}$/i.test(signature)) {
    rawSig = Uint8Array.from(signature.match(/../g)!.map((h) => parseInt(h, 16)));
  } else {
    const base64 = signature.replace(/-/g, "+").replace(/_/g, "/");
    const pad = base64.length % 4 ? "=".repeat(4 - (base64.length % 4)) : "";
    rawSig = Uint8Array.from(atob(base64 + pad), (c) => c.charCodeAt(0));
  }

  return await crypto.subtle.verify("HMAC", key, rawSig, enc.encode(data));
}

// HMAC-SHA256 서명 생성 헬퍼
async function createHmacSha256Hex(data: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sigBuf = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return Array.from(new Uint8Array(sigBuf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function parseBase64UrlJson(str: string): any {
  try {
    const base64 = str.replace(/-/g, "+").replace(/_/g, "/");
    const pad = base64.length % 4 ? "=".repeat(4 - (base64.length % 4)) : "";
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(base64 + pad), (c) => c.charCodeAt(0))));
  } catch {
    return null;
  }
}

export async function onRequestPost(context: { request: Request; env: Env }) {
  const { request, env } = context;
  let ticket: string | null = null;
  let returnTo: string | null = null;

  try {
    const formData = await request.formData();
    ticket = formData.get("ticket") as string | null;
    returnTo = formData.get("returnTo") as string | null;
  } catch {
    return new Response("잘못된 요청 형식입니다.", { status: 400 });
  }

  if (!ticket || typeof ticket !== "string") {
    return new Response("인증 티켓이 누락되었습니다.", { status: 400 });
  }

  const parts = ticket.split(".");
  if (parts.length !== 2) {
    return new Response("유효하지 않은 티켓 형식입니다.", { status: 401 });
  }
  const [body, sig] = parts;
  const payload = parseBase64UrlJson(body);

  if (!payload || typeof payload !== "object" || !payload.uid) {
    return new Response("유효하지 않은 티켓 페이로드입니다.", { status: 401 });
  }

  const authCenter = env.AUTH_CENTER || "https://login.knoblab.xyz";
  let verifiedUser: { uid: string; email: string; emailVerified: boolean } | null = null;

  // 1. Method A: 로컬 SSO_TICKET_SECRET 기반 서명 검증
  if (env.SSO_TICKET_SECRET) {
    const isValid = await verifyHmacSha256(body, sig, env.SSO_TICKET_SECRET);
    if (isValid) {
      const now = Date.now();
      if (payload.exp && payload.exp > now && payload.targetOrigin === "https://cnsh.life") {
        verifiedUser = {
          uid: String(payload.uid),
          email: String(payload.email || ""),
          emailVerified: payload.ev === true,
        };
      }
    }
  }

  // 2. Method B: 중앙 인증 서버(/api/verify-sso-ticket)를 통한 D1 Replay 방지 검증 폴백
  if (!verifiedUser) {
    try {
      const verifyRes = await fetch(`${authCenter}/api/verify-sso-ticket`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://cnsh.life",
        },
        body: JSON.stringify({
          ticket,
          targetOrigin: "https://cnsh.life",
        }),
      });

      if (verifyRes.ok) {
        const vData: any = await verifyRes.json();
        if (vData?.valid && vData?.uid) {
          verifiedUser = {
            uid: String(vData.uid),
            email: String(vData.email || ""),
            emailVerified: vData.emailVerified === true,
          };
        }
      }
    } catch (netErr) {
      console.error("[SSO Callback] Central verification failed:", netErr);
    }
  }

  if (!verifiedUser) {
    return new Response("위변조되었거나 만료된 티켓입니다.", { status: 401 });
  }

  // 3. 서명된 세션 쿠키 발급
  const cookieOpts = "Path=/; Max-Age=604800; HttpOnly; Secure; SameSite=Lax";
  const headers = new Headers();
  headers.append("Set-Cookie", `session_uid=${encodeURIComponent(verifiedUser.uid)}; ${cookieOpts}`);
  headers.append("Set-Cookie", `session_email=${encodeURIComponent(verifiedUser.email)}; ${cookieOpts}`);
  if (verifiedUser.emailVerified) {
    headers.append("Set-Cookie", `session_email_verified=true; ${cookieOpts}`);
  }

  const signSecret = env.SESSION_SECRET || env.SSO_TICKET_SECRET;
  if (signSecret) {
    const sigPayload = `cnsh-life-session-v1:${verifiedUser.uid}:${verifiedUser.email}:${verifiedUser.emailVerified ? "1" : "0"}`;
    const sigHex = await createHmacSha256Hex(sigPayload, signSecret);
    headers.append("Set-Cookie", `session_sig=${encodeURIComponent(sigHex)}; ${cookieOpts}`);
  }

  // 레거시 session_token 정리
  headers.append(
    "Set-Cookie",
    "session_token=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Lax"
  );

  // 4. 안전한 목적지 리다이렉트 (오픈 리다이렉트 방지)
  let safeDestination = "/";
  if (
    returnTo &&
    typeof returnTo === "string" &&
    returnTo.startsWith("/") &&
    !returnTo.startsWith("//") &&
    !returnTo.includes("\\")
  ) {
    safeDestination = returnTo;
  }

  headers.set("Location", safeDestination);
  return new Response(null, { status: 302, headers });
}

export async function onRequestGet() {
  return new Response(null, {
    status: 302,
    headers: { Location: "/" },
  });
}
