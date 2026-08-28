interface Env {
  // 환경변수 바인딩이 필요하다면 여기에 정의
}

const YAHOO_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

async function getYahooCrumbAndCookies(): Promise<{ crumb: string; cookies: string }> {
  const initRes = await fetch("https://fc.yahoo.com/", {
    headers: { "User-Agent": YAHOO_UA },
    redirect: "manual"
  });

  let cookieParts: string[] = [];
  if (typeof initRes.headers.getSetCookie === "function") {
    cookieParts = initRes.headers.getSetCookie().map(c => c.split(";")[0]);
  } else {
    const raw = initRes.headers.get("set-cookie");
    if (raw) cookieParts = raw.split(",").map(c => c.split(";")[0].trim());
  }
  const cookieStr = cookieParts.join("; ");

  const crumbRes = await fetch("https://query2.finance.yahoo.com/v1/test/getcrumb", {
    headers: { "User-Agent": YAHOO_UA, "Cookie": cookieStr }
  });
  if (!crumbRes.ok) throw new Error(`Crumb 획득 실패 (${crumbRes.status})`);
  const crumb = await crumbRes.text();

  return { crumb, cookies: cookieStr };
}

async function fetchYahooChart(yfCode: string): Promise<any> {
  const { crumb, cookies } = await getYahooCrumbAndCookies();

  const url = `https://query2.finance.yahoo.com/v8/finance/chart/${yfCode}?region=US&lang=en-US&includePrePost=false&interval=1m&useYfid=true&range=1d&crumb=${encodeURIComponent(crumb)}`;

  const res = await fetch(url, {
    headers: {
      "User-Agent": YAHOO_UA,
      "Cookie": cookies,
      "Accept": "application/json"
    }
  });

  if (!res.ok) throw new Error(`Yahoo Finance 응답 오류 (${res.status})`);
  return await res.json();
}

function codeToYahooSymbol(code: string): string {
  if (code === "KOSPI") return "^KS11";
  if (code === "KOSDAQ") return "^KQ11";
  if (code === "NAS@IXIC" || code === ".IXIC" || code === "NASDAQ") return "^IXIC";
  if (code === "FX_USDKRW") return "KRW=X";
  if (code === "SP500" || code === "S&P500") return "^GSPC";
  return code;
}

function parseChartResult(raw: any) {
  const result = raw?.chart?.result?.[0];
  if (!result || !result.timestamp) throw new Error("분봉 데이터가 없습니다.");

  const prevClose = result.meta.chartPreviousClose || result.meta.previousClose;
  const timestamps = result.timestamp;
  const closePrices = result.indicators.quote[0].close;

  const rows = timestamps.map((ts: number, i: number) => {
    const date = new Date(ts * 1000);
    const kstDate = new Date(date.getTime() + (9 * 60 * 60 * 1000));
    const hh = String(kstDate.getUTCHours()).padStart(2, "0");
    const mm = String(kstDate.getUTCMinutes()).padStart(2, "0");
    const ss = String(kstDate.getUTCSeconds()).padStart(2, "0");
    return { datetime: `${hh}${mm}${ss}`, value: closePrices[i] };
  }).filter((r: any) => r.value !== null && !isNaN(r.value));

  return { rows: rows.slice(-30), prevClose };
}

export const onRequest = async (context: any) => {
  const url = new URL(context.request.url);
  const code = url.searchParams.get("code");

  if (!code) {
    return jsonResponse({ error: "code 쿼리파라미터가 필요합니다." }, 400);
  }

  try {
    const yfCode = codeToYahooSymbol(code);
    const raw = await fetchYahooChart(yfCode);
    const data = parseChartResult(raw);
    return jsonResponse(data, 200);
  } catch (err: any) {
    return jsonResponse({ error: err.message }, 500);
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
