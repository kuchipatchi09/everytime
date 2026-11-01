// functions/api/me.ts
// cnsh.life (cnsh-eta) 세션 정보 조회 및 chating-main 프로필 동기화

import { Env, verifySession, fetchChatingProfile } from "./_profileSync";

export const onRequestGet = async (context: { request: Request; env: Env }) => {
  const user = await verifySession(context.request, context.env);

  if (!user) {
    return new Response(JSON.stringify({ authenticated: false }), {
      status: 401,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    });
  }

  // chating-main 프로필 정보 비동기 조회 (본인 uid 기준)
  let chatingProfile: any = null;
  try {
    chatingProfile = await fetchChatingProfile(user, context.env);
  } catch (e) {
    console.warn("[me.ts] fetchChatingProfile error:", e);
  }

  return new Response(
    JSON.stringify({
      authenticated: true,
      uid: user.uid,
      email: user.email,
      emailVerified: user.emailVerified,
      token: user.token || "",
      displayName: chatingProfile?.displayName || null,
      photoURL: chatingProfile?.photoURL || null,
      schoolGrade: chatingProfile?.schoolGrade || null,
      schoolClass: chatingProfile?.schoolClass || null,
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
