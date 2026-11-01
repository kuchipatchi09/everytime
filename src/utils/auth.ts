export interface KnoblabUser {
  token?: string;
  uid: string;
  email: string;
  emailVerified?: boolean;
  displayName?: string | null;
  photoURL?: string | null;
  schoolGrade?: string | null;
  schoolClass?: string | null;
  agreedTerms?: boolean;
  agreedPrivacy?: boolean;
  agreedAt?: number | null;
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
 * chating-main 프로필(닉네임, 학년/반)을 함께 반환받아 클라이언트에 동기화합니다.
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
          emailVerified: data.emailVerified === true,
          displayName: data.displayName || null,
          photoURL: data.photoURL || null,
          schoolGrade: data.schoolGrade ? String(data.schoolGrade) : null,
          schoolClass: data.schoolClass ? String(data.schoolClass) : null,
          agreedTerms: data.agreedTerms === true,
          agreedPrivacy: data.agreedPrivacy === true,
          agreedAt: data.agreedAt ? Number(data.agreedAt) : null,
        };
        // 백엔드 동의 상태가 있으면 로컬 스토리지도 함께 동기화
        if (currentUser.agreedTerms && currentUser.agreedPrivacy) {
          try {
            localStorage.setItem("asterisk_agreed_terms", "true");
            localStorage.setItem("asterisk_agreed_privacy", "true");
            if (currentUser.agreedAt) {
              localStorage.setItem("asterisk_agreed_at", String(currentUser.agreedAt));
            }
          } catch (_) {}
        }
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
 * 서버(/api/profile)에 프로필(닉네임, 학년, 반) 변경을 요청하고 chating-main과 양방향 동기화합니다.
 */
export async function updateUserProfileOnServer(params: {
  displayName?: string;
  photoURL?: string;
  schoolGrade?: string | null;
  schoolClass?: string | null;
  agreedTerms?: boolean;
  agreedPrivacy?: boolean;
  agreedAt?: number | null;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch("/api/profile", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(params),
    });

    const data: any = await res.json().catch(() => ({}));

    if (!res.ok || !data?.success) {
      return { success: false, error: data?.error || `프로필 동기화 실패 (${res.status})` };
    }

    if (currentUser) {
      currentUser = {
        ...currentUser,
        ...(params.displayName !== undefined ? { displayName: params.displayName } : {}),
        ...(params.photoURL !== undefined ? { photoURL: params.photoURL } : {}),
        ...(params.schoolGrade !== undefined ? { schoolGrade: params.schoolGrade } : {}),
        ...(params.schoolClass !== undefined ? { schoolClass: params.schoolClass } : {}),
        ...(params.agreedTerms !== undefined ? { agreedTerms: params.agreedTerms } : {}),
        ...(params.agreedPrivacy !== undefined ? { agreedPrivacy: params.agreedPrivacy } : {}),
        ...(params.agreedAt !== undefined ? { agreedAt: params.agreedAt } : {}),
      };
      notifyAuthChange(currentUser);
    }

    return { success: true };
  } catch (err: any) {
    console.error("updateUserProfileOnServer error:", err);
    return { success: false, error: err.message || "네트워크 오류가 발생했습니다." };
  }
}

/**
 * 서비스 이용약관 및 개인정보 처리방침에 모두 동의했는지 확인합니다.
 */
export function hasAgreedTerms(): boolean {
  if (currentUser) {
    if (currentUser.agreedTerms === true && currentUser.agreedPrivacy === true) return true;
  }
  try {
    const terms = localStorage.getItem("asterisk_agreed_terms") === "true";
    const privacy = localStorage.getItem("asterisk_agreed_privacy") === "true";
    return terms && privacy;
  } catch {
    return false;
  }
}

/**
 * 이용약관 및 개인정보 처리방침 동의 상태를 저장하고 백엔드에 동기화합니다.
 */
export async function setTermsAgreement(agreedTerms: boolean, agreedPrivacy: boolean): Promise<void> {
  const agreedAt = (agreedTerms && agreedPrivacy) ? Date.now() : null;
  try {
    localStorage.setItem("asterisk_agreed_terms", String(agreedTerms));
    localStorage.setItem("asterisk_agreed_privacy", String(agreedPrivacy));
    if (agreedAt) {
      localStorage.setItem("asterisk_agreed_at", String(agreedAt));
    } else {
      localStorage.removeItem("asterisk_agreed_at");
    }
  } catch (_) {}

  if (currentUser) {
    currentUser.agreedTerms = agreedTerms;
    currentUser.agreedPrivacy = agreedPrivacy;
    currentUser.agreedAt = agreedAt;
    notifyAuthChange(currentUser);
    await updateUserProfileOnServer({
      agreedTerms,
      agreedPrivacy,
      agreedAt,
    });
  }
}

/**
 * Knoblab 통합 로그인 페이지(https://login.knoblab.xyz/)로 이동하여 로그인을 요청합니다.
 * cnsh.life 등 크로스 도메인 서비스의 경우 POST를 수신하는 /api/auth-callback 엔드포인트로 redirect를 설정합니다.
 * @param callbackUrl 인증 완료 후 POST 데이터를 수신할 서버 엔드포인트 URL (기본값: 현재 오리진 + "/api/auth-callback")
 * @param serviceName 로그인 페이지에 표시할 서비스명 (기본값: "CNSH")
 */
export function loginWithKnoblab(callbackUrl?: string, serviceName: string = "CNSH"): void {
  const origin = window.location.origin;
  const currentPath = window.location.pathname + window.location.search;
  const targetCallback = callbackUrl || (currentPath && currentPath !== "/" ? `${origin}${currentPath}` : `${origin}/api/auth-callback`);
  const loginEndpoint = `https://login.knoblab.xyz/?redirect=${encodeURIComponent(targetCallback)}&service=${encodeURIComponent(serviceName)}`;
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
