// Longitudinal patient store — the layer that turns one-off screening into a
// companion with a memory.
//
// PROTOTYPE storage: an in-memory Map (pinned to globalThis so it survives
// `next dev`'s per-route bundling and hot-reload) plus a best-effort JSON file
// so trajectories persist across server restarts and can be demoed "over weeks."
// Production would use a HIPAA-eligible datastore with encryption, per-tenant
// isolation, audit logging, retention, and real patient identity/auth — the
// types here are serializable so that swap is storage-only.

import fs from "node:fs";
import path from "node:path";
import type {
  Domain,
  InstrumentResult,
  PatientRecord,
  RiskTier,
  SessionSummary,
  Trajectory,
  TrajectoryDirection,
} from "./types";

const DATA_DIR = path.join(process.cwd(), ".data");
const DATA_FILE = path.join(DATA_DIR, "patients.json");

const g = globalThis as unknown as {
  __corecarePatients?: Map<string, PatientRecord>;
  __corecarePatientsLoaded?: boolean;
};

function store(): Map<string, PatientRecord> {
  if (!g.__corecarePatients) g.__corecarePatients = new Map();
  if (!g.__corecarePatientsLoaded) {
    g.__corecarePatientsLoaded = true;
    loadFromDisk(g.__corecarePatients);
  }
  return g.__corecarePatients;
}

function loadFromDisk(map: Map<string, PatientRecord>) {
  try {
    if (!fs.existsSync(DATA_FILE)) return;
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    const records = JSON.parse(raw) as PatientRecord[];
    for (const r of records) map.set(r.patientId, r);
  } catch {
    // Corrupt/unreadable file is non-fatal for a prototype — start fresh.
  }
}

function saveToDisk(map: Map<string, PatientRecord>) {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(Array.from(map.values()), null, 2), "utf8");
  } catch {
    // Persistence is best-effort; in-memory state still works this session.
  }
}

/** Stable-ish patient key from a display name. Returns null for anonymous (no continuity). */
export function patientIdFromName(name?: string): string | null {
  if (!name) return null;
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return slug ? `pt_${slug}` : null;
}

export function getPatient(patientId: string): PatientRecord | undefined {
  return store().get(patientId);
}

/** How many completed check-ins this patient already has (0 for new). */
export function priorVisitCount(patientId: string): number {
  return store().get(patientId)?.sessions.length ?? 0;
}

/** Append a completed session summary and persist. */
export function recordSession(patientId: string, displayName: string | undefined, summary: SessionSummary): void {
  const map = store();
  const now = Date.now();
  const existing = map.get(patientId);
  if (existing) {
    // Idempotency: don't double-record the same session.
    if (!existing.sessions.some((s) => s.sessionId === summary.sessionId)) {
      existing.sessions.push(summary);
    }
    existing.updatedAt = now;
    if (displayName) existing.displayName = displayName;
  } else {
    map.set(patientId, {
      patientId,
      displayName,
      createdAt: now,
      updatedAt: now,
      sessions: [summary],
    });
  }
  saveToDisk(map);
}

/** Build a compact SessionSummary from computed results. */
export function summarize(
  sessionId: string,
  situationText: string,
  overallTier: RiskTier,
  safetyTriggered: boolean,
  results: InstrumentResult[],
): SessionSummary {
  return {
    sessionId,
    at: Date.now(),
    situationText,
    overallTier,
    safetyTriggered,
    // Only instruments the patient actually answered belong in the trajectory —
    // a fully-skipped instrument is "not assessed", not a real score of 0.
    results: results
      .filter((r) => r.answered > 0)
      .map((r) => ({
        instrumentId: r.instrumentId,
        shortName: r.shortName,
        domain: r.domain,
        score: r.score,
        maxScore: r.maxScore,
        bandLabel: r.band.label,
        tier: r.band.tier,
      })),
  };
}

function directionOf(points: { score: number; maxScore: number }[]): TrajectoryDirection {
  if (points.length < 2) return "single";
  const first = points[0];
  const last = points[points.length - 1];
  const frac = (last.score - first.score) / (last.maxScore || 1);
  // Higher score = more symptoms for every instrument here, so a drop is improvement.
  if (frac <= -0.1) return "improving";
  if (frac >= 0.1) return "worsening";
  return "steady";
}

/**
 * Per-instrument score history across all of a patient's summaries, in order.
 * Pass `include` to fold in the just-finished (not-yet-persisted) session.
 */
export function computeTrajectories(patientId: string, include?: SessionSummary): Trajectory[] {
  const record = store().get(patientId);
  const summaries = [...(record?.sessions ?? [])];
  if (include && !summaries.some((s) => s.sessionId === include.sessionId)) summaries.push(include);
  summaries.sort((a, b) => a.at - b.at);

  const byInstrument = new Map<string, Trajectory>();
  for (const s of summaries) {
    for (const r of s.results) {
      let traj = byInstrument.get(r.instrumentId);
      if (!traj) {
        traj = {
          instrumentId: r.instrumentId,
          shortName: r.shortName,
          domain: r.domain as Domain,
          points: [],
          direction: "single",
          delta: 0,
        };
        byInstrument.set(r.instrumentId, traj);
      }
      traj.points.push({ at: s.at, score: r.score, maxScore: r.maxScore, tier: r.tier, bandLabel: r.bandLabel });
    }
  }

  const out: Trajectory[] = [];
  for (const traj of byInstrument.values()) {
    traj.points.sort((a, b) => a.at - b.at);
    traj.direction = directionOf(traj.points);
    traj.delta = traj.points.length >= 2 ? traj.points[traj.points.length - 1].score - traj.points[0].score : 0;
    out.push(traj);
  }
  // Most-changed / most-tracked first.
  out.sort((a, b) => b.points.length - a.points.length || Math.abs(b.delta) - Math.abs(a.delta));
  return out;
}
