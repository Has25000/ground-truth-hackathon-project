import "server-only";
import https from "node:https";

// The pipeline's outbound HTTP goes through node:https with its own pool.
// Next.js wraps global fetch, and under the pipeline's parallel load those
// calls queued for ~60s each (measured: 67s via fetch vs 4s via https for the
// same Claude request). This keeps external API calls independent of that.

const agent = new https.Agent({ keepAlive: true, maxSockets: 64 });

export async function httpsFetch(input: string | URL | Request, init: RequestInit = {}): Promise<Response> {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const headers: Record<string, string> = {};
  new Headers(init.headers ?? (input instanceof Request ? input.headers : undefined)).forEach((v, k) => (headers[k] = v));

  let body: Buffer | undefined;
  if (init.body != null) {
    if (typeof init.body === "string") body = Buffer.from(init.body);
    else if (init.body instanceof ArrayBuffer || ArrayBuffer.isView(init.body)) body = Buffer.from(init.body as ArrayBuffer);
    else body = Buffer.from(await new Response(init.body).arrayBuffer());
    headers["content-length"] = String(body.length);
  }

  return new Promise<Response>((resolve, reject) => {
    const req = https.request(url, { method: init.method ?? "GET", headers, agent, signal: init.signal ?? undefined }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("error", reject);
      res.on("end", () => {
        const out = new Headers();
        for (const [k, v] of Object.entries(res.headers)) if (v != null) out.set(k, Array.isArray(v) ? v.join(", ") : v);
        const status = res.statusCode ?? 500;
        const nullBody = status === 204 || status === 304;
        resolve(new Response(nullBody ? null : Buffer.concat(chunks), { status, statusText: res.statusMessage, headers: out }));
      });
    });
    req.on("error", reject);
    req.end(body);
  });
}
