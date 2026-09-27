"use client";

/* Composite sections that need client-side state beyond the primitives. */

import { StickyStory } from "./motion";
import { CallScreen, PhoneFrame } from "./scenes";

const BEATS = [
  { k: "It answers.", body: "On the first ring, in your business’s name, at 3 AM on a holiday the same as at noon." },
  { k: "It looks it up.", body: "Service areas, prices, policies: it reads your knowledge before it speaks, so it quotes what you wrote." },
  { k: "It gets it done.", body: "Books the visit, updates the CRM, texts the confirmation. Real actions in your real tools." },
  { k: "It hands off.", body: "When a caller needs a person, your team gets the conversation with the context already written." },
];

/**
 * Pinned: a live call plays on the phone while four short claims step
 * through beside it, one per screen of scrolling.
 */
export function CallStory() {
  return (
    <StickyStory beats={BEATS.length} height={4}>
      {(beat) => (
        <div className="mk-wrap grid items-center gap-8 lg:gap-12 lg:grid-cols-[1.1fr_1fr]">
          <div>
            <p className="mk-eyebrow">A real call, start to finish</p>
            <div className="mt-6 flex flex-col gap-3">
              {BEATS.map((b, i) => (
                <div key={b.k} className={i === beat ? "" : "max-lg:hidden"} style={{ transition: "opacity 600ms var(--mk-ease), transform 600ms var(--mk-ease)", opacity: i === beat ? 1 : 0.22, transform: i === beat ? "none" : "translateX(-6px)" }}>
                  <h3 className="mk-h1">{b.k}</h3>
                  <div style={{ display: "grid", gridTemplateRows: i === beat ? "1fr" : "0fr", transition: "grid-template-rows 600ms var(--mk-ease)" }}>
                    <p className="mk-lead overflow-hidden" style={{ maxWidth: "34ch" }}><span className="block pt-3 pb-2">{b.body}</span></p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="flex justify-center">
            <div className="w-[min(230px,30vh)] lg:w-[min(340px,40vh)]"><PhoneFrame width="100%"><CallScreen /></PhoneFrame></div>
          </div>
        </div>
      )}
    </StickyStory>
  );
}
