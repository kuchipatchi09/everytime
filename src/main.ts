import "./styles/styles.css";

import { $, showToast } from "./utils/dom";
import { esc } from "./utils/escape";
import { getSavedClass, getSavedName, setSavedClass, setSavedName } from "./utils/storage";
import { checkAuth, getAuthUser, loginWithKnoblab, logout, onAuthStateChange } from "./utils/auth";
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
  const welcomeForm = welcomeModal.querySelector("form");

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

  welcomeForm?.addEventListener("submit", (e) => {
    e.preventDefault();
    const value = nameInput.value.trim();
    if (!value) return;
    setSavedName(value);
    welcomeModal.classList.add("hidden");
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

export function openProfileModal(): void {
  const modal = $("#profile-modal");
  const user = getAuthUser();
  const savedName = getSavedName() || "학생";

  const displayNameEl = $("#profile-display-name");
  const displayEmailEl = $("#profile-display-email");
  const displayUidEl = $("#profile-display-uid");

  if (displayNameEl) displayNameEl.textContent = savedName;
  if (displayEmailEl) displayEmailEl.textContent = user?.email || "이메일 정보 없음";
  if (displayUidEl) displayUidEl.textContent = user?.uid || "-";

  modal.classList.remove("hidden");
}

export function closeProfileModal(): void {
  const modal = $("#profile-modal");
  modal.classList.add("hidden");
}

function initProfileModal(): void {
  const modal = $("#profile-modal");
  const closeBtn = $("#profile-modal-close");
  const changeNameBtn = $("#profile-btn-change-name");
  const logoutBtn = $("#profile-btn-logout");

  closeBtn?.addEventListener("click", closeProfileModal);
  modal?.addEventListener("click", (e) => {
    if (e.target === modal) closeProfileModal();
  });

  changeNameBtn?.addEventListener("click", () => {
    closeProfileModal();
    openNameChangeModal();
  });

  logoutBtn?.addEventListener("click", () => {
    closeProfileModal();
    handleLogout();
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
        <div class="drawer-auth-user-info">
          <div class="user-name">
            <span class="btn-nav-profile-dot"></span>
            <strong>${esc(savedName)}</strong>
          </div>
          <div class="user-email">${esc(user.email || user.uid)}</div>
        </div>
        <div class="drawer-auth-actions">
          <button type="button" class="btn-drawer-secondary" id="drawer-btn-change-name">이름 변경</button>
          <button type="button" class="btn-drawer-secondary" id="drawer-btn-logout">로그아웃</button>
        </div>
      `;
      $("#drawer-btn-change-name")?.addEventListener("click", () => {
        closeMobileDrawer();
        openNameChangeModal();
      });
      $("#drawer-btn-logout")?.addEventListener("click", () => {
        closeMobileDrawer();
        handleLogout();
      });
    } else {
      drawerContainer.innerHTML = `
        <div class="drawer-auth-user-info">
          <div class="user-name">${esc(savedName)}님 (게스트)</div>
          <div class="user-email">Knoblab 계정으로 로그인해 서비스를 연동하세요.</div>
        </div>
        <div class="drawer-auth-actions">
          <button type="button" class="btn-drawer-secondary" id="drawer-btn-change-name">이름 변경</button>
          <button type="button" class="btn-drawer-primary" id="drawer-btn-login">Knoblab 로그인</button>
        </div>
      `;
      $("#drawer-btn-change-name")?.addEventListener("click", () => {
        closeMobileDrawer();
        openNameChangeModal();
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
