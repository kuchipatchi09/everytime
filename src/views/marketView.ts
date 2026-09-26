import { Chart, registerables } from "chart.js";
import { fetchMarketData } from "../services/marketService";
import { esc } from "../utils/escape";
import { $ } from "../utils/dom";
import { getSavedTickers } from "../utils/storage";
import { TickerConfigItem } from "../types/market";

Chart.register(...registerables);

const TIMEOUT_SEC = 30;
let marketCharts: Record<string, Chart> = {};
let cooldownTimer: number | null = null;
let remainingSeconds = 0;

const safeIdFor = (item: TickerConfigItem): string => item.code.replace(/[^a-zA-Z0-9]/g, "_");

export function stopMarketView(): void {
  Object.values(marketCharts).forEach((chart) => {
    try {
      chart.destroy();
    } catch {}
  });
  marketCharts = {};

  if (cooldownTimer) {
    clearInterval(cooldownTimer);
    cooldownTimer = null;
  }
}

export function renderMarketView(): void {
  stopMarketView();
  const marketItems = getSavedTickers();

  $("#content").innerHTML = `
    <section class="market-view">
      <section class="dash-market-section">
        <div class="market-section-head">
          <div>
            <span class="eyebrow-plain">asterisk* Finance Info</span>
            <h3>
              <a href="https://finance.knoblab.xyz/" target="_blank" rel="noopener noreferrer" class="market-heading-link">
                글로벌 금융 시장 지표 <sup>↗</sup>
              </a>
            </h3>
          </div>
          <button class="market-refresh-btn" id="market-refresh-btn">새로고침</button>
        </div>

        ${marketItems.length === 0 ? `
          <div class="market-empty-box">
            <p>설정된 관심 금융 지표가 없습니다.</p>
            <small>우측 상단 프로필에서 원하는 종목 또는 티커를 추가해보세요.</small>
          </div>
        ` : `
          <div class="market-mobile-tabs">
            ${marketItems.map((item, index) => `
              <button class="market-mob-tab ${index === 0 ? "active" : ""}" data-target="market-card-${safeIdFor(item)}">${esc(item.symbol)}</button>
            `).join("")}
          </div>

          <div class="market-cards-grid" style="grid-template-columns: repeat(${marketItems.length}, minmax(0, 1fr));">
            ${marketItems.map((item, index) => {
              const safeId = safeIdFor(item);
              return `
                <article class="market-card ${index === 0 ? "mob-active" : ""}" id="market-card-${safeId}">
                  <div>
                    <div class="market-card-header">
                      <div class="market-title-wrap">
                        <span class="market-series-name">${esc(item.symbol)}</span>
                        <h4 class="market-card-title">${esc(item.name)}</h4>
                      </div>
                      <span class="market-status-badge status-loading" id="market-status-${safeId}">확인 중</span>
                    </div>
                    <div class="market-rate-box">
                      <span class="market-current-rate" id="rate-val-${safeId}">로딩 중...</span>
                      <div class="market-diff-box">
                        <span class="market-diff-rate" id="rate-diff-${safeId}"></span>
                        <span class="market-date-label" id="rate-date-${safeId}"></span>
                      </div>
                    </div>
                    <div class="market-chart-container"><canvas id="chart-${safeId}"></canvas></div>
                  </div>
                  <div class="market-card-footer">
                    <span id="rate-fetch-${safeId}">LAST FETCH -</span>
                    <span>Intraday 1M</span>
                  </div>
                </article>`;
            }).join("")}
          </div>
        `}
      </section>
    </section>`;

  $("#market-refresh-btn")?.addEventListener("click", () => void handleMarketManualRefresh());
  document.querySelectorAll<HTMLButtonElement>(".market-mob-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll<HTMLButtonElement>(".market-mob-tab").forEach((item) => item.classList.remove("active"));
      btn.classList.add("active");
      document.querySelectorAll<HTMLElement>(".market-card").forEach((card) => {
        card.classList.toggle("mob-active", card.id === btn.dataset.target);
      });
    });
  });

  if (marketItems.length > 0) {
    void loadAllMarketCards(marketItems);
    startMarketCooldown();
  }
}

async function handleMarketManualRefresh(): Promise<void> {
  const marketItems = getSavedTickers();
  if (marketItems.length === 0 || remainingSeconds > 0) return;
  const btn = document.getElementById("market-refresh-btn") as HTMLButtonElement | null;
  if (btn) {
    btn.disabled = true;
    btn.textContent = "불러오는 중...";
  }
  await loadAllMarketCards(marketItems);
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
    } else if (currentBtn) {
      currentBtn.textContent = `새로고침 (${remainingSeconds}s)`;
    }
  }, 1000);
}

async function loadAllMarketCards(items: TickerConfigItem[]): Promise<void> {
  await Promise.all(items.map((item) => loadSingleMarketCard(item)));
}

async function loadSingleMarketCard(item: TickerConfigItem): Promise<void> {
  const safeId = safeIdFor(item);
  const rateValEl = document.getElementById(`rate-val-${safeId}`);
  const rateDiffEl = document.getElementById(`rate-diff-${safeId}`);
  const rateDateEl = document.getElementById(`rate-date-${safeId}`);
  const rateFetchEl = document.getElementById(`rate-fetch-${safeId}`);
  const statusEl = document.getElementById(`market-status-${safeId}`);
  const canvas = document.getElementById(`chart-${safeId}`) as HTMLCanvasElement | null;
  if (!rateValEl || !canvas) return;

  try {
    const json = await fetchMarketData(item.code);
    if (json.error || !json.rows?.length) {
      rateValEl.textContent = json.error || "데이터 없음";
      if (rateDiffEl) rateDiffEl.textContent = "";
      if (statusEl) {
        statusEl.className = "market-status-badge status-halted";
        statusEl.textContent = "거래 중단";
      }
      return;
    }

    const rows = json.rows;
    const latest = rows[rows.length - 1];
    rateValEl.innerHTML = `${latest.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}<small>${esc(item.unit)}</small>`;

    if (rateDiffEl && json.prevClose && json.prevClose > 0) {
      const diff = latest.value - json.prevClose;
      const pct = (diff / json.prevClose) * 100;
      const className = diff > 0 ? "diff-up" : diff < 0 ? "diff-down" : "diff-even";
      const sign = diff > 0 ? "▲" : diff < 0 ? "▼" : "-";
      const prefix = diff > 0 ? "+" : diff < 0 ? "-" : "";
      rateDiffEl.textContent = `${sign} ${Math.abs(diff).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${prefix}${Math.abs(pct).toFixed(2)}%)`;
      rateDiffEl.className = `market-diff-rate ${className}`;
    }

    if (statusEl) {
      const state = json.marketState || "CLOSED";
      const text = json.marketStatusText || (state === "OPEN" ? "장중" : "장 종료");
      statusEl.className = `market-status-badge status-${state.toLowerCase()}`;
      statusEl.innerHTML = state === "OPEN" ? `<span class="market-status-dot"></span>${esc(text)}` : esc(text);
    }

    if (rateDateEl && latest.datetime) {
      const time = latest.datetime.length >= 4 ? `${latest.datetime.slice(0, 2)}:${latest.datetime.slice(2, 4)}` : latest.datetime;
      rateDateEl.textContent = json.marketState === "CLOSED" ? `(${time} 마감)` : `(${time} 기준)`;
    }
    if (rateFetchEl) rateFetchEl.textContent = `FETCH ${new Date().toLocaleTimeString("ko-KR", { hour12: false })}`;

    renderCardChart(safeId, canvas, rows.map((row) => row.datetime.length >= 4 ? `${row.datetime.slice(0, 2)}:${row.datetime.slice(2, 4)}` : row.datetime), rows.map((row) => row.value), item);
  } catch (error) {
    console.warn(`Failed to load market card for ${item.name}:`, error);
    rateValEl.textContent = "조회 실패";
    if (statusEl) {
      statusEl.className = "market-status-badge status-halted";
      statusEl.textContent = "거래 중단";
    }
  }
}

function renderCardChart(safeId: string, canvas: HTMLCanvasElement, labels: string[], values: number[], item: TickerConfigItem): void {
  marketCharts[safeId]?.destroy();
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const gridColor = document.body.matches(".sky-bg-active") ? "#48484A" : "#D1D1D6";
  marketCharts[safeId] = new Chart(ctx, {
    type: "line",
    data: { labels, datasets: [{ data: values, borderColor: "#000000", backgroundColor: "rgba(0, 0, 0, 0.05)", borderWidth: 1.5, fill: true, tension: 0.1, pointRadius: 0, pointHoverRadius: 4, pointHoverBackgroundColor: "#000000" }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { mode: "index", intersect: false, callbacks: { label: (context) => `${(context.parsed.y ?? 0).toLocaleString()} ${item.unit}` } } },
      scales: {
        x: { grid: { color: gridColor }, ticks: { color: "#48484A", font: { family: "Asta Sans, Pretendard, monospace", size: 9 }, maxTicksLimit: 6 } },
        y: { grid: { color: gridColor }, ticks: { color: "#48484A", font: { family: "Asta Sans, Pretendard, monospace", size: 9 }, callback: (value) => Number(value).toLocaleString() } },
      },
    },
  });
}
