"use client";

import { useEffect } from "react";
import { formatPrice } from "./price";

export function Checkout(props: { priceCents: number; paying: boolean; onPay: () => void; onClose: () => void }) {
  const { onClose } = props;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const price = formatPrice(props.priceCents);

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="checkout-title" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div className="eyebrow sm">Find your people · {price}</div>
            <div id="checkout-title" style={{ fontWeight: 600, fontSize: 28, lineHeight: 1.05, letterSpacing: "-0.04em" }}>
              Meet the people here who can help you.
            </div>
          </div>
          <button className="close-btn" onClick={onClose} aria-label="Close" disabled={props.paying}>✕</button>
        </div>
        <div className="serif" style={{ fontSize: 16, color: "var(--text-2)" }}>
          We&apos;ll research the room and show you who these people are, why you should meet, and what to open with. Then we
          help you reach out.
        </div>
        <div className="fake-card" style={{ fontFamily: "var(--f-sans)", fontSize: 15 }}>
          <div style={{ padding: "14px 16px", display: "flex", justifyContent: "space-between" }}>
            <span>Introductions at this event</span>
            <span className="mono">{price}</span>
          </div>
        </div>
        <button className="btn-blue" onClick={props.onPay} disabled={props.paying}>
          {props.paying ? "Processing…" : `Pay ${price} and find my people`}
        </button>
        <div style={{ fontSize: 12, textAlign: "center" }} className="muted">Simulated checkout. No card needed.</div>
      </div>
    </div>
  );
}
