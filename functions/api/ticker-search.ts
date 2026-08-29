const YAHOO_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

export interface TickerSearchResult {
  code: string;
  symbol: string;
  name: string;
  exchDisp?: string;
  quoteType?: string;
  unit: string;
}

function determineUnit(symbol: string, quoteType?: string, exchDisp?: string): string {
  if (symbol.startsWith("^") || quoteType === "INDEX") return "pt";
  if (symbol.endsWith(".KS") || symbol.endsWith(".KQ") || exchDisp === "KSC" || exchDisp === "KOE") return "원";
  if (symbol === "KRW=X" || symbol.includes("KRW")) return "원";
  if (symbol.endsWith("=X")) return "";
  if (quoteType === "CRYPTOCURRENCY") return "$";
  return "$";
}

export const onRequest = async (context: any) => {
  const url = new URL(context.request.url);
  const query = url.searchParams.get("q")?.trim();

  if (!query) {
    return jsonResponse([], 200);
  }

  try {
    const targetUrl = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=10&newsCount=0&enableFuzzyQuery=true`;
    const res = await fetch(targetUrl, {
      headers: {
        "User-Agent": YAHOO_UA,
        "Accept": "application/json"
      }
    });

    if (!res.ok) {
      return jsonResponse({ error: `Yahoo Search error: ${res.status}` }, 500);
    }

    const data: any = await res.json();
    const quotes = Array.isArray(data?.quotes) ? data.quotes : [];

    const results: TickerSearchResult[] = quotes
      .filter((item: any) => item.symbol)
      .map((item: any) => {
        const symbol = item.symbol;
        const name = item.shortname || item.longname || item.symbol;
        const unit = determineUnit(symbol, item.quoteType, item.exchDisp);
        return {
          code: symbol,
          symbol: symbol,
          name: name,
          exchDisp: item.exchDisp || item.exchange || "",
          quoteType: item.quoteType || "",
          unit: unit
        };
      });

    return jsonResponse(results, 200);
  } catch (err: any) {
    return jsonResponse({ error: err.message || "Failed to search ticker" }, 500);
  }
};

export const onRequestOptions = async () => {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400"
    }
  });
};

function jsonResponse(obj: any, status: number) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    }
  });
}
