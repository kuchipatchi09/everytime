export interface KnoblabUser {
  token?: string;
  uid: string;
  email: string;
}

type AuthChangeCallback = (user: KnoblabUser | null) => void;
const authListeners: Set<AuthChangeCallback> = new Set();

let currentUser: KnoblabUser | null = null;
let isInitialCheckDone = false;
let checkAuthPromise: Promise<KnoblabUser | null> | null = null;

/**
 * 현재 캐시된 Knoblab 사용자 정보를 반환합니다.
 */
export function getAuthUser(): KnoblabUser | null {
  return currentUser;
}

/**
 * 서버(/api/me)를 호출하여 현재 로그인 상태를 확인하고 캐시를 갱신합니다.
 */
export async function checkAuth(): Promise<KnoblabUser | null> {
  if (checkAuthPromise) return checkAuthPromise;

  checkAuthPromise = (async () => {
    try {
      const res = await fetch("/api/me", {
        credentials: "include",
      });

      if (!res.ok) {
        currentUser = null;
        if (isInitialCheckDone) notifyAuthChange(null);
        isInitialCheckDone = true;
        return null;
      }

      const data = await res.json();
      if (data?.authenticated && data?.uid) {
        currentUser = {
          token: data.token || "",
          uid: data.uid,
          email: data.email || "",
        };
      } else {
        currentUser = null;
      }
      notifyAuthChange(currentUser);
      isInitialCheckDone = true;
      return currentUser;
    } catch (err) {
      console.error("인증 상태 확인 실패:", err);
      currentUser = null;
      notifyAuthChange(null);
      isInitialCheckDone = true;
      return null;
    } finally {
      checkAuthPromise = null;
    }
  })();

  return checkAuthPromise;
}

/**
 * Knoblab 통합 로그인 페이지(https://login.knoblab.xyz/)로 이동하여 로그인을 요청합니다.
 * cnsh.life 등 크로스 도메인 서비스의 경우 POST를 수신하는 /api/auth-callback 엔드포인트로 redirect를 설정합니다.
 * @param callbackUrl 인증 완료 후 POST 데이터를 수신할 서버 엔드포인트 URL (기본값: 현재 오리진 + "/api/auth-callback")
 * @param serviceName 로그인 페이지에 표시할 서비스명 (기본값: "asterisk")
 */
export function loginWithKnoblab(callbackUrl?: string, serviceName: string = "asterisk"): void {
  const origin = window.location.origin;
  const targetCallback = callbackUrl || `${origin}/api/auth-callback`;
  const loginEndpoint = `https://login.knoblab.xyz/?service=${encodeURIComponent(serviceName)}&redirect=${encodeURIComponent(targetCallback)}`;
  window.location.href = loginEndpoint;
}

/**
 * 로그아웃을 수행합니다.
 * 1. 자체 도메인의 세션 쿠키 삭제 (/api/logout)
 * 2. Knoblab SSO 세션 쿠키 삭제 (https://login.knoblab.xyz/api/clear-session)
 */
export async function logout(): Promise<void> {
  try {
    await fetch("/api/logout", {
      method: "POST",
      credentials: "include",
    });
  } catch (e) {
    console.error("Local session clear failed:", e);
  }

  try {
    await fetch("https://login.knoblab.xyz/api/clear-session", {
      method: "POST",
      credentials: "include",
      mode: "no-cors",
    });
  } catch (e) {
    console.error("SSO clear-session failed:", e);
  }

  currentUser = null;
  notifyAuthChange(null);
}

/**
 * 인증 상태 변경을 감지하는 이벤트 리스너를 등록합니다.
 */
export function onAuthStateChange(callback: AuthChangeCallback): () => void {
  authListeners.add(callback);
  return () => {
    authListeners.delete(callback);
  };
}

/**
 * 인증 상태 변경을 모든 리스너에게 통지합니다.
 */
export function notifyAuthChange(user: KnoblabUser | null): void {
  authListeners.forEach((listener) => {
    try {
      listener(user);
    } catch (e) {
      console.error("Error in auth listener:", e);
    }
  });
}
