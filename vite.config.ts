import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

async function getMarketData(code: string) {
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
    const rows = reversed.map((item: any) => {
      const val = parseFloat(String(item.closePrice).replace(/,/g, ""));
      const dateStr = (item.localTradedAt || "").replace(/-/g, "");
      return {
        datetime: dateStr.length >= 8 ? dateStr.slice(4) : dateStr,
        value: val
      };
    }).filter((r: any) => !isNaN(r.value));

    if (rows.length === 0 || rows[rows.length - 1].value !== currentVal) {
      const now = new Date();
      const hh = String(now.getHours()).padStart(2, "0");
      const mm = String(now.getMinutes()).padStart(2, "0");
      rows.push({ datetime: `${hh}${mm}`, value: currentVal });
    }

    return { rows, prevClose };
  }

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
    const rows = reversed.map((item: any) => {
      const val = parseFloat(String(item.closePrice).replace(/,/g, ""));
      const dt = item.localTradedAt ? item.localTradedAt.split("T")[0].replace(/-/g, "").slice(4) : "";
      return {
        datetime: dt,
        value: val
      };
    }).filter((r: any) => !isNaN(r.value));

    if (rows.length === 0 || rows[rows.length - 1].value !== currentVal) {
      const now = new Date();
      const hh = String(now.getHours()).padStart(2, "0");
      const mm = String(now.getMinutes()).padStart(2, "0");
      rows.push({ datetime: `${hh}${mm}`, value: currentVal });
    }

    return { rows, prevClose };
  }

  if (code === "FX_USDKRW") {
    const priceRes = await fetch("https://api.stock.naver.com/marketindex/exchange/FX_USDKRW/prices?pageSize=30&page=1");
    const prices = await priceRes.json();
    const latest = prices[0];

    const currentVal = parseFloat(String(latest.closePrice).replace(/,/g, ""));
    const prevDiff = parseFloat(String(latest.fluctuations).replace(/,/g, ""));
    const prevClose = currentVal - prevDiff;

    const reversed = [...prices].reverse();
    const rows = reversed.map((item: any) => {
      const val = parseFloat(String(item.closePrice).replace(/,/g, ""));
      const dt = (item.localTradedAt || "").replace(/-/g, "").slice(4);
      return {
        datetime: dt,
        value: val
      };
    }).filter((r: any) => !isNaN(r.value));

    return { rows, prevClose };
  }

  throw new Error("Unsupported market code");
}

function marketProxyMiddleware(req: any, res: any, next: any) {
  if (req.url?.startsWith("/api/naver-market")) {
    (async () => {
      try {
        const url = new URL(req.url, `http://${req.headers.host}`);
        const code = url.searchParams.get("code") || "KOSPI";

        const data = await getMarketData(code);

        res.setHeader("Content-Type", "application/json");
        res.setHeader("Cache-Control", "no-store");
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.end(JSON.stringify(data));
      } catch (err: any) {
        res.setHeader("Content-Type", "application/json");
        res.statusCode = 500;
        res.end(JSON.stringify({ error: err.message || "Failed to fetch market data" }));
      }
    })();
    return;
  }
  next();
}

export default defineConfig({
  plugins: [
    react(),
    {
      name: "naver-market-proxy",
      configureServer(server) {
        server.middlewares.use(marketProxyMiddleware);
      },
      configurePreviewServer(server) {
        server.middlewares.use(marketProxyMiddleware);
      }
    }
  ],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        brand: resolve(__dirname, "brand.html"),
      },
    },
  },
});
