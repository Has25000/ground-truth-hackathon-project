# overlap

Event introductions. A host uploads a guest list; we research everyone and work out what each person needs and can offer. Guests type their name on the event page, see what we learned about them and a teaser of who here could help, and pay $5 (simulated) to see who those people are and get help reaching out.

**Stack:** Next.js on Vercel · Supabase (Postgres + Auth) · no separate server. Research uses You.com + Firecrawl, profiles/blurbs use Claude Haiku 5.5 (Groq, then Gemini as fallbacks), match scoring uses TypeSafe Jev.

## Pages

| Path | What |
| --- | --- |
| `/` | Homepage |
| `/e/[slug]` | A real event page |
| `/login` | Host sign in / sign up (Supabase Auth) |
| `/admin` | Your communities → events → Setup / People / Matches |

## Run locally

```bash
npm install
cp .env.example .env.local   # then fill in values
npm run dev
```

## Secrets — where they live

This repo is **public**. Keys never go in git.

- **Local:** `.env.local` (gitignored).
- **Production:** Vercel → Project → Settings → Environment Variables. The Supabase integration adds the `SUPABASE` ones; add `ANTHROPIC_API_KEY`, `YOU_API_KEY`, `FIRECRAWL_API_KEY`, `GROQ_API_KEY`, `GEMINI_API_KEY`, `JEV_API_KEY` yourself.
- Not in GitHub secrets (nothing runs in GitHub Actions) and not in Supabase (no Edge Functions).

## Database changes

Migrations live in `supabase/migrations/`. With the Supabase GitHub integration set to deploy `main`, merging a new migration file applies it. To apply by hand: `supabase db push`. Never edit a migration that's already applied — add a new file (`supabase migration new <name>`).

## How the pipeline runs (serverless)

- Host clicks **Run** on an event → the admin page calls `POST /api/admin/events/[id]/run` in a loop; each call processes ~45s of work (jobs are claimed atomically in Postgres, so nothing runs twice).
- Research + enrichment finish for the whole pool before matching starts, so everyone is matched against the full room.
- A guest who adds themselves (or isn't researched yet) is processed right away in the background (`after()`), and the page polls their job.
- Code: `src/lib/pipeline/agents.ts` (agents), `runner.ts` (stages + persistence), `clients.ts` (API clients).

## Privacy rules in code

- Before the $5 unlock, the browser only gets `need`, `score`, `blurb` for each match.
- Blurbs are scrubbed of the person's name and employer before they're stored.
- Full names, LinkedIn URLs and contact details of matches are never sent to guests.
