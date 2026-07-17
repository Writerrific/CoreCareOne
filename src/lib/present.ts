// Pure presentation helpers, safe to import from client components.
// (No server-only imports — just types + formatting.)

import type { Domain, RiskTier, VisitType } from "./types";

export function tierLabel(t: RiskTier): string {
  switch (t) {
    case "minimal":
      return "Minimal";
    case "low":
      return "Low";
    case "moderate":
      return "Moderate";
    case "high":
      return "Elevated";
    case "urgent":
      return "Needs prompt attention";
  }
}

export function tierColor(t: RiskTier): string {
  switch (t) {
    case "minimal":
      return "#64748b";
    case "low":
      return "#0d9488";
    case "moderate":
      return "#ca8a04";
    case "high":
      return "#ea580c";
    case "urgent":
      return "#dc2626";
  }
}

export function tierRank(t: RiskTier): number {
  return { minimal: 0, low: 1, moderate: 2, high: 3, urgent: 4 }[t];
}

export function visitTypeLabel(v: VisitType): string {
  switch (v) {
    case "primary_care":
      return "Primary Care visit";
    case "behavioral_health":
      return "Behavioral Health visit";
    case "integrated":
      return "Integrated visit (medical + behavioral)";
    case "crisis":
      return "Urgent / crisis support";
  }
}

export function urgencyLabel(u: "same_day" | "within_week" | "routine" | "self_directed"): string {
  switch (u) {
    case "same_day":
      return "Same day";
    case "within_week":
      return "Within a week";
    case "routine":
      return "Routine (a few weeks)";
    case "self_directed":
      return "Your choice of timing";
  }
}

/** Compact "3d ago" / "2w ago" for queue rows. */
export function timeAgo(then: number): string {
  const mins = Math.round((Date.now() - then) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 14) return `${days}d ago`;
  if (days < 60) return `${Math.round(days / 7)}w ago`;
  return `${Math.round(days / 30)}mo ago`;
}

export function domainLabel(d: Domain): string {
  return {
    mood: "Mood",
    anxiety: "Anxiety",
    stress: "Stress",
    sleep: "Sleep",
    alcohol: "Alcohol",
    trauma: "Trauma",
    energy: "Energy",
    safety: "Safety",
  }[d];
}
