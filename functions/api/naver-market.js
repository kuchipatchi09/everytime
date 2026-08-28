const NAVER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Referer": "https://m.stock.naver.com/",
  "Accept": "application/json, text/plain, */*",
  "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7"
};

function naverFetch(url) {
  return fetch(url, { headers: NAVER_HEADERS });
}

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const code = url.searchParams.get("code") || "KOSPI";

  try {
    const data = await getMarketData(code);
    return jsonResponse(data, 200);
  } catch (err) {
    return jsonResponse({ error: err.message }, 500);
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400"
    }
  });
}

async function getMarketData(code) {
  // 1. KOSPI
  if (code === "KOSPI") {
    const [basicRes, priceRes] = await Promise.all([
      naverFetch("https://m.stock.naver.com/api/index/KOSPI/basic"),
      naverFetch("https://m.stock.naver.com/api/index/KOSPI/price?pageSize=30&page=1")
    ]);
    const basic = await basicRes.json();
    const prices = await priceRes.json();

    const currentVal = parseFloat(String(basic.closePrice).replace(/,/g, ""));
    const prevDiff = parseFloat(String(basic.compareToPreviousClosePrice).replace(/,/g, ""));
    const prevClose = currentVal - prevDiff;

    // 가격 리스트 (시간 역순이므로 오래된 순으로 정렬)
    const reversed = [...prices].reverse();
    const rows = reversed.map((item) => {
      const val = parseFloat(String(item.closePrice).replace(/,/g, ""));
      const dateStr = (item.localTradedAt || "").replace(/-/g, "");
      return {
        datetime: dateStr.length >= 8 ? dateStr.slice(4) : dateStr,
        value: val
      };
    }).filter(r => !isNaN(r.value));

    // 최신 현재가 추가
    if (rows.length === 0 || rows[rows.length - 1].value !== currentVal) {
      const now = new Date();
      const hh = String(now.getHours()).padStart(2, "0");
      const mm = String(now.getMinutes()).padStart(2, "0");
      rows.push({ datetime: `${hh}${mm}`, value: currentVal });
    }

    return { rows, prevClose };
  }

  // 2. NASDAQ (.IXIC / NAS@IXIC)
  if (code === "NAS@IXIC" || code === ".IXIC" || code === "NASDAQ") {
    const [basicRes, priceRes] = await Promise.all([
      naverFetch("https://api.stock.naver.com/index/.IXIC/basic"),
      naverFetch("https://api.stock.naver.com/index/.IXIC/price?pageSize=30&page=1")
    ]);
    const basic = await basicRes.json();
    const prices = await priceRes.json();

    const currentVal = parseFloat(String(basic.closePrice).replace(/,/g, ""));
    const prevDiff = parseFloat(String(basic.compareToPreviousClosePrice).replace(/,/g, ""));
    const prevClose = currentVal - prevDiff;

    const reversed = [...prices].reverse();
    const rows = reversed.map((item) => {
      const val = parseFloat(String(item.closePrice).replace(/,/g, ""));
      const dt = item.localTradedAt ? item.localTradedAt.split("T")[0].replace(/-/g, "").slice(4) : "";
      return {
        datetime: dt,
        value: val
      };
    }).filter(r => !isNaN(r.value));

    if (rows.length === 0 || rows[rows.length - 1].value !== currentVal) {
      const now = new Date();
      const hh = String(now.getHours()).padStart(2, "0");
      const mm = String(now.getMinutes()).padStart(2, "0");
      rows.push({ datetime: `${hh}${mm}`, value: currentVal });
    }

    return { rows, prevClose };
  }

  // 3. USD/KRW (FX_USDKRW)
  if (code === "FX_USDKRW") {
    const priceRes = await naverFetch("https://api.stock.naver.com/marketindex/exchange/FX_USDKRW/prices?pageSize=30&page=1");
    const prices = await priceRes.json();
    const latest = prices[0];

    const currentVal = parseFloat(String(latest.closePrice).replace(/,/g, ""));
    const prevDiff = parseFloat(String(latest.fluctuations).replace(/,/g, ""));
    const prevClose = currentVal - prevDiff;

    const reversed = [...prices].reverse();
    const rows = reversed.map((item) => {
      const val = parseFloat(String(item.closePrice).replace(/,/g, ""));
      const dt = (item.localTradedAt || "").replace(/-/g, "").slice(4);
      return {
        datetime: dt,
        value: val
      };
    }).filter(r => !isNaN(r.value));

    return { rows, prevClose };
  }

  throw new Error("지원하지 않는 종목 코드입니다.");
}

function jsonResponse(obj, status) {
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
