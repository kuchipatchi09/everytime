import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

function marketProxyMiddleware(req: any, res: any, next: any) {
  if (req.url?.startsWith("/api/naver-market")) {
    (async () => {
      try {
        const url = new URL(req.url, `http://${req.headers.host}`);
        const code = url.searchParams.get("code") || "KOSPI";

        let yfCode = "";
        if (code === "KOSPI") yfCode = "^KS11";
        else if (code === "KOSDAQ") yfCode = "^KQ11";
        else if (code === "NAS@IXIC" || code === ".IXIC" || code === "NASDAQ") yfCode = "^IXIC";
        else if (code === "FX_USDKRW") yfCode = "KRW=X";
        else if (code === "SP500" || code === "S&P500") yfCode = "^GSPC";
        else yfCode = code;

        const targetUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${yfCode}?region=US&lang=en-US&includePrePost=false&interval=1m&useYfid=true&range=1d`;

        const response = await fetch(targetUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
            "Accept": "application/json"
          }
        });

        if (!response.ok) {
          throw new Error(`Yahoo Finance status ${response.status}`);
        }

        const raw = await response.json();
        const result = raw?.chart?.result?.[0];
        if (!result || !result.timestamp) {
          throw new Error("No intraday chart data available");
        }

        const prevClose = result.meta.chartPreviousClose || result.meta.previousClose;
        const timestamps = result.timestamp;
        const closePrices = result.indicators.quote[0].close;

        const rows = timestamps.map((ts: number, i: number) => {
          const date = new Date(ts * 1000);
          const kstDate = new Date(date.getTime() + (9 * 60 * 60 * 1000));
          const hh = String(kstDate.getUTCHours()).padStart(2, "0");
          const mm = String(kstDate.getUTCMinutes()).padStart(2, "0");
          const ss = String(kstDate.getUTCSeconds()).padStart(2, "0");
          return {
            datetime: `${hh}${mm}${ss}`,
            value: closePrices[i]
          };
        }).filter((r: { value: number | null }) => r.value !== null && !isNaN(r.value));

        const last30Mins = rows.slice(-30);

        res.setHeader("Content-Type", "application/json");
        res.setHeader("Cache-Control", "no-store");
        res.end(JSON.stringify({ rows: last30Mins, prevClose }));
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
