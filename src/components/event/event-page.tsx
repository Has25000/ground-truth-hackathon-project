"use client";

import { useEffect, useState } from "react";
import type { LookupResult, PublicEvent, ViewerPayload } from "@/lib/types";
import { Hero } from "./hero";
import { AddSelf } from "./add-self";
import { Research } from "./research";
import { Profile } from "./profile";
import { Checkout } from "./checkout";
import { Picker } from "./picker";

type Step = "enter" | "pick" | "add" | "research" | "profile";
type Candidate = Extract<LookupResult, { status: "multiple" }>["candidates"][number];

export function EventPage({ event }: { event: PublicEvent }) {
  const api = `/api/events/${event.slug}`;
  const [step, setStep] = useState<Step>("enter");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [addName, setAddName] = useState("");
  const [addLinkedin, setAddLinkedin] = useState("");
  const [pending, setPending] = useState<{ id: string; name: string } | null>(null);
  const [researchStage, setResearchStage] = useState(0);
  const [researchFailed, setResearchFailed] = useState(false);
  const [viewer, setViewer] = useState<ViewerPayload | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [paying, setPaying] = useState(false);
  const [finding, setFinding] = useState(false);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [step]);

  const handle = (data: LookupResult, typed: string) => {
    if (data.status === "found") {
      setViewer(data.viewer);
      setStep("profile");
    } else if (data.status === "researching") {
      setPending({ id: data.attendeeId, name: data.name });
      setResearchStage(0);
      setResearchFailed(false);
      setStep("research");
    } else if (data.status === "multiple") {
      setCandidates(data.candidates);
      setStep("pick");
    } else {
      setAddName(typed);
      setAddLinkedin("");
      setStep("add");
    }
  };

  const call = async <T,>(fn: () => Promise<T>) => {
    setLoading(true);
    setError(null);
    try {
      return await fn();
    } catch {
      setError("Something went wrong. Try again.");
      return null;
    } finally {
      setLoading(false);
    }
  };

  const getJson = async <T,>(url: string, init?: RequestInit) => {
    const res = await fetch(url, { cache: "no-store", ...init });
    if (!res.ok) throw new Error(String(res.status));
    return (await res.json()) as T;
  };

  const lookup = (name: string) =>
    call(async () => {
      const q = name.trim();
      if (!q) return;
      handle(await getJson<LookupResult>(`${api}/lookup?name=${encodeURIComponent(q)}`), q);
    });

  const pick = (id: string) => call(async () => handle(await getJson<LookupResult>(`${api}/resolve/${encodeURIComponent(id)}`), ""));

  const submitAdd = () =>
    call(async () => {
      const name = addName.trim();
      if (!name) return;
      const { attendeeId } = await getJson<{ attendeeId: string }>(`${api}/attendees`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, linkedin_url: addLinkedin }),
      });
      setPending({ id: attendeeId, name });
      setResearchStage(0);
      setResearchFailed(false);
      setStep("research");
    });

  // Poll the person's research job until their profile and matches exist.
  useEffect(() => {
    if (step !== "research" || !pending) return;
    let stop = false;
    const tick = async () => {
      try {
        const job = await getJson<{ stage: number; status: string }>(`${api}/job/${encodeURIComponent(pending.id)}`);
        if (stop) return;
        setResearchStage(job.stage);
        if (job.status === "failed") setResearchFailed(true);
        if (job.status === "done") {
          stop = true;
          const v = await getJson<ViewerPayload>(`${api}/viewer/${encodeURIComponent(pending.id)}`);
          setTimeout(() => {
            setViewer(v);
            setStep("profile");
          }, 500);
        }
      } catch {
        /* keep polling */
      }
    };
    tick();
    const t = setInterval(() => !stop && tick(), 1500);
    return () => {
      stop = true;
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, pending]);

  const reset = () => {
    setStep("enter");
    setQuery("");
    setViewer(null);
    setPending(null);
    setError(null);
    setFinding(false);
  };

  const pay = async () => {
    if (paying || !viewer) return;
    setPaying(true);
    try {
      const v = await getJson<ViewerPayload>(`${api}/unlock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ viewer_id: viewer.profile.id }),
      });
      await new Promise((r) => setTimeout(r, 900));
      setCheckoutOpen(false);
      setFinding(true);
      setViewer(v);
    } catch {
      setError("Payment didn't go through. Try again.");
    } finally {
      setPaying(false);
    }
  };

  const requestIntro = async (blurbId: string) => {
    if (!viewer) return;
    setViewer({ ...viewer, revealed: viewer.revealed.map((r) => (r.id === blurbId ? { ...r, requested: true } : r)) });
    fetch(`${api}/intro`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ viewer_id: viewer.profile.id, blurb_id: blurbId }),
    }).catch(() => {});
  };

  return (
    <>
      {step === "enter" && (
        <Hero
          eventName={event.name}
          query={query}
          setQuery={setQuery}
          onSubmit={() => lookup(query)}
          loading={loading}
          error={error}
          count={event.researchedCount}
        />
      )}
      {step === "pick" && <Picker candidates={candidates} onPick={pick} onBack={reset} />}
      {step === "add" && (
        <AddSelf
          name={addName}
          setName={setAddName}
          linkedin={addLinkedin}
          setLinkedin={setAddLinkedin}
          onSubmit={submitAdd}
          onBack={reset}
          loading={loading}
          error={error}
        />
      )}
      {step === "research" && pending && (
        <Research
          firstName={pending.name.trim().split(/\s+/)[0] || "you"}
          stage={researchStage}
          poolCount={event.researchedCount}
          failed={researchFailed}
          onBack={reset}
        />
      )}
      {step === "profile" && viewer && (
        <Profile
          viewer={viewer}
          priceCents={event.priceCents}
          finding={finding}
          onFindingDone={() => setFinding(false)}
          onUnlock={() => setCheckoutOpen(true)}
          onRequest={requestIntro}
          onReset={reset}
          error={error}
        />
      )}
      {checkoutOpen && (
        <Checkout priceCents={event.priceCents} paying={paying} onPay={pay} onClose={() => !paying && setCheckoutOpen(false)} />
      )}
    </>
  );
}
