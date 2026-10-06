/**
 * Adapter that lets the Web-standard OAuth handlers run in a Vercel (Node) serverless function.
 * Server-only: do not import from browser code.
 * Keep it self-contained (no relative imports): the Vercel entry points load it as native Node ESM,
 * where extensionless relative imports fail with ERR_MODULE_NOT_FOUND.
 */

export interface NodeRequestLike {
  method?: string;
  url?: string;
  headers: Record<string, string | string[] | undefined>;
}

export interface NodeResponseLike {
  statusCode: number;
  setHeader(name: string, value: string | string[]): unknown;
  end(body?: string): unknown;
}

export function toWebRequest(req: NodeRequestLike): Request {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) for (const v of value) headers.append(key, v);
    else headers.set(key, value);
  }
  const forwardedProto = headers.get("x-forwarded-proto")?.split(",")[0].trim();
  const proto = forwardedProto === "http" || forwardedProto === "https" ? forwardedProto : "https";
  const host = headers.get("x-forwarded-host")?.split(",")[0].trim() || headers.get("host") || "localhost";
  return new Request(`${proto}://${host}${req.url ?? "/"}`, { method: req.method ?? "GET", headers });
}

export async function sendWebResponse(res: NodeResponseLike, response: Response): Promise<void> {
  res.statusCode = response.status;
  const cookies: string[] = [];
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() === "set-cookie") cookies.push(value);
    else res.setHeader(key, value);
  });
  if (cookies.length > 0) res.setHeader("Set-Cookie", cookies);
  res.end(await response.text());
}
