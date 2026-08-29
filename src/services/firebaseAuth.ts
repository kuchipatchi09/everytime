import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  User,
  Auth
} from "firebase/auth";

export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId?: string;
}

const STORAGE_KEY_FIREBASE_CONFIG = "custom_firebase_config";

// 기본 제공 또는 사용자 지정 Firebase 설정
export const DEFAULT_FIREBASE_CONFIG: FirebaseConfig = {
  apiKey: (import.meta as any).env?.VITE_FIREBASE_API_KEY || "",
  authDomain: (import.meta as any).env?.VITE_FIREBASE_AUTH_DOMAIN || "",
  projectId: (import.meta as any).env?.VITE_FIREBASE_PROJECT_ID || "",
  storageBucket: (import.meta as any).env?.VITE_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: (import.meta as any).env?.VITE_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: (import.meta as any).env?.VITE_FIREBASE_APP_ID || ""
};

export function getSavedFirebaseConfig(): FirebaseConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_FIREBASE_CONFIG);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.apiKey && parsed?.projectId) {
        return parsed;
      }
    }
  } catch (e) {
    console.warn("Failed to parse saved firebase config:", e);
  }
  return { ...DEFAULT_FIREBASE_CONFIG };
}

export function saveFirebaseConfig(cfg: FirebaseConfig): void {
  localStorage.setItem(STORAGE_KEY_FIREBASE_CONFIG, JSON.stringify(cfg));
}

let appInstance: FirebaseApp | null = null;
let authInstance: Auth | null = null;

export function getOrInitFirebaseAuth(): Auth | null {
  const config = getSavedFirebaseConfig();
  if (!config.apiKey || !config.projectId) {
    return null;
  }

  try {
    if (!appInstance) {
      if (getApps().length > 0) {
        appInstance = getApp();
      } else {
        appInstance = initializeApp(config);
      }
    }
    if (!authInstance && appInstance) {
      authInstance = getAuth(appInstance);
    }
    return authInstance;
  } catch (err) {
    console.error("Firebase init failed:", err);
    return null;
  }
}

export async function loginWithGoogle(): Promise<User> {
  const auth = getOrInitFirebaseAuth();
  if (!auth) {
    throw new Error("Firebase 설정(API Key, Project ID)이 필요합니다.");
  }
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  const result = await signInWithPopup(auth, provider);
  return result.user;
}

export async function logoutFirebase(): Promise<void> {
  const auth = getOrInitFirebaseAuth();
  if (auth) {
    await signOut(auth);
  }
}

export async function getFirebaseIdToken(): Promise<string> {
  const auth = getOrInitFirebaseAuth();
  if (!auth || !auth.currentUser) {
    throw new Error("로그인된 사용자가 없습니다.");
  }
  return await auth.currentUser.getIdToken(true);
}

export function onFirebaseAuthStateChange(callback: (user: User | null) => void): () => void {
  const auth = getOrInitFirebaseAuth();
  if (!auth) {
    callback(null);
    return () => {};
  }
  return onAuthStateChanged(auth, callback);
}
