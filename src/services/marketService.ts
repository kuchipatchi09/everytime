import { MarketResponse, MarketRow } from "../types/market";

export async function fetchMarketData(code: string): Promise<MarketResponse> {
  // 1. Cloudflare Pages Functions / Workers / Vite dev server 엔드포인트 호출
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
    console.warn(`Local API fetch failed for ${code}:`, err);
  }

  // 2. 서버리스 프록시 연결 전 임시 오프라인 안전 기준 데이터
  const fallbackValues: Record<string, { val: number; diff: number; history: number[] }> = {
    KOSPI: {
      val: 6788.88,
      diff: -123.49,
      history: [6696.96, 6742.74, 6808.21, 6912.37, 6788.88]
    },
    "NAS@IXIC": {
      val: 26424.84,
      diff: -116.51,
      history: [25980.19, 26151.30, 26130.20, 26541.35, 26424.84]
    },
    NASDAQ: {
      val: 26424.84,
      diff: -116.51,
      history: [25980.19, 26151.30, 26130.20, 26541.35, 26424.84]
    },
    FX_USDKRW: {
      val: 1379.70,
      diff: -2.30,
      history: [1384.00, 1383.50, 1386.00, 1382.00, 1379.70]
    }
  };

  const item = fallbackValues[code] || fallbackValues["KOSPI"];
  const prevClose = item.val - item.diff;
  const rows: MarketRow[] = item.history.map((price, idx) => ({
    datetime: `D-${item.history.length - idx}`,
    value: price
  }));

  return { rows, prevClose };
}
