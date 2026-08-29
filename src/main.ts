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
  const topClassBadge = document.querySelector<HTMLElement>("#top-class-badge");
  
  if (tab === "메인") {
    const savedName = getSavedName() || "학생";
    pageTitle.innerHTML = `
      <span class="welcome-name-wrap">${esc(savedName)}님, 오늘도 반가워요.</span>
      <button type="button" class="title-name-edit-btn" id="title-name-edit-btn" aria-label="환경설정" title="환경설정 열기">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
        </svg>
      </button>
    `;
    $("#title-name-edit-btn")?.addEventListener("click", () => openProfileModal());
  } else if (tab === "브랜드") {
    pageTitle.textContent = "브랜드 스토리";
  } else if (tab === "타이머") {
    pageTitle.textContent = "자습 타이머";
  } else {
    pageTitle.textContent = tab;
  }

  // 브랜드 탭일 때와 일반 탭일 때의 상단 타이틀 및 학년/반 배지 표시 제어
  if (titleContainer) {
    titleContainer.style.display = tab === "브랜드" ? "none" : "flex";
  }
  if (topClassBadge) {
    topClassBadge.style.display = (tab === "브랜드" || tab === "공지" || tab === "타이머") ? "none" : "flex";
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

export function updateTopClassBadge(): void {
  const badgeText = $("#top-class-text");
  const saved = getSavedClass();
  if (badgeText) {
    badgeText.textContent = `${saved.g}학년 ${saved.c}반`;
  }
}

function initTopClassBadge(): void {
  updateTopClassBadge();
  const badge = $("#top-class-badge");
  badge?.addEventListener("click", () => {
    openProfileModal();
  });
  badge?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openProfileModal();
    }
  });
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
import { searchTickers } from "./services/marketService";
import { StudentStockSubmission } from "./types/studentStock";

export function openProfileModal(): void {
  const modal = $("#profile-modal");
  const user = getAuthUser();
  const savedName = getSavedName() || "학생";

  const nameInput = $<HTMLInputElement>("#profile-name-input");
  const displayEmailEl = $("#profile-display-email");
  const displayUidEl = $("#profile-display-uid");
  const logoutBtn = $("#profile-btn-logout");

  if (nameInput) nameInput.value = savedName;
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

const STORAGE_KEY_PENDING_STOCK = "pending_student_stock_submission";

export function getPendingStockSubmission(): StudentStockSubmission | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PENDING_STOCK);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setPendingStockSubmission(data: StudentStockSubmission | null): void {
  if (data) {
    localStorage.setItem(STORAGE_KEY_PENDING_STOCK, JSON.stringify(data));
  } else {
    localStorage.removeItem(STORAGE_KEY_PENDING_STOCK);
  }
}

export function closeProfileModal(): void {
  const modal = $("#profile-modal");
  modal.classList.add("hidden");
}

/**
 * 서버에서 내 학년/반/번호 및 주식 티커 데이터를 조회하여 로컬 스토리지와 UI(상단 바 포함)에 동기화합니다.
 * 대기 중이던 미반영 설정(Pending submission)이 있으면 먼저 서버로 전송합니다.
 */
export async function syncUserDataFromServer(): Promise<void> {
  const user = getAuthUser();
  if (!user) return;

  // 1. 대기 중이던 저장 요청이 있으면 서버에 먼저 전송하여 자동 적용
  const pending = getPendingStockSubmission();
  if (pending) {
    try {
      await submitStudentStock(pending);
      setPendingStockSubmission(null);
      showToast("✓ 로그인 완료: 저장 대기 중이던 설정이 서버에 성공적으로 동기화되었습니다!");
    } catch (err: any) {
      console.warn("대기 중인 설정 동기화 실패:", err);
    }
  }

  // 2. 서버의 최신 정보로 UI 동기화
  try {
    const data = await fetchMyStock();
    if (!data) return;

    if (data.grade && data.class_num) {
      const g = String(data.grade) as GradeNumber;
      const c = String(data.class_num) as ClassNumber;
      setSavedClass({ g, c });

      // 상단 바 학년/반 텍스트 배지 동기화
      updateTopClassBadge();

      // 프로필 모달 입력창 동기화
      const profileGrade = $<HTMLSelectElement>("#profile-stock-grade");
      const profileClass = $<HTMLInputElement>("#profile-stock-class");
      const profileNum = $<HTMLInputElement>("#profile-stock-num");
      if (profileGrade) profileGrade.value = g;
      if (profileClass) profileClass.value = c;
      if (profileNum && data.student_num) profileNum.value = String(data.student_num);
    }

    // 주식 티커 동기화
    const syncedTickers: TickerConfigItem[] = [
      { name: data.ticker_1, symbol: data.ticker_1, code: data.ticker_1, unit: "pt" },
      { name: data.ticker_2, symbol: data.ticker_2, code: data.ticker_2, unit: "pt" },
      { name: data.ticker_3, symbol: data.ticker_3, code: data.ticker_3, unit: "pt" },
    ].filter((t) => t.code);
    if (syncedTickers.length > 0) {
      setSavedTickers(syncedTickers);
    }

    const ticker1Input = $<HTMLInputElement>("#profile-stock-ticker-1");
    const ticker2Input = $<HTMLInputElement>("#profile-stock-ticker-2");
    const ticker3Input = $<HTMLInputElement>("#profile-stock-ticker-3");
    if (ticker1Input && data.ticker_1) ticker1Input.value = data.ticker_1.toUpperCase();
    if (ticker2Input && data.ticker_2) ticker2Input.value = data.ticker_2.toUpperCase();
    if (ticker3Input && data.ticker_3) ticker3Input.value = data.ticker_3.toUpperCase();

    renderActiveView();
  } catch (err: any) {
    console.warn("서버 데이터 동기화 실패:", err);
  }
}

async function loadProfileStockData(): Promise<void> {
  const user = getAuthUser();
  const statusBadge = $("#profile-stock-status-badge");
  const nameInput = $<HTMLInputElement>("#profile-name-input");
  const gradeSelect = $<HTMLSelectElement>("#profile-stock-grade");
  const classInput = $<HTMLInputElement>("#profile-stock-class");
  const numInput = $<HTMLInputElement>("#profile-stock-num");
  const ticker1Input = $<HTMLInputElement>("#profile-stock-ticker-1");
  const ticker2Input = $<HTMLInputElement>("#profile-stock-ticker-2");
  const ticker3Input = $<HTMLInputElement>("#profile-stock-ticker-3");

  const savedName = getSavedName() || "학생";
  if (nameInput && !nameInput.value) nameInput.value = savedName;

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

      // 상단 바 및 로컬 스토리지도 즉시 동기화
      if (data.grade && data.class_num) {
        const g = String(data.grade) as GradeNumber;
        const c = String(data.class_num) as ClassNumber;
        setSavedClass({ g, c });
        updateTopClassBadge();
      }

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
      ].filter((t) => t.code);
      if (syncedTickers.length > 0) {
        setSavedTickers(syncedTickers);
      }
      renderActiveView();
    } else {
      if (statusBadge) {
        statusBadge.textContent = "기존 제출 데이터 없음 (신규)";
        statusBadge.className = "profile-stock-status-badge";
      }
    }
  } catch (err: any) {
    console.warn("서버 주식 데이터 조회 실패:", err);
    if (statusBadge) {
      statusBadge.textContent = "조회 실패";
      statusBadge.className = "profile-stock-status-badge status-error";
    }
  }
}

function initProfileModal(): void {
  const modal = $("#profile-modal");
  const closeBtn = $("#profile-modal-close");
  const logoutBtn = $("#profile-btn-logout");
  const form = $<HTMLFormElement>("#profile-stock-form");
  const submitBtn = $<HTMLButtonElement>("#btn-profile-stock-submit");

  const ticker1Input = $<HTMLInputElement>("#profile-stock-ticker-1");
  const ticker2Input = $<HTMLInputElement>("#profile-stock-ticker-2");
  const ticker3Input = $<HTMLInputElement>("#profile-stock-ticker-3");

  closeBtn?.addEventListener("click", closeProfileModal);
  modal?.addEventListener("click", (e) => {
    if (e.target === modal) closeProfileModal();
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

  // 1. 설정 탭 전환 (내 정보 <-> 관심 주식)
  const tabBtns = document.querySelectorAll<HTMLButtonElement>(".settings-tab-btn");
  const tabPanes = document.querySelectorAll<HTMLElement>(".settings-tab-pane");

  tabBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetTab = btn.dataset.settingsTab;
      tabBtns.forEach((b) => {
        const isTarget = b === btn;
        b.classList.toggle("active", isTarget);
        b.setAttribute("aria-selected", isTarget ? "true" : "false");
      });
      tabPanes.forEach((pane) => {
        pane.classList.toggle("active", pane.id === `tab-pane-${targetTab}`);
      });
    });
  });

  // 2. 입력창마다 인라인 자동완성 검색 드롭다운 연결
  const tickerSlots = [
    {
      input: ticker1Input,
      dropdown: $<HTMLElement>("#ticker-dropdown-1"),
    },
    {
      input: ticker2Input,
      dropdown: $<HTMLElement>("#ticker-dropdown-2"),
    },
    {
      input: ticker3Input,
      dropdown: $<HTMLElement>("#ticker-dropdown-3"),
    },
  ];

  const activeDebounceTimers = new Map<HTMLInputElement, any>();

  const closeAllDropdowns = () => {
    tickerSlots.forEach(({ dropdown }) => {
      dropdown?.classList.add("hidden");
    });
  };

  tickerSlots.forEach(({ input, dropdown }) => {
    if (!input || !dropdown) return;

    const performSearchForSlot = async () => {
      const q = input.value.trim();
      if (!q) {
        dropdown.innerHTML = "";
        dropdown.classList.add("hidden");
        return;
      }

      dropdown.classList.remove("hidden");
      dropdown.innerHTML = `<div class="ticker-search-status">검색 중...</div>`;

      try {
        const results = await searchTickers(q);
        if (input.value.trim() !== q) return; // 중간에 입력이 바뀌었으면 무시

        if (!results || results.length === 0) {
          dropdown.innerHTML = `<div class="ticker-search-status">검색 결과 없음 ('${esc(q)}' 직접 사용)</div>`;
          return;
        }

        dropdown.innerHTML = results
          .slice(0, 6)
          .map(
            (item) => `
          <div class="ticker-search-item" data-symbol="${esc(item.symbol)}" data-name="${esc(item.name)}">
            <div class="ticker-search-item-left">
              <div class="ticker-search-item-header">
                <span class="ticker-search-sym">${esc(item.symbol)}</span>
                ${item.exchDisp ? `<span class="ticker-search-exch">${esc(item.exchDisp)}</span>` : ""}
              </div>
              <span class="ticker-search-name">${esc(item.name)}</span>
            </div>
            <button type="button" class="btn-ticker-add">+ 선택</button>
          </div>
        `
          )
          .join("");

        dropdown.querySelectorAll<HTMLElement>(".ticker-search-item").forEach((itemEl) => {
          itemEl.addEventListener("click", (e) => {
            e.stopPropagation();
            const sym = itemEl.dataset.symbol;
            const name = itemEl.dataset.name;
            if (sym) {
              input.value = sym.toUpperCase();
              dropdown.classList.add("hidden");
              showToast(`'${sym}' (${name || ""}) 선택됨`);
            }
          });
        });
      } catch (err) {
        dropdown.innerHTML = `<div class="ticker-search-status">검색 중 오류 발생</div>`;
      }
    };

    input.addEventListener("input", () => {
      clearTimeout(activeDebounceTimers.get(input));
      const val = input.value.trim();
      if (val.length >= 1) {
        const timer = setTimeout(performSearchForSlot, 300);
        activeDebounceTimers.set(input, timer);
      } else {
        dropdown.innerHTML = "";
        dropdown.classList.add("hidden");
      }
    });

    input.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        dropdown.classList.add("hidden");
      }
    });
  });

  // 바깥 영역 클릭 시 모든 드롭다운 닫기
  document.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;
    if (!target.closest(".ticker-input-relative")) {
      closeAllDropdowns();
    }
  });

  // 추천 칩 클릭 시 빈 입력창에 채우기
  document.querySelectorAll<HTMLButtonElement>("#profile-stock-preset-chips .preset-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      const ticker = chip.dataset.ticker;
      if (!ticker) return;

      const emptySlot = tickerSlots.find((s) => s.input && !s.input.value.trim());
      if (emptySlot && emptySlot.input) {
        emptySlot.input.value = ticker;
      } else if (tickerSlots[0]?.input) {
        tickerSlots[0].input.value = ticker;
      }
      closeAllDropdowns();
    });
  });

  // 폼 제출 핸들러 (POST /submit)
  // 폼 제출 핸들러 (환경설정 통합 저장)
  form?.addEventListener("submit", async (e) => {
    e.preventDefault();

    const user = getAuthUser();
    const nameInput = $<HTMLInputElement>("#profile-name-input");
    const gradeSelect = $<HTMLSelectElement>("#profile-stock-grade");
    const classInput = $<HTMLInputElement>("#profile-stock-class");
    const numInput = $<HTMLInputElement>("#profile-stock-num");

    const nameVal = nameInput?.value.trim();
    const gradeVal = Number(gradeSelect?.value);
    const classVal = Number(classInput?.value);
    const numVal = Number(numInput?.value);
    const t1 = ticker1Input?.value.trim().toUpperCase() || "";
    const t2 = ticker2Input?.value.trim().toUpperCase() || "";
    const t3 = ticker3Input?.value.trim().toUpperCase() || "";

    if (!nameVal || !gradeVal || !classVal || !numVal || !t1 || !t2 || !t3) {
      showToast("이름, 학년, 반, 번호 및 티커 3개를 모두 입력해주세요.");
      return;
    }

    // 1. 이름 저장
    setSavedName(nameVal);

    // 2. 학년/반 로컬 스토리지 및 상단 바 텍스트 배지 동기화
    setSavedClass({
      g: String(gradeVal) as GradeNumber,
      c: String(classVal) as ClassNumber,
    });
    updateTopClassBadge();

    // 3. 로컬 스토리지에 티커 동기화
    const newTickers: TickerConfigItem[] = [
      { name: t1, symbol: t1, code: t1, unit: "pt" },
      { name: t2, symbol: t2, code: t2, unit: "pt" },
      { name: t3, symbol: t3, code: t3, unit: "pt" },
    ];
    setSavedTickers(newTickers);

    // 4. 화면 및 인증 UI 즉시 갱신
    updateAuthUI();
    renderActiveView();

    const payload: StudentStockSubmission = {
      grade: gradeVal,
      class_num: classVal,
      student_num: numVal,
      ticker_1: t1,
      ticker_2: t2,
      ticker_3: t3,
    };

    // 토큰 만료 등으로 재로그인이 필요할 때 복귀 후 자동 반영되도록 대기 큐에 우선 저장
    setPendingStockSubmission(payload);

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "저장 중...";
    }

    if (!user) {
      showToast("설정이 로컬에 저장되었습니다. Knoblab 로그인 시 클라우드에도 영구 저장됩니다.");
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "설정 저장하기";
      }
      return;
    }

    try {
      await submitStudentStock(payload);

      // 서버 저장 성공 시 대기 큐 제거
      setPendingStockSubmission(null);

      showToast("환경설정(학생 정보 & 주식 티커)이 성공적으로 저장되었습니다!");

      const statusBadge = $("#profile-stock-status-badge");
      if (statusBadge) {
        statusBadge.textContent = `✓ 저장 완료 (${new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })})`;
        statusBadge.className = "profile-stock-status-badge status-ok";
      }
    } catch (err: any) {
      console.warn("서버 저장 실패:", err);
      const isAuthError =
        err.message?.includes("AUTH_EXPIRED") ||
        err.message?.includes("401") ||
        err.message?.includes("만료") ||
        err.message?.includes("인증") ||
        err.message?.includes("유효");

      if (isAuthError) {
        showToast("인증 세션 갱신을 위해 로그인 페이지로 이동합니다. (작성한 설정은 로그인 후 자동 저장됩니다)");
        setTimeout(() => {
          loginWithKnoblab();
        }, 1200);
      } else {
        showToast(`서버 저장 실패 (${err.message || "네트워크 오류"}), 로컬에는 안전하게 저장되었습니다.`);
      }
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "설정 저장하기";
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
  initTopClassBadge();
  initWelcomeModal();
  initNameChangeModal();
  initProfileModal();
  updateAuthUI();
  onAuthStateChange(async (user) => {
    if (!getSavedName() && user?.email) {
      const emailPrefix = user.email.split("@")[0];
      setSavedName(emailPrefix);
      const welcomeModal = $("#welcome");
      welcomeModal?.classList.add("hidden");
    }
    updateAuthUI();
    if (user) {
      await syncUserDataFromServer();
    }
    if (currentTab === "메인") {
      switchTab("메인", false);
    }
  });
  checkAuth();
  initNavigation();
  handleUrlRoute();
});
