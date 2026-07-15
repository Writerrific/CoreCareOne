"use client";

import { useState } from "react";
import { SITUATIONS } from "@/lib/situations";

export interface IntakePayload {
  displayName?: string;
  situationText: string;
  tags: string[];
}

export function IntakeForm({ onStart, busy }: { onStart: (p: IntakePayload) => void; busy: boolean }) {
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  function pickSituation(id: string, label: string) {
    setSelected(id);
    if (!text.trim()) setText(label);
  }

  const canStart = text.trim().length > 2 && !busy;

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold text-slate-900">Let&apos;s start with you.</h1>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">
        In your own words, what&apos;s going on lately? There are no wrong answers — a sentence is plenty. Pick a starting
        point below or just type.
      </p>

      <div className="mt-6">
        <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
          First name <span className="font-normal text-slate-400">(optional)</span>
        </label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="What should I call you?"
          className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm outline-none focus:border-core-500 focus:ring-2 focus:ring-core-100"
        />
      </div>

      <div className="mt-5">
        <label className="text-xs font-medium uppercase tracking-wide text-slate-500">A starting point</label>
        <div className="mt-2 flex flex-wrap gap-2">
          {SITUATIONS.filter((s) => s.id !== "general_checkin").map((s) => (
            <button
              key={s.id}
              onClick={() => pickSituation(s.id, s.label)}
              className={`rounded-full border px-3.5 py-1.5 text-sm transition ${
                selected === s.id
                  ? "border-core-500 bg-core-50 text-core-800"
                  : "border-slate-300 bg-white text-slate-600 hover:border-core-300"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5">
        <label className="text-xs font-medium uppercase tracking-wide text-slate-500">In your words</label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          placeholder="e.g. I'm a college runner and my times have been slipping. I feel flat and I'm not recovering like I used to."
          className="mt-1.5 w-full resize-none rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm leading-relaxed outline-none focus:border-core-500 focus:ring-2 focus:ring-core-100"
        />
      </div>

      <button
        onClick={() =>
          onStart({
            displayName: name.trim() || undefined,
            situationText: text.trim(),
            tags: selected ? [selected] : [],
          })
        }
        disabled={!canStart}
        className="mt-5 w-full rounded-xl bg-core-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-core-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? "Setting things up…" : "Begin my check-in"}
      </button>

      <p className="mt-3 text-center text-xs text-slate-400">
        Private by design · you can skip any question · not a diagnosis or emergency service
      </p>
    </div>
  );
}
