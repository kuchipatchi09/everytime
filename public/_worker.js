export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/naver-market")) {
      if (request.method === "OPTIONS") {
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

      const code = url.searchParams.get("code") || "KOSPI";

      try {
        const data = await getMarketData(code);
        return new Response(JSON.stringify(data), {
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type"
          }
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          }
        });
      }
    }

    return env.ASSETS ? env.ASSETS.fetch(request) : fetch(request);
  }
};

async function getMarketData(code) {
  // 1. KOSPI
  if (code === "KOSPI") {
    const [basicRes, priceRes] = await Promise.all([
      fetch("https://m.stock.naver.com/api/index/KOSPI/basic"),
      fetch("https://m.stock.naver.com/api/index/KOSPI/price?pageSize=30&page=1")
    ]);
    const basic = await basicRes.json();
    const prices = await priceRes.json();

    const currentVal = parseFloat(String(basic.closePrice).replace(/,/g, ""));
    const prevDiff = parseFloat(String(basic.compareToPreviousClosePrice).replace(/,/g, ""));
    const prevClose = currentVal - prevDiff;

    const reversed = [...prices].reverse();
    const rows = reversed.map((item) => {
      const val = parseFloat(String(item.closePrice).replace(/,/g, ""));
      const dateStr = (item.localTradedAt || "").replace(/-/g, "");
      return {
        datetime: dateStr.length >= 8 ? dateStr.slice(4) : dateStr,
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

  // 2. NASDAQ
  if (code === "NAS@IXIC" || code === ".IXIC" || code === "NASDAQ") {
    const [basicRes, priceRes] = await Promise.all([
      fetch("https://api.stock.naver.com/index/.IXIC/basic"),
      fetch("https://api.stock.naver.com/index/.IXIC/price?pageSize=30&page=1")
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

  // 3. USD/KRW
  if (code === "FX_USDKRW") {
    const priceRes = await fetch("https://api.stock.naver.com/marketindex/exchange/FX_USDKRW/prices?pageSize=30&page=1");
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
