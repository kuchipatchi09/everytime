import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";
import net from "net";

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
      req.on("end", async () => {
        let ticket = "";
        let token = "";
        let uid = "";
        let email = "";

        const contentType = req.headers["content-type"] || "";
        if (contentType.includes("application/x-www-form-urlencoded")) {
          const params = new URLSearchParams(body);
          ticket = params.get("ticket") || "";
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
                if (name === "ticket") ticket = content;
                if (name === "token") token = content;
                if (name === "uid") uid = content;
                if (name === "email") email = content;
              }
            }
          }
        }

        // 중앙 인증 서버로 티켓 검증 요청
        let emailVerified = false;
        if (ticket) {
          try {
            const verifyRes = await fetch("https://login.knoblab.xyz/api/verify-sso-ticket", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Origin": "https://cnsh.life",
              },
              body: JSON.stringify({
                ticket,
                targetOrigin: "https://cnsh.life",
              }),
            });
            if (verifyRes.ok) {
              const data = (await verifyRes.json()) as any;
              if (data?.valid && data?.uid) {
                uid = data.uid;
                email = data.email || "";
                emailVerified = data.emailVerified === true;
              }
            }
          } catch (e) {
            console.warn("Dev ticket verification warning:", e);
          }
        }

        if (uid || token) {
          const cookieOpts = "Path=/; Max-Age=604800; HttpOnly; SameSite=Lax";
          res.setHeader("Set-Cookie", [
            `session_uid=${encodeURIComponent(uid || "dev_user")}; ${cookieOpts}`,
            `session_email=${encodeURIComponent(email)}; ${cookieOpts}`,
            `session_email_verified=${emailVerified ? "true" : "false"}; ${cookieOpts}`,
            `session_token=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`,
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
    const uid = cookies["session_uid"];
    const email = cookies["session_email"];
    const emailVerified = cookies["session_email_verified"] === "true";
    const token = cookies["session_token"];

    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-store");

    if (uid) {
      res.statusCode = 200;
      res.end(JSON.stringify({
        authenticated: true,
        uid: decodeURIComponent(uid),
        email: decodeURIComponent(email || ""),
        emailVerified,
        token: token ? decodeURIComponent(token) : "",
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
      `session_email_verified=; ${clearOpts}`,
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
        const rawCode = url.searchParams.get("code") || "KOSPI";
        const code = decodeURIComponent(rawCode).trim();
        const c = code.toUpperCase();

        let yfCode = code;
        if (c === "KOSPI" || c === "코스피") yfCode = "^KS11";
        else if (c === "KOSDAQ" || c === "코스닥") yfCode = "^KQ11";
        else if (c === "NAS@IXIC" || c === ".IXIC" || c === "NASDAQ" || c === "나스닥") yfCode = "^IXIC";
        else if (c === "FX_USDKRW" || c === "USD/KRW" || c === "USD-KRW" || c === "USDKRW" || c === "원/달러" || c === "원/달러 환율") yfCode = "KRW=X";
        else if (c === "JPY/KRW" || c === "JPY-KRW" || c === "JPYKRW" || c === "엔/원" || c === "엔/원 환율") yfCode = "JPYKRW=X";
        else if (c === "EUR/KRW" || c === "EUR-KRW" || c === "EURKRW" || c === "유로/원") yfCode = "EURKRW=X";
        else if (c === "SP500" || c === "S&P500" || c === "S&P 500" || c === "^GSPC") yfCode = "^GSPC";
        else if (c.includes("/") && (c.endsWith("USD") || c.endsWith("KRW"))) yfCode = c.replace("/", "-");

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

        const meta = result.meta || {};
        const prevClose = meta.chartPreviousClose || meta.previousClose;
        const timestamps = result.timestamp;
        const closePrices = result.indicators?.quote?.[0]?.close || [];

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

        const nowSec = Math.floor(Date.now() / 1000);
        const ctp = meta.currentTradingPeriod;
        let marketState: "OPEN" | "CLOSED" | "PRE" | "POST" = "CLOSED";
        let marketStatusText = "장 종료";

        if (ctp) {
          const reg = ctp.regular;
          const pre = ctp.pre;
          const post = ctp.post;

          if (reg && nowSec >= reg.start && nowSec < reg.end) {
            marketState = "OPEN";
            marketStatusText = "장중";
          } else if (post && post.start !== post.end && nowSec >= post.start && nowSec < post.end) {
            marketState = "POST";
            marketStatusText = "애프터마켓";
          } else if (pre && pre.start !== pre.end && nowSec >= pre.start && nowSec < pre.end) {
            marketState = "PRE";
            marketStatusText = "프리마켓";
          } else if (reg && nowSec < reg.start) {
            marketState = "CLOSED";
            marketStatusText = "장 시작 전";
          } else {
            marketState = "CLOSED";
            marketStatusText = "장 종료";
          }
        }

        const last30Mins = rows.slice(-30);

        res.setHeader("Content-Type", "application/json");
        res.setHeader("Cache-Control", "no-store");
        res.end(JSON.stringify({
          rows: last30Mins,
          prevClose,
          marketState,
          marketStatusText,
          tradingPeriod: ctp
        }));
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

function tickerSearchMiddleware(req: any, res: any, next: any) {
  if (req.url?.startsWith("/api/ticker-search")) {
    (async () => {
      try {
        const url = new URL(req.url, `http://${req.headers.host}`);
        const q = url.searchParams.get("q")?.trim() || "";

        if (!q) {
          res.setHeader("Content-Type", "application/json");
          res.setHeader("Cache-Control", "no-store");
          res.end(JSON.stringify([]));
          return;
        }

        const targetUrl = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=10&newsCount=0&enableFuzzyQuery=true`;

        const response = await fetch(targetUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
            "Accept": "application/json"
          }
        });

        if (!response.ok) {
          throw new Error(`Yahoo Search status ${response.status}`);
        }

        const raw = await response.json();
        const quotes = Array.isArray(raw?.quotes) ? raw.quotes : [];

        const results = quotes
          .filter((item: any) => item.symbol)
          .map((item: any) => {
            const symbol = item.symbol;
            let unit = "$";
            if (symbol.startsWith("^") || item.quoteType === "INDEX") unit = "pt";
            else if (symbol.endsWith(".KS") || symbol.endsWith(".KQ") || item.exchDisp === "KSC" || item.exchDisp === "KOE") unit = "원";
            else if (symbol === "KRW=X" || symbol.includes("KRW")) unit = "원";
            else if (symbol.endsWith("=X")) unit = "";
            else if (item.quoteType === "CRYPTOCURRENCY") unit = "$";

            return {
              code: symbol,
              symbol: symbol,
              name: item.shortname || item.longname || item.symbol,
              exchDisp: item.exchDisp || item.exchange || "",
              quoteType: item.quoteType || "",
              unit: unit
            };
          });

        res.setHeader("Content-Type", "application/json");
        res.setHeader("Cache-Control", "no-store");
        res.end(JSON.stringify(results));
      } catch (err: any) {
        res.setHeader("Content-Type", "application/json");
        res.statusCode = 500;
        res.end(JSON.stringify({ error: err.message || "Failed to search ticker" }));
      }
    })();
    return;
  }
  next();
}

let devCachedTimetable: any = null;
let devCacheTimestamp = 0;
const DEV_CACHE_TTL_MS = 5 * 60 * 1000;

function fetchComciTcp(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const client = net.connect({ host: "comci.net", port: 4082 }, () => {
      client.write(`GET ${path} HTTP/1.1\r\nHost: comci.net:4082\r\nUser-Agent: Mozilla/5.0\r\nConnection: close\r\n\r\n`);
    });
    const chunks: Buffer[] = [];
    client.on("data", (d) => chunks.push(d));
    client.on("end", () => {
      const buf = Buffer.concat(chunks);
      resolve(buf.toString("utf8"));
    });
    client.on("error", reject);
  });
}

function parseComciganJsonDev(json: any) {
  const result: Record<string, Record<string, Record<string, string[]>>> = {
    "1": {},
    "2": {},
    "3": {},
  };
  const DAYS = ["월", "화", "수", "목", "금"];
  const 분리 = json.분리 || 100;
  const subjects: string[] = json.자료492 || [];
  const teachers: string[] = json.자료446 || [];
  const rawDefault = json.자료481;
  const rawDaily = json.자료147;

  function splitData(dat: any): number[] {
    if (!dat) return [0, 0];
    const matches = String(dat).match(/\d{1,3}(?=(\d{3})+(?!\d))|\d{1,3}$/g);
    if (!matches) return [0, 0];
    return matches.reverse().map(Number);
  }

  function mTime(mm: number, m2: number): string {
    if (m2 === 100) return "";
    const t = Math.floor(mm / m2);
    if (t >= 1 && t <= 26) {
      return String.fromCharCode(t + 64) + "_";
    }
    return "";
  }

  function dongCalc(자료: any, i: number, 학년: number, 반: number, 요일: number, 교시: number, 과목: number) {
    if (!자료.동시그룹 || !자료.동시그룹[i]) return [0, 0, 0];
    let n1 = 0, n2 = 0, 대상그룹 = 0;
    for (let j = 1; j <= 자료.동시그룹[i][0]; j++) {
      const 과목4 = Math.floor(자료.동시그룹[i][j] / 1000);
      const 그룹2 = Math.floor(과목4 / 1000);
      const 과목2 = 과목4 - 그룹2 * 1000;
      const 교사 = Math.floor(그룹2 / 100);
      const 그룹 = 그룹2 - 교사 * 100;
      const 학급 = 자료.동시그룹[i][j] - 과목4 * 1000;
      const 학년2 = Math.floor(학급 / 100);
      const 반2 = 학급 - 학년2 * 100;
      if (학년 === 학년2 && 반 === 반2 && 과목 === 과목2) {
        대상그룹 = 그룹;
      }
      const rawVal = 자료.자료147?.[학년2]?.[반2]?.[요일]?.[교시] ?? 0;
      const m3 = typeof rawVal === "string" && rawVal.startsWith(">") ? Number(rawVal.substring(1)) : Number(rawVal);
      const 과목3 = Math.floor(m3 / 1000);
      const 교사2 = m3 - 과목3 * 1000;
      if (학년 === 학년2 && 과목3 === 과목2 && 교사 === 교사2) {
        n1 += 1;
      } else {
        if (학년 === 학년2 && 과목3 === 과목2) {
          n2 += 1;
        } else {
          return [0, 0, 0];
        }
      }
    }
    return [n1, n2, 대상그룹];
  }

  function 동시그룹코드(자료: any, 학년: number, 반: number, 과목: number, 요일: number, 교시: number): string {
    if (!Array.isArray(자료.동시그룹) || !자료.동시그룹[0]) return "";
    for (let k = 1; k <= 2; k++) {
      for (let i = 1; i <= 자료.동시그룹[0][0]; i++) {
        const ma = dongCalc(자료, i, 학년, 반, 요일, 교시, 과목);
        if (ma[2] === 0) continue;
        const m2 = ma[0] + ma[1];
        if ((k === 1 && ma[0] === 자료.동시그룹[i][0]) || (k === 2 && m2 === 자료.동시그룹[i][0])) {
          return String.fromCharCode(ma[2] + 64) + "_";
        }
      }
    }
    return "";
  }

  // 1단계: 학년별/전교 과목당 담당 교사 집합 수집 (수탐구, AP선대 등 교사 2인 이상 과목 판별)
  const gradeSubjectTeachers = new Map<string, Set<string>>();
  const schoolWideSubjectTeachers = new Map<string, Set<string>>();

  for (let grade = 1; grade <= 3; grade++) {
    const classCount = Math.min(4, json.학급수?.[grade] || 4);
    for (let cls = 1; cls <= classCount; cls++) {
      for (let day = 1; day <= 5; day++) {
        for (let per = 1; per <= 7; per++) {
          const rawVal = rawDaily?.[grade]?.[cls]?.[day]?.[per] ??
                         rawDefault?.[grade]?.[cls]?.[day]?.[per] ?? 0;
          if (!rawVal) continue;
          const numPart = typeof rawVal === "string" && rawVal.startsWith(">") ? rawVal.substring(1) : rawVal;
          const ma = splitData(numPart);
          const th = ma[0] || 0;
          let sb = (ma[1] || 0) + Number(ma[2] || 0) * 1000;
          sb = sb % 분리;
          const subjectName = subjects[sb] || "";
          const teacherName = teachers[th] || "";
          if (subjectName && teacherName) {
            const key = `${grade}_${subjectName}`;
            if (!gradeSubjectTeachers.has(key)) gradeSubjectTeachers.set(key, new Set());
            gradeSubjectTeachers.get(key)!.add(teacherName);

            if (!schoolWideSubjectTeachers.has(subjectName)) schoolWideSubjectTeachers.set(subjectName, new Set());
            schoolWideSubjectTeachers.get(subjectName)!.add(teacherName);
          }
        }
      }
    }
  }

  for (let grade = 1; grade <= 3; grade++) {
    const classCount = Math.min(4, json.학급수?.[grade] || 4);
    for (let cls = 1; cls <= classCount; cls++) {
      result[String(grade)][String(cls)] = {
        월: [],
        화: [],
        수: [],
        목: [],
        금: [],
      };

      for (let dayIdx = 0; dayIdx < 5; dayIdx++) {
        const dayKey = DAYS[dayIdx];
        const dayNumber = dayIdx + 1;
        const periods: string[] = [];

        for (let period = 1; period <= 7; period++) {
          const rawVal = rawDaily?.[grade]?.[cls]?.[dayNumber]?.[period] ??
                         rawDefault?.[grade]?.[cls]?.[dayNumber]?.[period] ?? 0;

          if (!rawVal) {
            periods.push("");
            continue;
          }

          let numberPart = rawVal;
          if (typeof rawVal === "string" && rawVal.startsWith(">")) {
            numberPart = rawVal.substring(1);
          }

          const ma = splitData(numberPart);
          const th = ma[0] || 0;
          let sb = (ma[1] || 0) + Number(ma[2] || 0) * 1000;

          let prefix = mTime(sb, 분리);
          sb = sb % 분리;
          let subjectName = subjects[sb] || "";
          const teacherName = teachers[th] || "";

          if (prefix === "") {
            prefix = 동시그룹코드(json, grade, cls, sb, dayNumber, period);
          }

          // 창체 제외, 과목명이 같으나 담당 교사가 2명 이상인 경우 괄호치고 선생님 성 표시: 예: AP선대(정), 수탐구(김)
          const key = `${grade}_${subjectName}`;
          const isMultiTeacher =
            !subjectName.startsWith("창체") &&
            ((gradeSubjectTeachers.get(key)?.size || 0) >= 2 ||
              (schoolWideSubjectTeachers.get(subjectName)?.size || 0) >= 2);

          if (isMultiTeacher && teacherName) {
            const surname = teacherName.replace(/[^가-힣a-zA-Z]/g, "")[0] || teacherName[0] || "";
            if (surname) {
              subjectName = `${subjectName}(${surname})`;
            }
          }

          const fullSubject = prefix + subjectName;
          periods.push(fullSubject);
        }

        result[String(grade)][String(cls)][dayKey] = periods;
      }
    }
  }

  return result;
}

function timetableProxyMiddleware(req: any, res: any, next: any) {
  if (req.url?.startsWith("/api/timetable")) {
    (async () => {
      const now = Date.now();
      const force = req.url?.includes("force") || req.url?.includes("t=");
      if (!force && devCachedTimetable && (now - devCacheTimestamp < DEV_CACHE_TTL_MS)) {
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
        res.end(JSON.stringify({
          success: true,
          cached: true,
          updatedAt: new Date(devCacheTimestamp).toISOString(),
          timetable: devCachedTimetable,
        }));
        return;
      }

      try {
        const pageHtml = await fetchComciTcp("/st");
        const idx = pageHtml.indexOf("school_ra(sc)");
        const idx2 = pageHtml.indexOf("sc_data('");

        if (idx === -1 || idx2 === -1) {
          throw new Error("컴시간 식별 코드를 찾을 수 없습니다.");
        }

        const extractSchoolRa = pageHtml.substr(idx, 50).replace(/\s/g, "");
        const schoolRaMatch = extractSchoolRa.match(/url:'.(.*?)'/);
        const extractScData = pageHtml.substr(idx2, 30).replace(/\s/g, "");
        const scDataMatch = extractScData.match(/\(.*?\)/);

        if (!schoolRaMatch || !scDataMatch) {
          throw new Error("컴시간 파라미터 매칭 실패");
        }

        const extractCode = schoolRaMatch[1];
        const scData = scDataMatch[0].replace(/[()]/g, "").replace(/'/g, "").split(",");

        const s7 = scData[0] + 34089;
        const base64Query = Buffer.from(s7 + "_0_" + scData[2]).toString("base64");
        const dataPath = extractCode.split("?")[0] + "?" + base64Query;

        const dataRaw = await fetchComciTcp(dataPath);
        const jsonStart = dataRaw.indexOf("{");
        const jsonEnd = dataRaw.lastIndexOf("}");
        if (jsonStart === -1 || jsonEnd === -1) {
          throw new Error("유효한 시간표 JSON 데이터를 찾지 못했습니다.");
        }

        const json = JSON.parse(dataRaw.substring(jsonStart, jsonEnd + 1));
        const timetable = parseComciganJsonDev(json);

        devCachedTimetable = timetable;
        devCacheTimestamp = now;

        res.setHeader("Content-Type", "application/json");
        res.setHeader("Cache-Control", "public, max-age=300");
        res.end(JSON.stringify({
          success: true,
          cached: false,
          updatedAt: new Date(now).toISOString(),
          timetable,
        }));
      } catch (err: any) {
        if (devCachedTimetable) {
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({
            success: true,
            cached: true,
            fallback: true,
            error: err.message,
            timetable: devCachedTimetable,
          }));
          return;
        }
        res.setHeader("Content-Type", "application/json");
        res.statusCode = 500;
        res.end(JSON.stringify({ success: false, error: err.message || "Failed to fetch timetable" }));
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
        server.middlewares.use(tickerSearchMiddleware);
        server.middlewares.use(timetableProxyMiddleware);
      },
      configurePreviewServer(server) {
        server.middlewares.use(marketProxyMiddleware);
        server.middlewares.use(tickerSearchMiddleware);
        server.middlewares.use(timetableProxyMiddleware);
      }
    }
  ],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        brand: resolve(__dirname, "brand.html"),
        astronomy: resolve(__dirname, "astronomy-test/index.html"),
      },
    },
  },
});
