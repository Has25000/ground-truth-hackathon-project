import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { httpsFetch } from "./http";

// Thin clients for the external APIs. Keys are read from server env only.

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchJson(url: string, init: RequestInit, timeoutMs: number) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await httpsFetch(url, { ...init, signal: ctrl.signal });
    const text = await res.text();
    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    return { ok: res.ok, status: res.status, body };
  } finally {
    clearTimeout(t);
  }
}

// ------------------------------------------------------------- You.com ---

export type WebResult = { url: string; title: string; description: string; snippets: string[] };

export async function youSearch(query: string, count = 8): Promise<WebResult[]> {
  const key = process.env.YOU_API_KEY;
  if (!key) return [];
  const t = Date.now();
  try {
    return await youSearchOnce(query, count, key);
  } finally {
    timing("you.com", t);
  }
}

async function youSearchOnce(query: string, count: number, key: string): Promise<WebResult[]> {
  const u = `https://ydc-index.io/v1/search?query=${encodeURIComponent(query)}&count=${count}`;
  const res = await fetchJson(u, { headers: { "X-API-Key": key } }, 25_000).catch(() => null);
  if (!res?.ok) return [];
  const web = ((res.body as { results?: { web?: WebResult[] } })?.results?.web ?? []) as WebResult[];
  return web.map((w) => ({ url: w.url, title: w.title ?? "", description: w.description ?? "", snippets: w.snippets ?? [] }));
}

// ----------------------------------------------------------- Firecrawl ---

export async function firecrawlScrape(url: string): Promise<string | null> {
  const key = process.env.FIRECRAWL_API_KEY;
  if (!key) return null;
  const t = Date.now();
  for (let attempt = 0; attempt < 3; attempt++) {
    const md = await firecrawlOnce(url, key);
    if (md !== "rate_limited") {
      timing("firecrawl", t, md ? "ok" : "no page", attempt ? `after ${attempt} rate-limit waits` : "");
      return md;
    }
    await sleep(2000 * (attempt + 1)); // plan concurrency limit hit; wait and retry
  }
  return null;
}

async function firecrawlOnce(url: string, key: string): Promise<string | null | "rate_limited"> {
  const res = await fetchJson(
    "https://api.firecrawl.dev/v2/scrape",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true, timeout: 30_000 }),
    },
    45_000,
  ).catch(() => null);
  if (res?.status === 429) return "rate_limited";
  const md = (res?.body as { data?: { markdown?: string } })?.data?.markdown;
  return res?.ok && md ? md : null;
}

// ---------------------------------------------------------------- LLM ---

/** Convert the Gemini-style schema used in agents.ts into strict JSON Schema. */
function toJsonSchema(s: Record<string, unknown>): Record<string, unknown> {
  const type = String(s.type).toLowerCase();
  const out: Record<string, unknown> = { type: s.nullable ? [type, "null"] : type };
  if (type === "object") {
    const props = (s.properties ?? {}) as Record<string, Record<string, unknown>>;
    out.properties = Object.fromEntries(Object.entries(props).map(([k, v]) => [k, toJsonSchema(v)]));
    out.required = Object.keys(props);
    out.additionalProperties = false;
  }
  if (type === "array") out.items = toJsonSchema(s.items as Record<string, unknown>);
  return out;
}

// Each Groq model has its own per-minute token bucket (8k/min on the free
// tier), so calls rotate across models and hop to the next one on a 429.
const GROQ_MODELS = (process.env.GROQ_MODELS ?? "openai/gpt-oss-120b,qwen/qwen3.8-27b,openai/gpt-oss-20b").split(",").map((s) => s.trim()).filter(Boolean);
let groqCursor = 0;

async function groqJson<T>(prompt: string, schema: object, timeoutMs: number): Promise<T | null> {
  const key = process.env.GROQ_API_KEY;
  if (!key) return null;
  const jsonSchema = toJsonSchema(schema as Record<string, unknown>);
  const deadline = Date.now() + 120_000;
  let strictOk = true;
  for (let round = 0; round < 4 && Date.now() < deadline; round++) {
    let waitMs = 0;
    for (let k = 0; k < GROQ_MODELS.length; k++) {
      const model = GROQ_MODELS[groqCursor++ % GROQ_MODELS.length];
      const res = await fetchJson(
        "https://api.groq.com/openai/v1/chat/completions",
        {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model,
            temperature: 0.4,
            messages: strictOk
              ? [{ role: "user", content: prompt }]
              : [{ role: "user", content: `${prompt}\n\nRespond with JSON only, matching this JSON Schema:\n${JSON.stringify(jsonSchema)}` }],
            response_format: strictOk ? { type: "json_schema", json_schema: { name: "result", strict: true, schema: jsonSchema } } : { type: "json_object" },
          }),
        },
        timeoutMs,
      ).catch(() => null);
      if (res?.ok) {
        const text = (res.body as { choices?: { message?: { content?: string } }[] })?.choices?.[0]?.message?.content;
        try {
          if (text) return JSON.parse(text) as T;
        } catch {
          /* try the next model */
        }
      } else if (res?.status === 429) {
        const msg = JSON.stringify(res.body ?? "");
        const secs = Number(msg.match(/try again in ([\d.]+)s/)?.[1] ?? 6);
        waitMs = waitMs ? Math.min(waitMs, secs * 1000) : secs * 1000;
      } else if (res?.status === 400) {
        strictOk = false; // model rejected the strict schema; fall back to JSON mode
      }
    }
    if (waitMs) await sleep(Math.min(waitMs + 250, 20_000));
  }
  return null;
}

// -------------------------------------------------------------- Claude ---

/** Convert the schema format used in agents.ts into a Zod schema. */
function toZod(s: Record<string, unknown>): z.ZodType {
  const t = String(s.type).toUpperCase();
  let out: z.ZodType;
  if (t === "OBJECT") {
    const props = (s.properties ?? {}) as Record<string, Record<string, unknown>>;
    out = z.object(Object.fromEntries(Object.entries(props).map(([k, v]) => [k, toZod(v)])));
  } else if (t === "ARRAY") out = z.array(toZod(s.items as Record<string, unknown>));
  else if (t === "NUMBER") out = z.number();
  else if (t === "INTEGER") out = z.number().int();
  else if (t === "BOOLEAN") out = z.boolean();
  else out = z.string();
  return s.nullable ? out.nullable() : out;
}

const CLAUDE_MODEL = process.env.CLAUDE_MODEL ?? "claude-haiku-5-5";
let anthropic: Anthropic | null = null;

async function claudeJson<T>(prompt: string, schema: object): Promise<T | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  anthropic ??= new Anthropic({ maxRetries: 4, timeout: 90_000, fetch: httpsFetch });
  try {
    const res = await anthropic.messages.parse({
      model: CLAUDE_MODEL,
      max_tokens: 8000,
      output_config: { effort: "low", format: zodOutputFormat(toZod(schema as Record<string, unknown>)) },
      messages: [{ role: "user", content: prompt }],
    });
    if (res.stop_reason === "refusal") return null;
    return (res.parsed_output as T | null) ?? null;
  } catch (e) {
    if (e instanceof Anthropic.APIError) console.error(`claude ${e.status}: ${e.message.slice(0, 200)}`);
    else console.error("claude call failed", e);
    return null;
  }
}

/** Structured JSON from the LLM: Claude first, then Groq, then Gemini; null if all fail. */
export async function llmJson<T>(prompt: string, schema: object, opts: { timeoutMs?: number } = {}): Promise<T | null> {
  const t = Date.now();
  const c = await claudeJson<T>(prompt, schema);
  timing("claude", t, c ? "ok" : "FAILED", `${Math.round(prompt.length / 4)} tok in`);
  if (c) return c;
  const t2 = Date.now();
  const g = await groqJson<T>(prompt, schema, opts.timeoutMs ?? 60_000);
  timing("groq-fallback", t2, g ? "ok" : "FAILED");
  return g ?? (await geminiJson<T>(prompt, schema, { timeoutMs: 25_000 }));
}

/** One line per external call so slow steps are easy to spot in the server log. */
export function timing(what: string, start: number, ...info: string[]) {
  if (process.env.PIPELINE_TIMING === "0") return;
  console.log(`[pipeline] ${what} ${((Date.now() - start) / 1000).toFixed(1)}s ${info.join(" ")}`);
}

// -------------------------------------------------------------- Gemini ---

const MODELS = (process.env.GEMINI_MODELS ?? "gemini-3.8-flash,gemini-3.7-flash,gemini-3.6-flash,gemini-3.5-flash,gemini-flash-latest")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

/**
 * Structured JSON generation. Tries each model with backoff; returns null if
 * every attempt fails so callers can fall back to heuristics.
 */
export async function geminiJson<T>(prompt: string, schema: object, opts: { timeoutMs?: number } = {}): Promise<T | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  const body = JSON.stringify({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { responseMimeType: "application/json", responseSchema: schema, temperature: 0.4 },
  });
  for (let attempt = 0; attempt < 2; attempt++) {
    for (const model of MODELS) {
      const res = await fetchJson(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        { method: "POST", headers: { "X-goog-api-key": key, "Content-Type": "application/json" }, body },
        opts.timeoutMs ?? 60_000,
      ).catch(() => null);
      if (!res?.ok) continue;
      const text = (res.body as { candidates?: { content?: { parts?: { text?: string }[] } }[] })?.candidates?.[0]?.content?.parts
        ?.map((p) => p.text ?? "")
        .join("");
      if (!text) continue;
      try {
        return JSON.parse(text) as T;
      } catch {
        continue;
      }
    }
    await sleep(1500 * (attempt + 1));
  }
  return null;
}

// ----------------------------------------------------------------- Jev ---

export type JevQuestion =
  | { type: "score"; instructions: string; criteria: string[] }
  | { type: "noul"; instructions: string; criteria?: { true: string; false: string } };

export type JevAnswer = { type: string; score?: number; noul?: number; confidence?: number; legend?: Record<string, string> };

export async function jevEvaluate(state: string, questions: Record<string, JevQuestion>): Promise<Record<string, JevAnswer> | null> {
  const key = process.env.JEV_API_KEY;
  if (!key) return null;
  const t = Date.now();
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetchJson(
      "https://api.typesafe.ai/v1/systemone",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "jev-latest", state, questions }),
      },
      45_000,
    ).catch(() => null);
    if (res?.ok) {
      timing("jev", t);
      return ((res.body as { answers?: Record<string, JevAnswer> })?.answers ?? null) as Record<string, JevAnswer> | null;
    }
    await sleep(1000);
  }
  return null;
}

/** Run async work over items with a concurrency cap. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i], i);
      }
    }),
  );
  return out;
}
