"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { PatientRecord, RiskTier, SessionSummary, Trajectory } from "@/lib/types";
import { tierColor, tierLabel, timeAgo } from "@/lib/present";
import { TrajectoryChart } from "@/components/TrajectoryChart";

interface QueueEntry {
  patient: PatientRecord;
  latestTier: RiskTier;
  latestAt: number;
  safetyEver: boolean;
  trajectories: Trajectory[];
}

const TIERS: RiskTier[] = ["urgent", "high", "moderate", "low", "minimal"];

function TierBadge({ tier }: { tier: RiskTier }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold text-white"
      style={{ background: tierColor(tier) }}
    >
      {tierLabel(tier)}
    </span>
  );
}

function SessionRow({ s, index }: { s: SessionSummary; index: number }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-semibold text-slate-700">
          Check-in #{index + 1} · {new Date(s.at).toLocaleDateString()} ({timeAgo(s.at)})
        </span>
        <TierBadge tier={s.overallTier} />
      </div>
      <p className="mt-1.5 text-sm italic leading-snug text-slate-600">&ldquo;{s.situationText}&rdquo;</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {s.results.map((r) => (
          <span key={r.instrumentId} className="rounded-md bg-white px-2 py-0.5 text-[11px] tabular-nums text-slate-600 ring-1 ring-slate-200">
            {r.shortName} {r.score}/{r.maxScore}
            <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full align-middle" style={{ background: tierColor(r.tier) }} />
          </span>
        ))}
        {s.results.length === 0 &&
          (s.safetyTriggered ? (
            <span className="text-[11px] font-medium text-red-700">Screening paused · routed to crisis resources (988)</span>
          ) : (
            <span className="text-[11px] text-amber-600">All screeners skipped</span>
          ))}
      </div>
      {(s.redFlags ?? []).length > 0 && (
        <ul className="mt-2 space-y-0.5">
          {(s.redFlags ?? []).map((f, i) => (
            <li key={i} className="text-xs font-medium text-red-700">
              ⚑ {f}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function ClinicPage() {
  const [entries, setEntries] = useState<QueueEntry[] | null>(null);
  const [counts, setCounts] = useState<Record<RiskTier, number> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tierFilter, setTierFilter] = useState<RiskTier | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/clinic")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(({ entries, counts }) => {
        setEntries(entries);
        setCounts(counts);
      })
      .catch(() => setError("Couldn't load the queue. Is the server running?"));
  }, []);

  const visible = useMemo(
    () => (entries ?? []).filter((e) => !tierFilter || e.latestTier === tierFilter),
    [entries, tierFilter],
  );
  const selected = useMemo(
    () => visible.find((e) => e.patient.patientId === selectedId) ?? visible[0] ?? null,
    [visible, selectedId],
  );

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Staff chrome is deliberately darker than the patient-facing app. */}
      <header className="border-b border-slate-700 bg-slate-900">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex h-8 w-8 items-center justify-center rounded-lg bg-core-600 text-sm font-bold text-white">
              C1
            </Link>
            <div>
              <span className="text-sm font-semibold text-white">Care Team Console</span>
              <span className="ml-2 rounded bg-slate-700 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-300">
                Staff view
              </span>
            </div>
          </div>
          <span className="hidden text-xs text-slate-400 md:block">
            Prototype · no auth yet · production requires clinician login + audit log
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-6">
        {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>}

        {!error && entries === null && <p className="py-16 text-center text-sm text-slate-500">Loading queue…</p>}

        {entries !== null && entries.length === 0 && (
          <div className="py-20 text-center">
            <p className="text-sm font-medium text-slate-600">No completed check-ins yet.</p>
            <p className="mt-1 text-sm text-slate-400">
              Patient check-ins land here as they finish. (Anonymous check-ins are not retained.)
            </p>
          </div>
        )}

        {entries !== null && entries.length > 0 && (
          <>
            {/* Triage stat tiles — click to filter */}
            <div className="grid grid-cols-5 gap-2">
              {TIERS.map((t) => (
                <button
                  key={t}
                  title={tierLabel(t)}
                  onClick={() => setTierFilter(tierFilter === t ? null : t)}
                  className={`rounded-xl border bg-white p-3 text-left transition ${
                    tierFilter === t ? "border-slate-700 ring-2 ring-slate-300" : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: tierColor(t) }} />
                    <span className="hidden truncate text-[11px] font-medium uppercase tracking-wide text-slate-500 sm:inline">
                      {tierLabel(t)}
                    </span>
                  </div>
                  <div className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{counts?.[t] ?? 0}</div>
                </button>
              ))}
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-[340px_1fr]">
              {/* Queue */}
              <div className="space-y-2">
                {visible.length === 0 && (
                  <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
                    No patients at this tier.
                  </p>
                )}
                {visible.map((e) => (
                  <button
                    key={e.patient.patientId}
                    onClick={() => setSelectedId(e.patient.patientId)}
                    className={`w-full rounded-xl border bg-white p-3.5 text-left transition ${
                      selected?.patient.patientId === e.patient.patientId
                        ? "border-core-500 ring-2 ring-core-100"
                        : "border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-slate-800">
                        {e.patient.displayName ?? e.patient.patientId}
                        {e.safetyEver && (
                          <span className="ml-1.5 align-middle text-xs font-bold text-red-600" title="Safety concern in history">
                            ⚑
                          </span>
                        )}
                      </span>
                      <TierBadge tier={e.latestTier} />
                    </div>
                    <p className="mt-1 line-clamp-1 text-xs italic text-slate-500">
                      &ldquo;{e.patient.sessions[e.patient.sessions.length - 1].situationText}&rdquo;
                    </p>
                    <p className="mt-1 text-[11px] text-slate-400">
                      {e.patient.sessions.length} check-in{e.patient.sessions.length > 1 ? "s" : ""} · latest {timeAgo(e.latestAt)}
                    </p>
                  </button>
                ))}
              </div>

              {/* Detail */}
              {selected ? (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-slate-200 bg-white p-5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h2 className="text-lg font-bold text-slate-900">{selected.patient.displayName ?? selected.patient.patientId}</h2>
                      <TierBadge tier={selected.latestTier} />
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {selected.patient.sessions.length} completed check-in{selected.patient.sessions.length > 1 ? "s" : ""} · first{" "}
                      {timeAgo(selected.patient.sessions[0].at)} · latest {timeAgo(selected.latestAt)}
                    </p>
                    {selected.safetyEver && (
                      <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-800">
                        ⚑ Safety concern raised in at least one check-in. Review before the visit.
                      </div>
                    )}
                  </div>

                  {selected.trajectories.some((t) => t.points.length >= 2) && (
                    <div className="rounded-2xl border border-slate-200 bg-white p-5">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Trend across check-ins</h3>
                      <div className="mt-3">
                        <TrajectoryChart trajectories={selected.trajectories} />
                      </div>
                    </div>
                  )}

                  <div className="rounded-2xl border border-slate-200 bg-white p-5">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Check-in history (newest first)</h3>
                    <div className="mt-3 space-y-3">
                      {selected.patient.sessions
                        .map((s, i) => ({ s, i }))
                        .reverse()
                        .map(({ s, i }) => (
                          <SessionRow key={s.sessionId} s={s} index={i} />
                        ))}
                    </div>
                    <p className="mt-4 text-[11px] text-slate-400">
                      Scores computed deterministically from validated screeners · screening ≠ diagnosis · verify with the patient.
                    </p>
                  </div>
                </div>
              ) : (
                <p className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
                  Select a patient to review.
                </p>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
