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
import { interpretFreeText, understandSituation, warmItemPhrasing, writeBriefs } from "./anthropic";
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
  energy: "Let's start with energy and recovery.",
  sleep: "A few about sleep.",
  stress: "Now some about stress.",
  anxiety: "Now a few about worry and anxiety.",
  alcohol: "A quick, private check about alcohol.",
  mood: "Now a few about mood. Take your time.",
  trauma: "These next few are about difficult experiences. Go at your own pace.",
  safety: "One last check before we wrap up.",
};

const DISCLAIMER =
  "Before we start: I help you get ready for your visit. I'm not a doctor or therapist, and this isn't a diagnosis. " +
  "What you share goes to your Core Care team so your appointment can pick up where you leave off. If anything feels urgent, call 988 or 911.";

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
    msg({ speaker: "companion", text: `Hi${context.displayName ? ` ${context.displayName}` : ""}. ${DISCLAIMER}` }),
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
          `Welcome back. This is check-in #${session.visitNumber}. ${whenAgo ? `Last time (${whenAgo}), ` : "Last time, "}` +
          `${lastTop ? `${DOMAIN_LABEL[lastTop.domain as Domain]} stood out most. ` : ""}` +
          `Let's see what's changed.`,
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
      `Focused on ${session.pathway.length} areas from what you told me: ${session.pathway.map((d) => DOMAIN_LABEL[d]).join(", ")}.` +
      (carried.length ? ` Re-checking ${carried.map((d) => DOMAIN_LABEL[d]).join(" & ")} from your last visit.` : ""),
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

const CRISIS_MESSAGE =
  "Thanks for telling me. That's important, and it's worth talking to a real person now rather than working through it here. " +
  "**In the U.S. you can call or text 988 anytime** for the Suicide & Crisis Lifeline (free, 24/7), or call 911 if you're in immediate danger. " +
  "Core Care can also connect you with someone today. You don't have to handle this alone.";

/**
 * Add a domain's default instrument to the pathway if it isn't already planned.
 * Keeps a not-yet-reached safety check last by inserting ahead of it.
 */
function addDomainToPathway(session: Session, d: Domain): boolean {
  const inst = instrumentForDomain(d);
  if (!inst || session.plannedInstrumentIds.includes(inst.id)) return false;
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
  return true;
}

/**
 * Adaptive in-conversation pathway expansion. When a completed instrument
 * signals a related concern, weave in the relevant screener mid-session — the
 * companion follows the person's answers instead of a fixed script.
 */
function expandPathway(session: Session): Domain[] {
  const results = computeResults(session.answers, session.skipped);
  const added: Domain[] = [];
  const addDomain = (d: Domain) => {
    if (addDomainToPathway(session, d)) added.push(d);
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

/** "a", "a and b", or "a, b, and c". */
function joinList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

function contextString(session: Session): string {
  return (
    (session.context.situationText ? `situation: ${session.context.situationText}. ` : "") +
    (session.context.tags.length ? `tags: ${session.context.tags.join(", ")}.` : "")
  );
}

/** Route into the safety phase: crisis message, freeze results, persist. */
function enterSafety(session: Session): void {
  session.safetyTriggered = true;
  session.phase = "safety";
  session.messages.push(msg({ speaker: "companion", text: CRISIS_MESSAGE }));
  session.results = computeResults(session.answers, session.skipped);
  session.overallTier = "urgent";
  persistSummary(session);
}

/**
 * Shared tail for answering OR skipping the current item: leave-instrument
 * bookkeeping, adaptive expansion, then either ask the next item or finalize.
 */
async function continueAfterCurrent(session: Session, prevInstrumentId: string): Promise<void> {
  const advanced = advanceCursor(session);
  const crossedInstrument = !advanced || currentInstrument(session)?.id !== prevInstrumentId;

  if (crossedInstrument) {
    const finished = getInstrument(prevInstrumentId);
    if (finished && session.answers.some((a) => a.instrumentId === finished.id)) {
      session.signals.push(signalForResult(scoreInstrument(finished, session.answers, session.skipped)));
    }
    const added = expandPathway(session);
    if (added.length) {
      const labels = joinList(added.map((d) => DOMAIN_LABEL[d]));
      session.signals.push({
        id: `sig_expand_${Date.now()}`,
        domain: added[0],
        text: `Your answers point at ${labels}, so I added a few questions.`,
        tier: "low",
        source: "adaptive follow-up",
        at: Date.now(),
      });
      session.messages.push(
        msg({
          speaker: "companion",
          text: `A few of your answers point at ${labels}, so I'll ask a couple more about that. Skip any you'd rather not.`,
        }),
      );
    }
  }

  session.overallTier = overallTier(computeResults(session.answers, session.skipped));

  const nextInstrument = currentInstrument(session);
  const nextItem = nextInstrument?.items[session.cursor.itemIndex];
  if (nextInstrument && nextItem) {
    const next = await emitCurrentItem(session, crossedInstrument);
    if (next) session.messages.push(next);
  } else {
    session.phase = "summary";
    session.results = computeResults(session.answers, session.skipped);
    session.overallTier = overallTier(session.results);
    session.messages.push(
      msg({
        speaker: "companion",
        text:
          "That's all my questions. Thanks for being straight with me. I've pulled together a short summary for you and a " +
          "brief for your Core Care team. Let's take a look, then sort out whether to book a visit.",
      }),
    );
    persistSummary(session);
  }
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
    enterSafety(session);
    return saveSession(session);
  }

  await continueAfterCurrent(session, instrument.id);
  return saveSession(session);
}

/** Skip the current item without recording an answer, and move on. */
export async function skipItem(session: Session): Promise<Session> {
  if (session.phase !== "screening") return session;
  const instrument = currentInstrument(session);
  const item = instrument?.items[session.cursor.itemIndex];
  if (!instrument || !item) {
    session.phase = "summary";
    return saveSession(session);
  }

  if (!session.skipped.includes(item.id)) session.skipped.push(item.id);
  session.messages.push(msg({ speaker: "patient", text: "Skipped" }));
  session.signals.push({
    id: `sig_skip_${item.id}_${Date.now()}`,
    domain: instrument.domain,
    text: `Skipped: ${item.prompt.toLowerCase()}`,
    tier: "minimal",
    source: `${instrument.shortName} · skipped`,
    at: Date.now(),
  });

  await continueAfterCurrent(session, instrument.id);
  return saveSession(session);
}

/**
 * Open-ended free text. The companion interprets what the person wrote, updates
 * the ledger, and adapts the pathway — without losing their place. The current
 * question stays pending (it is restated) so they can still answer it.
 */
export async function submitFreeText(session: Session, text: string): Promise<Session> {
  if (session.phase !== "screening") return session;
  const trimmed = text.trim().slice(0, 1000);
  if (trimmed.length < 2) return session;

  session.messages.push(msg({ speaker: "patient", text: trimmed }));
  const interpreted = await interpretFreeText(trimmed, contextString(session));

  // Safety takes precedence over everything.
  if (interpreted.safety) {
    session.signals.push({
      id: `sig_ftsafety_${Date.now()}`,
      domain: "safety",
      text: "Raised a possible safety concern in their own words.",
      tier: "urgent",
      source: "free text",
      at: Date.now(),
    });
    enterSafety(session);
    return saveSession(session);
  }

  // Surface whatever the interpretation picked up, traceable to "free text".
  for (const s of interpreted.signals) {
    session.signals.push({
      id: `sig_ft_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      domain: s.domain,
      text: s.text,
      tier: s.tier,
      source: "free text",
      at: Date.now(),
    });
  }

  // Adapt the pathway to any new areas they raised.
  const added: Domain[] = [];
  for (const d of interpreted.domains) if (addDomainToPathway(session, d)) added.push(d);

  let ack = interpreted.acknowledgement || "Thanks, I've noted that.";
  if (added.length) ack += ` I'll add a few questions about ${joinList(added.map((d) => DOMAIN_LABEL[d]))}.`;
  session.messages.push(msg({ speaker: "companion", text: ack }));

  // Restate the current question so the answer buttons have clear context again.
  const restated = await emitCurrentItem(session, false);
  if (restated) session.messages.push(restated);

  session.overallTier = overallTier(computeResults(session.answers, session.skipped));
  return saveSession(session);
}

/** Persist a completed session to the patient's longitudinal record (named patients only). */
function persistSummary(session: Session): void {
  if (!session.patientId || session.patientId.startsWith("anon_")) return;
  const results = session.results.length ? session.results : computeResults(session.answers, session.skipped);
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

  const results = session.results.length ? session.results : computeResults(session.answers, session.skipped);
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
      ? "Signals were low. A visit is optional. You can book a routine check-in anytime, and this summary will be waiting."
      : `Your strongest signals point to ${visitTypeLabel(visitType).toLowerCase()}. ` +
        `With an overall level of ${tierLabel(tier).toLowerCase()}, ${urgencyPhrase(urgency)}.`;

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
  const results = session.results.length ? session.results : computeResults(session.answers, session.skipped);
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
