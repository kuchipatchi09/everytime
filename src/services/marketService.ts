import { MarketResponse } from "../types/market";

export async function fetchMarketData(code: string): Promise<MarketResponse> {
  const res = await fetch(`/api/naver-market?code=${encodeURIComponent(code)}`);
  if (!res.ok) throw new Error(`Market fetch error: ${res.status}`);
  return res.json();
}
