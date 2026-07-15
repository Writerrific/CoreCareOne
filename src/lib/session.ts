// In-memory session store.
//
// PROTOTYPE ONLY. A production deployment would persist to a HIPAA-eligible
// datastore with encryption at rest, per-tenant isolation, audit logging, and
// a retention policy. The Session shape is deliberately serializable so that
// swap is a storage change, not a domain change.

import type { PatientContext, Session } from "./types";

// Pin the store to globalThis. In `next dev`, route handlers are compiled into
// separate bundles and a plain module-level `const store = new Map()` gets
// duplicated per route — so a session created in /api/session is invisible to
// /api/turn (404 "Session not found"). Anchoring to globalThis gives every
// route handler the same Map, and also survives hot-reload during development.
// (Prototype-only: still single-process, in-memory — swap for a DB in prod.)
const globalStore = globalThis as unknown as {
  __corecareSessions?: Map<string, Session>;
};
const store: Map<string, Session> =
  globalStore.__corecareSessions ?? (globalStore.__corecareSessions = new Map<string, Session>());

function id(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

export function createSession(context: PatientContext, patientId: string, visitNumber: number): Session {
  const now = Date.now();
  const session: Session = {
    id: id("ses"),
    patientId,
    visitNumber,
    createdAt: now,
    updatedAt: now,
    phase: "intake",
    context,
    pathway: [],
    plannedInstrumentIds: [],
    cursor: { instrumentIndex: 0, itemIndex: 0 },
    messages: [],
    answers: [],
    skipped: [],
    signals: [],
    results: [],
    overallTier: "minimal",
    safetyTriggered: false,
  };
  store.set(session.id, session);
  return session;
}

export function getSession(sessionId: string): Session | undefined {
  return store.get(sessionId);
}

export function saveSession(session: Session): Session {
  session.updatedAt = Date.now();
  store.set(session.id, session);
  return session;
}

export function newMessageId(): string {
  return id("msg");
}
