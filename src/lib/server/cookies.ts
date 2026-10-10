export interface CookieOptions {
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "lax" | "strict";
  path?: string;
  maxAge?: number;
}

/** Reads one cookie from a request's Cookie header. */
export function getCookie(req: Request, name: string): string | undefined {
  const header = req.headers.get("cookie");
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) {
      try {
        return decodeURIComponent(part.slice(i + 1).trim());
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

/** Appends a Set-Cookie header. */
export function setCookie(headers: Headers, name: string, value: string, opts: CookieOptions = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${opts.path ?? "/"}`];
  if (opts.maxAge !== undefined) parts.push(`Max-Age=${opts.maxAge}`);
  if (opts.maxAge === 0) parts.push("Expires=Thu, 01 Jan 1970 00:00:00 GMT");
  if (opts.httpOnly) parts.push("HttpOnly");
  if (opts.secure) parts.push("Secure");
  if (opts.sameSite) parts.push(`SameSite=${opts.sameSite === "lax" ? "Lax" : "Strict"}`);
  headers.append("Set-Cookie", parts.join("; "));
}

export function deleteCookie(headers: Headers, name: string, path = "/") {
  setCookie(headers, name, "", { path, maxAge: 0 });
}
