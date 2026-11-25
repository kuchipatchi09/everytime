import "./styles/styles.css";

import { $, showToast } from "./utils/dom";
import { esc } from "./utils/escape";
import {
  getAgreedAt,
  getSavedClass,
  getSavedName,
  getSavedStudentNum,
  getSavedTickers,
  hasAgreedTerms,
  setSavedClass,
  setSavedName,
  setSavedStudentNum,
  setSavedTickers,
  setTermsAgreement,
} from "./utils/storage";
import { TickerConfigItem } from "./types/market";
import { renderDashboard, stopNowCardContinuousTicker, exitNowFullscreen } from "./views/dashboardView";
import { renderTimetable } from "./views/timetableView";
import { renderAfterschool } from "./views/afterschoolView";
import { renderMeals, setMealCode } from "./views/mealView";
import { renderBoard, renderNoticeDetail } from "./views/noticeView";
import { renderBrand } from "./views/brandView";
import { renderTimer } from "./views/timerView";
import { renderMarketView, stopMarketView } from "./views/marketView";
import { ClassNumber, GradeNumber } from "./types/timetable";
import { MealCode } from "./types/meal";
import { getCachedWeatherCode, getWeatherGreeting } from "./constants/weatherGreetings";
import { startWeatherAutoRefresh } from "./services/weatherService";
import { skyBackgroundService } from "./services/skyBackgroundService";

export type TabName = "메인" | "시간표" | "방과후" | "급식" | "공지" | "타이머" | "금융 지표" | "브랜드";

let currentTab: TabName = "메인";

export function switchTab(tab: TabName, updateUrl = true): void {
  currentTab = tab;
  stopNowCardContinuousTicker();
  stopMarketView();
  exitNowFullscreen();


  // 브랜드는 고정된 브랜드 캔버스를 사용하므로, 저장된 설정은 유지한 채 하늘만 숨긴다.
  skyBackgroundService.setSuppressed(tab === "브랜드");
  if (skyBackgroundService.getIsEnabled() && tab !== "브랜드") {
    skyBackgroundService.resume();
  }

  const pageTitle = $("#page-title");


  const titleContainer = document.querySelector<HTMLElement>(".title");
  const topClassBadge = document.querySelector<HTMLElement>("#top-class-badge");
  
  if (tab === "메인") {
    const savedName = getSavedName() || "학생";
    const greetingText = getWeatherGreeting(getCachedWeatherCode(), savedName);
    pageTitle.innerHTML = `
      <span class="welcome-name-wrap" id="welcome-name-wrap">${esc(greetingText)}</span>
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
    titleContainer.classList.toggle("tab-hidden", tab === "브랜드");
  }
  if (topClassBadge) {
    topClassBadge.classList.toggle("tab-hidden", ["브랜드", "공지", "타이머", "금융 지표"].includes(tab));
  }

  // 데스크탑 네비게이션 및 모바일 드로어 탭 활성화 상태 동기화
  document.querySelectorAll<HTMLButtonElement>("[data-tab]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tab);
  });
  document.querySelectorAll<HTMLButtonElement>(".nav-dropdown-trigger").forEach((trigger) => {
    const dropdown = trigger.closest<HTMLElement>(".nav-dropdown");
    const containsActiveTab = !!dropdown?.querySelector(`[data-tab="${tab}"]`);
    trigger.classList.toggle("active", containsActiveTab);
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
  } else if (currentTab === "금융 지표") {
    renderMarketView();
  } else if (currentTab === "브랜드") {
    renderBrand(() => switchTab("메인"));
  }
}

export function updateMainGreeting(weatherCode?: number): void {
  if (currentTab !== "메인") return;
  const wrap = $("#welcome-name-wrap");
  if (wrap) {
    const savedName = getSavedName() || "학생";
    wrap.textContent = getWeatherGreeting(weatherCode ?? getCachedWeatherCode(), savedName);
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


function updateProfileTermsUI(): void {
  const statusEl = $("#profile-terms-status");
  const dateEl = $("#profile-terms-date");
  const agreed = hasAgreedTerms();

  if (statusEl) {
    if (agreed) {
      statusEl.textContent = "동의 완료";
      statusEl.style.color = "#10b981";
    } else {
      statusEl.textContent = "미동의 (이용 제한)";
      statusEl.style.color = "#cf222e";
    }
  }

  if (dateEl) {
    const dateVal = getAgreedAt();
    if (dateVal) {
      const d = new Date(dateVal);
      dateEl.textContent = `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
    } else {
      dateEl.textContent = agreed ? "동의됨" : "-";
    }
  }
}

function initTermsModal(): void {
  const modal = $("#terms-modal");
  const checkAll = $<HTMLInputElement>("#terms-check-all");
  const checkService = $<HTMLInputElement>("#terms-check-service");
  const checkPrivacy = $<HTMLInputElement>("#terms-check-privacy");
  const submitBtn = $<HTMLButtonElement>("#terms-agree-submit");

  if (!modal || !checkService || !checkPrivacy || !submitBtn) return;

  const updateSubmitState = () => {
    const valid = checkService.checked && checkPrivacy.checked;
    submitBtn.disabled = !valid;
    if (checkAll) {
      checkAll.checked = valid;
    }
  };

  checkAll?.addEventListener("change", () => {
    const checked = checkAll.checked;
    checkService.checked = checked;
    checkPrivacy.checked = checked;
    submitBtn.disabled = !checked;
  });

  checkService.addEventListener("change", updateSubmitState);
  checkPrivacy.addEventListener("change", updateSubmitState);

  submitBtn.addEventListener("click", async () => {
    if (!checkService.checked || !checkPrivacy.checked) return;
    submitBtn.disabled = true;
    submitBtn.textContent = "저장 중...";
    try {
      await setTermsAgreement(true, true);
      modal.classList.add("hidden");
      showToast("약관 및 개인정보 처리방침에 동의하였습니다.");
      updateProfileTermsUI();
    } catch (e) {
      console.error(e);
      showToast("동의 상태 저장 중 오류가 발생했습니다.", 3000);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "동의하고 시작하기";
    }
  });

  // 초기 상태 검사: 미동의 시 모달 열기
  if (!hasAgreedTerms()) {
    modal.classList.remove("hidden");
  } else {
    modal.classList.add("hidden");
  }
}

function initWelcomeModal(): void {
  const welcomeModal = $("#welcome");
  const nameInput = $<HTMLInputElement>("#name-input");
  const guestForm = $("#welcome-guest-form");

  const savedName = getSavedName();

  if (!savedName) {
    welcomeModal.classList.remove("hidden");
    setTimeout(() => nameInput.focus(), 0);
  }

  // 닉네임 입력 폼 제출
  guestForm?.addEventListener("submit", (e) => {
    e.preventDefault();
    const value = nameInput.value.trim();
    if (!value) return;
    setSavedName(value);
    welcomeModal.classList.add("hidden");
    showToast(`${value}님, 환영합니다!`);
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

import { searchTickers } from "./services/marketService";

export function openProfileModal(): void {
  updateProfileTermsUI();
  const modal = $("#profile-modal");
  const savedName = getSavedName() || "학생";

  const nameInput = $<HTMLInputElement>("#profile-name-input");
  if (nameInput) nameInput.value = savedName;

  loadProfileStockData();

  modal.classList.remove("hidden");
}

export function closeProfileModal(): void {
  const modal = $("#profile-modal");
  modal.classList.add("hidden");
}

function loadProfileStockData(): void {
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

  const localNum = getSavedStudentNum();
  if (numInput && !numInput.value && localNum) numInput.value = String(localNum);

  const localTickers = getSavedTickers();
  if (ticker1Input && !ticker1Input.value && localTickers[0]) ticker1Input.value = localTickers[0].symbol;
  if (ticker2Input && !ticker2Input.value && localTickers[1]) ticker2Input.value = localTickers[1].symbol;
  if (ticker3Input && !ticker3Input.value && localTickers[2]) ticker3Input.value = localTickers[2].symbol;

  // 화면 효과 스위치 및 시간 오프셋 동기화
  const skyBgToggle = $<HTMLInputElement>("#setting-sky-bg-toggle");
  const skyPerfToggle = $<HTMLInputElement>("#setting-sky-perf-toggle");
  const skyOffsetSelect = $<HTMLSelectElement>("#setting-sky-offset-select");
  if (skyBgToggle) skyBgToggle.checked = skyBackgroundService.getIsEnabled();
  const skyCloudsToggle = $<HTMLInputElement>("#setting-sky-clouds-toggle");
  if (skyCloudsToggle) skyCloudsToggle.checked = skyBackgroundService.getIsCloudsEnabled();
  if (skyPerfToggle) skyPerfToggle.checked = skyBackgroundService.getIsPerfMode();
  if (skyOffsetSelect) skyOffsetSelect.value = String(skyBackgroundService.getTimeOffset());

  if (statusBadge) {
    statusBadge.textContent = "브라우저 저장";
    statusBadge.className = "profile-stock-status-badge status-ok";
  }
}

function initProfileModal(): void {
  // 약관 동의 해제 버튼 리스너
  $("#profile-btn-revoke-terms")?.addEventListener("click", async () => {
    if (!window.confirm("정말 이용약관 및 개인정보 처리방침 동의를 해제하시겠습니까?\n해제 시 서비스 이용이 즉시 제한되며, 다시 동의해야 이용할 수 있습니다.")) {
      return;
    }
    await setTermsAgreement(false, false);
    updateProfileTermsUI();
    closeProfileModal();
    const termsModal = $("#terms-modal");
    termsModal?.classList.remove("hidden");
    const checkAll = $<HTMLInputElement>("#terms-check-all");
    const checkService = $<HTMLInputElement>("#terms-check-service");
    const checkPrivacy = $<HTMLInputElement>("#terms-check-privacy");
    const submitBtn = $<HTMLButtonElement>("#terms-agree-submit");
    if (checkAll) checkAll.checked = false;
    if (checkService) checkService.checked = false;
    if (checkPrivacy) checkPrivacy.checked = false;
    if (submitBtn) submitBtn.disabled = true;
    showToast("약관 동의가 해제되었습니다.");
  });

  const modal = $("#profile-modal");
  const closeBtn = $("#profile-modal-close");
  const form = $<HTMLFormElement>("#profile-stock-form");

  const ticker1Input = $<HTMLInputElement>("#profile-stock-ticker-1");
  const ticker2Input = $<HTMLInputElement>("#profile-stock-ticker-2");
  const ticker3Input = $<HTMLInputElement>("#profile-stock-ticker-3");

  closeBtn?.addEventListener("click", closeProfileModal);
  modal?.addEventListener("click", (e) => {
    if (e.target === modal) closeProfileModal();
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

  // 1-1. 화면 효과 및 저사양 성능 모드 스위치 이벤트
  const skyBgToggle = $<HTMLInputElement>("#setting-sky-bg-toggle");
  const skyPerfToggle = $<HTMLInputElement>("#setting-sky-perf-toggle");

  const skyCloudsToggle = $<HTMLInputElement>("#setting-sky-clouds-toggle");
  skyCloudsToggle?.addEventListener("change", () => {
    const isChecked = skyCloudsToggle.checked;
    skyBackgroundService.toggleClouds(isChecked);
    showToast(
      isChecked
        ? "실시간 기상 구름 효과가 켜졌습니다."
        : "실시간 기상 구름 효과가 꺼졌습니다."
    );
  });

  skyBgToggle?.addEventListener("change", () => {
    const isChecked = skyBgToggle.checked;
    skyBackgroundService.toggle(isChecked);
    showToast(
      isChecked
        ? "실시간 천체 하늘 배경이 켜졌습니다."
        : "천체 하늘 배경이 완전히 꺼졌습니다 (렌더링 루프 종료)."
    );
  });

  skyPerfToggle?.addEventListener("change", () => {
    const isChecked = skyPerfToggle.checked;
    skyBackgroundService.setPerfMode(isChecked);
    showToast(
      isChecked
        ? "저사양 성능 최적화 모드가 켜졌습니다."
        : "저사양 성능 모드가 꺼졌습니다."
    );
  });

  const skyOffsetSelect = $<HTMLSelectElement>("#setting-sky-offset-select");
  skyOffsetSelect?.addEventListener("change", () => {
    const offset = Number(skyOffsetSelect.value);
    skyBackgroundService.setTimeOffset(offset);
    showToast(
      offset === 0
        ? "실시간 로컬 시각(한국 기준)으로 동기화되었습니다."
        : `배경 시뮬레이션 시간대가 ${offset > 0 ? `+${offset}` : offset}시간으로 변경되었습니다.`
    );
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

  // 폼 제출 핸들러 (브라우저 캐시 저장)
  form?.addEventListener("submit", (e) => {
    e.preventDefault();

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

    if (!nameVal || !gradeVal || !classVal) {
      showToast("이름, 학년, 반을 입력해주세요.");
      return;
    }

    // 1. 이름 저장
    setSavedName(nameVal);

    // 2. 학년/반/번호 브라우저 캐시 저장 및 상단 바 텍스트 배지 동기화
    setSavedClass({
      g: String(gradeVal) as GradeNumber,
      c: String(classVal) as ClassNumber,
    });
    setSavedStudentNum(numVal > 0 ? numVal : null);
    updateTopClassBadge();

    // 3. 브라우저 캐시에 티커 동기화 (티커가 입력된 경우)
    if (t1 || t2 || t3) {
      const newTickers: TickerConfigItem[] = [
        { name: t1 || "코스피", symbol: t1 || "KOSPI", code: t1 || "KOSPI", unit: "pt" },
        { name: t2 || "나스닥", symbol: t2 || "NASDAQ", code: t2 || "NAS@IXIC", unit: "pt" },
        { name: t3 || "원/달러", symbol: t3 || "USD/KRW", code: t3 || "FX_USDKRW", unit: "원" },
      ];
      setSavedTickers(newTickers);
    }

    // 4. 화면 및 UI 즉시 갱신
    updateAuthUI();
    renderActiveView();

    const statusBadge = $("#profile-stock-status-badge");
    if (statusBadge) {
      statusBadge.textContent = `저장 완료 (${new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })})`;
      statusBadge.className = "profile-stock-status-badge status-ok";
    }

    showToast("설정이 브라우저에 저장되었습니다!");
  });
}


export function updateAuthUI(): void {
  const savedName = getSavedName() || "학생";
  const initial = savedName.trim()[0]?.toUpperCase() || "U";
  const navContainer = document.getElementById("nav-auth-container");
  const drawerContainer = document.getElementById("drawer-auth-container");
  const mobToggle = document.getElementById("mobile-profile-toggle");

  // 모바일 헤더 좌측 프로필 아이콘 업데이트
  if (mobToggle) {
    mobToggle.innerHTML = `
      <span class="user-avatar-fallback" style="width: 24px; height: 24px; border-radius: 50%; background: var(--color-black); color: var(--color-paper); display: inline-flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; font-family: var(--font-mono); flex-shrink: 0;">
        ${esc(initial)}
      </span>
    `;
  }

  // 데스크탑 네비게이션
  if (navContainer) {
    navContainer.innerHTML = `
      <button type="button" class="btn-nav-profile" id="btn-nav-profile" title="프로필 및 설정 열기">
        <span class="user-avatar-fallback" style="width: 22px; height: 22px; border-radius: 50%; background: var(--color-black); color: var(--color-paper); display: inline-flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 700; font-family: var(--font-mono); flex-shrink: 0;">
          ${esc(initial)}
        </span>
        <span class="btn-nav-profile-name">${esc(savedName)}</span>
      </button>
    `;
    $("#btn-nav-profile")?.addEventListener("click", () => openProfileModal());
  }

  // 모바일 드로어
  if (drawerContainer) {
    drawerContainer.innerHTML = `
      <div class="drawer-auth-user-card" id="drawer-user-card" role="button" tabindex="0" title="프로필 및 티커 설정">
        <div class="drawer-auth-user-info">
          <div class="user-name" style="display: flex; align-items: center; gap: 6px;">
            <span class="user-avatar-fallback" style="width: 20px; height: 20px; border-radius: 50%; background: var(--color-black); color: var(--color-paper); display: inline-flex; align-items: center; justify-content: center; font-size: 9.5px; font-weight: 700; font-family: var(--font-mono); flex-shrink: 0;">
              ${esc(initial)}
            </span>
            <strong>${esc(savedName)}</strong>
          </div>
          <div class="user-email">브라우저 로컬 저장 모드</div>
        </div>
        <span class="drawer-profile-arrow" style="display: inline-flex; align-items: center; gap: 4px;">설정 <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square"><path d="M5 12h14"></path><path d="m12 5 7 7-7 7"></path></svg></span>
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
  }
}

export function closeMobileDrawer(): void {
  const mobileDrawer = $("#mobile-drawer");
  mobileDrawer?.classList.add("hidden");
  document.body.style.overflow = "";
}

function initNavigation(): void {
  // 브랜드 서비스 배지 (cnsh.life) 클릭 시 메인 탭 전환
  document.querySelectorAll<HTMLElement>(".brand-community-badge").forEach((badge) => {
    badge.addEventListener("click", (e) => {
      e.preventDefault();
      closeDesktopDropdowns();
      switchTab("메인");
    });
  });

  // 모바일 헤더 프로필/설정 버튼
  $("#mobile-profile-toggle")?.addEventListener("click", () => {
    openProfileModal();
  });

  // 데스크탑 탭 클릭
  document.querySelectorAll<HTMLButtonElement>(".desktop-nav [data-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.tab as TabName;
      if (tab) {
        closeDesktopDropdowns();
        switchTab(tab);
      }
    });
  });

  const desktopDropdowns = document.querySelectorAll<HTMLElement>(".nav-dropdown");
  const dropdownMenus = new Map<HTMLElement, HTMLElement>();
  desktopDropdowns.forEach((dropdown) => {
    const menu = dropdown.querySelector<HTMLElement>(".nav-dropdown-menu");
    if (menu) dropdownMenus.set(dropdown, menu);
  });

  const closeDesktopDropdowns = () => {
    desktopDropdowns.forEach((dropdown) => {
      dropdown.classList.remove("is-open");
      dropdown.querySelector<HTMLButtonElement>(".nav-dropdown-trigger")?.setAttribute("aria-expanded", "false");
      const menu = dropdownMenus.get(dropdown);
      menu?.classList.remove("is-open");
      if (menu?.classList.contains("is-portaled")) {
        menu.classList.remove("is-portaled");
        menu.style.removeProperty("top");
        menu.style.removeProperty("left");
        dropdown.append(menu);
      }
    });
  };

  desktopDropdowns.forEach((dropdown) => {
    const trigger = dropdown.querySelector<HTMLButtonElement>(".nav-dropdown-trigger");
    const menu = dropdownMenus.get(dropdown);
    menu?.querySelectorAll<HTMLAnchorElement>("a").forEach((link) => {
      link.addEventListener("click", closeDesktopDropdowns);
    });
    trigger?.addEventListener("click", () => {
      const willOpen = !dropdown.classList.contains("is-open");
      closeDesktopDropdowns();
      dropdown.classList.toggle("is-open", willOpen);
      trigger.setAttribute("aria-expanded", String(willOpen));
      if (willOpen && menu) {
        menu.classList.add("is-open");
        if (document.body.classList.contains("sky-bg-active")) {
          const rect = dropdown.getBoundingClientRect();
          menu.classList.add("is-portaled");
          document.body.append(menu);
          menu.style.top = `${rect.bottom - 8}px`;
          menu.style.left = `${rect.left}px`;
        }
      }
    });
  });

  document.addEventListener("click", (event) => {
    const target = event.target;
    const clickedDropdown = target instanceof Node && (
      Array.from(desktopDropdowns).some((dropdown) => dropdown.contains(target)) ||
      Array.from(dropdownMenus.values()).some((menu) => menu.contains(target))
    );
    if (!clickedDropdown) {
      closeDesktopDropdowns();
    }
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
      closeDesktopDropdowns();
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
    if (["메인", "시간표", "방과후", "급식", "공지", "타이머", "금융 지표", "브랜드"].includes(decoded)) {
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

function preventAccidentalZoom(): void {

  // 1. 트랙패드 핀치 줌 & 마우스 휠 줌(Ctrl+Wheel) 차단
  window.addEventListener(
    "wheel",
    (e) => {
      if (e.ctrlKey) {
        e.preventDefault();
      }
    },
    { passive: false }
  );

  // 2. 모바일 멀티 터치 핀치 줌 차단
  window.addEventListener(
    "touchstart",
    (e) => {
      if (e.touches.length > 1) {
        e.preventDefault();
      }
    },
    { passive: false }
  );

  // 3. iOS Safari 제스처 줌 차단
  document.addEventListener(
    "gesturestart",
    (e) => {
      e.preventDefault();
    },
    { passive: false }
  );
  document.addEventListener(
    "gesturechange",
    (e) => {
      e.preventDefault();
    },
    { passive: false }
  );
  document.addEventListener(
    "gestureend",
    (e) => {
      e.preventDefault();
    },
    { passive: false }
  );

  // 4. 모바일 더블 탭 확대 방지
  let lastTouchEnd = 0;
  document.addEventListener(
    "touchend",
    (e) => {
      const now = Date.now();
      if (now - lastTouchEnd <= 300) {
        e.preventDefault();
      }
      lastTouchEnd = now;
    },
    { passive: false }
  );

  // 5. 키보드 줌 단축키 차단 (Ctrl + +, Ctrl + -, Ctrl + 0)
  window.addEventListener("keydown", (e) => {
    if (
      e.ctrlKey &&
      (e.key === "+" || e.key === "-" || e.key === "=" || e.key === "0")
    ) {
      e.preventDefault();
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  preventAccidentalZoom();
  startWeatherAutoRefresh();

  const skyContainer = document.getElementById("sky-background");
  skyBackgroundService.setSuppressed(window.location.hash === "#brand" || window.location.pathname.endsWith("/brand") || window.location.pathname.endsWith("/brand.html"));
  skyBackgroundService.init(skyContainer);

  initDateDisplay();
  initTopClassBadge();
  initTermsModal();
  initWelcomeModal();
  initNameChangeModal();
  initProfileModal();

  updateAuthUI();
  initNavigation();
  handleUrlRoute();
});
