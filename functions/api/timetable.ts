// Cloudflare Pages Function: /api/timetable
// Fetch & parse Chungnam Science High School live timetable from comci.net:4082

import { connect } from 'cloudflare:sockets';

const COMCIGAN_HOST = 'comci.net';
const COMCIGAN_PORT = 4082;
const SCHOOL_CODE = 34089; // 충남과학고등학교

let cachedTimetable: any = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5분 캐시

async function fetchTcpData(path: string): Promise<string> {
  const socket = connect({ hostname: COMCIGAN_HOST, port: COMCIGAN_PORT });
  const writer = socket.writable.getWriter();
  const encoder = new TextEncoder();
  await writer.write(
    encoder.encode(`GET ${path} HTTP/1.1\r\nHost: ${COMCIGAN_HOST}:${COMCIGAN_PORT}\r\nUser-Agent: Mozilla/5.0\r\nConnection: close\r\n\r\n`)
  );
  writer.releaseLock();

  const reader = socket.readable.getReader();
  const chunks: Uint8Array[] = [];
  while (true) {
    const { value, done } = await reader.read();
    if (value) chunks.push(value);
    if (done) break;
  }

  let totalLen = 0;
  for (const c of chunks) totalLen += c.length;
  const combined = new Uint8Array(totalLen);
  let offset = 0;
  for (const c of chunks) {
    combined.set(c, offset);
    offset += c.length;
  }

  // latin1 for binary/header scanning, utf-8 for json body
  return new TextDecoder('utf-8').decode(combined);
}

function parseComciganJson(json: any) {
  const result: Record<string, Record<string, Record<string, string[]>>> = {
    '1': {},
    '2': {},
    '3': {},
  };
  const DAYS = ['월', '화', '수', '목', '금'];
  const 분리 = json.분리 || 100;
  const subjects: string[] = json.자료492 || [];
  const rawDefault = json.자료481;
  const rawDaily = json.자료147;

  function splitData(dat: any): number[] {
    if (!dat) return [0, 0];
    const matches = String(dat).match(/\d{1,3}(?=(\d{3})+(?!\d))|\d{1,3}$/g);
    if (!matches) return [0, 0];
    return matches.reverse().map(Number);
  }

  function mTime(mm: number, m2: number): string {
    if (m2 === 100) return '';
    const t = Math.floor(mm / m2);
    if (t >= 1 && t <= 26) {
      return String.fromCharCode(t + 64) + '_';
    }
    return '';
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
      const m3 = typeof rawVal === 'string' && rawVal.startsWith('>') ? Number(rawVal.substring(1)) : Number(rawVal);
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
    if (!Array.isArray(자료.동시그룹) || !자료.동시그룹[0]) return '';
    for (let k = 1; k <= 2; k++) {
      for (let i = 1; i <= 자료.동시그룹[0][0]; i++) {
        const ma = dongCalc(자료, i, 학년, 반, 요일, 교시, 과목);
        if (ma[2] === 0) continue;
        const m2 = ma[0] + ma[1];
        if ((k === 1 && ma[0] === 자료.동시그룹[i][0]) || (k === 2 && m2 === 자료.동시그룹[i][0])) {
          return String.fromCharCode(ma[2] + 64) + '_';
        }
      }
    }
    return '';
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
            periods.push('');
            continue;
          }

          let numberPart = rawVal;
          if (typeof rawVal === 'string' && rawVal.startsWith('>')) {
            numberPart = rawVal.substring(1);
          }

          const ma = splitData(numberPart);
          const th = ma[0] || 0;
          let sb = (ma[1] || 0) + Number(ma[2] || 0) * 1000;

          let prefix = mTime(sb, 분리);
          sb = sb % 분리;
          const subjectName = subjects[sb] || '';
          if (prefix === '') {
            prefix = 동시그룹코드(json, grade, cls, sb, dayNumber, period);
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

export const onRequest = async () => {
  const now = Date.now();
  if (cachedTimetable && (now - cacheTimestamp < CACHE_TTL_MS)) {
    return jsonResponse({ success: true, cached: true, updatedAt: new Date(cacheTimestamp).toISOString(), timetable: cachedTimetable }, 200);
  }

  try {
    // 1. Fetch /st to extract dynamic endpoint code & scData
    const pageHtml = await fetchTcpData('/st');
    const idx = pageHtml.indexOf('school_ra(sc)');
    const idx2 = pageHtml.indexOf("sc_data('");

    if (idx === -1 || idx2 === -1) {
      throw new Error('컴시간 식별 코드를 페이지에서 찾을 수 없습니다.');
    }

    const extractSchoolRa = pageHtml.substr(idx, 50).replace(/\s/g, '');
    const schoolRaMatch = extractSchoolRa.match(/url:'.(.*?)'/);
    const extractScData = pageHtml.substr(idx2, 30).replace(/\s/g, '');
    const scDataMatch = extractScData.match(/\(.*?\)/);

    if (!schoolRaMatch || !scDataMatch) {
      throw new Error('컴시간 파라미터 매칭 실패');
    }

    const extractCode = schoolRaMatch[1];
    const scData = scDataMatch[0].replace(/[()]/g, '').replace(/'/g, '').split(',');

    // 2. Build timetable request path
    const s7 = scData[0] + SCHOOL_CODE;
    const base64Query = btoa(s7 + '_0_' + scData[2]);
    const dataPath = extractCode.split('?')[0] + '?' + base64Query;

    // 3. Fetch timetable JSON
    const dataRaw = await fetchTcpData(dataPath);
    const jsonStart = dataRaw.indexOf('{');
    const jsonEnd = dataRaw.lastIndexOf('}');
    if (jsonStart === -1 || jsonEnd === -1) {
      throw new Error('유효한 시간표 JSON 데이터를 수신하지 못했습니다.');
    }

    const json = JSON.parse(dataRaw.substring(jsonStart, jsonEnd + 1));
    const timetable = parseComciganJson(json);

    cachedTimetable = timetable;
    cacheTimestamp = now;

    return jsonResponse({
      success: true,
      cached: false,
      updatedAt: new Date(now).toISOString(),
      timetable,
    }, 200);
  } catch (err: any) {
    if (cachedTimetable) {
      return jsonResponse({
        success: true,
        cached: true,
        fallback: true,
        error: err.message,
        timetable: cachedTimetable,
      }, 200);
    }
    return jsonResponse({
      success: false,
      error: err.message || '시간표 파싱 오류',
    }, 500);
  }
};

export const onRequestOptions = async () => {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    },
  });
};

function jsonResponse(obj: any, status: number) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=300',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
