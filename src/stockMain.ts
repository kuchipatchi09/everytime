import "./styles/stock.css";
import {
  getFirebaseIdToken,
  getOrInitFirebaseAuth,
  getSavedFirebaseConfig,
  loginWithGoogle,
  logoutFirebase,
  onFirebaseAuthStateChange,
  saveFirebaseConfig,
} from "./services/firebaseAuth";
import {
  fetchMyStock,
  getApiBaseUrl,
  setApiBaseUrl,
  submitStudentStock,
} from "./services/studentStockApi";
import { StudentStockSubmission } from "./types/studentStock";
import { User } from "firebase/auth";

let currentUser: User | null = null;
let toastTimeout: number | null = null;

function showToast(message: string, duration = 3000): void {
  const toast = document.getElementById("toast");
  if (!toast) return;
  if (toastTimeout) clearTimeout(toastTimeout);

  toast.textContent = message;
  toast.classList.remove("hidden");

  toastTimeout = window.setTimeout(() => {
    toast.classList.add("hidden");
    toastTimeout = null;
  }, duration);
}

function updateAuthUI(user: User | null): void {
  currentUser = user;
  const authContainer = document.getElementById("auth-container");
  const loginBanner = document.getElementById("login-banner");
  const formInputs = document.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>(
    "#stock-form input, #stock-form select, #stock-form button[type='submit']"
  );

  if (user) {
    // 로그인 상태
    if (authContainer) {
      authContainer.innerHTML = `
        <div class="user-profile-badge">
          ${
            user.photoURL
              ? `<img src="${user.photoURL}" alt="" class="user-avatar" referrerpolicy="no-referrer" />`
              : ""
          }
          <span class="user-name-text" title="${user.email || user.displayName || ""}">${
            user.displayName || user.email || "사용자"
          }</span>
          <button type="button" class="btn-logout" id="btn-logout">로그아웃</button>
        </div>
      `;
      document.getElementById("btn-logout")?.addEventListener("click", handleLogout);
    }
    if (loginBanner) loginBanner.classList.add("hidden");

    formInputs.forEach((el) => {
      el.disabled = false;
    });

    // 로그인 완료 시 자동으로 GET /my-stock 호출
    loadMyStockData();
  } else {
    // 미로그인 상태
    if (authContainer) {
      authContainer.innerHTML = `
        <button type="button" class="btn-google-login" id="btn-header-login">
          <svg width="14" height="14" viewBox="0 0 48 48">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
          </svg>
          <span>Google 로그인</span>
        </button>
      `;
      document.getElementById("btn-header-login")?.addEventListener("click", handleGoogleLogin);
    }
    if (loginBanner) loginBanner.classList.remove("hidden");

    formInputs.forEach((el) => {
      el.disabled = true;
    });

    const statusPanel = document.getElementById("status-panel");
    if (statusPanel) statusPanel.classList.add("hidden");
  }
}

async function handleGoogleLogin(): Promise<void> {
  try {
    const auth = getOrInitFirebaseAuth();
    if (!auth) {
      openConfigModal();
      showToast("Firebase 설정을 먼저 입력해주세요.");
      return;
    }
    const user = await loginWithGoogle();
    showToast(`${user.displayName || user.email || "사용자"}님 환영합니다!`);
  } catch (err: any) {
    console.error("로그인 실패:", err);
    if (err.code === "auth/popup-closed-by-user") {
      return;
    }
    if (err.message && err.message.includes("Firebase 설정")) {
      openConfigModal();
    }
    showToast(`로그인 실패: ${err.message || "오류가 발생했습니다."}`);
  }
}

async function handleLogout(): Promise<void> {
  try {
    await logoutFirebase();
    showToast("로그아웃되었습니다.");
  } catch (err: any) {
    console.error("로그아웃 실패:", err);
    showToast(`로그아웃 실패: ${err.message}`);
  }
}

async function loadMyStockData(): Promise<void> {
  if (!currentUser) return;

  try {
    const idToken = await getFirebaseIdToken();
    const data = await fetchMyStock(idToken);

    if (data) {
      const gradeSelect = document.getElementById("input-grade") as HTMLSelectElement;
      const classInput = document.getElementById("input-class") as HTMLInputElement;
      const studentNumInput = document.getElementById("input-student-num") as HTMLInputElement;
      const ticker1Input = document.getElementById("input-ticker-1") as HTMLInputElement;
      const ticker2Input = document.getElementById("input-ticker-2") as HTMLInputElement;
      const ticker3Input = document.getElementById("input-ticker-3") as HTMLInputElement;
      const statusPanel = document.getElementById("status-panel");
      const statusTime = document.getElementById("status-saved-time");

      if (gradeSelect && data.grade) gradeSelect.value = String(data.grade);
      if (classInput && data.class_num) classInput.value = String(data.class_num);
      if (studentNumInput && data.student_num) studentNumInput.value = String(data.student_num);
      if (ticker1Input && data.ticker_1) ticker1Input.value = data.ticker_1.toUpperCase();
      if (ticker2Input && data.ticker_2) ticker2Input.value = data.ticker_2.toUpperCase();
      if (ticker3Input && data.ticker_3) ticker3Input.value = data.ticker_3.toUpperCase();

      if (statusPanel) statusPanel.classList.remove("hidden");
      if (statusTime) {
        statusTime.textContent = data.updated_at
          ? `최근 저장: ${new Date(data.updated_at).toLocaleString("ko-KR")}`
          : "기존 데이터 불러옴";
      }

      showToast("기존에 저장된 주식 티커 데이터를 불러왔습니다.");
    }
  } catch (err: any) {
    console.warn("기존 데이터 조회 실패:", err);
  }
}

function initTickerInputs(): void {
  const tickerInputs = [
    document.getElementById("input-ticker-1") as HTMLInputElement,
    document.getElementById("input-ticker-2") as HTMLInputElement,
    document.getElementById("input-ticker-3") as HTMLInputElement,
  ];

  // 3. 입력 시 자동으로 영문 대문자 변환
  tickerInputs.forEach((input) => {
    if (!input) return;
    input.addEventListener("input", () => {
      const start = input.selectionStart;
      const end = input.selectionEnd;
      input.value = input.value.toUpperCase().replace(/\s+/g, "");
      if (start !== null && end !== null) {
        input.setSelectionRange(start, end);
      }
    });
  });

  // 추천 칩 클릭 시 빈 슬롯에 자동 채우기
  document.querySelectorAll<HTMLButtonElement>(".chip-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const ticker = btn.dataset.ticker;
      if (!ticker) return;

      const emptyInput = tickerInputs.find((i) => i && !i.value.trim());
      if (emptyInput) {
        emptyInput.value = ticker;
      } else if (tickerInputs[0]) {
        tickerInputs[0].value = ticker;
      }
    });
  });
}

function initFormSubmit(): void {
  const form = document.getElementById("stock-form") as HTMLFormElement;
  const submitBtn = document.getElementById("btn-submit") as HTMLButtonElement;

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (!currentUser) {
      showToast("먼저 Google 계정으로 로그인해주세요.");
      return;
    }

    const gradeVal = Number((document.getElementById("input-grade") as HTMLSelectElement).value);
    const classVal = Number((document.getElementById("input-class") as HTMLInputElement).value);
    const studentNumVal = Number((document.getElementById("input-student-num") as HTMLInputElement).value);
    const ticker1Val = (document.getElementById("input-ticker-1") as HTMLInputElement).value.trim().toUpperCase();
    const ticker2Val = (document.getElementById("input-ticker-2") as HTMLInputElement).value.trim().toUpperCase();
    const ticker3Val = (document.getElementById("input-ticker-3") as HTMLInputElement).value.trim().toUpperCase();

    // 빈칸 검사
    if (!gradeVal || !classVal || !studentNumVal || !ticker1Val || !ticker2Val || !ticker3Val) {
      showToast("모든 항목(학년, 반, 번호, 티커 3개)을 빠짐없이 입력해주세요.");
      return;
    }

    const payload: StudentStockSubmission = {
      grade: gradeVal,
      class_num: classVal,
      student_num: studentNumVal,
      ticker_1: ticker1Val,
      ticker_2: ticker2Val,
      ticker_3: ticker3Val,
    };

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "저장 중...";
    }

    try {
      const idToken = await getFirebaseIdToken();
      await submitStudentStock(idToken, payload);

      showToast("주식 티커 및 학생 정보가 성공적으로 저장되었습니다!");

      const statusPanel = document.getElementById("status-panel");
      const statusTime = document.getElementById("status-saved-time");
      if (statusPanel) statusPanel.classList.remove("hidden");
      if (statusTime) {
        statusTime.textContent = `최근 저장: ${new Date().toLocaleTimeString("ko-KR")}`;
      }
    } catch (err: any) {
      console.error("저장 실패:", err);
      showToast(`저장에 실패했습니다: ${err.message || "네트워크 오류"}`);
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "저장하기 (POST /submit)";
      }
    }
  });
}

function openConfigModal(): void {
  const modal = document.getElementById("config-modal");
  const urlInput = document.getElementById("config-api-base-url") as HTMLInputElement;
  const apiKeyInput = document.getElementById("config-fb-api-key") as HTMLInputElement;
  const authDomainInput = document.getElementById("config-fb-auth-domain") as HTMLInputElement;
  const projectIdInput = document.getElementById("config-fb-project-id") as HTMLInputElement;

  const currentConfig = getSavedFirebaseConfig();
  if (urlInput) urlInput.value = getApiBaseUrl();
  if (apiKeyInput) apiKeyInput.value = currentConfig.apiKey;
  if (authDomainInput) authDomainInput.value = currentConfig.authDomain;
  if (projectIdInput) projectIdInput.value = currentConfig.projectId;

  modal?.classList.remove("hidden");
}

function closeConfigModal(): void {
  document.getElementById("config-modal")?.classList.add("hidden");
}

function initConfigModal(): void {
  const openBtn = document.getElementById("btn-open-config");
  const closeBtn = document.getElementById("btn-close-config");
  const cancelBtn = document.getElementById("btn-config-cancel");
  const saveBtn = document.getElementById("btn-config-save");
  const modal = document.getElementById("config-modal");

  openBtn?.addEventListener("click", openConfigModal);
  closeBtn?.addEventListener("click", closeConfigModal);
  cancelBtn?.addEventListener("click", closeConfigModal);
  modal?.addEventListener("click", (e) => {
    if (e.target === modal) closeConfigModal();
  });

  saveBtn?.addEventListener("click", () => {
    const url = (document.getElementById("config-api-base-url") as HTMLInputElement).value;
    const apiKey = (document.getElementById("config-fb-api-key") as HTMLInputElement).value;
    const authDomain = (document.getElementById("config-fb-auth-domain") as HTMLInputElement).value;
    const projectId = (document.getElementById("config-fb-project-id") as HTMLInputElement).value;

    if (url) setApiBaseUrl(url);
    saveFirebaseConfig({ apiKey, authDomain, projectId });

    closeConfigModal();
    showToast("환경 설정이 저장되었습니다. 페이지를 새로고침합니다.");
    setTimeout(() => window.location.reload(), 800);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  initTickerInputs();
  initFormSubmit();
  initConfigModal();

  document.getElementById("btn-banner-login")?.addEventListener("click", handleGoogleLogin);

  // Firebase Auth 상태 구독
  onFirebaseAuthStateChange((user) => {
    updateAuthUI(user);
  });
});
