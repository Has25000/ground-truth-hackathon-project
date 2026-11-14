// Minimal RFC-4180-ish CSV parser (quoted fields, escaped quotes, CRLF).
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== "")) rows.push(row);
  return rows;
}

export const REQUIRED_COLS = ["name", "linkedin_url", "went"] as const;
export const OPTIONAL_COLS = ["role", "bio", "skills"] as const;

const truthy = (v: string) => ["yes", "y", "true", "1", "x"].includes(v.trim().toLowerCase());

const ALIASES: Record<string, string> = { linkedin: "linkedin_url", linkedin_profile: "linkedin_url", full_name: "name", attended: "went", checked_in: "went", title: "role", headline: "role" };

export type SheetRow = { name: string; linkedin_url?: string; went: boolean; role?: string; bio?: string; skills: string[]; extra: Record<string, string> };

/** Turn a CSV into attendee rows for POST /api/admin/events/[id]/sheet. */
export function toRows(text: string): { rows: SheetRow[]; columns: string[]; missing: string[] } {
  const [header = [], ...body] = parseCsv(text);
  const cols = header.map((h) => {
    const k = h.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
    return ALIASES[k] ?? k;
  });
  const idx = (c: string) => cols.indexOf(c);
  const rows = body
    .map((r) => {
      const get = (c: string) => (idx(c) >= 0 ? (r[idx(c)] ?? "").trim() : "");
      const extra: Record<string, string> = {};
      cols.forEach((c, i) => {
        if (!["name", "linkedin_url", "went", "role", "bio", "skills"].includes(c) && r[i]?.trim()) extra[c] = r[i].trim().slice(0, 500);
      });
      return {
        name: get("name"),
        linkedin_url: get("linkedin_url") || undefined,
        went: truthy(get("went")),
        role: get("role") || undefined,
        bio: get("bio") || undefined,
        skills: get("skills").split(/[;,|]/).map((s) => s.trim()).filter(Boolean),
        extra,
      };
    })
    .filter((r) => r.name);
  return { rows, columns: cols, missing: REQUIRED_COLS.filter((c) => !cols.includes(c)) };
}
