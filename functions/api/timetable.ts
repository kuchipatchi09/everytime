// Cloudflare Pages Function: /api/timetable
// Fetch & parse Chungnam Science High School live timetable from comci.net:4082

import { connect } from 'cloudflare:sockets';

const COMCIGAN_HOST = 'comci.net';
const COMCIGAN_PORT = 4082;
const SCHOOL_CODE = 34089; // 충남과학고등학교

let cachedTimetable: any = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 60 * 1000; // 1분 인메모리 캐시

function findHeaderBodySplit(buf: Uint8Array): number {
  for (let i = 0; i <= buf.length - 4; i++) {
    if (buf[i] === 13 && buf[i + 1] === 10 && buf[i + 2] === 13 && buf[i + 3] === 10) {
      return i;
    }
  }
  return -1;
}

function decodeChunkedBody(buf: Uint8Array): Uint8Array {
  const out: Uint8Array[] = [];
  let offset = 0;
  while (offset < buf.length) {
    let lineEnd = -1;
    for (let i = offset; i <= buf.length - 2; i++) {
      if (buf[i] === 13 && buf[i + 1] === 10) {
        lineEnd = i;
        break;
      }
    }
    if (lineEnd === -1) break;
    const sizeHex = new TextDecoder('ascii').decode(buf.subarray(offset, lineEnd)).split(';')[0].trim();
    const chunkSize = parseInt(sizeHex, 16);
    if (!Number.isFinite(chunkSize) || chunkSize <= 0) break;
    const dataStart = lineEnd + 2;
    const dataEnd = Math.min(dataStart + chunkSize, buf.length);
    out.push(buf.subarray(dataStart, dataEnd));
    offset = dataEnd + 2; // skip trailing \r\n
  }
  let total = 0;
  for (const c of out) total += c.length;
  const result = new Uint8Array(total);
  let pos = 0;
  for (const c of out) {
    result.set(c, pos);
    pos += c.length;
  }
  return result;
}

async function fetchComciganHttp(
  path: string,
  extraHeaders: Record<string, string> = {}
): Promise<{ statusCode: number; cookies: string[]; body: string }> {
  const socket = connect({ hostname: COMCIGAN_HOST, port: COMCIGAN_PORT });
  const writer = socket.writable.getWriter();
  const encoder = new TextEncoder();

  const headerLines = [
    `GET ${path} HTTP/1.1`,
    `Host: ${COMCIGAN_HOST}:${COMCIGAN_PORT}`,
    `User-Agent: Mozilla/5.0`,
    `Accept: */*`,
    ...Object.entries(extraHeaders).map(([k, v]) => `${k}: ${v}`),
    `Connection: close`,
    '',
    '',
  ];

  await writer.write(encoder.encode(headerLines.join('\r\n')));
  writer.releaseLock();

  const reader = socket.readable.getReader();
  const chunks: Uint8Array[] = [];
  let totalLen = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (value) {
      totalLen += value.length;
      if (totalLen > 2 * 1024 * 1024) {
        throw new Error('Comcigan response payload exceeded maximum limit of 2MB');
      }
      chunks.push(value);
    }
    if (done) break;
  }

  const combined = new Uint8Array(totalLen);
  let offset = 0;
  for (const c of chunks) {
    combined.set(c, offset);
    offset += c.length;
  }

  const splitIdx = findHeaderBodySplit(combined);
  if (splitIdx === -1) {
    return {
      statusCode: 200,
      cookies: [],
      body: new TextDecoder('utf-8').decode(combined),
    };
  }

  const rawHeaderText = new TextDecoder('utf-8').decode(combined.subarray(0, splitIdx));
  const headerLinesResp = rawHeaderText.split('\r\n');
  const statusMatch = headerLinesResp[0]?.match(/HTTP\/\d\.\d\s+(\d+)/);
  const statusCode = statusMatch ? Number(statusMatch[1]) : 200;

  const cookies: string[] = [];
  let isChunked = false;
  for (let i = 1; i < headerLinesResp.length; i++) {
    const line = headerLinesResp[i];
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const name = line.slice(0, colonIdx).trim().toLowerCase();
    const val = line.slice(colonIdx + 1).trim();
    if (name === 'set-cookie') {
      cookies.push(val.split(';')[0]);
    } else if (name === 'transfer-encoding' && val.toLowerCase().includes('chunked')) {
      isChunked = true;
    }
  }

  let bodyBytes = combined.subarray(splitIdx + 4);
  if (isChunked) {
    bodyBytes = decodeChunkedBody(bodyBytes);
  }

  return {
    statusCode,
    cookies,
    body: new TextDecoder('utf-8').decode(bodyBytes),
  };
}

function decodeComciganObfuscatedBlocks(source: string, marker: string): string[] {
  const blocks: string[] = [];
  let pos = 0;
  while ((pos = source.indexOf(marker, pos)) !== -1) {
    const argStart = source.indexOf('([[', pos);
    const argEnd = source.indexOf(');', argStart);
    if (argStart === -1 || argEnd === -1) break;
    const [arr, key] = JSON.parse('[' + source.slice(argStart + 1, argEnd) + ']');
    let decoded = '';
    for (let i = 0; i < arr.length; i++) {
      if (arr[i][0]) {
        decoded += arr[i][1];
        continue;
      }
      const hex = arr[i][1];
      for (let j = 0; j < hex.length; j += 4) {
        decoded += String.fromCharCode(parseInt(hex.substr(j, 4), 16) ^ ((key + (j / 4) * 13) & 255));
      }
    }
    blocks.push(decoded);
    pos = argEnd + 2;
  }
  return blocks;
}

function decodeBase64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes;
}

function decodeHexToBytes(hex: string): Uint8Array {
  const clean = hex.trim();
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.substr(i * 2, 2), 16);
  }
  return bytes;
}

function decodeComciganText(encoded: any, xorKey: string): string {
  if (!encoded) return '';
  if (!xorKey) return String(encoded);
  const buf = decodeBase64ToBytes(String(encoded));
  const bytes = new Uint8Array(buf.length);
  for (let i = 0; i < buf.length; i++) {
    bytes[i] = buf[i] ^ xorKey.charCodeAt(i % xorKey.length);
  }
  return new TextDecoder('euc-kr', { fatal: false }).decode(bytes);
}

async function decryptComciganPayload(rawData: string, aesKey: Uint8Array | null): Promise<string> {
  const cleaned = String(rawData || '').replace(/\x00+$/, '');
  if (cleaned.startsWith('{')) {
    return cleaned;
  }
  const parts = cleaned.split(':');
  if (parts.length !== 4 || !parts[0]) {
    return cleaned;
  }
  if (!aesKey) {
    throw new Error('컴시간 복호화 키를 찾을 수 없습니다.');
  }

  const decodePart = parts[0] === 'enc1' ? decodeHexToBytes : decodeBase64ToBytes;
  const iv = decodePart(parts[1]);
  const ciphertext = decodePart(parts[2]);
  const tag = decodePart(parts[3]);

  const hmacKeyBytes = await crypto.subtle.digest('SHA-256', aesKey);
  const hmacKey = await crypto.subtle.importKey(
    'raw',
    hmacKeyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );
  const signedPayload = new TextEncoder().encode(parts.slice(0, 3).join(':'));
  const verified = await crypto.subtle.verify('HMAC', hmacKey, tag, signedPayload);
  if (!verified) {
    throw new Error('컴시간 시간표 데이터 HMAC 인증 실패');
  }

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    aesKey,
    { name: 'AES-CBC' },
    false,
    ['decrypt']
  );
  const decryptedBuf = await crypto.subtle.decrypt(
    { name: 'AES-CBC', iv },
    cryptoKey,
    ciphertext
  );
  return new TextDecoder('utf-8').decode(decryptedBuf).replace(/\x00+$/, '');
}

function parseComciganJson(json: any, xorKey = '', fieldMap: Record<string, string | undefined> = {}) {
  const result: Record<string, Record<string, Record<string, string[]>>> = {
    '1': {},
    '2': {},
    '3': {},
  };
  const DAYS = ['월', '화', '수', '목', '금'];
  const 분리 = json.분리 || 100;
  const rawSubjects: any[] = (fieldMap.subjectKey && json[fieldMap.subjectKey]) || json.자료173 || json.자료492 || [];
  const rawTeachers: any[] = (fieldMap.teacherKey && json[fieldMap.teacherKey]) || json.자료194 || json.자료446 || [];
  const subjects: string[] = rawSubjects.map((v) => (v ? decodeComciganText(v, xorKey) : ''));
  const teachers: string[] = rawTeachers.map((v) => {
    if (!v) return '';
    const name = decodeComciganText(v, xorKey);
    if ((name.includes('*') && !name.startsWith('*') && !name.endsWith('*')) || (name.length === 2 && name[1] === '*')) {
      return name;
    }
    return name.replace('*', '');
  });
  const rawDefault = (fieldMap.defaultKey && json[fieldMap.defaultKey]) || json.자료162 || json.자료481;
  const rawDaily = (fieldMap.dailyKey && json[fieldMap.dailyKey]) || json.자료152 || json.자료147;

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
      const rawVal = ((fieldMap.dailyKey && 자료[fieldMap.dailyKey]) || 자료.자료152 || 자료.자료147)?.[학년2]?.[반2]?.[요일]?.[교시] ?? 0;
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

  // 1단계: 학년별/전교 과목당 담당 교사 집합 수집 (수탐구, AP선대 등 교사가 2명 이상인 과목 판별용)
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
          const numPart = typeof rawVal === 'string' && rawVal.startsWith('>') ? rawVal.substring(1) : rawVal;
          const ma = splitData(numPart);
          const th = ma[0] || 0;
          let sb = (ma[1] || 0) + Number(ma[2] || 0) * 1000;
          sb = sb % 분리;
          const subjectName = subjects[sb] || '';
          const teacherName = teachers[th] || '';
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

  // 2단계: 학급별 주간 시간표 빌드
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
          let subjectName = subjects[sb] || '';
          const teacherName = teachers[th] || '';

          if (prefix === '') {
            prefix = 동시그룹코드(json, grade, cls, sb, dayNumber, period);
          }

          // 창체 제외, 과목명이 같으나 담당 교사가 2명 이상인 경우 괄호치고 선생님 성 표시: 예: AP선대(정), 수탐구(김)
          const key = `${grade}_${subjectName}`;
          const isMultiTeacher =
            !subjectName.startsWith('창체') &&
            ((gradeSubjectTeachers.get(key)?.size || 0) >= 2 ||
              (schoolWideSubjectTeachers.get(subjectName)?.size || 0) >= 2);

          if (isMultiTeacher && teacherName) {
            const surname = teacherName.replace(/[^가-힣a-zA-Z]/g, '')[0] || teacherName[0] || '';
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

export const onRequest = async (context: any) => {
  const url = new URL(context.request.url);
  const force = url.searchParams.has('force') || url.searchParams.has('t');
  const now = Date.now();

  if (!force && cachedTimetable && (now - cacheTimestamp < CACHE_TTL_MS)) {
    return jsonResponse({ success: true, cached: true, updatedAt: new Date(cacheTimestamp).toISOString(), timetable: cachedTimetable }, 200);
  }

  try {
    // 1. Fetch /st to extract dynamic endpoint code, scData, token & keys
    const stRes = await fetchComciganHttp('/st');
    const pageHtml = stRes.body;
    const cookies = stRes.cookies.join('; ');
    const tokenMatch = pageHtml.match(/window\.__HourRequestToken\s*=\s*'([^']+)'/);
    const hourToken = tokenMatch ? tokenMatch[1] : '';

    let dataPath = '';
    let xorKey = '';
    let aesKey: Uint8Array | null = null;
    const fieldMap: Record<string, string | undefined> = {};

    if (pageHtml.includes('/* hour-obfuscated-v2 */')) {
      const outerBlocks = decodeComciganObfuscatedBlocks(pageHtml, '/* hour-obfuscated-v2 */');
      const mainScript = outerBlocks[0] || '';
      const nestedScript = decodeComciganObfuscatedBlocks(mainScript, '/* hour-ajax-obfuscated-v1 */').join('\n');

      const timetableAjaxMatch = nestedScript.match(
        /function\s+(\w+)\s*\(\s*sc\s*,\s*sc2\s*,\s*da1\s*,\s*r\s*,\s*success\s*\)[\s\S]*?url:'\.([^']+)'[\s\S]*?btoa\([^)]*?'(_[^']+)'\)/
      );
      if (!timetableAjaxMatch) {
        throw new Error('컴시간 시간표 API 엔드포인트를 찾을 수 없습니다.');
      }

      const ajaxTimetableFn = timetableAjaxMatch[1];
      const endpoint = timetableAjaxMatch[2].split('?')[0];
      const querySuffix = timetableAjaxMatch[3];

      const scDataFnMatch = mainScript.match(
        new RegExp(`function\\s+(\\w+)\\s*\\(\\s*sc\\s*,\\s*sc2\\s*,\\s*r\\s*,\\s*nw\\s*\\)[\\s\\S]*?${ajaxTimetableFn}\\(sc,`)
      );
      const scDataFn = scDataFnMatch ? scDataFnMatch[1] : 'sc_data';
      const scPrefixMatch = mainScript.match(new RegExp(`${scDataFn}\\('([^']+)'`));
      if (!scPrefixMatch) {
        throw new Error('컴시간 학교 접두사 파라미터를 찾을 수 없습니다.');
      }
      const scPrefix = scPrefixMatch[1];

      const s7 = scPrefix + SCHOOL_CODE;
      const base64Query = btoa(`${s7}_0_1${querySuffix}`);
      dataPath = `${endpoint}?${base64Query}`;

      const qKeyMatch = nestedScript.match(/String\.fromCharCode\(([\d,\s]+)\)[\s\S]*?TextDecoder\('euc-kr'/);
      if (qKeyMatch) {
        xorKey = qKeyMatch[1].split(',').map((n) => String.fromCharCode(Number(n.trim()))).join('');
      }

      const hKeyMatch = nestedScript.match(/CryptoJS\.enc\.Hex\.parse\(\(function\(a\)\{return\s+([^;]+);\}\)\(\[([^\]]+)\]\)\)/);
      if (hKeyMatch) {
        const partsArr = JSON.parse('[' + hKeyMatch[2].replace(/'/g, '"') + ']');
        const orderMatches = [...hKeyMatch[1].matchAll(/a\[(\d+)\]/g)].map((m) => Number(m[1]));
        const aesKeyHex = orderMatches.map((idx) => partsArr[idx]).join('');
        aesKey = decodeHexToBytes(aesKeyHex);
      }

      fieldMap.defaultKey = mainScript.match(/원자료=Q자료\(자료\.([A-Za-z0-9_가-힣]+)\[학년\]/)?.[1];
      fieldMap.dailyKey = mainScript.match(/일일자료=Q자료\(자료\.([A-Za-z0-9_가-힣]+)\[학년\]/)?.[1];
      fieldMap.teacherKey = mainScript.match(/성명=\w+\(자료\.([A-Za-z0-9_가-힣]+)\[th\]\)/)?.[1];
      fieldMap.subjectKey = mainScript.match(/과목명=\w+\(자료\.([A-Za-z0-9_가-힣]+)\[sb\]\)/)?.[1];
    } else {
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

      const s7 = scData[0] + SCHOOL_CODE;
      const base64Query = btoa(s7 + '_0_' + scData[2]);
      dataPath = extractCode.split('?')[0] + '?' + base64Query;
    }

    // 2. Fetch & decrypt timetable JSON
    const requestHeaders: Record<string, string> = {
      Referer: `http://${COMCIGAN_HOST}:${COMCIGAN_PORT}/st`,
    };
    if (cookies) requestHeaders.Cookie = cookies;
    if (hourToken) requestHeaders['X-Hour-Token'] = hourToken;

    const dataRes = await fetchComciganHttp(dataPath, requestHeaders);
    if (dataRes.statusCode >= 400) {
      throw new Error(`컴시간 데이터 요청 실패 (HTTP ${dataRes.statusCode})`);
    }

    const dataRaw = await decryptComciganPayload(dataRes.body, aesKey);
    const jsonStart = dataRaw.indexOf('{');
    const jsonEnd = dataRaw.lastIndexOf('}');
    if (jsonStart === -1 || jsonEnd === -1) {
      throw new Error('유효한 시간표 JSON 데이터를 수신하지 못했습니다.');
    }

    const json = JSON.parse(dataRaw.substring(jsonStart, jsonEnd + 1));
    const timetable = parseComciganJson(json, xorKey, fieldMap);

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
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
