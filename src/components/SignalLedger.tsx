"use client";

import type { CareSignal, RiskTier } from "@/lib/types";
import { tierColor } from "@/lib/present";
import { TierMeter } from "./TierMeter";

/**
 * The transparent Care-Signal Ledger. Every signal is traceable to its source
 * (an instrument item or the situation). This is what the patient sees live and
 * what becomes the auditable backbone of the clinician brief.
 */
export function SignalLedger({ signals, overallTier }: { signals: CareSignal[]; overallTier: RiskTier }) {
  return (
    <aside className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white">
      <div className="border-b border-slate-100 p-4">
        <h2 className="text-sm font-semibold text-slate-900">Care-Signal Ledger</h2>
        <p className="mt-1 text-xs text-slate-500">
          What I&apos;m noticing, and exactly why. Nothing hidden.
        </p>
        <div className="mt-4">
          <TierMeter tier={overallTier} />
        </div>
      </div>

      <div className="calm-scroll flex-1 overflow-y-auto p-4">
        {signals.length === 0 ? (
          <p className="text-sm text-slate-400">Signals will appear here as we talk.</p>
        ) : (
          <ul className="space-y-3">
            {signals
              .slice()
              .reverse()
              .map((s) => (
                <li key={s.id} className="rise-in rounded-xl border border-slate-100 bg-slate-50 p-3">
                  <div className="flex items-start gap-2">
                    <span
                      className="mt-1 h-2 w-2 shrink-0 rounded-full"
                      style={{ background: tierColor(s.tier) }}
                    />
                    <div>
                      <p className="text-sm leading-snug text-slate-700">{s.text}</p>
                      <p className="mt-1 text-[11px] uppercase tracking-wide text-slate-400">{s.source}</p>
                    </div>
                  </div>
                </li>
              ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
