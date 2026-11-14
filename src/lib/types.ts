// Shapes exchanged between the API routes and the browser.
// Teasers carry NO identity fields. Identity only arrives in `revealed`
// after the (simulated) $5 unlock.

export type Need = {
  text: string;
  evidence: string;
  /** 0–1. Every need is the system's guess. */
  confidence: number;
};

export type ViewerProfile = {
  id: string;
  name: string;
  headline: string;
  background: string;
  linkedin: string; // without protocol
  sourcesLabel: string;
  needs: Need[];
};

export type Teaser = {
  id: string;
  need: string;
  score: number; // 0–1
  blurb: string;
};

export type Revealed = Teaser & {
  headline: string;
  first: string;
  role: string;
  org: string;
  bio: string;
  why: string;
  shared: string[];
  offer: string;
  between: string;
  openers: string[];
  requested: boolean;
};

export type ViewerPayload = {
  profile: ViewerProfile;
  teasers: Teaser[];
  unlocked: boolean;
  revealed: Revealed[];
};

export type LookupResult =
  | { status: "found"; viewer: ViewerPayload }
  | { status: "researching"; attendeeId: string; name: string }
  | { status: "multiple"; candidates: { id: string; name: string; role: string }[] }
  | { status: "not_found" };

export type JobStatus = {
  stage: number; // index into RESEARCH_STAGES; === length means done
  status: "queued" | "running" | "done" | "failed";
};

export type PublicEvent = {
  slug: string;
  name: string;
  priceCents: number;
  researchedCount: number;
};
