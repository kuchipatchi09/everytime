import { MarketResponse, TickerSearchResult } from "../types/market";

export async function fetchMarketData(code: string): Promise<MarketResponse> {
  try {
    const res = await fetch(`/api/naver-market?code=${encodeURIComponent(code)}`);
    const contentType = res.headers.get("content-type") || "";

    if (res.ok && contentType.includes("json")) {
      const data = await res.json();
      if (data && Array.isArray(data.rows) && data.rows.length > 0) {
        return data;
      }
    }

    return { error: "시장 데이터를 불러올 수 없습니다." };
  } catch (err) {
    console.warn(`API fetch failed for ${code}:`, err);
    return { error: "시장 데이터를 불러올 수 없습니다." };
  }
}

export async function searchTickers(query: string): Promise<TickerSearchResult[]> {
  try {
    const res = await fetch(`/api/ticker-search?q=${encodeURIComponent(query.trim())}`);
    const contentType = res.headers.get("content-type") || "";

    if (res.ok && contentType.includes("json")) {
      const data = await res.json();
      if (Array.isArray(data)) {
        return data;
      }
    }
    return [];
  } catch (err) {
    console.warn(`Ticker search failed for ${query}:`, err);
    return [];
  }
}
