import "./styles/styles.css";

import { $, showToast } from "./utils/dom";
import { esc } from "./utils/escape";
import {
  getSavedClass,
  getSavedName,
  getSavedTickers,
  setSavedClass,
  setSavedName,
  setSavedTickers,
} from "./utils/storage";
import { checkAuth, getAuthUser, loginWithKnoblab, logout, onAuthStateChange } from "./utils/auth";
import { TickerConfigItem } from "./types/market";
import { renderDashboard } from "./views/dashboardView";
import { renderTimetable } from "./views/timetableView";
import { renderAfterschool } from "./views/afterschoolView";
import { renderMeals, setMealCode } from "./views/mealView";
import { renderBoard, renderNoticeDetail } from "./views/noticeView";
import { renderBrand } from "./views/brandView";
import { renderTimer } from "./views/timerView";
import { ClassNumber, GradeNumber } from "./types/timetable";
import { MealCode } from "./types/meal";

export type TabName = "메인" | "시간표" | "방과후" | "급식" | "공지" | "타이머" | "브랜드";

let currentTab: TabName = "메인";

export function switchTab(tab: TabName, updateUrl = true): void {
  currentTab = tab;
  const pageTitle = $("#page-title");
  const titleContainer = document.querySelector<HTMLElement>(".title");
  const pickerEl = document.querySelector<HTMLElement>(".picker");
  
  if (tab === "메인") {
    const savedName = getSavedName() || "학생";
    pageTitle.innerHTML = `
      <span class="welcome-name-wrap">${esc(savedName)}님, 오늘도 반가워요.</span>
      <button type="button" class="title-name-edit-btn" id="title-name-edit-btn" aria-label="이름 변경" title="이름 변경">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
        </svg>
      </button>
    `;
    $("#title-name-edit-btn")?.addEventListener("click", () => openNameChangeModal());
  } else if (tab === "브랜드") {
    pageTitle.textContent = "브랜드 스토리";
  } else if (tab === "타이머") {
    pageTitle.textContent = "자습 타이머";
  } else {
    pageTitle.textContent = tab;
  }

  // 브랜드 탭일 때와 일반 탭일 때의 상단 타이틀 및 피커 표시 제어
  if (titleContainer) {
    titleContainer.style.display = tab === "브랜드" ? "none" : "flex";
  }
  if (pickerEl) {
    pickerEl.style.display = (tab === "브랜드" || tab === "공지" || tab === "타이머") ? "none" : "flex";
  }

  // 데스크탑 네비게이션 및 모바일 드로어 탭 활성화 상태 동기화
  document.querySelectorAll<HTMLButtonElement>("[data-tab]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tab);
  });

  if (updateUrl) {
    if (tab === "브랜드") {
      history.pushState(null, "", "#brand");
    } else if (tab === "타이머") {
      history.pushState(null, "", "#timer");
    } else if (tab === "메인") {
      history.pushState(null, "", window.location.pathname);
    } else {
      history.pushState(null, "", `#${encodeURIComponent(tab)}`);
    }
  }

  renderActiveView();
}

export function renderActiveView(): void {
  if (currentTab === "메인") {
    renderDashboard(
      (t) => switchTab(t as TabName),
      (idx) => renderNoticeDetail(idx)
    );
  } else if (currentTab === "시간표") {
    renderTimetable();
  } else if (currentTab === "방과후") {
    renderAfterschool();
  } else if (currentTab === "급식") {
    renderMeals();
  } else if (currentTab === "공지") {
    renderBoard();
  } else if (currentTab === "타이머") {
    renderTimer();
  } else if (currentTab === "브랜드") {
    renderBrand(() => switchTab("메인"));
  }
}

function initClassPicker(): void {
  const gradeSelect = $<HTMLSelectElement>("#grade");
  const classSelect = $<HTMLSelectElement>("#class");
  const saved = getSavedClass();

  gradeSelect.value = saved.g;
  classSelect.value = saved.c;

  const handleClassChange = () => {
    setSavedClass({
      g: gradeSelect.value as GradeNumber,
      c: classSelect.value as ClassNumber,
    });
    renderActiveView();
  };

  gradeSelect.addEventListener("change", handleClassChange);
  classSelect.addEventListener("change", handleClassChange);
}

function initWelcomeModal(): void {
  const welcomeModal = $("#welcome");
  const nameInput = $<HTMLInputElement>("#name-input");
  const guestForm = $("#welcome-guest-form");
  const knoblabBtn = $("#welcome-btn-knoblab");

  const authUser = getAuthUser();
  const savedName = getSavedName();

  if (!savedName) {
    if (authUser?.email) {
      const emailPrefix = authUser.email.split("@")[0];
      nameInput.value = emailPrefix;
      setSavedName(emailPrefix);
    } else {
      welcomeModal.classList.remove("hidden");
      setTimeout(() => nameInput.focus(), 0);
    }
  }

  // Knoblab SSO 통합 로그인 버튼
  knoblabBtn?.addEventListener("click", () => {
    loginWithKnoblab();
  });

  // 게스트 모드 닉네임 입력 폼 제출
  guestForm?.addEventListener("submit", (e) => {
    e.preventDefault();
    const value = nameInput.value.trim();
    if (!value) return;
    setSavedName(value);
    welcomeModal.classList.add("hidden");
    showToast(`${value}님, 환영합니다! (게스트 모드)`);
    updateAuthUI();
    switchTab("메인");
  });
}

export function openNameChangeModal(): void {
  const modal = $("#name-modal");
  const input = $<HTMLInputElement>("#edit-name-input");
  const current = getSavedName() || "";
  input.value = current;
  modal.classList.remove("hidden");
  setTimeout(() => {
    input.focus();
    input.select();
  }, 50);
}

export function closeNameChangeModal(): void {
  const modal = $("#name-modal");
  modal.classList.add("hidden");
}

function initNameChangeModal(): void {
  const modal = $("#name-modal");
  const form = $<HTMLFormElement>("#name-change-form");
  const closeBtn = $("#name-modal-close");
  const cancelBtn = $("#name-modal-cancel");
  const input = $<HTMLInputElement>("#edit-name-input");

  closeBtn?.addEventListener("click", closeNameChangeModal);
  cancelBtn?.addEventListener("click", closeNameChangeModal);
  modal?.addEventListener("click", (e) => {
    if (e.target === modal) closeNameChangeModal();
  });

  form?.addEventListener("submit", (e) => {
    e.preventDefault();
    const newName = input.value.trim();
    if (!newName) return;
    setSavedName(newName);
    closeNameChangeModal();
    showToast(`이름이 '${newName}'(으)로 변경되었습니다.`);
    updateAuthUI();
    if (currentTab === "메인") {
      switchTab("메인", false);
    }
  });
}

import {
  fetchMyStock,
  submitStudentStock,
} from "./services/studentStockApi";
import { StudentStockSubmission } from "./types/studentStock";

export function openProfileModal(): void {
  const modal = $("#profile-modal");
  const user = getAuthUser();
  const savedName = getSavedName() || "학생";

  const displayNameEl = $("#profile-display-name");
  const displayEmailEl = $("#profile-display-email");
  const displayUidEl = $("#profile-display-uid");
  const logoutBtn = $("#profile-btn-logout");

  if (displayNameEl) displayNameEl.textContent = savedName;
  if (displayEmailEl) displayEmailEl.textContent = user?.email || "게스트 모드 (미연동)";
  if (displayUidEl) displayUidEl.textContent = user?.uid || "Local Guest";

  if (logoutBtn) {
    if (user) {
      logoutBtn.textContent = "로그아웃";
      logoutBtn.className = "btn-danger";
    } else {
      logoutBtn.textContent = "Knoblab 로그인";
      logoutBtn.className = "btn-submit";
    }
  }

  loadProfileStockData();

  modal.classList.remove("hidden");
}

export function closeProfileModal(): void {
  const modal = $("#profile-modal");
  modal.classList.add("hidden");
}

async function loadProfileStockData(): Promise<void> {
  const user = getAuthUser();
  const statusBadge = $("#profile-stock-status-badge");
  const gradeSelect = $<HTMLSelectElement>("#profile-stock-grade");
  const classInput = $<HTMLInputElement>("#profile-stock-class");
  const numInput = $<HTMLInputElement>("#profile-stock-num");
  const ticker1Input = $<HTMLInputElement>("#profile-stock-ticker-1");
  const ticker2Input = $<HTMLInputElement>("#profile-stock-ticker-2");
  const ticker3Input = $<HTMLInputElement>("#profile-stock-ticker-3");

  const localClass = getSavedClass();
  if (gradeSelect) gradeSelect.value = localClass.g;
  if (classInput && !classInput.value) classInput.value = localClass.c;

  const localTickers = getSavedTickers();
  if (ticker1Input && !ticker1Input.value && localTickers[0]) ticker1Input.value = localTickers[0].symbol;
  if (ticker2Input && !ticker2Input.value && localTickers[1]) ticker2Input.value = localTickers[1].symbol;
  if (ticker3Input && !ticker3Input.value && localTickers[2]) ticker3Input.value = localTickers[2].symbol;

  if (!user) {
    if (statusBadge) {
      statusBadge.textContent = "게스트 모드 (로컬 설정)";
      statusBadge.className = "profile-stock-status-badge";
    }
    return;
  }

  if (statusBadge) {
    statusBadge.textContent = "서버 데이터 조회 중...";
    statusBadge.className = "profile-stock-status-badge status-loading";
  }

  try {
    const data = await fetchMyStock();

    if (data) {
      if (gradeSelect && data.grade) gradeSelect.value = String(data.grade);
      if (classInput && data.class_num) classInput.value = String(data.class_num);
      if (numInput && data.student_num) numInput.value = String(data.student_num);
      if (ticker1Input && data.ticker_1) ticker1Input.value = data.ticker_1.toUpperCase();
      if (ticker2Input && data.ticker_2) ticker2Input.value = data.ticker_2.toUpperCase();
      if (ticker3Input && data.ticker_3) ticker3Input.value = data.ticker_3.toUpperCase();

      if (statusBadge) {
        statusBadge.textContent = data.updated_at
          ? `✓ 서버 로드 완료 (${new Date(data.updated_at).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })})`
          : "✓ 서버 데이터 로드됨";
        statusBadge.className = "profile-stock-status-badge status-ok";
      }

      // 대시보드 티커도 동기화
      const syncedTickers: TickerConfigItem[] = [
        { name: data.ticker_1, symbol: data.ticker_1, code: data.ticker_1, unit: "pt" },
        { name: data.ticker_2, symbol: data.ticker_2, code: data.ticker_2, unit: "pt" },
        { name: data.ticker_3, symbol: data.ticker_3, code: data.ticker_3, unit: "pt" },
      ].filter(t => t.code);
      if (syncedTickers.length > 0) {
        setSavedTickers(syncedTickers);
      }
    } else {
      if (statusBadge) {
        statusBadge.textContent = "기존 제출 데이터 없음 (신규)";
        statusBadge.className = "profile-stock-status-badge";
      }
    }
  } catch (err: any) {
    console.warn("서버 주식 데이터 조회 실패:", err);
    if (statusBadge) {
      statusBadge.textContent = err.message?.includes("로그인")
        ? "로그인 필요"
        : "조회 실패";
      statusBadge.className = "profile-stock-status-badge status-error";
    }
  }
}

function initProfileModal(): void {
  const modal = $("#profile-modal");
  const closeBtn = $("#profile-modal-close");
  const changeNameBtn = $("#profile-btn-change-name");
  const logoutBtn = $("#profile-btn-logout");
  const form = $<HTMLFormElement>("#profile-stock-form");
  const submitBtn = $<HTMLButtonElement>("#btn-profile-stock-submit");

  const ticker1Input = $<HTMLInputElement>("#profile-stock-ticker-1");
  const ticker2Input = $<HTMLInputElement>("#profile-stock-ticker-2");
  const ticker3Input = $<HTMLInputElement>("#profile-stock-ticker-3");
  const tickerInputs = [ticker1Input, ticker2Input, ticker3Input];

  closeBtn?.addEventListener("click", closeProfileModal);
  modal?.addEventListener("click", (e) => {
    if (e.target === modal) closeProfileModal();
  });

  changeNameBtn?.addEventListener("click", () => {
    closeProfileModal();
    openNameChangeModal();
  });

  logoutBtn?.addEventListener("click", () => {
    const user = getAuthUser();
    closeProfileModal();
    if (user) {
      handleLogout();
    } else {
      loginWithKnoblab();
    }
  });

  // 티커 입력 시 실시간 대문자 변환
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

  // 추천 칩 클릭 시 자동 입력
  document.querySelectorAll<HTMLButtonElement>("#profile-stock-preset-chips .preset-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      const ticker = chip.dataset.ticker;
      if (!ticker) return;

      const empty = tickerInputs.find((inp) => inp && !inp.value.trim());
      if (empty) {
        empty.value = ticker;
      } else if (ticker1Input) {
        ticker1Input.value = ticker;
      }
    });
  });

  // 폼 제출 핸들러 (POST /submit)
  form?.addEventListener("submit", async (e) => {
    e.preventDefault();

    const user = getAuthUser();
    const gradeSelect = $<HTMLSelectElement>("#profile-stock-grade");
    const classInput = $<HTMLInputElement>("#profile-stock-class");
    const numInput = $<HTMLInputElement>("#profile-stock-num");

    const gradeVal = Number(gradeSelect?.value);
    const classVal = Number(classInput?.value);
    const numVal = Number(numInput?.value);
    const t1 = ticker1Input?.value.trim().toUpperCase() || "";
    const t2 = ticker2Input?.value.trim().toUpperCase() || "";
    const t3 = ticker3Input?.value.trim().toUpperCase() || "";

    if (!gradeVal || !classVal || !numVal || !t1 || !t2 || !t3) {
      showToast("학년, 반, 번호 및 티커 3개를 모두 입력해주세요.");
      return;
    }

    const payload: StudentStockSubmission = {
      grade: gradeVal,
      class_num: classVal,
      student_num: numVal,
      ticker_1: t1,
      ticker_2: t2,
      ticker_3: t3,
    };

    // 로컬 스토리지에 티커 동기화
    const newTickers: TickerConfigItem[] = [
      { name: t1, symbol: t1, code: t1, unit: "pt" },
      { name: t2, symbol: t2, code: t2, unit: "pt" },
      { name: t3, symbol: t3, code: t3, unit: "pt" },
    ];
    setSavedTickers(newTickers);

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "서버 저장 중...";
    }

    if (!user) {
      showToast("로컬에 티커가 저장되었습니다. Knoblab 로그인 시 서버에도 영구 저장됩니다.");
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "주식 티커 저장하기 (POST /submit)";
      }
      if (currentTab === "메인") {
        renderDashboard(
          (t) => switchTab(t as TabName),
          (idx) => renderNoticeDetail(idx)
        );
      }
      return;
    }

    try {
      await submitStudentStock(payload);

      showToast("주식 티커 3개와 학생 정보가 서버에 성공적으로 저장되었습니다!");

      const statusBadge = $("#profile-stock-status-badge");
      if (statusBadge) {
        statusBadge.textContent = `✓ 저장 완료 (${new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })})`;
        statusBadge.className = "profile-stock-status-badge status-ok";
      }

      if (currentTab === "메인") {
        renderDashboard(
          (t) => switchTab(t as TabName),
          (idx) => renderNoticeDetail(idx)
        );
      }
    } catch (err: any) {
      console.error("서버 저장 실패:", err);
      showToast(`저장 실패: ${err.message || "네트워크 오류"}`);
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "주식 티커 저장하기 (POST /submit)";
      }
    }
  });
}


export function updateAuthUI(): void {
  const user = getAuthUser();
  const savedName = getSavedName() || "학생";
  const navContainer = document.getElementById("nav-auth-container");
  const drawerContainer = document.getElementById("drawer-auth-container");

  // 데스크탑 네비게이션
  if (navContainer) {
    if (user) {
      navContainer.innerHTML = `
        <button type="button" class="btn-nav-profile" id="btn-nav-profile" title="계정 정보 (${esc(user.email || user.uid)})">
          <span class="btn-nav-profile-dot"></span>
          <span>${esc(savedName)}</span>
        </button>
      `;
      $("#btn-nav-profile")?.addEventListener("click", () => openProfileModal());
    } else {
      navContainer.innerHTML = `
        <button type="button" class="btn-nav-name-edit" id="btn-nav-name-edit" title="이름 변경">
          <span>${esc(savedName)}</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
          </svg>
        </button>
        <button type="button" class="btn-nav-login" id="btn-nav-login" title="Knoblab 계정으로 로그인">
          <span>로그인</span>
        </button>
      `;
      $("#btn-nav-name-edit")?.addEventListener("click", () => openNameChangeModal());
      $("#btn-nav-login")?.addEventListener("click", () => loginWithKnoblab());
    }
  }

  // 모바일 드로어
  if (drawerContainer) {
    if (user) {
      drawerContainer.innerHTML = `
        <div class="drawer-auth-user-card" id="drawer-user-card" role="button" tabindex="0" title="내 프로필 및 티커 설정">
          <div class="drawer-auth-user-info">
            <div class="user-name">
              <span class="btn-nav-profile-dot"></span>
              <strong>${esc(savedName)}</strong>
            </div>
            <div class="user-email">${esc(user.email || user.uid)}</div>
          </div>
          <span class="drawer-profile-arrow">설정 →</span>
        </div>
        <div class="drawer-auth-actions">
          <button type="button" class="btn-drawer-primary" id="drawer-btn-profile">
            내 프로필 & 티커 설정
          </button>
        </div>
      `;
      $("#drawer-user-card")?.addEventListener("click", () => {
        closeMobileDrawer();
        openProfileModal();
      });
      $("#drawer-btn-profile")?.addEventListener("click", () => {
        closeMobileDrawer();
        openProfileModal();
      });
    } else {
      drawerContainer.innerHTML = `
        <div class="drawer-auth-user-card" id="drawer-user-card" role="button" tabindex="0" title="프로필 및 티커 설정">
          <div class="drawer-auth-user-info">
            <div class="user-name">${esc(savedName)}님 (게스트)</div>
            <div class="user-email">프로필 및 티커를 자유롭게 설정하세요.</div>
          </div>
          <span class="drawer-profile-arrow">설정 →</span>
        </div>
        <div class="drawer-auth-actions">
          <button type="button" class="btn-drawer-secondary" id="drawer-btn-profile">프로필 & 티커 설정</button>
          <button type="button" class="btn-drawer-primary" id="drawer-btn-login">로그인</button>
        </div>
      `;
      $("#drawer-user-card")?.addEventListener("click", () => {
        closeMobileDrawer();
        openProfileModal();
      });
      $("#drawer-btn-profile")?.addEventListener("click", () => {
        closeMobileDrawer();
        openProfileModal();
      });
      $("#drawer-btn-login")?.addEventListener("click", () => {
        loginWithKnoblab();
      });
    }
  }
}

async function handleLogout(): Promise<void> {
  await logout();
  showToast("로그아웃되었습니다.");
  updateAuthUI();
  if (currentTab === "메인") {
    switchTab("메인", false);
  }
}

export function closeMobileDrawer(): void {
  const mobileDrawer = $("#mobile-drawer");
  mobileDrawer?.classList.add("hidden");
  document.body.style.overflow = "";
}

function initNavigation(): void {
  const brandButton = $(".asterisk-brand");
  brandButton?.addEventListener("click", () => switchTab("메인"));

  // 데스크탑 탭 클릭
  document.querySelectorAll<HTMLButtonElement>(".desktop-nav [data-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.tab as TabName;
      if (tab) switchTab(tab);
    });
  });

  // 모바일 드로어 탭 클릭
  document.querySelectorAll<HTMLButtonElement>(".drawer-nav-item[data-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.tab as TabName;
      if (tab) {
        closeMobileDrawer();
        switchTab(tab);
      }
    });
  });

  // 모바일 햄버거 메뉴 열기/닫기
  const mobileToggleBtn = $("#mobile-menu-toggle");
  const mobileDrawer = $("#mobile-drawer");
  const closeBtn = $("#drawer-close-btn");
  const backdrop = $("#drawer-backdrop");

  const openMobileDrawer = () => {
    mobileDrawer?.classList.remove("hidden");
    document.body.style.overflow = "hidden";
  };

  mobileToggleBtn?.addEventListener("click", openMobileDrawer);
  closeBtn?.addEventListener("click", closeMobileDrawer);
  backdrop?.addEventListener("click", closeMobileDrawer);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (!mobileDrawer?.classList.contains("hidden")) {
        closeMobileDrawer();
      }
      closeNameChangeModal();
      closeProfileModal();
    }
  });

  const footerBrandBtn = $("#footer-brand-btn");
  footerBrandBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    switchTab("브랜드");
  });

  window.addEventListener("popstate", () => {
    handleUrlRoute();
  });
}

function handleUrlRoute(): void {
  const hash = window.location.hash.replace("#", "");
  const path = window.location.pathname;

  if (hash === "brand" || path.endsWith("/brand") || path.endsWith("/brand.html")) {
    switchTab("브랜드", false);
  } else if (hash === "timer" || hash === "타이머") {
    switchTab("타이머", false);
  } else if (hash) {
    const decoded = decodeURIComponent(hash) as TabName;
    if (["메인", "시간표", "방과후", "급식", "공지", "타이머", "브랜드"].includes(decoded)) {
      switchTab(decoded, false);
      return;
    }
    switchTab("메인", false);
  } else {
    switchTab("메인", false);
  }
}

function initDateDisplay(): void {
  const d = new Date();
  const dateEl = $("#date");
  dateEl.textContent = new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(d);

  const h = d.getHours();
  const defaultMealCode: MealCode = h < 8 ? "1" : h < 13 ? "2" : "3";
  setMealCode(defaultMealCode);
}

document.addEventListener("DOMContentLoaded", () => {
  initDateDisplay();
  initClassPicker();
  initWelcomeModal();
  initNameChangeModal();
  initProfileModal();
  updateAuthUI();
  onAuthStateChange((user) => {
    if (!getSavedName() && user?.email) {
      const emailPrefix = user.email.split("@")[0];
      setSavedName(emailPrefix);
      const welcomeModal = $("#welcome");
      welcomeModal?.classList.add("hidden");
    }
    updateAuthUI();
    if (currentTab === "메인") {
      switchTab("메인", false);
    }
  });
  checkAuth();
  initNavigation();
  handleUrlRoute();
});
