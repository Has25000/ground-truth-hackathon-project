"use client";

export function Hero(props: {
  eventName: string;
  query: string;
  setQuery: (v: string) => void;
  onSubmit: () => void;
  loading: boolean;
  error: string | null;
  count: number;
}) {
  return (
    <section className="hero">
      <div className="hero-inner">
        <div className="eyebrow" style={{ color: "var(--on-dark-1)" }}>{props.eventName}</div>
        <h1>Find your people in this room.</h1>
        <p className="hero-lead">
          Type your name. You&apos;ll see what we learned about you from your LinkedIn, and the people here who could help with
          what you need most.
        </p>
        <form
          className="name-form"
          onSubmit={(e) => {
            e.preventDefault();
            props.onSubmit();
          }}
        >
          <input
            value={props.query}
            onChange={(e) => props.setQuery(e.target.value)}
            placeholder="Your full name"
            aria-label="Your full name"
            autoComplete="name"
          />
          <button type="submit" disabled={props.loading}>
            {props.loading ? "Finding…" : "Find me"}
          </button>
        </form>
        {props.error && <div className="hero-error">{props.error}</div>}
        <div className="hero-foot">
          {props.count > 0 && <span>{props.count} people here, already researched</span>}
          <span>Names stay private until you choose to meet</span>
        </div>
      </div>
    </section>
  );
}
