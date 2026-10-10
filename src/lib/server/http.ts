
export type ApiErrorCode =
  | "not_configured"
  | "bad_request"
  | "unauthorized"
  | "not_found"
  | "rate_limited"
  | "upstream_error";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: ApiErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export function json(data: unknown, init: { status?: number; maxAge?: number; headers?: HeadersInit } = {}) {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set(
    "Cache-Control",
    init.maxAge ? `public, max-age=${Math.min(init.maxAge, 300)}, s-maxage=${init.maxAge}` : "no-store",
  );
  return new Response(JSON.stringify(data), { status: init.status ?? 200, headers });
}

export function errorJson(e: unknown) {
  if (e instanceof ApiError) return json({ error: { code: e.code, message: e.message } }, { status: e.status });
  console.error(e);
  return json({ error: { code: "upstream_error", message: "The music service request failed." } }, { status: 502 });
}

/** Wraps a route handler so thrown ApiErrors become JSON error responses. */
export function handler<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A) => {
    try {
      return await fn(...args);
    } catch (e) {
      return errorJson(e);
    }
  };
}

/** Maps an upstream provider response status to a user-facing ApiError. */
export async function upstreamError(provider: string, res: Response): Promise<ApiError> {
  let detail = "";
  try {
    const body = (await res.json()) as { error?: { message?: string } | string; message?: string };
    detail = typeof body.error === "string" ? body.error : (body.error?.message ?? body.message ?? "");
  } catch {
    /* ignore */
  }
  if (res.status === 429) return new ApiError(429, "rate_limited", `${provider} rate limit reached. Try again shortly.`);
  if (res.status === 404) return new ApiError(404, "not_found", `${provider} couldn't find that item.`);
  if (res.status === 401 || res.status === 403)
    return new ApiError(
      res.status === 401 ? 401 : 403,
      "unauthorized",
      `${provider} refused the request${detail ? `: ${detail}` : ""}. Check the API credentials and quota.`,
    );
  return new ApiError(502, "upstream_error", `${provider} returned an error (${res.status})${detail ? `: ${detail}` : ""}.`);
}

/**
 * Small response cache: per-isolate memory plus the Cloudflare edge cache
 * (`caches.default`) when running on Cloudflare. Saves provider API quota.
 */
const memory = new Map<string, { expires: number; body: string }>();

export async function cached<T>(key: string, ttlSeconds: number, load: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = memory.get(key);
  if (hit && hit.expires > now) return JSON.parse(hit.body) as T;

  const edge = (globalThis as { caches?: { default?: Cache } }).caches?.default;
  const cacheUrl = `https://cache.spotube-web.internal/${encodeURIComponent(key)}`;
  if (edge) {
    try {
      const res = await edge.match(cacheUrl);
      if (res) {
        const body = await res.text();
        memory.set(key, { expires: now + ttlSeconds * 1000, body });
        return JSON.parse(body) as T;
      }
    } catch {
      /* cache is optional */
    }
  }

  const value = await load();
  const body = JSON.stringify(value);
  if (memory.size > 500) memory.delete(memory.keys().next().value as string);
  memory.set(key, { expires: now + ttlSeconds * 1000, body });
  if (edge) {
    try {
      await edge.put(
        cacheUrl,
        new Response(body, { headers: { "Cache-Control": `s-maxage=${ttlSeconds}`, "Content-Type": "application/json" } }),
      );
    } catch {
      /* cache is optional */
    }
  }
  return value;
}

export function requireParam(url: URL, name: string, pattern?: RegExp): string {
  const v = url.searchParams.get(name)?.trim();
  if (!v) throw new ApiError(400, "bad_request", `Missing "${name}" parameter.`);
  if (pattern && !pattern.test(v)) throw new ApiError(400, "bad_request", `Invalid "${name}" parameter.`);
  if (v.length > 500) throw new ApiError(400, "bad_request", `"${name}" is too long.`);
  return v;
}

/**
 * Rejects cross-site browser requests so other websites can't spend this
 * deployment's provider API quota. (Non-browser clients can still call the
 * API; keep provider keys restricted in each provider console as well.)
 */
export function sameOrigin(req: Request) {
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none")
    throw new ApiError(403, "unauthorized", "Cross-site requests are not allowed.");
}
