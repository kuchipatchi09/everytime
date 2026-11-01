// functions/api/profile.ts
// cnsh.life (cnsh-eta) 사용자 프로필 조회 및 chating-main 양방향 동기화 API

import {
  Env,
  verifySession,
  fetchChatingProfile,
  updateChatingProfile,
} from "./_profileSync";

function isOriginAllowed(origin: string | null, requestUrl: string): boolean {
  if (!origin) return false;
  try {
    const originHost = new URL(origin).host.toLowerCase();
    const reqHost = new URL(requestUrl).host.toLowerCase();
    return originHost === reqHost || originHost === "cnsh.life" || originHost.endsWith(".cnsh.life");
  } catch {
    return false;
  }
}

export const onRequestGet = async (context: { request: Request; env: Env }) => {
  const user = await verifySession(context.request, context.env);
  if (!user) {
    return new Response(JSON.stringify({ error: "로그인이 필요합니다." }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const profile = await fetchChatingProfile(user, context.env);
  return new Response(
    JSON.stringify({
      success: true,
      profile: profile || {
        uid: user.uid,
        displayName: null,
        photoURL: null,
        schoolGrade: null,
        schoolClass: null,
      },
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    }
  );
};

export const onRequestPost = async (context: { request: Request; env: Env }) => {
  const { request, env } = context;

  // 1. CSRF 검증
  const origin = request.headers.get("Origin");
  if (origin && !isOriginAllowed(origin, request.url)) {
    return new Response(JSON.stringify({ error: "CSRF 검증 실패: 허용되지 않은 출처입니다." }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  // 2. 세션 검증
  const user = await verifySession(request, env);
  if (!user) {
    return new Response(JSON.stringify({ error: "로그인이 필요합니다." }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // 3. 페이로드 파싱 및 검증
  let body: any = {};
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "잘못된 JSON 형식입니다." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const displayName = typeof body.displayName === "string"
    ? body.displayName.trim().slice(0, 50)
    : undefined;

  let schoolGrade: string | null | undefined = undefined;
  if (body.schoolGrade !== undefined) {
    const rawGrade = String(body.schoolGrade).trim();
    if (["1", "2", "3"].includes(rawGrade)) {
      schoolGrade = rawGrade;
    } else if (body.schoolGrade === null || rawGrade === "") {
      schoolGrade = null;
    }
  }

  let schoolClass: string | null | undefined = undefined;
  if (body.schoolClass !== undefined) {
    const rawClass = String(body.schoolClass).trim();
    if (["1", "2", "3", "4"].includes(rawClass)) {
      schoolClass = rawClass;
    } else if (body.schoolClass === null || rawClass === "") {
      schoolClass = null;
    }
  }

  // 4. chating-main 백엔드로 S2S 업데이트 전송
  const result = await updateChatingProfile(
    user,
    {
      displayName,
      photoURL: typeof body.photoURL === "string" ? body.photoURL.trim().slice(0, 500) : undefined,
      schoolGrade,
      schoolClass,
    },
    env
  );

  if (!result.success) {
    return new Response(JSON.stringify({ error: result.error || "프로필 저장에 실패했습니다." }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ success: true, profile: result.profile }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
};
