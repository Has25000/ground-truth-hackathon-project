const norm = (s: string) =>
  s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^\p{L}\p{N}\s-]/gu, "").replace(/\s+/g, " ").trim();

/**
 * Case-insensitive name match. Exact first; otherwise every typed word must
 * start a word in the name. Needs 3+ characters so the lookup can't list the room.
 */
export function matchName<T extends { name: string }>(rows: T[], query: string): T[] {
  const q = norm(query);
  if (!q) return [];
  const exact = rows.filter((r) => norm(r.name) === q);
  if (exact.length || q.length < 3) return exact;
  const tokens = q.split(" ");
  return rows.filter((r) => {
    const words = norm(r.name).split(/[\s-]+/);
    return tokens.every((t) => words.some((w) => w.startsWith(t)));
  });
}
