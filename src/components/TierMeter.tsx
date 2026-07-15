"use client";

import type { RiskTier } from "@/lib/types";
import { tierColor, tierLabel, tierRank } from "@/lib/present";

const TIERS: RiskTier[] = ["minimal", "low", "moderate", "high", "urgent"];

/** A 5-segment stratification meter — makes "not binary" visible at a glance. */
export function TierMeter({ tier, label = "Overall signal" }: { tier: RiskTier; label?: string }) {
  const active = tierRank(tier);
  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</span>
        <span className="text-xs font-semibold" style={{ color: tierColor(tier) }}>
          {tierLabel(tier)}
        </span>
      </div>
      <div className="mt-2 flex gap-1">
        {TIERS.map((t, i) => (
          <div
            key={t}
            className="h-2 flex-1 rounded-full transition-colors"
            style={{ background: i <= active ? tierColor(tier) : "#e2e8f0" }}
            title={tierLabel(t)}
          />
        ))}
      </div>
    </div>
  );
}
