import { DAYS, DEFAULT_TIMETABLE } from "../constants/timetable";
import { getRoutine } from "../constants/routines";
import { fetchAfterschoolData } from "../services/afterschoolService";
import { fetchCurrentWeather } from "../services/weatherService";
import { fetchDailyMeal } from "../services/mealService";
import { fetchNotices } from "../services/noticeService";
import { esc } from "../utils/escape";
import { formatDateKey, toMinutes } from "../utils/time";
import { $ } from "../utils/dom";
import { getSavedClass, getSavedName } from "../utils/storage";
import { DayOfWeek } from "../types/timetable";
import { getWeatherGreeting, setCachedWeatherCode } from "../constants/weatherGreetings";

let nowCardTicker: number | null = null;
let showYearEndTimer = false;


let isNowFullscreen = false;

export function exitNowFullscreen(): void {
  isNowFullscreen = false;
  document.body.classList.remove("now-fullscreen-active");

  if (document.fullscreenElement) {
    document.exitFullscreen?.().catch(() => {});
  }
}

export function enterNowFullscreen(): void {
  isNowFullscreen = true;
  document.body.classList.add("now-fullscreen-active");

  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen?.().catch(() => {});
  }
}


export function stopNowCardContinuousTicker(): void {
  if (nowCardTicker) {
    clearInterval(nowCardTicker);
    nowCardTicker = null;
  }
}

function startNowCardContinuousTicker(
  active: [string, string, string],
  onReload: () => void
): void {
  stopNowCardContinuousTicker();

  nowCardTicker = window.setInterval(() => {
    const remEl = document.getElementById("now-card-remaining");
    const percentEl = document.getElementById("now-card-percent");
    const barEl = document.getElementById("now-card-progress-bar");

    const fsClockEl = document.getElementById("now-fs-clock");
    const fsRemEl = document.getElementById("now-fs-remaining");
    const fsPercentEl = document.getElementById("now-fs-percent");
    const fsBarEl = document.getElementById("now-fs-progress-bar");

    if (!remEl && !percentEl && !barEl && !fsClockEl) {
      stopNowCardContinuousTicker();
      return;
    }

    const now = new Date();
    const isAfterMidnight = now.getHours() === 0 && now.getMinutes() < 30;
    const currentMs =
      (now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()) * 1000 +
      now.getMilliseconds() +
      (isAfterMidnight ? 24 * 3600 * 1000 : 0);

    const startMs = toMinutes(active[0]) * 60 * 1000;
    const endMs = toMinutes(active[1]) * 60 * 1000;
    const durationMs = Math.max(1, endMs - startMs);
    const remainingMs = endMs - currentMs;
    const elapsedMs = currentMs - startMs;

    // 만약 현재 교시 범위를 벗어나면 다음 교시로 대시보드 갱신
    if (!showYearEndTimer && (remainingMs <= 0 || currentMs < startMs)) {
      stopNowCardContinuousTicker();
      onReload();
      return;
    }

    const remainingMin = Math.ceil(remainingMs / 60000);
    const progress = Math.min(100, Math.max(0, (elapsedMs / durationMs) * 100));

    const h = String(now.getHours()).padStart(2, "0");
    const m = String(now.getMinutes()).padStart(2, "0");
    const s = String(now.getSeconds()).padStart(2, "0");
    const clockText = `${h}:${m}:${s}`;

    if (fsClockEl) fsClockEl.textContent = clockText;

    if (!showYearEndTimer) {
      if (remEl) remEl.textContent = `종료까지 ${remainingMin}분`;
      if (percentEl) percentEl.textContent = `${progress.toFixed(3)}%`;
      if (barEl) barEl.style.width = `${progress.toFixed(3)}%`;
      if (fsRemEl) fsRemEl.textContent = `종료까지 ${remainingMin}분`;
      if (fsPercentEl) fsPercentEl.textContent = `${progress.toFixed(3)}%`;
      if (fsBarEl) fsBarEl.style.width = `${progress.toFixed(3)}%`;
    }

    const theYear = new Date().getFullYear();
    const theTime = new Date(theYear + 1, 1-1, 1, 0, 0, 0);
    const oldTime = new Date(theYear, 3-1, 2, 0, 0, 0);
    const thisTime = new Date();
    const durationMS = theTime.getTime() - oldTime.getTime();
    const remainingMS = theTime.getTime() - thisTime.getTime();
    const remainingMin2 = Math.ceil(remainingMS / 60000);
    const progress2 = Math.min(
      100,
      Math.max(0, (1 - (remainingMS / durationMS)) * 100)
    );

    if (showYearEndTimer && remainingMS <= 0) {
      stopNowCardContinuousTicker();
      onReload();
      return;
    }

    if (showYearEndTimer) {
      if (remEl) remEl.textContent = `종료까지 ${remainingMin2}분`;
      if (percentEl) percentEl.textContent = `${progress2.toFixed(7)}%`;
      if (barEl) barEl.style.width = `${progress2.toFixed(7)}%`;
      if (fsRemEl) fsRemEl.textContent = `종료까지 ${remainingMin2}분`;
      if (fsPercentEl) fsPercentEl.textContent = `${progress2.toFixed(7)}%`;
      if (fsBarEl) fsBarEl.style.width = `${progress2.toFixed(7)}%`;
    }
  }, 50); // 50ms 주기 고정폭 셋째자리 정밀 틱
}



export async function renderDashboard(
  onNavigateTab: (tab: string) => void,
  onOpenNoticeDetail: (index: number) => void
): Promise<void> {
  stopNowCardContinuousTicker();
  const now = new Date();
  const { g, c } = getSavedClass();
  const dayIndex = now.getDay() - 1;
  const currentDayOfWeek: DayOfWeek | null = dayIndex >= 0 && dayIndex < 5 ? DAYS[dayIndex] : null;
  const today = currentDayOfWeek ? DEFAULT_TIMETABLE[g][c][currentDayOfWeek] : [];

  const isAfterMidnightRoutine = now.getHours() === 0 && now.getMinutes() < 30;
  const currentSec =
    now.getHours() * 3600 +
    now.getMinutes() * 60 +
    now.getSeconds() +
    (isAfterMidnightRoutine ? 24 * 3600 : 0);
  const minutes = currentSec / 60;

  const routineDay = isAfterMidnightRoutine
    ? (now.getDay() + 6) % 7
    : now.getDay();
  const items = getRoutine(routineDay);
  const active =
    items.find(
      (item) =>
        minutes >= toMinutes(item[0]) && minutes < toMinutes(item[1])
    ) || items[0];

  const period = /^(\d)교시/.exec(active[2]);
  const subject = period ? today[Number(period[1]) - 1] : "";
  let activityName = subject || active[2];
  let activityType = subject ? "수업" : "일과";

  if (active[2].startsWith("8교시")) {
    try {
      const schedules = await fetchAfterschoolData();
      const dateKey = formatDateKey(now);
      const afterschool =
        (schedules[g] as any)?.[dateKey]?.[c] ||
        (schedules[dateKey] as any)?.[c] ||
        null;
      if (afterschool) {
        activityName = afterschool[0];
        activityType = "방과후";
      }
    } catch (error) {
      console.error("방과후 과목 로딩 실패:", error);
    }
  }

  const startSec = toMinutes(active[0]) * 60;
  const endSec = toMinutes(active[1]) * 60;
  const durationSec = Math.max(1, endSec - startSec);
  const remainingSec = Math.max(0, endSec - currentSec);
  const remainingMin = Math.ceil(remainingSec / 60);

  const next = items[items.indexOf(active) + 1];
  const progress = Math.min(
    100,
    Math.max(0, ((currentSec - startSec) / durationSec) * 100)
  );
  const times = [
    "08:40",
    "09:40",
    "10:40",
    "11:40",
    now.getDay() === 3 ? "13:50" : "13:30",
    now.getDay() === 3 ? "14:40" : "14:30",
    "15:30",
  ];

  const theYear = new Date().getFullYear();
  const theTime = new Date(theYear + 1, 1-1, 1, 0, 0, 0);
  const oldTime = new Date(theYear, 3-1, 2, 0, 0, 0);
  const thisTime = new Date();
  const durationMS = theTime.getTime() - oldTime.getTime();
  const remainingMS = theTime.getTime() - thisTime.getTime();
  const remainingMin2 = Math.ceil(remainingMS / 60000);
  const progress2 = Math.min(
    100,
    Math.max(0, (1 - (remainingMS / durationMS)) * 100)
  );
  const isYearEndTimer = showYearEndTimer;

  $("#content").innerHTML = `
    <section class="dashboard">
      <!-- 전체화면 하단 진척도 & 실시간 텔레메트리 독 (클릭 시 전체화면 종료) -->
      <div class="now-fullscreen-dock" id="now-fullscreen-dock" role="button" tabindex="0" title="전체화면 종료 (클릭)">
        <div class="now-fs-header">
          <div class="now-fs-badge" id="now-fs-exit-badge" title="전체화면 종료 (클릭)">
            <i class="now-dot"></i>
            <span>${isYearEndTimer ? "학년 현황" : `지금 ${activityType}`}</span>
            <span class="now-fs-period-badge">${isYearEndTimer ? `${theYear}. 3. 2. – ${theYear}. 12. 31.` : `${active[2]} · ${active[0]}–${active[1]}`}</span>
          </div>
          <div class="now-fs-clock" id="now-fs-clock">--:--:--</div>
        </div>

        <div class="now-fs-body">
          <div class="now-fs-title-box">
            <h1 class="now-fs-subject">${isYearEndTimer ? `${g}학년` : esc(activityName)}</h1>
            <span class="now-fs-class">${g}학년 ${c}반</span>
          </div>
          <div class="now-fs-stats-box">
            <strong class="now-fs-remaining" id="now-fs-remaining">${isYearEndTimer ? `종료까지 ${remainingMin2}분` : remainingSec > 0 ? `종료까지 ${remainingMin}분` : "진행 중"}</strong>
            <span class="now-fs-percent" id="now-fs-percent">${isYearEndTimer ? `${progress2.toFixed(7)}%` : `${progress.toFixed(3)}%`}</span>
          </div>
        </div>

        <!-- 작은 진척도 바 -->
        <div class="now-fs-progress-track">
          <div class="now-fs-progress-fill" id="now-fs-progress-bar" style="width:${isYearEndTimer ? progress2.toFixed(7) : progress.toFixed(3)}%;"></div>
        </div>

        <div class="now-fs-footer">
          <span class="now-fs-next-label">
            ${isYearEndTimer ? (g === "3" ? "다음 <strong>???</strong>" : `다음 <strong>${parseInt(g) + 1}학년</strong>`) : (next ? `다음 일과 <strong>${next[2]} · ${next[0]}</strong>` : "오늘 일과가 끝났습니다.")}
          </span>
        </div>
      </div>


      <article class="now-card" id="now-card" role="button" tabindex="0" title="전체화면으로 보기 (클릭)">
        <div class="now-top">
          <span><i class="now-dot"></i>${isYearEndTimer ? "학년 현황" : `지금 ${activityType}`}</span>
          <div class="now-time-stat">
            <b id="now-card-remaining">${isYearEndTimer ? `종료까지 ${remainingMin2}분` : remainingSec > 0 ? `종료까지 ${remainingMin}분` : "진행 중"}</b>
            <span id="now-card-percent" class="now-card-percent">${isYearEndTimer ? `${progress2.toFixed(7)}%` : `${progress.toFixed(3)}%`}</span>
          </div>
        </div>
        <p>${isYearEndTimer ? `${theYear}. 3. 2. – ${theYear}. 12. 31.` : `${active[2]} · ${active[0]}–${active[1]}`}</p>
        <h2>${isYearEndTimer ? `${g}학년` : esc(activityName)}</h2>
        <small>${g}학년 ${c}반</small>
        <div class="routine-progress">
          <span id="now-card-progress-bar" style="width:${isYearEndTimer ? progress2.toFixed(7) : progress.toFixed(3)}%;"></span>
        </div>
        <div class="now-card-bottom-row">
          <div class="now-next">
            ${isYearEndTimer ? (g === "3" ? "다음 <strong>???</strong>" : `다음 <strong>${parseInt(g) + 1}학년</strong>`) : (next ? `다음 일과 <strong>${next[2]} · ${next[0]}</strong>` : "오늘 일과가 끝났습니다.")}
          </div>
          <button type="button" class="now-timer-toggle" id="now-timer-toggle-btn">${isYearEndTimer ? "일과 타이머로" : "종업 타이머로"}</button>
        </div>
      </article>
      
      <article class="dash-card weather-card" id="weather-card">
        <span class="eyebrow">LIVE WEATHER</span>
        <div class="weather-main"><strong>—°</strong></div>
        <h3>날씨 확인 중</h3><p>공주 기준 실시간 날씨</p>
      </article>

      <article class="dash-card meal-card" id="today-meal">
        <span class="eyebrow">TODAY'S MEAL</span>
        <h3>오늘의 급식</h3><p>급식 정보를 불러오는 중입니다.</p>
        <button class="dash-link" id="dash-meal-btn">주간 급식 보기 →</button>
      </article>

      <article class="dash-card notice-card" id="latest-notice">
        <span class="eyebrow">LATEST NOTICE</span><h3>최신 공지</h3>
        <p>공지를 불러오는 중입니다.</p>
      </article>

      <article class="dash-card today-schedule">
        <div class="dash-head">
          <div><span class="eyebrow">TODAY'S SCHEDULE</span><h3>오늘 시간표</h3></div>
          <button class="dash-link" id="dash-timetable-btn">전체 시간표 →</button>
        </div>
        <div class="today-lines">
          ${
            today.length
              ? today
                  .map(
                    (x: string, i: number) =>
                      `<p class="today-line ${period && Number(period[1]) === i + 1 ? "current" : ""}"><span>${i + 1}</span><time>${times[i]}</time><b>${esc(x)}</b></p>`
                  )
                  .join("")
              : "<p>오늘은 정규 수업이 없습니다.</p>"
          }
        </div>
      </article>

    </section>`;

  const nowCard = $("#now-card");
  nowCard?.addEventListener("click", () => enterNowFullscreen());
  const timerToggle = $("#now-timer-toggle-btn");
  timerToggle?.addEventListener("mouseenter", () => nowCard?.removeAttribute("title"));
  timerToggle?.addEventListener("mouseleave", () => nowCard?.setAttribute("title", "전체화면으로 보기 (클릭)"));
  timerToggle?.addEventListener("click", (event) => {
    event.stopPropagation();
    showYearEndTimer = !showYearEndTimer;
    void renderDashboard(onNavigateTab, onOpenNoticeDetail);
  });
  $("#now-fullscreen-dock")?.addEventListener("click", () => exitNowFullscreen());

  document.addEventListener("fullscreenchange", () => {
    if (!document.fullscreenElement && isNowFullscreen) {
      exitNowFullscreen();
    }
  });


  $("#dash-meal-btn")?.addEventListener("click", () => onNavigateTab("급식"));
  $("#dash-timetable-btn")?.addEventListener("click", () => onNavigateTab("시간표"));

  loadDashboardWeather();
  loadDashboardMeal(now);
  loadDashboardNotices(onNavigateTab, onOpenNoticeDetail);

  // 실시간 연속 갱신 타이커 가동 (초 단위 정밀 계산 & 진행바 부드러운 애니메이션)
  startNowCardContinuousTicker(active, () => renderDashboard(onNavigateTab, onOpenNoticeDetail));
}


async function loadDashboardWeather(): Promise<void> {
  try {
    const data = await fetchCurrentWeather();
    const weatherCard = $("#weather-card");
    if (!weatherCard) return;

    const weatherCode = data.weather[0]?.id;
    if (weatherCode) {
      setCachedWeatherCode(weatherCode);
      const wrap = $("#welcome-name-wrap");
      if (wrap) {
        const savedName = getSavedName() || "학생";
        wrap.textContent = getWeatherGreeting(weatherCode, savedName);
      }
    }

    weatherCard.innerHTML = `
      <span class="eyebrow">LIVE WEATHER</span>
      <div class="weather-main">
        <img src="https://openweathermap.org/img/wn/${data.weather[0].icon}@2x.png" alt="">
        <strong>${Math.round(data.main.temp)}°</strong>
      </div>
      <h3>${esc(data.weather[0].description)}</h3>
      <p>체감 ${Math.round(data.main.feels_like)}° · 습도 ${data.main.humidity}%</p>
      <small>Weather data © OpenWeather</small>`;
  } catch (error) {
    console.error("날씨 로딩 실패:", error);
    const weatherCard = $("#weather-card");
    if (weatherCard) {
      weatherCard.innerHTML =
        '<span class="eyebrow">LIVE WEATHER</span><h3>날씨를 불러오지 못했습니다.</h3><p>잠시 후 다시 확인해주세요.</p>';
    }
  }
}

async function loadDashboardMeal(now: Date): Promise<void> {
  const code = now.getHours() < 8 ? "1" : now.getHours() < 14 ? "2" : "3";
  const label = code === "1" ? "조식" : code === "2" ? "중식" : "석식";
  const mealCard = $("#today-meal");
  if (!mealCard) return;

  try {
    const menu = await fetchDailyMeal(now, code);
    mealCard.innerHTML = `
      <span class="eyebrow">TODAY'S MEAL</span><h3>오늘의 ${label}</h3>
      <p>${menu}</p><button class="dash-link" id="dash-meal-sub-btn">주간 급식 보기 →</button>`;
    $("#dash-meal-sub-btn")?.addEventListener("click", () => {
      const navBtn = document.querySelector<HTMLButtonElement>('nav button[data-tab="급식"]');
      navBtn?.click();
    });
  } catch {
    const p = mealCard.querySelector("p");
    if (p) p.textContent = "급식을 불러오지 못했습니다.";
  }
}

async function loadDashboardNotices(
  onNavigateTab: (tab: string) => void,
  onOpenNoticeDetail: (index: number) => void
): Promise<void> {
  const noticeCard = $("#latest-notice");
  if (!noticeCard) return;

  try {
    const posts = await fetchNotices();
    if (posts.length) {
      noticeCard.innerHTML =
        '<span class="eyebrow">LATEST NOTICE</span><h3>최신 공지</h3>' +
        posts
          .slice(0, 3)
          .map(
            (p, i) =>
              `<button class="dash-notice-item" data-index="${i}"><span>${esc(p.category || "공지")}</span><b>${esc(p.title)}</b><time>${p.createdAt ? new Date(p.createdAt).toLocaleDateString("ko-KR") : ""}</time></button>`
          )
          .join("");

      noticeCard.querySelectorAll<HTMLButtonElement>(".dash-notice-item").forEach((btn) => {
        btn.addEventListener("click", () => {
          const idx = Number(btn.dataset.index);
          onNavigateTab("공지");
          setTimeout(() => onOpenNoticeDetail(idx), 0);
        });
      });
    } else {
      noticeCard.innerHTML =
        '<span class="eyebrow">LATEST NOTICE</span><h3>최신 공지</h3><p>등록된 공지가 없습니다.</p>';
    }
  } catch {
    noticeCard.innerHTML =
      '<span class="eyebrow">LATEST NOTICE</span><h3>최신 공지</h3><p>공지를 불러오지 못했습니다.</p>';
  }
}
