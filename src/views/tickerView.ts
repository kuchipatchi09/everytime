import { TICKER_ITEMS } from "../constants/config";
import { fetchMarketData } from "../services/marketService";
import { $ } from "../utils/dom";

let refreshIntervalId: number | null = null;
const REFRESH_INTERVAL_MS = 60000; // 1분 (60초)

export async function renderTicker(): Promise<void> {
  const tickerWrap = $("#stock-ticker");
  const tickerContent = $("#ticker-content");
  if (!tickerWrap || !tickerContent) return;

  const itemHtmlList: string[] = [];

  for (const item of TICKER_ITEMS) {
    try {
      const json = await fetchMarketData(item.code);
      if (json.rows && json.rows.length > 0) {
        const latest = json.rows[json.rows.length - 1];
        const prevClose = json.prevClose;

        const val = latest.value.toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });

        let diffStr = "";
        let diffClass = "diff-even";

        if (prevClose !== undefined && prevClose !== null && prevClose > 0) {
          const diff = latest.value - prevClose;
          const pct = (diff / prevClose) * 100;
          const absDiff = Math.abs(diff).toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          });
          const absPct = Math.abs(pct).toFixed(2);

          if (diff > 0) {
            diffStr = `▲ ${absDiff} (+${absPct}%)`;
            diffClass = "diff-up";
          } else if (diff < 0) {
            diffStr = `▼ ${absDiff} (-${absPct}%)`;
            diffClass = "diff-down";
          } else {
            diffStr = `- 0.00 (0.00%)`;
            diffClass = "diff-even";
          }
        }

        itemHtmlList.push(`
          <div class="ticker-item">
            <span class="ticker-symbol">${item.symbol}</span>
            <span class="ticker-name">${item.name}</span>
            <span class="ticker-val">${val}<small>${item.unit}</small></span>
            ${diffStr ? `<span class="ticker-diff ${diffClass}">${diffStr}</span>` : ""}
          </div>
        `);
      }
    } catch (e) {
      console.warn(`[Ticker] Failed to fetch ${item.name}:`, e);
    }
  }

  if (itemHtmlList.length > 0) {
    const sequence = itemHtmlList.join("");
    // 뉴욕 전광판 스타일 무한 롤링을 위해 4회 반복 연결
    tickerContent.innerHTML = sequence + sequence + sequence + sequence;
    tickerWrap.classList.remove("hidden");
  }

  // 1분(60초) 자동 새로고침 타이머 설정
  if (!refreshIntervalId) {
    refreshIntervalId = window.setInterval(() => {
      renderTicker();
    }, REFRESH_INTERVAL_MS);
  }
}
