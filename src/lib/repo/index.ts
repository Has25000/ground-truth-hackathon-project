import "server-only";
import { after } from "next/server";
import { runAttendee } from "../pipeline/runner";
import type { JobStatus, LookupResult, PublicEvent, ViewerPayload } from "../types";
import * as live from "./live";

// One interface for the event page, backed by Supabase.

export type EventSource = {
  event: PublicEvent;
  lookup(name: string): Promise<LookupResult>;
  resolve(attendeeId: string): Promise<LookupResult>;
  viewer(attendeeId: string): Promise<ViewerPayload | null>;
  addSelf(name: string, linkedin: string): Promise<{ attendeeId: string }>;
  job(attendeeId: string): Promise<JobStatus | null>;
  unlock(viewerId: string): Promise<ViewerPayload | null>;
  requestIntro(viewerId: string, blurbId: string): Promise<boolean>;
};

const kick = (id?: string) => {
  if (id) after(() => runAttendee(id).catch((e) => console.error("pipeline failed", id, e)));
};

export async function getSource(slug: string): Promise<EventSource | null> {
  const ev = await live.getEvent(slug);
  if (!ev) return null;
  return {
    event: ev,
    lookup: async (n) => {
      const { result, kick: k } = await live.lookup(ev.id, n);
      kick(k);
      return result;
    },
    resolve: async (id) => {
      const { result, kick: k } = await live.resolve(ev.id, id);
      kick(k);
      return result;
    },
    viewer: (id) => live.getViewer(ev.id, id),
    addSelf: async (n, l) => {
      const r = await live.addSelf(ev.id, n, l);
      kick(r.attendeeId);
      return r;
    },
    job: async (id) => {
      const j = await live.getJob(ev.id, id);
      // If a run died (e.g. function timeout), the next poll restarts it.
      if (j && j.status === "queued") kick(id);
      return j;
    },
    unlock: (id) => live.unlock(ev, id),
    requestIntro: (v, b) => live.requestIntro(ev.id, v, b),
  };
}
