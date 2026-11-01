// functions/api/_profileSync.ts
// cnsh.life <-> cnsh.space 프로필 동기화 보안 헬퍼

export interface Env {
  SESSION_SECRET?: string;
  SSO_TICKET_SECRET?: string;
  CHATING_API_BASE?: string;
}

export interface VerifiedSessionUser {
  uid: string;
  email: string;
  emailVerified: boolean;
  token?: string;
}

export interface ChatingProfile {
  uid?: string;
  displayName: string | null;
  photoURL: string | null;
  schoolGrade: string | null;
  schoolClass: string | null;
  updatedAt?: number;
}

export function parseCookies(cookieStr: string): Record<string, string> {
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

export async function verifyHmacSha256Hex(data: string, signatureHex: string, secret: string): Promise<boolean> {
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

export async function createHmacSha256Hex(data: string, secret: string): Promise<string> {
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

export async function verifySession(request: Request, env: Env): Promise<VerifiedSessionUser | null> {
  const cookies = parseCookies(request.headers.get("Cookie") || "");
  const rawUid = cookies["session_uid"];
  const rawEmail = cookies["session_email"];
  const emailVerified = cookies["session_email_verified"] === "true";
  const rawSig = cookies["session_sig"];
  const token = cookies["session_token"];

  if (!rawUid) return null;

  let uid = "";
  let email = "";
  let sig = "";
  try {
    uid = decodeURIComponent(rawUid);
    email = decodeURIComponent(rawEmail || "");
    sig = rawSig ? decodeURIComponent(rawSig) : "";
  } catch {
    return null;
  }

  const signSecret = env.SESSION_SECRET || env.SSO_TICKET_SECRET;
  if (signSecret) {
    if (!sig) return null;
    const expectedData = `cnsh-life-session-v1:${uid}:${email}:${emailVerified ? "1" : "0"}`;
    const isValid = await verifyHmacSha256Hex(expectedData, sig, signSecret);
    if (!isValid) return null;
  }

  return {
    uid,
    email,
    emailVerified,
    token: token ? decodeURIComponent(token) : undefined,
  };
}

export async function createSsoAssertion(user: VerifiedSessionUser, secret: string): Promise<string> {
  const now = Date.now();
  const payload = {
    v: 1,
    iss: "cnsh.life",
    aud: "cnsh.space",
    uid: user.uid,
    email: user.email,
    ev: user.emailVerified,
    iat: now,
    exp: now + 60000,
  };

  const jsonStr = JSON.stringify(payload);
  const base64 = btoa(unescape(encodeURIComponent(jsonStr)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const sigHex = await createHmacSha256Hex(base64, secret);
  return `${base64}.${sigHex}`;
}

export function getChatingApiBase(env: Env): string {
  const base = env.CHATING_API_BASE || "https://cnsh.space/api";
  return base.replace(/\/+$/, "");
}

export async function fetchChatingProfile(user: VerifiedSessionUser, env: Env): Promise<ChatingProfile | null> {
  const secret = env.SSO_TICKET_SECRET || env.SESSION_SECRET;
  const baseUrl = getChatingApiBase(env);
  const targetUrl = `${baseUrl}/users/profile?uid=${encodeURIComponent(user.uid)}`;

  const headers: Record<string, string> = {
    Accept: "application/json",
  };

  if (secret) {
    const assertion = await createSsoAssertion(user, secret);
    headers["X-Knoblab-Sso-Assertion"] = assertion;
    headers["Authorization"] = `Bearer assertion:${assertion}`;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3500);

  try {
    const res = await fetch(targetUrl, {
      method: "GET",
      headers,
      signal: controller.signal,
    });

    if (!res.ok) {
      return null;
    }

    const data: any = await res.json();
    return {
      uid: data.uid || user.uid,
      displayName: typeof data.displayName === "string" ? data.displayName : null,
      photoURL: typeof data.photoURL === "string" ? data.photoURL : null,
      schoolGrade: data.schoolGrade ? String(data.schoolGrade) : null,
      schoolClass: data.schoolClass ? String(data.schoolClass) : null,
      updatedAt: typeof data.updatedAt === "number" ? data.updatedAt : undefined,
    };
  } catch (err) {
    console.warn("[ProfileSync] fetchChatingProfile failed:", err);
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function updateChatingProfile(
  user: VerifiedSessionUser,
  profile: { displayName?: string; photoURL?: string; schoolGrade?: string | null; schoolClass?: string | null },
  env: Env
): Promise<{ success: boolean; profile?: ChatingProfile; error?: string }> {
  const secret = env.SSO_TICKET_SECRET || env.SESSION_SECRET;
  if (!secret) {
    return { success: false, error: "서버 SSO 시크릿이 설정되지 않았습니다." };
  }

  const baseUrl = getChatingApiBase(env);
  const targetUrl = `${baseUrl}/users/profile`;

  const assertion = await createSsoAssertion(user, secret);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
    "X-Knoblab-Sso-Assertion": assertion,
    Authorization: `Bearer assertion:${assertion}`,
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4000);

  try {
    const res = await fetch(targetUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        uid: user.uid,
        displayName: profile.displayName,
        photoURL: profile.photoURL,
        schoolGrade: profile.schoolGrade,
        schoolClass: profile.schoolClass,
        email: user.email,
        updatedAt: Date.now(),
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errJson: any = await res.json().catch(() => ({}));
      return { success: false, error: errJson.error || `서버 응답 오류 (${res.status})` };
    }

    const data: any = await res.json();
    return {
      success: true,
      profile: data.profile || {
        uid: user.uid,
        displayName: profile.displayName || null,
        photoURL: profile.photoURL || null,
        schoolGrade: profile.schoolGrade || null,
        schoolClass: profile.schoolClass || null,
      },
    };
  } catch (err: any) {
    console.error("[ProfileSync] updateChatingProfile network error:", err);
    return { success: false, error: err.message || "네트워크 오류가 발생했습니다." };
  } finally {
    clearTimeout(timeoutId);
  }
}
