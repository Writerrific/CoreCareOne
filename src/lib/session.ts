// In-memory session store.
//
// PROTOTYPE ONLY. A production deployment would persist to a HIPAA-eligible
// datastore with encryption at rest, per-tenant isolation, audit logging, and
// a retention policy. The Session shape is deliberately serializable so that
// swap is a storage change, not a domain change.

import type { PatientContext, Session } from "./types";

const store = new Map<string, Session>();

function id(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

export function createSession(context: PatientContext): Session {
  const now = Date.now();
  const session: Session = {
    id: id("ses"),
    createdAt: now,
    updatedAt: now,
    phase: "intake",
    context,
    pathway: [],
    plannedInstrumentIds: [],
    cursor: { instrumentIndex: 0, itemIndex: 0 },
    messages: [],
    answers: [],
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
