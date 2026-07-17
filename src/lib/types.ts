// Core domain types for CoreCareOne.
//
// Design principle: the CLINICAL layer (instruments, scoring, risk tiers) is
// fully typed and deterministic. The LLM only ever produces natural language;
// it never produces a score or a risk decision. That separation is what makes
// the tool auditable and safe to deploy in a real clinic.

/** A screening domain — the "what are we looking at" axis. */
export type Domain =
  | "mood"
  | "anxiety"
  | "stress"
  | "sleep"
  | "alcohol"
  | "trauma"
  | "energy" // fatigue / overtraining / nutrition proxy
  | "safety"; // suicide/self-harm risk — always screened when mood is in play

/** Risk is stratified, never binary. */
export type RiskTier = "minimal" | "low" | "moderate" | "high" | "urgent";

/** One answer option for an instrument item. */
export interface ItemChoice {
  label: string;
  value: number; // point value that feeds the validated score
}

/** A single validated screening item. */
export interface InstrumentItem {
  id: string;
  prompt: string; // the canonical wording of the item
  choices: ItemChoice[];
  /** If true, any non-zero answer is a safety flag that triggers escalation. */
  safetyCritical?: boolean;
}

/** Cutoff band for interpreting a total score. */
export interface ScoreBand {
  min: number;
  max: number;
  tier: RiskTier;
  label: string;
}

/** A validated screening instrument (e.g. PHQ-9, GAD-7). */
export interface Instrument {
  id: string;
  name: string;
  shortName: string;
  domain: Domain;
  /** Public-domain / freely usable clinical screener this is modeled on. */
  basis: string;
  /** Timeframe the items ask about, shown to the patient for honesty. */
  timeframe: string;
  items: InstrumentItem[];
  bands: ScoreBand[];
  /** Optional pre-screen: if these item ids all score 0, the full instrument can be skipped. */
  preScreenItemIds?: string[];
}

/** A recorded answer to an instrument item. */
export interface Answer {
  instrumentId: string;
  itemId: string;
  value: number;
  label: string;
  at: number;
}

/** A computed result for one instrument administered in a session. */
export interface InstrumentResult {
  instrumentId: string;
  name: string;
  shortName: string;
  domain: Domain;
  score: number;
  maxScore: number;
  band: ScoreBand;
  answered: number;
  total: number;
  skipped: number; // count of this instrument's items the patient chose to skip
  safetyFlags: string[]; // ids of safety-critical items answered non-zero
}

/** A "care signal" — one traceable line in the transparent ledger. */
export interface CareSignal {
  id: string;
  domain: Domain;
  text: string; // plain-language observation
  tier: RiskTier;
  source: string; // e.g. "GAD-7 item 3" or "situation: athlete"
  at: number;
}

/** Situation template: maps a life situation to relevant screening domains. */
export interface SituationTemplate {
  id: string;
  label: string;
  aliases: string[]; // keywords used by the offline matcher
  blurb: string;
  domains: Domain[];
}

export type Speaker = "companion" | "patient" | "system";

export interface ChatMessage {
  id: string;
  speaker: Speaker;
  text: string;
  at: number;
  /** If this message is administering an instrument item, the ids are attached. */
  instrumentId?: string;
  itemId?: string;
  choices?: ItemChoice[];
}

export type SessionPhase =
  | "intake" // learning the person's situation
  | "screening" // administering composed pathway
  | "safety" // a red flag was hit; crisis resources shown
  | "summary"; // briefs generated, scheduling offered

/** A demographic/context snapshot the patient optionally shares. */
export interface PatientContext {
  displayName?: string;
  ageBand?: string;
  situationText?: string; // free-text the patient gave
  tags: string[]; // e.g. ["athlete", "student"]
}

export interface Session {
  id: string;
  /** Stable patient key so check-ins over time form a trajectory (prototype: derived from name). */
  patientId: string;
  /** 1 for a first check-in, 2+ for returning. */
  visitNumber: number;
  createdAt: number;
  updatedAt: number;
  phase: SessionPhase;
  context: PatientContext;
  /** Domains the companion has decided to screen, in order. */
  pathway: Domain[];
  /** Instruments queued/administered, in order. */
  plannedInstrumentIds: string[];
  cursor: { instrumentIndex: number; itemIndex: number };
  messages: ChatMessage[];
  answers: Answer[];
  /** Item ids the patient explicitly skipped (not the same as pre-screen auto-skips). */
  skipped: string[];
  signals: CareSignal[];
  results: InstrumentResult[];
  overallTier: RiskTier;
  safetyTriggered: boolean;
}

/** The two artifacts produced at the end of a session. */
export interface Briefs {
  patientReflection: string;
  clinicianBrief: ClinicianBrief;
  scheduling: SchedulingRecommendation;
  /** Per-instrument score history across this patient's check-ins (this session included). */
  trajectories: Trajectory[];
  visitNumber: number;
}

export interface ClinicianBrief {
  headline: string;
  narrative: string;
  results: InstrumentResult[];
  redFlags: string[];
  suggestedFocus: string[];
  overallTier: RiskTier;
  /** Trajectory lines, e.g. "PHQ-9: 4 → 8 → 12 (worsening)". */
  trajectoryNotes: string[];
  visitNumber: number;
  returning: boolean;
}

// ---- Longitudinal layer ----------------------------------------------------

/** A compact, persisted record of one completed session — the trajectory unit. */
export interface SessionSummary {
  sessionId: string;
  at: number;
  situationText: string;
  overallTier: RiskTier;
  safetyTriggered: boolean;
  /** Red flags computed at completion (older stored records may lack this). */
  redFlags?: string[];
  results: {
    instrumentId: string;
    shortName: string;
    domain: Domain;
    score: number;
    maxScore: number;
    bandLabel: string;
    tier: RiskTier;
  }[];
}

/** Everything we retain about a returning patient (prototype: in-memory + JSON file). */
export interface PatientRecord {
  patientId: string;
  displayName?: string;
  createdAt: number;
  updatedAt: number;
  sessions: SessionSummary[];
}

export interface TrajectoryPoint {
  at: number;
  score: number;
  maxScore: number;
  tier: RiskTier;
  bandLabel: string;
}

export type TrajectoryDirection = "improving" | "worsening" | "steady" | "single";

/** One instrument's score history across a patient's check-ins. */
export interface Trajectory {
  instrumentId: string;
  shortName: string;
  domain: Domain;
  points: TrajectoryPoint[];
  direction: TrajectoryDirection;
  /** Signed change from first to latest point (in raw score units). */
  delta: number;
}

export type VisitType = "primary_care" | "behavioral_health" | "integrated" | "crisis";

export interface SchedulingRecommendation {
  visitType: VisitType;
  urgency: "same_day" | "within_week" | "routine" | "self_directed";
  rationale: string;
}
