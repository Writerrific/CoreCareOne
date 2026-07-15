"use client";

import type { Trajectory, TrajectoryDirection } from "@/lib/types";
import { tierColor, tierLabel } from "@/lib/present";

// Small multiples: one mini line per instrument. Different instruments have
// different scales, so they each get their own chart (never a shared/dual axis).
// Higher score = more symptoms, so a line going UP = worsening. Every color is
// paired with a word + arrow — status color never carries meaning alone.

function directionMeta(d: TrajectoryDirection): { label: string; arrow: string; color: string } {
  switch (d) {
    case "improving":
      return { label: "improving", arrow: "▼", color: "#0d9488" }; // down = better here
    case "worsening":
      return { label: "worsening", arrow: "▲", color: "#ea580c" };
    case "steady":
      return { label: "steady", arrow: "→", color: "#64748b" };
    case "single":
      return { label: "baseline", arrow: "•", color: "#64748b" };
  }
}

function Sparkline({ t }: { t: Trajectory }) {
  const W = 176;
  const H = 56;
  const pad = 8;
  const n = t.points.length;
  const max = t.points[0]?.maxScore || 1;

  const x = (i: number) => (n <= 1 ? W / 2 : pad + (i * (W - 2 * pad)) / (n - 1));
  const y = (score: number) => H - pad - (score / max) * (H - 2 * pad);

  const path = t.points.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(p.score).toFixed(1)}`).join(" ");
  const last = t.points[n - 1];
  const dir = directionMeta(t.direction);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-700">{t.shortName}</span>
        <span
          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
          style={{ color: dir.color, background: `${dir.color}14` }}
        >
          <span aria-hidden>{dir.arrow}</span>
          {dir.label}
        </span>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="mt-1 w-full" role="img" aria-label={`${t.shortName} ${dir.label}`}>
        {/* baseline */}
        <line x1={pad} y1={H - pad} x2={W - pad} y2={H - pad} stroke="#e2e8f0" strokeWidth={1} />
        {n > 1 && <path d={path} fill="none" stroke="#94a3b8" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
        {t.points.map((p, i) => (
          <circle key={i} cx={x(i)} cy={y(p.score)} r={i === n - 1 ? 4 : 3} fill={tierColor(p.tier)}>
            <title>{`Check-in ${i + 1}: ${p.score}/${p.maxScore} — ${p.bandLabel} (${tierLabel(p.tier)})`}</title>
          </circle>
        ))}
      </svg>

      {/* numeric sequence doubles as the text/table view of the same data */}
      <div className="mt-1 text-[11px] tabular-nums text-slate-500">
        {t.points.map((p) => p.score).join(" → ")}
        <span className="text-slate-400"> / {max}</span>
      </div>
      <div className="text-[11px] text-slate-400">
        latest: <span style={{ color: tierColor(last.tier) }}>{last.bandLabel}</span>
      </div>
    </div>
  );
}

export function TrajectoryChart({ trajectories }: { trajectories: Trajectory[] }) {
  const multi = trajectories.filter((t) => t.points.length >= 2);
  if (multi.length === 0) return null;

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {multi.map((t) => (
          <Sparkline key={t.instrumentId} t={t} />
        ))}
      </div>
      <p className="mt-3 text-[11px] text-slate-400">
        Higher = more of what the screener measures, so a line trending down means things are easing. Trends, not any
        single score, are what your care team watches over time.
      </p>
    </div>
  );
}
