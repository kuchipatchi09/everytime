// functions/api/me.ts
// cnsh.life (cnsh-eta) 세션 정보 조회 및 서명 무결성 검증

interface Env {
  SESSION_SECRET?: string;
  SSO_TICKET_SECRET?: string;
}

function parseCookies(cookieStr: string): Record<string, string> {
  const cookies = Object.create(null);
  if (!cookieStr) return cookies;
  for (const pair of cookieStr.split(";")) {
    const trimmed = pair.trim();
    if (!trimmed) continue;
    const [rawKey, ...rest] = trimmed.split("=");
    const key = rawKey?.trim();
    if (key && key !== "__proto__" && key !== "constructor" && key !== "prototype") {
      cookies[key] = rest.join("=");
    }
  }
  return cookies;
}

async function verifyHmacSha256Hex(data: string, signatureHex: string, secret: string): Promise<boolean> {
  try {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      enc.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );
    if (!/^[0-9a-f]{64}$/i.test(signatureHex)) return false;
    const sigBuf = Uint8Array.from(signatureHex.match(/../g)!.map((h) => parseInt(h, 16)));
    return await crypto.subtle.verify("HMAC", key, sigBuf, enc.encode(data));
  } catch {
    return false;
  }
}

export const onRequestGet = async (context: { request: Request; env: Env }) => {
  const cookies = parseCookies(context.request.headers.get("Cookie") || "");
  const rawUid = cookies["session_uid"];
  const rawEmail = cookies["session_email"];
  const emailVerified = cookies["session_email_verified"] === "true";
  const rawSig = cookies["session_sig"];
  const token = cookies["session_token"];

  if (!rawUid) {
    return new Response(JSON.stringify({ authenticated: false }), {
      status: 401,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    });
  }

  let uid = "";
  let email = "";
  let sig = "";
  try {
    uid = decodeURIComponent(rawUid);
    email = decodeURIComponent(rawEmail || "");
    sig = rawSig ? decodeURIComponent(rawSig) : "";
  } catch {
    return new Response(JSON.stringify({ authenticated: false, error: "Malformed cookie" }), {
      status: 400,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    });
  }

  // 서명 검증 (시크릿이 환경변수에 설정된 경우 위조 세션 쿠키 원천 차단)
  const signSecret = context.env.SESSION_SECRET || context.env.SSO_TICKET_SECRET;
  if (signSecret) {
    if (!sig) {
      return new Response(JSON.stringify({ authenticated: false, error: "Unsigned session cookie" }), {
        status: 401,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      });
    }

    const expectedData = `cnsh-life-session-v1:${uid}:${email}:${emailVerified ? "1" : "0"}`;
    const isValid = await verifyHmacSha256Hex(expectedData, sig, signSecret);
    if (!isValid) {
      return new Response(JSON.stringify({ authenticated: false, error: "Tampered session cookie" }), {
        status: 401,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      });
    }
  }

  return new Response(
    JSON.stringify({
      authenticated: true,
      uid,
      email,
      emailVerified,
      token: token ? decodeURIComponent(token) : "",
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
