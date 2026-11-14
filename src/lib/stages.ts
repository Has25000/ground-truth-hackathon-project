// Pipeline stages shown while a self-added attendee is researched.
// Mirrors research_jobs.stage (0..4; 5 = done).
export const RESEARCH_STAGES = [
  { label: "Agent 1 · Research", detail: "Searching the web with You.com" },
  { label: "LinkedIn fallback", detail: "Fetching your profile with Firecrawl" },
  { label: "Agent 2 · Enrichment", detail: "What you might need and what you offer, with evidence" },
  { label: "Agent 3 · Matching", detail: "Scoring benefit both ways against {pool} people" },
  { label: "Writing blurbs", detail: "Describing your top 3 without naming them" },
];
