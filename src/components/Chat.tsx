"use client";

import { useEffect, useRef } from "react";
import type { ChatMessage, ItemChoice } from "@/lib/types";

/** Minimal formatter: **bold** and _italic_ only. Input is our own copy, not user HTML. */
function formatted(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return escaped
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/_(.+?)_/g, '<em class="text-slate-400">$1</em>');
}

function Bubble({ m }: { m: ChatMessage }) {
  const isPatient = m.speaker === "patient";
  return (
    <div className={`rise-in flex ${isPatient ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
          isPatient
            ? "bg-core-600 text-white"
            : "border border-slate-200 bg-white text-slate-700"
        }`}
        dangerouslySetInnerHTML={{ __html: formatted(m.text) }}
      />
    </div>
  );
}

export function Chat({
  messages,
  pendingChoices,
  onAnswer,
  busy,
}: {
  messages: ChatMessage[];
  pendingChoices: ItemChoice[] | null;
  onAnswer: (value: number, label: string) => void;
  busy: boolean;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, busy]);

  return (
    <div className="flex h-full flex-col">
      <div className="calm-scroll flex-1 space-y-3 overflow-y-auto p-4">
        {messages.map((m) => (
          <Bubble key={m.id} m={m} />
        ))}
        {busy && (
          <div className="flex justify-start">
            <div className="flex items-center gap-1 rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <span className="h-2 w-2 animate-bounce rounded-full bg-slate-300 [animation-delay:-0.2s]" />
              <span className="h-2 w-2 animate-bounce rounded-full bg-slate-300 [animation-delay:-0.1s]" />
              <span className="h-2 w-2 animate-bounce rounded-full bg-slate-300" />
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {pendingChoices && !busy && (
        <div className="border-t border-slate-100 p-4">
          <div className="flex flex-wrap gap-2">
            {pendingChoices.map((c) => (
              <button
                key={c.label}
                onClick={() => onAnswer(c.value, c.label)}
                className="rounded-xl border border-core-200 bg-core-50 px-4 py-2 text-sm font-medium text-core-800 transition hover:bg-core-100"
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
