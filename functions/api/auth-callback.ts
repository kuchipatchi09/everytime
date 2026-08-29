interface Env {
  // Cloudflare bindings
}

export const onRequestPost = async (context: { request: Request; env: Env }) => {
  try {
    const formData = await context.request.formData();
    const token = formData.get("token") as string | null;
    const uid = formData.get("uid") as string | null;
    const email = formData.get("email") as string | null;

    if (!token || !uid) {
      return new Response("인증 데이터가 누락되었습니다.", {
        status: 400,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    // 자체 세션 쿠키 설정 (30일 유지: 2592000초)
    const cookieOpts = "Path=/; Max-Age=2592000; HttpOnly; Secure; SameSite=Lax";
    const headers = new Headers();
    headers.append("Set-Cookie", `session_token=${encodeURIComponent(token)}; ${cookieOpts}`);
    headers.append("Set-Cookie", `session_uid=${encodeURIComponent(uid)}; ${cookieOpts}`);
    headers.append("Set-Cookie", `session_email=${encodeURIComponent(email || "")}; ${cookieOpts}`);

    // 세션 설정 후 메인 페이지로 리다이렉트
    headers.set("Location", "/");
    return new Response(null, { status: 302, headers });
  } catch (err: any) {
    return new Response(`오류 발생: ${err.message}`, {
      status: 500,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
};

export const onRequestGet = async () => {
  return new Response(null, {
    status: 302,
    headers: { Location: "/" },
  });
};
