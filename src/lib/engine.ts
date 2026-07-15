// The orchestrator: a small, auditable state machine that drives the session.
//
// Flow:  intake  ->  screening (composed pathway)  ->  [safety]  ->  summary
//
// The "agentic" behavior lives in HOW the pathway is composed (situation ->
// domains -> instruments), how items are adaptively skipped (pre-screens), and
// how the session self-routes to safety. The LLM decorates language; this file
// owns every state transition and every clinical decision.

import type {
  Answer,
  ChatMessage,
  Domain,
  Instrument,
  PatientContext,
  SchedulingRecommendation,
  Session,
  VisitType,
} from "./types";
import { getInstrument, instrumentForDomain } from "./instruments";
import { composePathway } from "./situations";
import {
  computeResults,
  hasSafetyFlag,
  overallTier,
  scoreInstrument,
  signalForAnswer,
  signalForResult,
  tierLabel,
  tierRank,
} from "./risk";
import { createSession, newMessageId, saveSession } from "./session";
import { understandSituation, warmItemPhrasing, writeBriefs } from "./anthropic";
import {
  computeTrajectories,
  getPatient,
  recordSession,
  summarize,
} from "./patients";
import type { Briefs, ClinicianBrief, SessionSummary } from "./types";

const DOMAIN_LABEL: Record<Domain, string> = {
  mood: "mood",
  anxiety: "anxiety",
  stress: "stress",
  sleep: "sleep",
  alcohol: "alcohol use",
  trauma: "difficult experiences",
  energy: "energy & recovery",
  safety: "safety",
};

const DOMAIN_INTRO: Record<Domain, string> = {
  energy: "Let's start with your energy and recovery.",
  sleep: "A few about sleep.",
  stress: "Now a couple about stress.",
  anxiety: "Now a few about worry and anxiety.",
  alcohol: "A quick, confidential check about alcohol.",
  mood: "Now a few about mood. Take your time.",
  trauma: "These next ones are about difficult experiences — go at your own pace.",
  safety: "One caring check before we wrap up.",
};

const DISCLAIMER =
  "I'm a companion that helps you prepare for your visit — not a doctor or therapist, and this isn't a diagnosis. " +
  "Everything you share is to help your Core Care team help you faster. If anything ever feels urgent, call 988 or 911.";

function msg(partial: Omit<ChatMessage, "id" | "at">): ChatMessage {
  return { id: newMessageId(), at: Date.now(), ...partial };
}

function currentInstrument(session: Session): Instrument | undefined {
  const id = session.plannedInstrumentIds[session.cursor.instrumentIndex];
  return id ? getInstrument(id) : undefined;
}

/** Build the companion message that administers the item at the cursor. */
async function emitCurrentItem(session: Session, includeIntro: boolean): Promise<ChatMessage | null> {
  const instrument = currentInstrument(session);
  if (!instrument) return null;
  const item = instrument.items[session.cursor.itemIndex];
  if (!item) return null;

  const context =
    (session.context.situationText ? `situation: ${session.context.situationText}. ` : "") +
    (session.context.tags.length ? `tags: ${session.context.tags.join(", ")}.` : "");
  const phrased = await warmItemPhrasing(item.prompt, context);

  const intro = includeIntro ? `${DOMAIN_INTRO[instrument.domain]} ` : "";
  const meta = ` _(${instrument.shortName}, ${instrument.timeframe})_`;
  return msg({
    speaker: "companion",
    text: `${intro}${phrased}${meta}`,
    instrumentId: instrument.id,
    itemId: item.id,
    choices: item.choices,
  });
}

/** Advance the cursor one item forward, applying pre-screen skips. Returns false when screening is complete. */
function advanceCursor(session: Session): boolean {
  let { instrumentIndex, itemIndex } = session.cursor;
  itemIndex++;

  while (instrumentIndex < session.plannedInstrumentIds.length) {
    const inst = getInstrument(session.plannedInstrumentIds[instrumentIndex]);
    if (!inst || itemIndex >= inst.items.length) {
      instrumentIndex++;
      itemIndex = 0;
      continue;
    }
    // Pre-screen skip: if we're about to ask the first item past the pre-screen
    // and every pre-screen answer was 0, skip the rest of this instrument.
    if (inst.preScreenItemIds && itemIndex === inst.preScreenItemIds.length) {
      const pre = session.answers.filter(
        (a) => a.instrumentId === inst.id && inst.preScreenItemIds!.includes(a.itemId),
      );
      const allZero = pre.length >= inst.preScreenItemIds.length && pre.every((a) => a.value === 0);
      if (allZero) {
        instrumentIndex++;
        itemIndex = 0;
        continue;
      }
    }
    session.cursor = { instrumentIndex, itemIndex };
    return true;
  }
  session.cursor = { instrumentIndex, itemIndex: 0 };
  return false;
}

/** Start a new session from the patient's shared context + situation text. */
export async function startSession(context: PatientContext, patientId: string): Promise<Session> {
  const prior = getPatient(patientId);
  const priorCount = prior?.sessions.length ?? 0;
  const returning = priorCount > 0;
  const session = createSession(context, patientId, priorCount + 1);

  session.messages.push(
    msg({ speaker: "companion", text: `Hi${context.displayName ? ` ${context.displayName}` : ""} — I'm glad you're here. ${DISCLAIMER}` }),
  );

  const situationText = context.situationText?.trim() || "general check-in";
  const understanding = await understandSituation(situationText);
  let domains = understanding.domains;

  // Longitudinal carry-forward: re-check areas that were elevated last time,
  // even if the person didn't bring them up today. This is the "companion
  // remembers" behavior — the pathway adapts to their history, not just today's words.
  let carried: Domain[] = [];
  if (returning) {
    const last = prior!.sessions[prior!.sessions.length - 1];
    carried = last.results
      .filter((r) => r.domain !== "safety" && tierRank(r.tier) >= 2 && !domains.includes(r.domain as Domain))
      .map((r) => r.domain as Domain);
    domains = Array.from(new Set([...domains, ...carried]));

    const lastTop = [...last.results].sort((a, b) => tierRank(b.tier) - tierRank(a.tier))[0];
    const whenAgo = daysAgo(last.at);
    session.messages.push(
      msg({
        speaker: "companion",
        text:
          `Welcome back — this is check-in #${session.visitNumber}. ${whenAgo ? `Last time (${whenAgo}), ` : "Last time, "}` +
          `${lastTop ? `${DOMAIN_LABEL[lastTop.domain as Domain]} stood out most. ` : ""}` +
          `Let's see how things have shifted since then.`,
      }),
    );
  }

  session.pathway = composePathway(domains);
  session.plannedInstrumentIds = session.pathway
    .map((d) => instrumentForDomain(d)?.id)
    .filter((id): id is string => Boolean(id));

  session.signals.push({
    id: `sig_pathway_${session.createdAt}`,
    domain: session.pathway[0] ?? "mood",
    text:
      `Composed a ${session.pathway.length}-area pathway from what you shared: ${session.pathway.map((d) => DOMAIN_LABEL[d]).join(", ")}.` +
      (carried.length ? ` (Re-checking ${carried.map((d) => DOMAIN_LABEL[d]).join(" & ")} from your last visit.)` : ""),
    tier: "minimal",
    source: `situation${carried.length ? " + history" : ""} → pathway`,
    at: Date.now(),
  });

  session.messages.push(msg({ speaker: "companion", text: understanding.acknowledgement }));

  session.phase = "screening";
  session.cursor = { instrumentIndex: 0, itemIndex: 0 };
  const first = await emitCurrentItem(session, true);
  if (first) session.messages.push(first);
  else session.phase = "summary";

  return saveSession(session);
}

/** Human "3 days ago" / "2 weeks ago" for the welcome-back line. */
function daysAgo(then: number): string {
  const d = Math.round((Date.now() - then) / 86_400_000);
  if (d <= 0) return "earlier today";
  if (d === 1) return "yesterday";
  if (d < 14) return `${d} days ago`;
  if (d < 60) return `${Math.round(d / 7)} weeks ago`;
  return `${Math.round(d / 30)} months ago`;
}

/**
 * Adaptive in-conversation pathway expansion. When a completed instrument
 * signals a related concern, weave in the relevant screener mid-session — the
 * companion follows the person's answers instead of a fixed script. Returns the
 * domains newly added (for transparency).
 */
function expandPathway(session: Session): Domain[] {
  const results = computeResults(session.answers);
  const added: Domain[] = [];

  const addDomain = (d: Domain) => {
    const inst = instrumentForDomain(d);
    if (!inst || session.plannedInstrumentIds.includes(inst.id)) return;
    // Keep a not-yet-reached safety check last by inserting ahead of it.
    const safetyIdx = session.plannedInstrumentIds.indexOf("safety");
    if (d !== "safety" && safetyIdx > session.cursor.instrumentIndex) {
      session.plannedInstrumentIds.splice(safetyIdx, 0, inst.id);
      const sPath = session.pathway.indexOf("safety");
      if (sPath !== -1) session.pathway.splice(sPath, 0, d);
      else session.pathway.push(d);
    } else {
      session.plannedInstrumentIds.push(inst.id);
      session.pathway.push(d);
    }
    added.push(d);
  };

  for (const r of results) {
    const t = tierRank(r.band.tier);
    if (r.domain === "energy" && t >= 2) {
      addDomain("sleep");
      addDomain("mood");
    }
    if (r.domain === "alcohol" && t >= 2) addDomain("mood");
    if (r.domain === "sleep" && t >= 3) addDomain("stress");
    if (r.domain === "anxiety" && t >= 3) addDomain("mood");
    if ((r.domain === "mood" || r.domain === "trauma") && t >= 1) addDomain("safety");
  }
  return added;
}

/** Record an answer to the current item and produce the next companion turn. */
export async function submitAnswer(
  session: Session,
  value: number,
  label: string,
): Promise<Session> {
  if (session.phase !== "screening") return session;
  const instrument = currentInstrument(session);
  if (!instrument) {
    session.phase = "summary";
    return saveSession(session);
  }
  const item = instrument.items[session.cursor.itemIndex];
  if (!item) {
    session.phase = "summary";
    return saveSession(session);
  }

  const answer: Answer = {
    instrumentId: instrument.id,
    itemId: item.id,
    value,
    label,
    at: Date.now(),
  };
  session.answers.push(answer);
  session.messages.push(msg({ speaker: "patient", text: label }));

  const sig = signalForAnswer(answer);
  if (sig) session.signals.push(sig);

  // Immediate safety routing on any endorsed safety-critical item.
  if (item.safetyCritical && value > 0) {
    session.safetyTriggered = true;
    session.phase = "safety";
    session.messages.push(
      msg({
        speaker: "companion",
        text:
          "Thank you for telling me that — I really mean it. What you just shared is important enough that the best next step " +
          "is talking with a real person, not a screen. **If you're in the U.S., you can call or text 988 right now** to reach the " +
          "Suicide & Crisis Lifeline (free, 24/7), or call 911 if you're in immediate danger. I can also help you reach Core Care Clinic today. " +
          "You are not a burden, and you don't have to carry this alone.",
      }),
    );
    session.results = computeResults(session.answers);
    session.overallTier = "urgent";
    persistSummary(session);
    return saveSession(session);
  }

  const prevInstrumentId = instrument.id;
  const advanced = advanceCursor(session);
  const crossedInstrument = !advanced || currentInstrument(session)?.id !== prevInstrumentId;

  // When we leave an instrument: record its band, then adaptively decide whether
  // its result warrants weaving in a related screener.
  if (crossedInstrument) {
    const finished = getInstrument(prevInstrumentId);
    if (finished && session.answers.some((a) => a.instrumentId === finished.id)) {
      session.signals.push(signalForResult(scoreInstrument(finished, session.answers)));
    }
    const added = expandPathway(session);
    if (added.length) {
      const labels = added.map((d) => DOMAIN_LABEL[d]).join(" and ");
      session.signals.push({
        id: `sig_expand_${Date.now()}`,
        domain: added[0],
        text: `Your answers opened up ${labels} — I wove in a few more questions.`,
        tier: "low",
        source: "adaptive follow-up",
        at: Date.now(),
      });
      session.messages.push(
        msg({
          speaker: "companion",
          text: `A couple of your answers made me want to check one more thing — I'll add a few quick questions about ${labels}. Still optional.`,
        }),
      );
    }
  }

  // Keep the overall meter honest and live as instruments accumulate.
  session.overallTier = overallTier(computeResults(session.answers));

  // After any expansion, is there still an item to ask?
  const nextInstrument = currentInstrument(session);
  const nextItem = nextInstrument?.items[session.cursor.itemIndex];
  if (nextInstrument && nextItem) {
    const next = await emitCurrentItem(session, crossedInstrument);
    if (next) session.messages.push(next);
  } else {
    session.phase = "summary";
    session.results = computeResults(session.answers);
    session.overallTier = overallTier(session.results);
    session.messages.push(
      msg({
        speaker: "companion",
        text:
          "That's everything I wanted to ask — thank you for your honesty. I've put together a short summary for you and a " +
          "clinical brief your Core Care team can read before your visit. Let's look at it together, and then we'll figure out " +
          "whether booking a visit makes sense.",
      }),
    );
    persistSummary(session);
  }

  return saveSession(session);
}

/** Persist a completed session to the patient's longitudinal record (named patients only). */
function persistSummary(session: Session): void {
  if (!session.patientId || session.patientId.startsWith("anon_")) return;
  const results = session.results.length ? session.results : computeResults(session.answers);
  const tier = session.safetyTriggered ? "urgent" : overallTier(results);
  const summary = summarize(
    session.id,
    session.context.situationText || "general check-in",
    tier,
    session.safetyTriggered,
    results,
  );
  recordSession(session.patientId, session.context.displayName, summary);
}

/** Deterministic scheduling recommendation from computed results. */
function recommendScheduling(session: Session): SchedulingRecommendation {
  if (session.safetyTriggered) {
    return {
      visitType: "crisis",
      urgency: "same_day",
      rationale:
        "A safety item was endorsed. This routes to immediate human contact and crisis resources (988), not a routine booking.",
    };
  }

  const results = session.results.length ? session.results : computeResults(session.answers);
  const tier = overallTier(results);

  const behavioralDomains: Domain[] = ["mood", "anxiety", "trauma", "alcohol", "stress"];
  const medicalDomains: Domain[] = ["energy", "sleep"];
  const behavioralHit = results.some(
    (r) => behavioralDomains.includes(r.domain) && tierRank(r.band.tier) >= 2,
  );
  const medicalHit = results.some(
    (r) => medicalDomains.includes(r.domain) && tierRank(r.band.tier) >= 2,
  );

  let visitType: VisitType = "integrated";
  if (behavioralHit && medicalHit) visitType = "integrated";
  else if (behavioralHit) visitType = "behavioral_health";
  else if (medicalHit) visitType = "primary_care";
  else visitType = "integrated";

  const urgency: SchedulingRecommendation["urgency"] =
    tier === "urgent" ? "same_day" : tier === "high" ? "within_week" : tier === "moderate" ? "within_week" : tier === "low" ? "routine" : "self_directed";

  const rationale =
    tier === "minimal"
      ? "Signals were minimal. A visit is optional — but you're always welcome to book a routine check-in, and this summary will be waiting."
      : `Your strongest signals suggest starting with ${visitTypeLabel(visitType).toLowerCase()}. ` +
        `Given an overall level of "${tierLabel(tier).toLowerCase()}", ${urgencyPhrase(urgency)}.`;

  return { visitType, urgency, rationale };
}

function urgencyPhrase(u: SchedulingRecommendation["urgency"]): string {
  switch (u) {
    case "same_day":
      return "a same-day appointment is recommended";
    case "within_week":
      return "booking within about a week is a good idea";
    case "routine":
      return "a routine appointment in the next few weeks makes sense";
    case "self_directed":
      return "you can decide the timing that feels right";
  }
}

export function visitTypeLabel(v: VisitType): string {
  switch (v) {
    case "primary_care":
      return "Primary Care";
    case "behavioral_health":
      return "Behavioral Health";
    case "integrated":
      return "Integrated (medical + behavioral)";
    case "crisis":
      return "Urgent / Crisis support";
  }
}

/** Compute both briefs + scheduling recommendation for a completed session. */
export async function generateBriefs(session: Session): Promise<Briefs> {
  const results = session.results.length ? session.results : computeResults(session.answers);
  const tier = session.safetyTriggered ? "urgent" : overallTier(results);

  const redFlags: string[] = [];
  for (const r of results) {
    if (r.safetyFlags.length) redFlags.push(`${r.shortName}: safety item endorsed`);
    if (tierRank(r.band.tier) >= 4) redFlags.push(`${r.shortName}: ${r.band.label} (${r.score}/${r.maxScore})`);
  }

  const suggestedFocus = results
    .filter((r) => tierRank(r.band.tier) >= 1)
    .sort((a, b) => tierRank(b.band.tier) - tierRank(a.band.tier))
    .map((r) => `${DOMAIN_LABEL[r.domain]} (${r.shortName} ${r.band.label.toLowerCase()})`);

  const resultsSummary = results
    .map((r) => `${r.shortName} ${r.score}/${r.maxScore} — ${r.band.label}${r.safetyFlags.length ? " [SAFETY FLAG]" : ""}`)
    .join("\n");

  // Longitudinal: fold this session in (dedup-safe) and chart each instrument.
  const currentSummary: SessionSummary = summarize(
    session.id,
    session.context.situationText || "general check-in",
    tier,
    session.safetyTriggered,
    results,
  );
  const trajectories = computeTrajectories(session.patientId, currentSummary);
  const trajectoryNotes = trajectories
    .filter((t) => t.points.length >= 2)
    .map((t) => `${t.shortName}: ${t.points.map((p) => p.score).join(" → ")} (${t.direction})`);

  const narratives = await writeBriefs({
    situationText: session.context.situationText || "general check-in",
    resultsSummary,
    overallTierLabel: tierLabel(tier),
    redFlags,
    suggestedFocus,
    safetyTriggered: session.safetyTriggered,
    returning: session.visitNumber > 1,
    trajectory: trajectoryNotes.join("; "),
  });

  const clinicianBrief: ClinicianBrief = {
    headline: narratives.headline,
    narrative: narratives.clinicianNarrative,
    results,
    redFlags,
    suggestedFocus,
    overallTier: tier,
    trajectoryNotes,
    visitNumber: session.visitNumber,
    returning: session.visitNumber > 1,
  };

  return {
    patientReflection: narratives.patientReflection,
    clinicianBrief,
    scheduling: recommendScheduling(session),
    trajectories,
    visitNumber: session.visitNumber,
  };
}
