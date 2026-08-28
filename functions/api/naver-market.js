export async function onRequest(context) {
  const url = new URL(context.request.url);
  const code = url.searchParams.get("code");

  if (!code) {
    return jsonResponse({ error: "code 쿼리파라미터가 필요합니다." }, 400);
  }

  try {
    let yfCode = "";
    if (code === "KOSPI") yfCode = "^KS11";
    else if (code === "KOSDAQ") yfCode = "^KQ11";
    else if (code === "NAS@IXIC" || code === ".IXIC" || code === "NASDAQ") yfCode = "^IXIC";
    else if (code === "FX_USDKRW") yfCode = "KRW=X";
    else if (code === "SP500" || code === "S&P500") yfCode = "^GSPC";
    else yfCode = code;

    const targetUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${yfCode}?region=US&lang=en-US&includePrePost=false&interval=1m&useYfid=true&range=1d`;
    
    const res = await fetch(targetUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        "Accept": "application/json"
      }
    });
    
    if (!res.ok) throw new Error(`야후 파이낸스 응답 오류 (status ${res.status})`);
    
    const raw = await res.json();
    const result = raw?.chart?.result?.[0];
    if (!result || !result.timestamp) throw new Error("분봉 데이터가 없습니다.");

    const prevClose = result.meta.chartPreviousClose || result.meta.previousClose;
    const timestamps = result.timestamp;
    const closePrices = result.indicators.quote[0].close;

    const rows = timestamps.map((ts, i) => {
      const date = new Date(ts * 1000);
      const kstDate = new Date(date.getTime() + (9 * 60 * 60 * 1000));
      
      const hh = String(kstDate.getUTCHours()).padStart(2, "0");
      const mm = String(kstDate.getUTCMinutes()).padStart(2, "0");
      const ss = String(kstDate.getUTCSeconds()).padStart(2, "0");
      
      return {
        datetime: `${hh}${mm}${ss}`,
        value: closePrices[i]
      };
    }).filter(r => r.value !== null && !isNaN(r.value));

    const last30Mins = rows.slice(-30);

    return jsonResponse({ rows: last30Mins, prevClose }, 200);

  } catch (err) {
    return jsonResponse({ error: err.message }, 500);
  }
}

function jsonResponse(obj, status) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
  });
}
