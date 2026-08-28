import "./styles/styles.css";

import { $ } from "./utils/dom";
import { getSavedClass, getSavedName, setSavedClass, setSavedName } from "./utils/storage";
import { renderDashboard } from "./views/dashboardView";
import { renderTimetable } from "./views/timetableView";
import { renderAfterschool } from "./views/afterschoolView";
import { renderMeals, setMealCode } from "./views/mealView";
import { renderBoard, renderNoticeDetail } from "./views/noticeView";
import { renderBrand } from "./views/brandView";
import { ClassNumber, GradeNumber } from "./types/timetable";
import { MealCode } from "./types/meal";

export type TabName = "메인" | "시간표" | "방과후" | "급식" | "공지" | "브랜드";

let currentTab: TabName = "메인";

export function switchTab(tab: TabName, updateUrl = true): void {
  currentTab = tab;
  const pageTitle = $("#page-title");
  const titleContainer = document.querySelector<HTMLElement>(".title");
  const pickerEl = document.querySelector<HTMLElement>(".picker");
  
  if (tab === "메인") {
    const savedName = getSavedName() || "학생";
    pageTitle.textContent = `${savedName}님, 오늘도 반가워요.`;
  } else if (tab === "브랜드") {
    pageTitle.textContent = "브랜드 스토리";
  } else {
    pageTitle.textContent = tab;
  }

  // 브랜드 탭일 때와 일반 탭일 때의 상단 타이틀 및 피커 표시 제어
  if (titleContainer) {
    titleContainer.style.display = tab === "브랜드" ? "none" : "flex";
  }
  if (pickerEl) {
    pickerEl.style.display = (tab === "브랜드" || tab === "공지") ? "none" : "flex";
  }

  // 데스크탑 네비게이션 및 모바일 드로어 탭 활성화 상태 동기화
  document.querySelectorAll<HTMLButtonElement>("[data-tab]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tab);
  });

  if (updateUrl) {
    if (tab === "브랜드") {
      history.pushState(null, "", "#brand");
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

  const savedName = getSavedName();
  if (!savedName) {
    welcomeModal.classList.remove("hidden");
    setTimeout(() => nameInput.focus(), 0);
  }

  welcomeForm?.addEventListener("submit", (e) => {
    e.preventDefault();
    const value = nameInput.value.trim();
    if (!value) return;
    setSavedName(value);
    welcomeModal.classList.add("hidden");
    switchTab("메인");
  });
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

  const closeMobileDrawer = () => {
    mobileDrawer?.classList.add("hidden");
    document.body.style.overflow = "";
  };

  mobileToggleBtn?.addEventListener("click", openMobileDrawer);
  closeBtn?.addEventListener("click", closeMobileDrawer);
  backdrop?.addEventListener("click", closeMobileDrawer);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !mobileDrawer?.classList.contains("hidden")) {
      closeMobileDrawer();
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
  } else if (hash) {
    const decoded = decodeURIComponent(hash) as TabName;
    if (["메인", "시간표", "방과후", "급식", "공지", "브랜드"].includes(decoded)) {
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
  initNavigation();
  handleUrlRoute();
});
