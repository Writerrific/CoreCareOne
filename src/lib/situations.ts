// Situation templates: the "situation-first, not symptom-first" layer.
//
// A patient describes their life ("I'm a college athlete and my times are
// slipping and I feel flat"). We map that to a set of screening DOMAINS, then
// compose a pathway from the instrument library. The LLM does richer mapping
// when available; this table is the deterministic fallback + the menu of
// starting points shown on the intake screen.

import type { Domain, SituationTemplate } from "./types";

export const SITUATIONS: SituationTemplate[] = [
  {
    id: "athlete_performance",
    label: "My performance / energy is slipping",
    aliases: ["athlete", "training", "performance", "sport", "gym", "runner", "coach", "tired", "recovery", "burnt out", "overtraining"],
    blurb: "For when workouts, recovery, or energy feel off — we'll look at sleep, energy, stress, and mood.",
    domains: ["energy", "sleep", "stress", "mood"],
  },
  {
    id: "low_mood",
    label: "I've been feeling low or not myself",
    aliases: ["depressed", "depression", "sad", "down", "hopeless", "empty", "unmotivated", "low mood", "numb"],
    blurb: "For persistent low mood or loss of interest — we'll gently check mood, sleep, and stress.",
    domains: ["mood", "sleep", "stress"],
  },
  {
    id: "anxiety_stress",
    label: "I feel anxious, stressed, or overwhelmed",
    aliases: ["anxious", "anxiety", "stress", "stressed", "overwhelmed", "panic", "worry", "on edge", "nervous"],
    blurb: "For worry, tension, or overwhelm — we'll look at anxiety, stress, and sleep.",
    domains: ["anxiety", "stress", "sleep"],
  },
  {
    id: "sleep_trouble",
    label: "I'm not sleeping well",
    aliases: ["sleep", "insomnia", "cant sleep", "can't sleep", "awake", "tired", "restless", "wired"],
    blurb: "For trouble falling or staying asleep — we'll check sleep, plus stress and mood that often travel with it.",
    domains: ["sleep", "stress", "mood"],
  },
  {
    id: "new_parent",
    label: "I'm a new or expecting parent",
    aliases: ["new parent", "postpartum", "pregnant", "perinatal", "baby", "newborn", "mom", "dad", "parent"],
    blurb: "For the perinatal window — we'll check mood, sleep, and stress with extra care.",
    domains: ["mood", "sleep", "stress", "anxiety"],
  },
  {
    id: "caregiver_burnout",
    label: "I'm caring for someone and running on empty",
    aliases: ["caregiver", "caring for", "burnout", "exhausted", "caretaker", "elderly parent", "sick family"],
    blurb: "For caregiver strain — we'll look at stress, mood, energy, and sleep.",
    domains: ["stress", "mood", "energy", "sleep"],
  },
  {
    id: "drinking_concern",
    label: "I'm wondering about my drinking or substance use",
    aliases: ["drinking", "alcohol", "drink", "substance", "using", "cutting down", "hangover"],
    blurb: "For questions about alcohol use — a confidential, non-judgmental check plus mood.",
    domains: ["alcohol", "mood", "stress"],
  },
  {
    id: "stress_after_event",
    label: "Something stressful happened and it's staying with me",
    aliases: ["trauma", "ptsd", "flashback", "nightmare", "assault", "accident", "loss", "grief", "stressful event"],
    blurb: "For a difficult event that won't settle — we'll check trauma-related signals, mood, and sleep, carefully.",
    domains: ["trauma", "mood", "sleep"],
  },
  {
    id: "general_checkin",
    label: "I just want a general check-in",
    aliases: ["checkup", "general", "not sure", "everything", "wellness", "annual"],
    blurb: "A broad well-being check across mood, stress, and sleep.",
    domains: ["mood", "stress", "sleep"],
  },
];

const BY_ID = new Map(SITUATIONS.map((s) => [s.id, s]));

export function getSituation(id: string): SituationTemplate | undefined {
  return BY_ID.get(id);
}

/**
 * Direct domain keywords. These let us pick up a concern EVEN WHEN no single
 * template owns it — so a message like "I'm an athlete but I've also been
 * drinking more and feeling down" surfaces energy + alcohol + mood together,
 * rather than being forced into just the "athlete" bucket.
 */
const DOMAIN_KEYWORDS: Record<Domain, string[]> = {
  mood: ["depress", "down", "hopeless", "sad", "empty", "numb", "no interest", "unmotivated", "worthless", "cry", "flat", "low"],
  anxiety: ["anxious", "anxiety", "panic", "worry", "worried", "on edge", "nervous", "dread", "racing thought", "restless"],
  stress: ["stress", "overwhelm", "pressure", "burnout", "burnt out", "too much", "piling up", "can't cope", "cant cope"],
  sleep: ["sleep", "insomnia", "awake", "tired", "exhausted", "restless", "wired", "can't sleep", "cant sleep", "waking"],
  alcohol: ["drink", "drinking", "alcohol", "hungover", "hangover", "wine", "beer", "booze", "substance", "weed", "using"],
  trauma: ["trauma", "ptsd", "flashback", "nightmare", "assault", "abuse", "accident", "attack", "violence", "grief", "loss"],
  energy: ["energy", "fatigue", "performance", "recovery", "training", "workout", "athlete", "run", "gym", "run-down", "appetite", "weight"],
  safety: [
    "suicid",
    "self-harm",
    "self harm",
    "hurt myself",
    "harm myself",
    "kill myself",
    "end it all",
    "end my life",
    "take my life",
    "want to die",
    "better off dead",
    "better off without me",
    "everyone would be better off",
    "don't want to be here",
    "dont want to be here",
    "wish i wasn't here",
    "wish i wasnt here",
    "no reason to live",
    "not worth living",
    "can't go on",
    "cant go on",
    "want to disappear",
  ],
};

// Offline safety-net: does a free-text note contain any explicit safety phrase?
// A keyword net is coarse (the LLM path is better), so it errs toward catching more.
export function mentionsSafetyConcern(text: string): boolean {
  const lower = ` ${text.toLowerCase()} `;
  return DOMAIN_KEYWORDS.safety.some((kw) => lower.includes(kw));
}

/**
 * Deterministic offline matcher: single best-matching template (kept for the
 * intake blurb / label). Prefer `inferDomains` for actual pathway composition.
 */
export function matchSituation(text: string): { template: SituationTemplate; matched: string[] } {
  const lower = ` ${text.toLowerCase()} `;
  let best: SituationTemplate = getSituation("general_checkin")!;
  let bestHits: string[] = [];
  for (const t of SITUATIONS) {
    const hits = t.aliases.filter((a) => lower.includes(a.toLowerCase()));
    if (hits.length > bestHits.length) {
      best = t;
      bestHits = hits;
    }
  }
  return { template: best, matched: bestHits };
}

/**
 * Adaptive, multi-signal domain inference — the offline counterpart to the LLM
 * intake. Rather than picking ONE category, it scores every domain from two
 * independent sources and unions everything that clears a threshold:
 *   1. how many templates' aliases the text hits (each contributes its domains)
 *   2. direct domain keywords (a stronger, category-independent signal)
 * The result adapts to the individual instead of flattening them to a bucket.
 */
export function inferDomains(text: string): {
  domains: Domain[];
  templateId: string;
  matched: string[];
  scores: Partial<Record<Domain, number>>;
} {
  const lower = ` ${text.toLowerCase()} `;
  const scores: Partial<Record<Domain, number>> = {};
  const matched = new Set<string>();
  const bump = (d: Domain, n: number) => (scores[d] = (scores[d] ?? 0) + n);

  let bestTemplate: SituationTemplate = getSituation("general_checkin")!;
  let bestHits = 0;
  for (const t of SITUATIONS) {
    const hits = t.aliases.filter((a) => lower.includes(a.toLowerCase()));
    if (hits.length) {
      for (const d of t.domains) bump(d, hits.length);
      hits.forEach((h) => matched.add(h));
    }
    if (hits.length > bestHits) {
      bestHits = hits.length;
      bestTemplate = t;
    }
  }

  for (const [domain, kws] of Object.entries(DOMAIN_KEYWORDS) as [Domain, string[]][]) {
    for (const kw of kws) {
      if (lower.includes(kw)) {
        bump(domain, 2);
        matched.add(kw);
      }
    }
  }

  let domains = (Object.keys(scores) as Domain[]).filter((d) => (scores[d] ?? 0) >= 2);
  if (!domains.length) domains = bestTemplate.domains.slice();
  return { domains, templateId: bestTemplate.id, matched: Array.from(matched), scores };
}

/**
 * Compose an ordered screening pathway from a set of domains.
 * Rules that make the pathway clinically sensible:
 *  - Safety is ALWAYS appended whenever mood or trauma is in play.
 *  - Order runs least-to-most sensitive so trust builds before safety items.
 */
export function composePathway(domains: Domain[]): Domain[] {
  const set = new Set<Domain>(domains);
  if (set.has("mood") || set.has("trauma")) set.add("safety");

  const ORDER: Domain[] = ["energy", "sleep", "stress", "anxiety", "alcohol", "mood", "trauma", "safety"];
  return ORDER.filter((d) => set.has(d));
}
