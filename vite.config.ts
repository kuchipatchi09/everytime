import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

function parseCookies(cookieStr: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!cookieStr) return cookies;
  for (const pair of cookieStr.split(";")) {
    const [key, ...rest] = pair.trim().split("=");
    if (key) cookies[key.trim()] = rest.join("=");
  }
  return cookies;
}

function authDevMiddleware(req: any, res: any, next: any) {
  const url = req.url ? new URL(req.url, `http://${req.headers.host}`) : null;
  if (!url) return next();

  if (url.pathname === "/api/auth-callback") {
    if (req.method === "POST") {
      let body = "";
      req.on("data", (chunk: any) => { body += chunk; });
      req.on("end", () => {
        let token = "";
        let uid = "";
        let email = "";

        const contentType = req.headers["content-type"] || "";
        if (contentType.includes("application/x-www-form-urlencoded")) {
          const params = new URLSearchParams(body);
          token = params.get("token") || "";
          uid = params.get("uid") || "";
          email = params.get("email") || "";
        } else if (contentType.includes("multipart/form-data")) {
          const boundaryMatch = contentType.match(/boundary=(.+)$/);
          const boundary = boundaryMatch ? boundaryMatch[1].trim() : "";
          if (boundary) {
            const parts = body.split(`--${boundary}`);
            for (const part of parts) {
              const nameMatch = part.match(/name="([^"]+)"/);
              if (nameMatch) {
                const name = nameMatch[1];
                const content = part.split("\r\n\r\n")[1]?.split("\r\n--")[0]?.trim() || "";
                if (name === "token") token = content;
                if (name === "uid") uid = content;
                if (name === "email") email = content;
              }
            }
          }
        }

        if (token || uid) {
          const cookieOpts = "Path=/; Max-Age=2592000; HttpOnly; SameSite=Lax";
          res.setHeader("Set-Cookie", [
            `session_token=${encodeURIComponent(token)}; ${cookieOpts}`,
            `session_uid=${encodeURIComponent(uid)}; ${cookieOpts}`,
            `session_email=${encodeURIComponent(email)}; ${cookieOpts}`,
          ]);
        }

        res.statusCode = 302;
        res.setHeader("Location", "/");
        res.end();
      });
      return;
    } else {
      res.statusCode = 302;
      res.setHeader("Location", "/");
      res.end();
      return;
    }
  }

  if (url.pathname === "/api/me") {
    const cookies = parseCookies(req.headers.cookie);
    const token = cookies["session_token"];
    const uid = cookies["session_uid"];
    const email = cookies["session_email"];

    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-store");

    if (uid || token) {
      res.statusCode = 200;
      res.end(JSON.stringify({
        authenticated: true,
        uid: decodeURIComponent(uid || ""),
        email: decodeURIComponent(email || ""),
      }));
    } else {
      res.statusCode = 401;
      res.end(JSON.stringify({ authenticated: false }));
    }
    return;
  }

  if (url.pathname === "/api/logout") {
    const clearOpts = "Path=/; Max-Age=0; HttpOnly; SameSite=Lax";
    res.setHeader("Set-Cookie", [
      `session_token=; ${clearOpts}`,
      `session_uid=; ${clearOpts}`,
      `session_email=; ${clearOpts}`,
    ]);
    res.setHeader("Content-Type", "application/json");
    res.statusCode = 200;
    res.end(JSON.stringify({ success: true }));
    return;
  }

  next();
}

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
      name: "auth-dev-proxy",
      configureServer(server) {
        server.middlewares.use(authDevMiddleware);
      },
      configurePreviewServer(server) {
        server.middlewares.use(authDevMiddleware);
      }
    },
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
