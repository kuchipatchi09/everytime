export interface KnoblabUser {
  token: string;
  uid: string;
  email: string;
}

type AuthChangeCallback = (user: KnoblabUser | null) => void;
const authListeners: Set<AuthChangeCallback> = new Set();

/**
 * 쿠키 문자열에서 특정 쿠키 값을 가져옵니다.
 */
function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(^|;\\s*)(${name})=([^;]*)`));
  return match ? decodeURIComponent(match[3]) : null;
}

/**
 * 쿠키를 삭제합니다 (현재 도메인 및 .knoblab.xyz 도메인 대상).
 */
function deleteCookie(name: string): void {
  const isKnoblab = window.location.hostname.endsWith("knoblab.xyz");
  const domainAttr = isKnoblab ? "; domain=.knoblab.xyz" : "";
  const expireBase = `path=/; max-age=0; Secure; SameSite=Lax${domainAttr}`;

  document.cookie = `${name}=; ${expireBase}`;
  // 혹시 현재 호스트로 직접 지정된 쿠키도 함께 삭제
  document.cookie = `${name}=; path=/; max-age=0; SameSite=Lax`;
}

/**
 * 현재 로그인된 Knoblab 사용자 정보를 쿠키에서 파싱하여 반환합니다.
 */
export function getAuthUser(): KnoblabUser | null {
  const token = getCookie("knoblab_token");
  const uid = getCookie("knoblab_uid");
  const email = getCookie("knoblab_email");

  if (uid || token) {
    return {
      token: token || "",
      uid: uid || "",
      email: email || "",
    };
  }

  return null;
}

/**
 * Knoblab 통합 로그인 페이지(https://login.knoblab.xyz/)로 이동하여 로그인을 요청합니다.
 * @param redirectUrl 인증 완료 후 돌아올 URL (기본값: 현재 페이지 URL)
 * @param serviceName 로그인 페이지 제목에 표시할 서비스명 (기본값: "asterisk")
 */
export function loginWithKnoblab(redirectUrl?: string, serviceName: string = "asterisk"): void {
  const targetUrl = redirectUrl || window.location.href;
  const loginEndpoint = `https://login.knoblab.xyz/?service=${encodeURIComponent(serviceName)}&redirect=${encodeURIComponent(targetUrl)}`;
  window.location.href = loginEndpoint;
}

/**
 * 로그아웃을 수행하고 쿠키를 삭제한 후 등록된 리스너에 알립니다.
 */
export function logout(): void {
  deleteCookie("knoblab_token");
  deleteCookie("knoblab_uid");
  deleteCookie("knoblab_email");
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
