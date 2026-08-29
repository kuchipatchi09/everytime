import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";
import { getAuth, Auth } from "firebase/auth";
import { checkAuth, getAuthUser } from "../utils/auth";
import { loginWithKnoblab } from "../utils/auth";

export const FIREBASE_CONFIG = {
  apiKey: (import.meta as any).env?.VITE_FIREBASE_API_KEY || "",
  authDomain: (import.meta as any).env?.VITE_FIREBASE_AUTH_DOMAIN || "knoblab.firebaseapp.com",
  projectId: (import.meta as any).env?.VITE_FIREBASE_PROJECT_ID || "knoblab",
  storageBucket: (import.meta as any).env?.VITE_FIREBASE_STORAGE_BUCKET || "knoblab.appspot.com",
  messagingSenderId: (import.meta as any).env?.VITE_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: (import.meta as any).env?.VITE_FIREBASE_APP_ID || ""
};

let appInstance: FirebaseApp | null = null;
let authInstance: Auth | null = null;

export function getOrInitFirebaseAuth(): Auth | null {
  if (!FIREBASE_CONFIG.apiKey || !FIREBASE_CONFIG.projectId) {
    return null;
  }

  try {
    if (!appInstance) {
      if (getApps().length > 0) {
        appInstance = getApp();
      } else {
        appInstance = initializeApp(FIREBASE_CONFIG);
      }
    }
    if (!authInstance && appInstance) {
      authInstance = getAuth(appInstance);
    }
    return authInstance;
  } catch (err) {
    console.warn("Firebase Auth init skipped or failed:", err);
    return null;
  }
}

/**
 * 항상 최신 Firebase ID Token을 가져옵니다.
 * 1. Firebase Auth 클라이언트의 currentUser가 있으면 getIdToken(true)로 자동 갱신
 * 2. 없으면 /api/me를 통해 최신 서버 세션 토큰 확인 및 갱신
 * 3. 모든 방법이 실패하면 SSO 재로그인 페이지로 자동 리다이렉트
 */
export async function getFreshIdToken(): Promise<string> {
  // 1. Firebase SDK를 통한 최신 토큰 획득 시도
  try {
    const auth = getOrInitFirebaseAuth();
    if (auth?.currentUser) {
      const freshToken = await auth.currentUser.getIdToken(true);
      if (freshToken) return freshToken;
    }
  } catch (err) {
    console.warn("Firebase getIdToken(true) error:", err);
  }

  // 2. 서버 세션(/api/me) 갱신 시도
  const updatedUser = await checkAuth();
  if (updatedUser?.token) {
    return updatedUser.token;
  }

  const cachedUser = getAuthUser();
  if (cachedUser?.token) {
    return cachedUser.token;
  }

  // 3. 모든 토큰 획득 실패 → SSO 재로그인으로 자동 리다이렉트
  console.warn("유효한 토큰을 찾을 수 없어 SSO 재로그인을 시도합니다.");
  loginWithKnoblab();
  throw new Error("인증 토큰이 만료되었습니다. 재로그인 페이지로 이동합니다...");
}
