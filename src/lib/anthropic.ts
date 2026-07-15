// LLM adapter for the natural-language layer.
//
// The LLM is used for THREE things only, none of which touch clinical scoring:
//   1. Understanding a free-text situation -> screening domains.
//   2. Phrasing a validated item empathetically for THIS person.
//   3. Writing the patient reflection + clinician brief narrative.
//
// If no ANTHROPIC_API_KEY is set (or CORECARE_ENGINE=mock), every function
// falls back to a deterministic implementation so the whole product runs
// offline. That fallback is also what keeps PHI off third parties during dev.

import Anthropic from "@anthropic-ai/sdk";
import type { Domain } from "./types";
import { SITUATIONS, inferDomains } from "./situations";
import { domainLabel } from "./present";

/** Human list of composed domains, e.g. "sleep, stress, and mood". */
function domainList(domains: Domain[]): string {
  const labels = domains.filter((d) => d !== "safety").map((d) => domainLabel(d).toLowerCase());
  if (labels.length <= 1) return labels[0] ?? "your wellbeing";
  return `${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]}`;
}

function offlineAck(domains: Domain[]): string {
  return (
    `Thanks for sharing that — and for putting it in your own words. Rather than a fixed form, I've picked out the areas ` +
    `that actually seem to matter here: ${domainList(domains)}. I'll ask a few focused questions about each. ` +
    `You can skip anything, and none of this is a diagnosis.`
  );
}

const MODEL = process.env.CORECARE_MODEL || "claude-opus-4-8";

export function llmEnabled(): boolean {
  if (process.env.CORECARE_ENGINE === "mock") return false;
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

const VALID_DOMAINS: Domain[] = [
  "mood",
  "anxiety",
  "stress",
  "sleep",
  "alcohol",
  "trauma",
  "energy",
  "safety",
];

/**
 * Map a free-text situation to screening domains + a one-line reflection.
 * Returns deterministically when the LLM is unavailable.
 */
export async function understandSituation(
  situationText: string,
): Promise<{ domains: Domain[]; acknowledgement: string; templateId: string }> {
  if (!llmEnabled()) {
    const { domains, templateId } = inferDomains(situationText);
    return { domains, templateId, acknowledgement: offlineAck(domains) };
  }

  const menu = SITUATIONS.map((s) => `- ${s.id}: ${s.label} -> domains: ${s.domains.join(", ")}`).join("\n");
  const system =
    `You are the intake layer of CoreCareOne, a pre-visit companion for a primary-care + behavioral-health clinic. ` +
    `A patient described their situation in their own words. Your ONLY job is to (a) pick the relevant screening DOMAINS ` +
    `and (b) write one warm, brief, non-diagnostic acknowledgement. You are NOT a therapist and must not give clinical advice.\n\n` +
    `Valid domains: ${VALID_DOMAINS.join(", ")}.\n` +
    `Reference situation menu (a STARTING point, not a set of boxes to force people into):\n${menu}\n\n` +
    `Be adaptive: capture ALL the concerns that are genuinely present, including co-occurring ones the menu doesn't pair ` +
    `(e.g. an athlete who is ALSO drinking more and feeling low -> energy AND alcohol AND mood). Don't flatten a person to ` +
    `one category. Pick 2-5 domains. If mood or trauma is relevant, safety is added automatically downstream. ` +
    `Reflect back what THEY said in your own warm words — don't recite a category name. ` +
    `Respond ONLY as JSON: {"domains": string[], "templateId": string, "acknowledgement": string}.`;

  try {
    const res = await getClient().messages.create({
      model: MODEL,
      max_tokens: 400,
      system,
      messages: [{ role: "user", content: situationText }],
    });
    const text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    const parsed = JSON.parse(extractJson(text));
    const domains = (parsed.domains as string[]).filter((d): d is Domain =>
      VALID_DOMAINS.includes(d as Domain),
    );
    const fallback = inferDomains(situationText);
    const finalDomains = domains.length ? domains : fallback.domains;
    return {
      domains: finalDomains,
      templateId: typeof parsed.templateId === "string" ? parsed.templateId : fallback.templateId,
      acknowledgement:
        typeof parsed.acknowledgement === "string" && parsed.acknowledgement.trim()
          ? parsed.acknowledgement.trim()
          : offlineAck(finalDomains),
    };
  } catch {
    const { domains, templateId } = inferDomains(situationText);
    return { domains, templateId, acknowledgement: offlineAck(domains) };
  }
}

/**
 * Optionally warm up the canonical wording of a validated item for THIS person.
 * The canonical prompt and the answer choices are UNCHANGED — only a short
 * lead-in sentence is added. Falls back to no lead-in when offline.
 */
export async function warmItemPhrasing(
  canonicalPrompt: string,
  context: string,
): Promise<string> {
  if (!llmEnabled()) return canonicalPrompt;
  const system =
    `You gently introduce a validated screening item without changing its meaning. ` +
    `Return the SAME question, optionally preceded by one short, warm lead-in clause. ` +
    `Do not add advice, do not add options, keep it under 40 words. Return plain text only.`;
  try {
    const res = await getClient().messages.create({
      model: MODEL,
      max_tokens: 120,
      system,
      messages: [
        { role: "user", content: `Context about the person: ${context}\nItem to ask: "${canonicalPrompt}"` },
      ],
    });
    const text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
    return text || canonicalPrompt;
  } catch {
    return canonicalPrompt;
  }
}

export interface NarrativeInput {
  situationText: string;
  resultsSummary: string;
  overallTierLabel: string;
  redFlags: string[];
  suggestedFocus: string[];
  safetyTriggered: boolean;
  /** True for a returning patient (2nd+ check-in). */
  returning?: boolean;
  /** Cross-visit trends, e.g. "PHQ-9: 8 → 12 (worsening); GAD-7: 10 → 6 (improving)". */
  trajectory?: string;
}

/** Write the two brief narratives. Deterministic fallback when offline. */
export async function writeBriefs(
  input: NarrativeInput,
): Promise<{ patientReflection: string; clinicianNarrative: string; headline: string }> {
  if (!llmEnabled()) return deterministicBriefs(input);

  const system =
    `You are the summarization layer of CoreCareOne. You write TWO things from ALREADY-COMPUTED screening results ` +
    `(you must not invent, re-score, or diagnose):\n` +
    `1) patientReflection: warm, plain-language, empowering, 2nd person, non-diagnostic, <140 words. Normalizes seeking help. ` +
    `Never says "you have <condition>". Ends by encouraging a conversation with a clinician.\n` +
    `2) clinicianNarrative: concise, clinical, 3rd person, for the treating clinician to read in 20 seconds before the visit. ` +
    `References the instrument bands and flags provided. <120 words.\n` +
    `3) headline: one line, <=12 words, for the top of the clinician brief.\n` +
    (input.safetyTriggered
      ? `A SAFETY item was endorsed: both narratives must foreground connecting to a person now and the 988 Lifeline; do not counsel.\n`
      : ``) +
    (input.trajectory
      ? `This is a RETURNING patient. Cross-visit trends are provided — reference the direction of change (improving/worsening) ` +
        `in both narratives; the trend is often more meaningful than any single score. Do not re-score.\n`
      : ``) +
    `Respond ONLY as JSON: {"patientReflection": string, "clinicianNarrative": string, "headline": string}.`;

  const user =
    `Situation (patient words): ${input.situationText}\n` +
    `Overall tier: ${input.overallTierLabel}\n` +
    `Results:\n${input.resultsSummary}\n` +
    `Red flags: ${input.redFlags.join("; ") || "none"}\n` +
    `Suggested focus: ${input.suggestedFocus.join("; ") || "general check-in"}\n` +
    `Cross-visit trend: ${input.trajectory || "first check-in"}`;

  try {
    const res = await getClient().messages.create({
      model: MODEL,
      max_tokens: 700,
      system,
      messages: [{ role: "user", content: user }],
    });
    const text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    const parsed = JSON.parse(extractJson(text));
    return {
      patientReflection: strOr(parsed.patientReflection, deterministicBriefs(input).patientReflection),
      clinicianNarrative: strOr(parsed.clinicianNarrative, deterministicBriefs(input).clinicianNarrative),
      headline: strOr(parsed.headline, deterministicBriefs(input).headline),
    };
  } catch {
    return deterministicBriefs(input);
  }
}

function deterministicBriefs(input: NarrativeInput): {
  patientReflection: string;
  clinicianNarrative: string;
  headline: string;
} {
  if (input.safetyTriggered) {
    return {
      headline: "Safety item endorsed — connect to a person now",
      patientReflection:
        "Thank you for being honest — that took courage. What you shared tells me the most important next step is talking " +
        "with a real person right away. You don't have to sort this out alone. If you're in the U.S., you can call or text 988 " +
        "any time to reach the Suicide & Crisis Lifeline. Core Care Clinic can also connect you with someone today.",
      clinicianNarrative:
        `Patient completed a pre-visit companion session and endorsed a safety item. Overall tier: ${input.overallTierLabel}. ` +
        `Red flags: ${input.redFlags.join("; ") || "safety item endorsed"}. Crisis resources were surfaced in-session; ` +
        `recommend immediate clinician contact and safety assessment. Suggested focus: ${input.suggestedFocus.join(", ") || "safety"}.`,
    };
  }
  const trendClausePatient = input.trajectory
    ? " Because you've checked in before, your care team can see how things are trending, not just today's snapshot — that context really helps."
    : "";
  const trendClauseClinician = input.trajectory ? ` Cross-visit trend: ${input.trajectory}.` : "";
  return {
    headline: input.returning
      ? `Follow-up check-in — overall ${input.overallTierLabel.toLowerCase()}`
      : `Pre-visit summary — overall ${input.overallTierLabel.toLowerCase()}`,
    patientReflection:
      "Thanks for taking the time — that's a real step toward feeling better. Based on what you shared, there are a few areas " +
      "worth talking through with your clinician. None of this is a diagnosis; it's a starting point that means your visit can " +
      "pick up where you left off instead of starting from scratch." +
      trendClausePatient +
      " Bringing this in will help your care team help you faster.",
    clinicianNarrative:
      `Patient completed a situation-first pre-visit screen. Overall tier: ${input.overallTierLabel}. ` +
      `${input.resultsSummary.replace(/\n/g, " ")}` +
      trendClauseClinician +
      ` Suggested focus: ${input.suggestedFocus.join(", ") || "general check-in"}.`,
  };
}

function extractJson(text: string): string {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) return "{}";
  return text.slice(start, end + 1);
}

function strOr(v: unknown, fallback: string): string {
  return typeof v === "string" && v.trim() ? v.trim() : fallback;
}
