import { MarketResponse, MarketRow } from "../types/market";

const FALLBACK_DATA: Record<string, { value: number; prevClose: number; unit: string }> = {
  KOSPI: { value: 2685.20, prevClose: 2672.40, unit: "pt" },
  "NAS@IXIC": { value: 17730.40, prevClose: 17810.10, unit: "pt" },
  NASDAQ: { value: 17730.40, prevClose: 17810.10, unit: "pt" },
  FX_USDKRW: { value: 1378.50, prevClose: 1382.10, unit: "원" }
};

function generateMockFallback(code: string): MarketResponse {
  const base = FALLBACK_DATA[code] || { value: 1000, prevClose: 990, unit: "pt" };
  const rows: MarketRow[] = [];
  const now = new Date();

  for (let i = 29; i >= 0; i--) {
    const t = new Date(now.getTime() - i * 60 * 1000);
    const hh = String(t.getHours()).padStart(2, "0");
    const mm = String(t.getMinutes()).padStart(2, "0");
    const ss = String(t.getSeconds()).padStart(2, "0");
    const randomVariation = (Math.sin(i / 3) * 0.002 + (Math.random() - 0.5) * 0.001) * base.value;
    rows.push({
      datetime: `${hh}${mm}${ss}`,
      value: Number((base.value + randomVariation).toFixed(2))
    });
  }

  return {
    rows,
    prevClose: base.prevClose
  };
}

export async function fetchMarketData(code: string): Promise<MarketResponse> {
  // 1. Vite dev server / Cloudflare Pages Functions 프록시 호출 시도
  try {
    const res = await fetch(`/api/naver-market?code=${encodeURIComponent(code)}`);
    const contentType = res.headers.get("content-type") || "";
    
    if (res.ok && contentType.includes("json")) {
      const data = await res.json();
      if (data && Array.isArray(data.rows) && data.rows.length > 0) {
        return data;
      }
    }
  } catch (err) {
    console.warn(`Local proxy fetch failed for ${code}, trying external fallback...`, err);
  }

  // 2. 외부 CORS 프록시를 통한 Yahoo Finance 직접 페치 시도
  try {
    let yfCode = "";
    if (code === "KOSPI") yfCode = "%5EKS11";
    else if (code === "KOSDAQ") yfCode = "%5EKQ11";
    else if (code === "NAS@IXIC" || code === ".IXIC" || code === "NASDAQ") yfCode = "%5EIXIC";
    else if (code === "FX_USDKRW") yfCode = "KRW=X";
    else yfCode = encodeURIComponent(code);

    const targetUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${yfCode}?interval=1m&range=1d`;
    const corsProxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`;

    const res = await fetch(corsProxyUrl);
    if (res.ok) {
      const raw = await res.json();
      const result = raw?.chart?.result?.[0];
      if (result && result.timestamp && result.indicators?.quote?.[0]?.close) {
        const prevClose = result.meta.chartPreviousClose || result.meta.previousClose;
        const timestamps: number[] = result.timestamp;
        const closePrices: (number | null)[] = result.indicators.quote[0].close;

        const rows: MarketRow[] = timestamps.map((ts, i) => {
          const date = new Date(ts * 1000);
          const kstDate = new Date(date.getTime() + (9 * 60 * 60 * 1000));
          const hh = String(kstDate.getUTCHours()).padStart(2, "0");
          const mm = String(kstDate.getUTCMinutes()).padStart(2, "0");
          const ss = String(kstDate.getUTCSeconds()).padStart(2, "0");
          return {
            datetime: `${hh}${mm}${ss}`,
            value: closePrices[i] as number
          };
        }).filter((r) => r.value !== null && !isNaN(r.value));

        const last30 = rows.slice(-30);
        if (last30.length > 0) {
          return { rows: last30, prevClose };
        }
      }
    }
  } catch (err) {
    console.warn(`External CORS fallback failed for ${code}`, err);
  }

  // 3. 정적 환경 / 오프라인 시 Graceful Mock Fallback 반환
  return generateMockFallback(code);
}
