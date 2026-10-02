interface Env {
  // Cloudflare bindings
}

function parseCookies(cookieStr: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!cookieStr) return cookies;
  for (const pair of cookieStr.split(";")) {
    const [key, ...rest] = pair.trim().split("=");
    if (key) cookies[key.trim()] = rest.join("=");
  }
  return cookies;
}

export const onRequestGet = async (context: { request: Request; env: Env }) => {
  const cookies = parseCookies(context.request.headers.get("Cookie") || "");
  const uid = cookies["session_uid"];
  const email = cookies["session_email"];
  const token = cookies["session_token"];

  if (!uid) {
    return new Response(JSON.stringify({ authenticated: false }), {
      status: 401,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    });
  }

  return new Response(
    JSON.stringify({
      authenticated: true,
      uid: decodeURIComponent(uid),
      email: decodeURIComponent(email || ""),
      token: token ? decodeURIComponent(token) : "",
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
