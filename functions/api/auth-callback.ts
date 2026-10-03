// HMAC-SHA256 서명 검증 헬퍼 (무설치, Cloudflare Workers 내장)
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

  // login.knoblab.xyz에서 생성하는 64자리 Hex 서명 및 Base64URL 서명 규격 모두 호환 지원
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

function parseBase64UrlJson(str: string): any {
  const base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const pad = base64.length % 4 ? "=".repeat(4 - (base64.length % 4)) : "";
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(base64 + pad), (c) => c.charCodeAt(0))));
}

export async function onRequestPost(context: { request: Request; env: { SSO_TICKET_SECRET?: string } }) {
  const { request, env } = context;
  const formData = await request.formData();
  const ticket = formData.get("ticket");
  if (!ticket || typeof ticket !== "string") {
    return new Response("인증 티켓이 누락되었습니다.", { status: 400 });
  }
  const parts = ticket.split(".");
  if (parts.length !== 2) {
    return new Response("유효하지 않은 티켓 형식입니다.", { status: 401 });
  }
  const [body, sig] = parts;
  // 1. 서명 검증
  const isValid = await verifyHmacSha256(body, sig, env.SSO_TICKET_SECRET);
  if (!isValid) {
    return new Response("위변조된 티켓입니다.", { status: 401 });
  }
  // 2. 만료 및 대상 도메인 확인
  const payload = parseBase64UrlJson(body);
  if (!payload.exp || payload.exp < Date.now()) {
    return new Response("만료된 티켓입니다.", { status: 401 });
  }
  if (payload.targetOrigin !== "https://cnsh.life") {
    return new Response("대상 도메인 불일치", { status: 403 });
  }
  // 3. cnsh.life 로컬 세션 쿠키 발급
  const cookieOpts = "Path=/; Max-Age=604800; HttpOnly; Secure; SameSite=Lax";
  const headers = new Headers();
  headers.append("Set-Cookie", `session_uid=${encodeURIComponent(payload.uid)}; ${cookieOpts}`);
  headers.append("Set-Cookie", `session_email=${encodeURIComponent(payload.email || "")}; ${cookieOpts}`);
  if (payload.ev) {
    headers.append("Set-Cookie", `session_email_verified=true; ${cookieOpts}`);
  }
  headers.append(
    "Set-Cookie",
    "session_token=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Lax"
  );
  headers.set("Location", "/");
  return new Response(null, { status: 302, headers });
}

export async function onRequestGet() {
  return new Response(null, {
    status: 302,
    headers: { Location: "/" },
  });
}
