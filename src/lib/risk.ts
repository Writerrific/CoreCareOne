// Deterministic scoring + risk stratification.
//
// Every number in a clinician brief is computed here from recorded answers and
// published cutoff bands. No LLM is involved in any scoring decision.

import type {
  Answer,
  CareSignal,
  Domain,
  Instrument,
  InstrumentResult,
  RiskTier,
  ScoreBand,
} from "./types";
import { getInstrument } from "./instruments";

const TIER_RANK: Record<RiskTier, number> = {
  minimal: 0,
  low: 1,
  moderate: 2,
  high: 3,
  urgent: 4,
};

export function tierRank(t: RiskTier): number {
  return TIER_RANK[t];
}

export function maxTier(a: RiskTier, b: RiskTier): RiskTier {
  return TIER_RANK[a] >= TIER_RANK[b] ? a : b;
}

export function bandForScore(instrument: Instrument, score: number): ScoreBand {
  const band = instrument.bands.find((b) => score >= b.min && score <= b.max);
  // Fall back to the top band if score exceeds all defined ranges.
  return band ?? instrument.bands[instrument.bands.length - 1];
}

/** Sum recorded answers for a given instrument. Skipped items simply aren't scored. */
export function scoreInstrument(
  instrument: Instrument,
  answers: Answer[],
  skipped: string[] = [],
): InstrumentResult {
  const relevant = answers.filter((a) => a.instrumentId === instrument.id);
  const score = relevant.reduce((sum, a) => sum + a.value, 0);
  const maxScore = instrument.items.reduce(
    (sum, item) => sum + Math.max(...item.choices.map((c) => c.value)),
    0,
  );
  const band = bandForScore(instrument, score);

  const safetyItemIds = new Set(instrument.items.filter((i) => i.safetyCritical).map((i) => i.id));
  const safetyFlags = relevant
    .filter((a) => safetyItemIds.has(a.itemId) && a.value > 0)
    .map((a) => a.itemId);

  const skippedSet = new Set(skipped);
  const skippedCount = instrument.items.filter((i) => skippedSet.has(i.id)).length;

  return {
    instrumentId: instrument.id,
    name: instrument.name,
    shortName: instrument.shortName,
    domain: instrument.domain,
    score,
    maxScore,
    band,
    answered: relevant.length,
    total: instrument.items.length,
    skipped: skippedCount,
    safetyFlags,
  };
}

/** Compute results for every instrument that has at least one answer or skip. */
export function computeResults(answers: Answer[], skipped: string[] = []): InstrumentResult[] {
  const ids = new Set(answers.map((a) => a.instrumentId));
  // Include instruments that were entirely skipped, too.
  for (const itemId of skipped) {
    const inst = instrumentForItem(itemId);
    if (inst) ids.add(inst.id);
  }
  const results: InstrumentResult[] = [];
  for (const id of ids) {
    const instrument = getInstrument(id);
    if (!instrument) continue;
    results.push(scoreInstrument(instrument, answers, skipped));
  }
  return results;
}

/** Find which instrument owns a given item id. */
function instrumentForItem(itemId: string): Instrument | undefined {
  // itemId is prefixed with the instrument id (e.g. "phq9_9" -> "phq9").
  const base = itemId.split("_")[0];
  const inst = getInstrument(base);
  if (inst) return inst;
  // Fallback: scan.
  return undefined;
}

/** Overall session tier = highest band tier across results, floored by any safety flag. */
export function overallTier(results: InstrumentResult[]): RiskTier {
  let tier: RiskTier = "minimal";
  for (const r of results) {
    tier = maxTier(tier, r.band.tier);
    if (r.safetyFlags.length > 0) tier = "urgent";
  }
  return tier;
}

/** Did any recorded answer trip a safety-critical item? */
export function hasSafetyFlag(answers: Answer[]): boolean {
  for (const a of answers) {
    if (a.value <= 0) continue;
    const instrument = getInstrument(a.instrumentId);
    const item = instrument?.items.find((i) => i.id === a.itemId);
    if (item?.safetyCritical) return true;
  }
  return false;
}

/**
 * Turn a freshly recorded answer into a traceable care signal, if it's notable.
 * Signals are the transparent ledger the patient sees and the clinician audits.
 */
export function signalForAnswer(answer: Answer): CareSignal | null {
  const instrument = getInstrument(answer.instrumentId);
  if (!instrument) return null;
  const item = instrument.items.find((i) => i.id === answer.itemId);
  if (!item) return null;

  if (item.safetyCritical && answer.value > 0) {
    return {
      id: `sig_${answer.itemId}_${answer.at}`,
      domain: instrument.domain,
      text: `Endorsed a safety item: "${item.prompt}"`,
      tier: "urgent",
      source: `${instrument.shortName} · ${item.id}`,
      at: answer.at,
    };
  }

  // Only surface a signal when the answer is meaningfully non-zero.
  const maxVal = Math.max(...item.choices.map((c) => c.value));
  if (answer.value >= Math.max(2, Math.ceil(maxVal / 2))) {
    const tier: RiskTier = answer.value >= maxVal ? "moderate" : "low";
    return {
      id: `sig_${answer.itemId}_${answer.at}`,
      domain: instrument.domain,
      text: `Reported "${answer.label.toLowerCase()}" for: ${item.prompt.toLowerCase()}`,
      tier,
      source: `${instrument.shortName} · ${item.id}`,
      at: answer.at,
    };
  }
  return null;
}

/** A completed-instrument signal summarizing its band. */
export function signalForResult(result: InstrumentResult): CareSignal {
  return {
    id: `sig_result_${result.instrumentId}`,
    domain: result.domain,
    text: `${result.shortName} total ${result.score}/${result.maxScore} — ${result.band.label}`,
    tier: result.band.tier,
    source: `${result.shortName} band`,
    at: Date.now(),
  };
}

export function tierLabel(t: RiskTier): string {
  switch (t) {
    case "minimal":
      return "Minimal signal";
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
      return "#64748b"; // slate
    case "low":
      return "#0d9488"; // teal
    case "moderate":
      return "#ca8a04"; // amber
    case "high":
      return "#ea580c"; // orange
    case "urgent":
      return "#dc2626"; // red
  }
}

/** Domain of a given instrument by id — helper for grouping signals. */
export function domainForDomains(domains: Domain[]): Domain | undefined {
  return domains[0];
}
