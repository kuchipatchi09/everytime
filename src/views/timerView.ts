import { AmbientSoundType, TimerPhase, TimerPreset, TimerPresetId } from "../types/timer";
import { ambientSound } from "../services/ambientSoundService";
import {
  addFocusSeconds,
  formatTimeFormatted,
  getSavedCustomMinutes,
  getTodayFocusSeconds,
  resetTodayFocusTime,
  setSavedCustomMinutes,
} from "../utils/timerStorage";
import { $, showToast } from "../utils/dom";
import { esc } from "../utils/escape";

export const PRESETS: Record<TimerPresetId, TimerPreset> = {
  pomodoro: {
    id: "pomodoro",
    name: "뽀모도로",
    focusMinutes: 25,
    breakMinutes: 5,
    longBreakMinutes: 15,
  },
  standard: {
    id: "표준 면학" as any, // ID matching below
    name: "표준 면학",
    focusMinutes: 50,
    breakMinutes: 10,
    longBreakMinutes: 20,
  },
  custom: {
    id: "custom",
    name: "사용자 지정",
    focusMinutes: 45,
    breakMinutes: 10,
    longBreakMinutes: 15,
  },
  stopwatch: {
    id: "stopwatch",
    name: "스톱워치",
    focusMinutes: 0,
    breakMinutes: 0,
    longBreakMinutes: 0,
    isStopwatch: true,
  },
};
// fix standard id
PRESETS.standard.id = "standard";

export const PRESET_ORDER: TimerPresetId[] = ["pomodoro", "standard", "custom", "stopwatch"];

// Global Timer State (메모리에 유지되어 탭 이동 후에도 타이머가 정상 작동)
let activePresetId: TimerPresetId = "pomodoro";
let currentPhase: TimerPhase = "focus";
let remainingSeconds = PRESETS.pomodoro.focusMinutes * 60;
let totalTargetSeconds = PRESETS.pomodoro.focusMinutes * 60;
let elapsedStopwatchSeconds = 0;
let isRunning = false;
let timerInterval: number | null = null;
let pomodoroRound = 1;
let isZenMode = false;

export function renderTimer(): void {
  // custom 분 불러오기
  PRESETS.custom.focusMinutes = getSavedCustomMinutes();
  if (activePresetId === "custom" && !isRunning && currentPhase === "focus") {
    totalTargetSeconds = PRESETS.custom.focusMinutes * 60;
    if (remainingSeconds > totalTargetSeconds || remainingSeconds === 0) {
      remainingSeconds = totalTargetSeconds;
    }
  }

  const content = $("#content");
  if (!content) return;

  const isStopwatch = activePresetId === "stopwatch";

  content.innerHTML = `
    <section class="timer-container">
      <!-- 상단 모드 선택 탭 (부가설명 없이 깔끔한 버튼) -->
      <div class="timer-modes-bar">
        ${PRESET_ORDER.map((key) => {
          const p = PRESETS[key];
          const isActive = activePresetId === key;
          return `
            <button class="timer-mode-btn ${isActive ? "active" : ""}" data-preset="${p.id}">
              <span class="mode-name">${esc(p.name)}</span>
            </button>
          `;
        }).join("")}
      </div>

      <!-- 메인 타이머 그리드 -->
      <div class="timer-main-grid">
        <article class="panel timer-display-card ${isZenMode ? "zen-mode" : ""}" id="timer-display-card">
          <!-- 상단 헤더: 몰입 모드가 아닐 때만 표시 -->
          <div class="timer-card-top" id="timer-card-top">
            <span class="eyebrow">${isStopwatch ? "STOPWATCH" : "FOCUS TIMER"}</span>
            <div class="timer-phase-pill ${currentPhase}">
              <span class="phase-indicator-dot"></span>
              <span id="timer-phase-label">${getPhaseLabel(isStopwatch, currentPhase, pomodoroRound)}</span>
            </div>
          </div>

          <!-- 커스텀 시간 변경 인풋 (사용자 지정 모드일 때만 표시) -->
          <div class="custom-time-config ${activePresetId === "custom" && !isRunning ? "" : "hidden"}" id="custom-time-config">
            <label for="custom-min-input">집중 시간(분):</label>
            <input type="number" id="custom-min-input" min="1" max="300" value="${PRESETS.custom.focusMinutes}" />
            <button class="secondary btn-sm" id="btn-apply-custom">적용</button>
          </div>

          <!-- 거대한 디지털 시계 디스플레이 -->
          <div class="timer-digits-wrap">
            <div class="timer-digits" id="timer-digits">
              ${formatDigitalDisplay(isStopwatch ? elapsedStopwatchSeconds : remainingSeconds)}
            </div>
            
            <!-- 프로그레스 바 -->
            <div class="timer-progress-track">
              <div class="timer-progress-fill" id="timer-progress-fill" style="width: ${calculateProgress()}%"></div>
            </div>
            <div class="timer-progress-info" id="timer-progress-info">
              ${isStopwatch ? "누적 측정 중" : `진행률 ${Math.round(calculateProgress())}%`}
            </div>
          </div>

          <!-- 컨트롤 버튼군 -->
          <div class="timer-actions">
            <button class="primary timer-btn-main" id="btn-timer-toggle">
              ${isRunning ? "일시정지" : "시작"}
            </button>
            <button class="secondary timer-btn-sub" id="btn-timer-reset" title="초기화">
              리셋
            </button>
            ${
              !isStopwatch
                ? `<button class="secondary timer-btn-sub" id="btn-timer-skip" title="다음 단계로 건너뛰기">건너뛰기 ➔</button>`
                : ""
            }
            <button class="secondary timer-btn-sub zen-toggle-btn" id="btn-timer-zen" title="몰입 모드(전체화면)">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
              </svg>
              <span>몰입 모드</span>
            </button>
          </div>

          <!-- 몰입 모드 전용 닫기 버튼 (헤더와 겹치지 않게 독립 배치) -->
          <button class="zen-close-btn ${isZenMode ? "" : "hidden"}" id="btn-zen-close" aria-label="몰입 모드 종료">
            ✕ 몰입 종료 (ESC)
          </button>
        </article>

        <!-- 사이드바: 앰비언스 사운드 & 오늘 통계 -->
        <div class="timer-sidebar">
          <!-- 앰비언스 사운드 카드 (이모티콘 제거) -->
          <article class="panel ambient-sound-card">
            <div class="panelhead">
              <span class="eyebrow">AMBIENT SOUND</span>
              <h3>집중 앰비언스</h3>
            </div>
            <p class="ambient-desc">집중력을 높여주는 내장 백색소음 사운드입니다.</p>
            
            <div class="ambient-sound-buttons">
              <button class="ambient-btn ${ambientSound.getCurrentType() === "none" ? "active" : ""}" data-sound="none">
                끄기
              </button>
              <button class="ambient-btn ${ambientSound.getCurrentType() === "rain" ? "active" : ""}" data-sound="rain">
                빗소리
              </button>
              <button class="ambient-btn ${ambientSound.getCurrentType() === "white" ? "active" : ""}" data-sound="white">
                백색소음
              </button>
              <button class="ambient-btn ${ambientSound.getCurrentType() === "brown" ? "active" : ""}" data-sound="brown">
                브라운 노이즈
              </button>
            </div>

            <div class="ambient-vol-control">
              <span class="vol-label">볼륨</span>
              <input type="range" id="ambient-vol-slider" min="0" max="100" value="${Math.round(ambientSound.getVolume() * 100)}" />
              <span class="vol-val" id="ambient-vol-val">${Math.round(ambientSound.getVolume() * 100)}%</span>
            </div>
          </article>

          <!-- 오늘의 집중 시간 통계 카드 -->
          <article class="panel timer-stats-card">
            <div class="panelhead" style="display: flex; justify-content: space-between; align-items: flex-start;">
              <div>
                <span class="eyebrow">TODAY'S RECORD</span>
                <h3>오늘의 자습 현황</h3>
              </div>
              <button class="secondary btn-sm" id="btn-reset-daily-time">초기화</button>
            </div>
            
            <div class="timer-stats-single">
              <span class="stat-label">오늘 총 순공 시간</span>
              <strong class="stat-value" id="stat-total-time">${formatTimeFormatted(getTodayFocusSeconds())}</strong>
            </div>
          </article>
        </div>
      </div>
    </section>
  `;

  bindTimerEvents();
}

function bindTimerEvents(): void {
  // 모드 변경 버튼
  document.querySelectorAll<HTMLButtonElement>(".timer-mode-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const presetId = btn.dataset.preset as TimerPresetId;
      if (!presetId || presetId === activePresetId) return;

      if (isRunning) {
        if (!confirm("진행 중인 타이머가 있습니다. 모드를 변경하시겠습니까?")) {
          return;
        }
        pauseTimer();
      }

      activePresetId = presetId;
      currentPhase = "focus";
      pomodoroRound = 1;
      elapsedStopwatchSeconds = 0;

      if (presetId === "stopwatch") {
        totalTargetSeconds = 0;
        remainingSeconds = 0;
      } else {
        const p = PRESETS[presetId];
        totalTargetSeconds = p.focusMinutes * 60;
        remainingSeconds = totalTargetSeconds;
      }

      renderTimer();
    });
  });

  // 커스텀 분 적용 버튼
  $("#btn-apply-custom")?.addEventListener("click", () => {
    const input = $<HTMLInputElement>("#custom-min-input");
    const min = parseInt(input.value, 10);
    if (!isNaN(min) && min >= 1 && min <= 300) {
      PRESETS.custom.focusMinutes = min;
      setSavedCustomMinutes(min);
      totalTargetSeconds = min * 60;
      remainingSeconds = totalTargetSeconds;
      showToast(`집중 시간이 ${min}분으로 설정되었습니다.`);
      updateTimerUI();
    }
  });

  // 시작 / 일시정지 버튼
  $("#btn-timer-toggle")?.addEventListener("click", () => {
    if (isRunning) {
      pauseTimer();
    } else {
      startTimer();
    }
  });

  // 리셋 버튼
  $("#btn-timer-reset")?.addEventListener("click", () => {
    resetTimer();
  });

  // 건너뛰기 버튼
  $("#btn-timer-skip")?.addEventListener("click", () => {
    if (confirm("현재 단계를 완료하고 다음 단계로 넘어가시겠습니까?")) {
      handlePhaseEnd(false);
    }
  });

  // 몰입 (Zen) 모드 토글
  $("#btn-timer-zen")?.addEventListener("click", () => {
    enterZenMode();
  });

  $("#btn-zen-close")?.addEventListener("click", () => {
    exitZenMode();
  });

  // 앰비언스 사운드 버튼들
  document.querySelectorAll<HTMLButtonElement>(".ambient-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const soundType = btn.dataset.sound as AmbientSoundType;
      if (!soundType) return;
      ambientSound.play(soundType);

      document.querySelectorAll<HTMLButtonElement>(".ambient-btn").forEach((b) => {
        b.classList.toggle("active", b.dataset.sound === soundType);
      });
    });
  });

  // 볼륨 슬라이더
  const volSlider = $<HTMLInputElement>("#ambient-vol-slider");
  volSlider?.addEventListener("input", () => {
    const val = parseInt(volSlider.value, 10);
    ambientSound.setVolume(val / 100);
    const volValEl = $("#ambient-vol-val");
    if (volValEl) volValEl.textContent = `${val}%`;
  });

  // 오늘 집중 시간 초기화
  $("#btn-reset-daily-time")?.addEventListener("click", () => {
    if (confirm("오늘의 누적 자습 시간을 초기화하시겠습니까?")) {
      resetTodayFocusTime();
      const statEl = $("#stat-total-time");
      if (statEl) statEl.textContent = formatTimeFormatted(0);
      showToast("오늘의 자습 시간이 초기화되었습니다.");
    }
  });

  // ESC 키로 Zen 모드 탈출
  window.removeEventListener("keydown", handleKeyDown);
  window.addEventListener("keydown", handleKeyDown);
}

function handleKeyDown(e: KeyboardEvent): void {
  if (e.key === "Escape" && isZenMode) {
    exitZenMode();
  }
}

function startTimer(): void {
  isRunning = true;

  if ("Notification" in window && Notification.permission === "default") {
    Notification.requestPermission();
  }

  if (timerInterval) clearInterval(timerInterval);

  timerInterval = window.setInterval(() => {
    if (activePresetId === "stopwatch") {
      elapsedStopwatchSeconds++;
      addFocusSeconds(1);
      updateTimerUI();
    } else {
      if (remainingSeconds > 0) {
        remainingSeconds--;
        if (currentPhase === "focus") {
          addFocusSeconds(1);
        }
        updateTimerUI();
      } else {
        handlePhaseEnd(true);
      }
    }
  }, 1000);

  updateTimerUI();
}

function pauseTimer(): void {
  isRunning = false;
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  updateTimerUI();
}

function resetTimer(): void {
  pauseTimer();
  elapsedStopwatchSeconds = 0;
  if (activePresetId === "stopwatch") {
    totalTargetSeconds = 0;
    remainingSeconds = 0;
  } else {
    const p = PRESETS[activePresetId];
    if (currentPhase === "focus") {
      totalTargetSeconds = p.focusMinutes * 60;
    } else if (currentPhase === "shortBreak") {
      totalTargetSeconds = p.breakMinutes * 60;
    } else {
      totalTargetSeconds = p.longBreakMinutes * 60;
    }
    remainingSeconds = totalTargetSeconds;
  }
  updateTimerUI();
}

function handlePhaseEnd(soundAlarm = true): void {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  isRunning = false;

  const currentPreset = PRESETS[activePresetId];

  if (soundAlarm) {
    ambientSound.playChime();
  }

  if (currentPhase === "focus") {
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification("asterisk* 자습 타이머", {
        body: `집중 세션(${currentPreset.focusMinutes}분)이 완료되었습니다. 휴식을 시작합니다.`,
        icon: "/favicon.svg",
      });
    }
    showToast(`집중 세션 완료! 휴식을 시작합니다.`);

    if (activePresetId === "pomodoro") {
      if (pomodoroRound >= 4) {
        currentPhase = "longBreak";
        pomodoroRound = 1;
        totalTargetSeconds = currentPreset.longBreakMinutes * 60;
      } else {
        currentPhase = "shortBreak";
        pomodoroRound++;
        totalTargetSeconds = currentPreset.breakMinutes * 60;
      }
    } else {
      currentPhase = "shortBreak";
      totalTargetSeconds = currentPreset.breakMinutes * 60;
    }
    remainingSeconds = totalTargetSeconds;
  } else {
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification("asterisk* 자습 타이머", {
        body: `휴식이 종료되었습니다. 새로운 집중 세션을 시작하세요.`,
        icon: "/favicon.svg",
      });
    }
    showToast(`휴식 종료! 다시 집중을 시작합니다.`);

    currentPhase = "focus";
    totalTargetSeconds = currentPreset.focusMinutes * 60;
    remainingSeconds = totalTargetSeconds;
  }

  renderTimer();
}

function calculateProgress(): number {
  if (activePresetId === "stopwatch") {
    return 100;
  }
  if (totalTargetSeconds <= 0) return 0;
  const elapsed = totalTargetSeconds - remainingSeconds;
  return Math.min(100, Math.max(0, (elapsed / totalTargetSeconds) * 100));
}

function formatDigitalDisplay(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;

  if (h > 0) {
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function getPhaseLabel(isStopwatch: boolean, phase: TimerPhase, round: number): string {
  if (isStopwatch) {
    return "스톱워치";
  }
  if (phase === "focus") {
    return activePresetId === "pomodoro" ? `집중 (${round}/4)` : "집중";
  }
  if (phase === "shortBreak") {
    return "짧은 휴식";
  }
  return "긴 휴식";
}

function updateTimerUI(): void {
  const digitsEl = $("#timer-digits");
  if (digitsEl) {
    digitsEl.textContent = formatDigitalDisplay(activePresetId === "stopwatch" ? elapsedStopwatchSeconds : remainingSeconds);
  }

  const fillEl = $("#timer-progress-fill");
  if (fillEl) {
    fillEl.style.width = `${calculateProgress()}%`;
  }

  const infoEl = $("#timer-progress-info");
  if (infoEl) {
    infoEl.textContent = activePresetId === "stopwatch" ? "누적 측정 중" : `진행률 ${Math.round(calculateProgress())}%`;
  }

  const toggleBtn = $("#btn-timer-toggle");
  if (toggleBtn) {
    toggleBtn.textContent = isRunning ? "일시정지" : "시작";
    toggleBtn.classList.toggle("running", isRunning);
  }

  const statEl = $("#stat-total-time");
  if (statEl) {
    statEl.textContent = formatTimeFormatted(getTodayFocusSeconds());
  }

  const timeStr = formatDigitalDisplay(activePresetId === "stopwatch" ? elapsedStopwatchSeconds : remainingSeconds);
  if (isRunning) {
    document.title = `(${timeStr}) asterisk* 자습 타이머`;
  } else {
    document.title = "asterisk";
  }
}

function enterZenMode(): void {
  isZenMode = true;
  const card = $("#timer-display-card");
  const zenClose = $("#btn-zen-close");
  const cardTop = $("#timer-card-top");

  if (card) card.classList.add("zen-mode");
  if (zenClose) zenClose.classList.remove("hidden");
  if (cardTop) cardTop.style.display = "none";
  document.body.classList.add("zen-active");
}

function exitZenMode(): void {
  isZenMode = false;
  const card = $("#timer-display-card");
  const zenClose = $("#btn-zen-close");
  const cardTop = $("#timer-card-top");

  if (card) card.classList.remove("zen-mode");
  if (zenClose) zenClose.classList.add("hidden");
  if (cardTop) cardTop.style.display = "";
  document.body.classList.remove("zen-active");
}
