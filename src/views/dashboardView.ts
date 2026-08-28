import { Chart, registerables } from "chart.js";
Chart.register(...registerables);

import { DAYS, DEFAULT_TIMETABLE } from "../constants/timetable";
import { getRoutine } from "../constants/routines";
import { fetchAfterschoolData } from "../services/afterschoolService";
import { fetchCurrentWeather } from "../services/weatherService";
import { fetchDailyMeal } from "../services/mealService";
import { fetchNotices } from "../services/noticeService";
import { fetchMarketData } from "../services/marketService";
import { esc } from "../utils/escape";
import { formatDateKey, toMinutes } from "../utils/time";
import { $ } from "../utils/dom";
import { getSavedClass } from "../utils/storage";
import { DayOfWeek } from "../types/timetable";
import { TickerConfigItem } from "../types/market";

const DASH_MARKET_ITEMS: TickerConfigItem[] = [
  { name: "코스피", symbol: "KOSPI", code: "KOSPI", unit: "pt" },
  { name: "나스닥", symbol: "NASDAQ", code: "NAS@IXIC", unit: "pt" },
  { name: "원/달러 환율", symbol: "USD/KRW", code: "FX_USDKRW", unit: "원" }
];

let marketCharts: Record<string, Chart> = {};
const TIMEOUT_SEC = 30; // 30초 쿨다운
let cooldownTimer: number | null = null;
let remainingSeconds = 0;

export async function renderDashboard(
  onNavigateTab: (tab: string) => void,
  onOpenNoticeDetail: (index: number) => void
): Promise<void> {
  const now = new Date();
  const { g, c } = getSavedClass();
  const dayIndex = now.getDay() - 1;
  const currentDayOfWeek: DayOfWeek | null = dayIndex >= 0 && dayIndex < 5 ? DAYS[dayIndex] : null;
  const today = currentDayOfWeek ? DEFAULT_TIMETABLE[g][c][currentDayOfWeek] : [];

  const isAfterMidnightRoutine = now.getHours() === 0 && now.getMinutes() < 30;
  const minutes =
    now.getHours() * 60 +
    now.getMinutes() +
    (isAfterMidnightRoutine ? 24 * 60 : 0);
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

  const remaining = Math.max(0, toMinutes(active[1]) - minutes);
  const next = items[items.indexOf(active) + 1];
  const duration = Math.max(1, toMinutes(active[1]) - toMinutes(active[0]));
  const progress = Math.min(
    100,
    Math.max(3, ((minutes - toMinutes(active[0])) / duration) * 100)
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

  $("#content").innerHTML = `
    <section class="dashboard">
      <article class="now-card">
        <div class="now-top">
          <span><i class="now-dot"></i>지금 ${activityType}</span>
          <b>${remaining ? `종료까지 ${remaining}분` : "진행 중"}</b>
        </div>
        <p>${active[2]} · ${active[0]}–${active[1]}</p>
        <h2>${esc(activityName)}</h2>
        <small>${g}학년 ${c}반</small>
        <div class="routine-progress"><span style="width:${progress}%"></span></div>
        <div class="now-next">
          ${next ? `다음 일과 <strong>${next[2]} · ${next[0]}</strong>` : "오늘 일과가 끝났습니다."}
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

      <!-- 오늘 시간표 아래 3개 금융 지표 카드 섹션 -->
      <section class="dash-market-section">
        <div class="market-section-head">
          <div>
            <span class="eyebrow-plain">asterisk* Finance Info</span>
            <h3>글로벌 금융 시장 지표</h3>
          </div>
          <div>
            <button class="market-refresh-btn" id="market-refresh-btn">새로고침</button>
          </div>
        </div>

        <!-- 모바일 전용 1개씩 보기 세그먼트 탭 -->
        <div class="market-mobile-tabs">
          ${DASH_MARKET_ITEMS.map(
            (item, idx) => `
            <button class="market-mob-tab ${idx === 0 ? "active" : ""}" data-target="market-card-${item.code.replace(/[^a-zA-Z0-9]/g, '_')}">
              ${item.symbol}
            </button>
          `
          ).join("")}
        </div>

        <div class="market-cards-grid">
          ${DASH_MARKET_ITEMS.map(
            (item, idx) => `
            <article class="market-card ${idx === 0 ? "mob-active" : ""}" id="market-card-${item.code.replace(/[^a-zA-Z0-9]/g, '_')}">
              <div>
                <div class="market-card-header">
                  <div class="market-title-wrap">
                    <span class="market-series-name">${item.symbol}</span>
                    <h4 class="market-card-title">${item.name}</h4>
                  </div>
                </div>

                <div class="market-rate-box">
                  <span class="market-current-rate" id="rate-val-${item.code.replace(/[^a-zA-Z0-9]/g, '_')}">로딩 중...</span>
                  <div class="market-diff-box">
                    <span class="market-diff-rate" id="rate-diff-${item.code.replace(/[^a-zA-Z0-9]/g, '_')}"></span>
                    <span class="market-date-label" id="rate-date-${item.code.replace(/[^a-zA-Z0-9]/g, '_')}"></span>
                  </div>
                </div>

                <div class="market-chart-container">
                  <canvas id="chart-${item.code.replace(/[^a-zA-Z0-9]/g, '_')}"></canvas>
                </div>
              </div>

              <div class="market-card-footer">
                <span id="rate-fetch-${item.code.replace(/[^a-zA-Z0-9]/g, '_')}">LAST FETCH -</span>
                <span>Intraday 1M</span>
              </div>
            </article>
          `
          ).join("")}
        </div>
      </section>
    </section>`;

  $("#dash-meal-btn")?.addEventListener("click", () => onNavigateTab("급식"));
  $("#dash-timetable-btn")?.addEventListener("click", () => onNavigateTab("시간표"));
  $("#market-refresh-btn")?.addEventListener("click", () => handleMarketManualRefresh());

  // 모바일 시장 지표 1개씩 전환 탭 이벤트
  document.querySelectorAll<HTMLButtonElement>(".market-mob-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll<HTMLButtonElement>(".market-mob-tab").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const targetId = btn.dataset.target;
      document.querySelectorAll<HTMLElement>(".market-card").forEach((card) => {
        card.classList.toggle("mob-active", card.id === targetId);
      });
    });
  });

  loadDashboardWeather();
  loadDashboardMeal(now);
  loadDashboardNotices(onNavigateTab, onOpenNoticeDetail);

  // 최초 로드 및 30초 쿨다운 시작
  loadAllMarketCards();
  startMarketCooldown();
}

async function handleMarketManualRefresh(): Promise<void> {
  if (remainingSeconds > 0) return;
  const btn = document.getElementById("market-refresh-btn") as HTMLButtonElement | null;
  if (btn) {
    btn.disabled = true;
    btn.textContent = "불러오는 중...";
  }
  await loadAllMarketCards();
  startMarketCooldown();
}

function startMarketCooldown(): void {
  const btn = document.getElementById("market-refresh-btn") as HTMLButtonElement | null;
  if (cooldownTimer) clearInterval(cooldownTimer);

  remainingSeconds = TIMEOUT_SEC;
  if (btn) {
    btn.disabled = true;
    btn.textContent = `새로고침 (${remainingSeconds}s)`;
  }

  cooldownTimer = window.setInterval(() => {
    remainingSeconds -= 1;
    const currentBtn = document.getElementById("market-refresh-btn") as HTMLButtonElement | null;
    if (remainingSeconds <= 0) {
      if (cooldownTimer) clearInterval(cooldownTimer);
      cooldownTimer = null;
      if (currentBtn) {
        currentBtn.disabled = false;
        currentBtn.textContent = "새로고침";
      }
    } else {
      if (currentBtn) {
        currentBtn.textContent = `새로고침 (${remainingSeconds}s)`;
      }
    }
  }, 1000);
}

async function loadAllMarketCards(): Promise<void> {
  for (const item of DASH_MARKET_ITEMS) {
    loadSingleMarketCard(item);
  }
}

async function loadSingleMarketCard(item: TickerConfigItem): Promise<void> {
  const safeId = item.code.replace(/[^a-zA-Z0-9]/g, "_");
  const rateValEl = document.getElementById(`rate-val-${safeId}`);
  const rateDiffEl = document.getElementById(`rate-diff-${safeId}`);
  const rateDateEl = document.getElementById(`rate-date-${safeId}`);
  const rateFetchEl = document.getElementById(`rate-fetch-${safeId}`);
  const canvas = document.getElementById(`chart-${safeId}`) as HTMLCanvasElement | null;

  if (!rateValEl || !canvas) return;

  try {
    const json = await fetchMarketData(item.code);
    if (!json.rows || json.rows.length === 0) {
      rateValEl.textContent = "데이터 없음";
      if (rateDiffEl) rateDiffEl.textContent = "";
      return;
    }

    const rows = json.rows;
    const prevClose = json.prevClose;
    const latest = rows[rows.length - 1];

    // 1. 현재가 표시
    const valFormatted = latest.value.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    rateValEl.innerHTML = `${valFormatted}<small>${item.unit}</small>`;

    // 2. 전일 종가 대비 등락 계산
    if (rateDiffEl && prevClose !== undefined && prevClose !== null && prevClose > 0) {
      const diff = latest.value - prevClose;
      const pct = (diff / prevClose) * 100;
      const absDiff = Math.abs(diff).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
      const absPct = Math.abs(pct).toFixed(2);

      let sign = "-";
      let className = "diff-even";
      let plusMinus = "";

      if (diff > 0) {
        sign = "▲";
        className = "diff-up";
        plusMinus = "+";
      } else if (diff < 0) {
        sign = "▼";
        className = "diff-down";
        plusMinus = "-";
      }

      rateDiffEl.textContent = `${sign} ${absDiff} (${plusMinus}${absPct}%)`;
      rateDiffEl.className = `market-diff-rate ${className}`;
    }

    // 3. 시간 레이블 및 갱신 시간
    if (rateDateEl && latest.datetime) {
      const dt = latest.datetime;
      const timeStr = dt.length >= 4 ? `${dt.slice(0, 2)}:${dt.slice(2, 4)}` : dt;
      rateDateEl.textContent = `(${timeStr} 기준)`;
    }

    if (rateFetchEl) {
      const fetchTime = new Date().toLocaleTimeString("ko-KR", { hour12: false });
      rateFetchEl.textContent = `FETCH ${fetchTime}`;
    }

    // 4. 차트 렌더링
    const labels = rows.map((r) => {
      const t = r.datetime;
      return t.length >= 4 ? `${t.slice(0, 2)}:${t.slice(2, 4)}` : t;
    });
    const values = rows.map((r) => r.value);

    renderCardChart(safeId, canvas, labels, values, item);
  } catch (err) {
    console.warn(`Failed to load market card for ${item.name}:`, err);
    if (rateValEl) rateValEl.textContent = "조회 실패";
  }
}

function renderCardChart(
  safeId: string,
  canvas: HTMLCanvasElement,
  labels: string[],
  values: number[],
  item: TickerConfigItem
): void {
  if (marketCharts[safeId]) {
    marketCharts[safeId].destroy();
  }

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  marketCharts[safeId] = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          data: values,
          borderColor: "#000000",
          backgroundColor: "rgba(0, 0, 0, 0.05)",
          borderWidth: 1.5,
          fill: true,
          tension: 0.1,
          pointRadius: 0,
          pointHoverRadius: 4,
          pointHoverBackgroundColor: "#000000",
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          mode: "index",
          intersect: false,
          callbacks: {
            label: (ctx) => `${(ctx.parsed.y ?? 0).toLocaleString()} ${item.unit}`,
          },
        },
      },
      scales: {
        x: {
          grid: { color: "#D1D1D6" },
          ticks: {
            color: "#48484A",
            font: { family: "Asta Sans, Pretendard, monospace", size: 9 },
            maxTicksLimit: 6,
          },
        },
        y: {
          grid: { color: "#D1D1D6" },
          ticks: {
            color: "#48484A",
            font: { family: "Asta Sans, Pretendard, monospace", size: 9 },
            callback: (v) => `${Number(v).toLocaleString()}`,
          },
        },
      },
    },
  });
}

async function loadDashboardWeather(): Promise<void> {
  try {
    const data = await fetchCurrentWeather();
    const weatherCard = $("#weather-card");
    if (!weatherCard) return;
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
