"use client";

import { useState } from "react";
import type { Briefs } from "@/lib/types";
import { tierColor, tierLabel, urgencyLabel, visitTypeLabel } from "@/lib/present";
import { TrajectoryChart } from "./TrajectoryChart";

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-slate-200 bg-white p-5 ${className}`}>{children}</div>;
}

export function BriefView({ briefs, safetyTriggered }: { briefs: Briefs; safetyTriggered: boolean }) {
  const [showClinician, setShowClinician] = useState(false);
  const [booked, setBooked] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const { patientReflection, clinicianBrief, scheduling, trajectories, visitNumber } = briefs;
  const hasTrajectory = trajectories.some((t) => t.points.length >= 2);

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      {safetyTriggered && (
        <div className="rounded-2xl border border-red-300 bg-red-50 p-5">
          <h2 className="text-sm font-bold text-red-800">Please talk to someone now</h2>
          <p className="mt-2 text-sm leading-relaxed text-red-800">
            Reach a real person. In the U.S., call or text{" "}
            <a href="tel:988" className="font-bold underline">
              988
            </a>{" "}
            (Suicide &amp; Crisis Lifeline, 24/7), or call{" "}
            <a href="tel:911" className="font-bold underline">
              911
            </a>{" "}
            if you&apos;re in immediate danger. Core Care Clinic can also connect you with someone today.
          </p>
        </div>
      )}

      {/* Patient-facing reflection */}
      <Card>
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-core-700">Your reflection</h2>
          {visitNumber > 1 && (
            <span className="rounded-full bg-core-100 px-2.5 py-0.5 text-[11px] font-medium text-core-800">
              Check-in #{visitNumber}
            </span>
          )}
        </div>
        <p className="mt-3 whitespace-pre-line text-[15px] leading-relaxed text-slate-700">{patientReflection}</p>
      </Card>

      {/* Longitudinal trajectory — the "companion remembers" payoff */}
      {hasTrajectory && (
        <Card>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-core-700">Your journey across check-ins</h2>
          <p className="mt-1 text-sm text-slate-500">How each area has moved since your earlier check-ins.</p>
          <div className="mt-4">
            <TrajectoryChart trajectories={trajectories} />
          </div>
        </Card>
      )}

      {/* Scheduling recommendation */}
      <Card className="border-core-200 bg-core-50">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-core-700">Suggested next step</h2>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-white px-3 py-1 text-sm font-semibold text-core-800 shadow-sm">
            {visitTypeLabel(scheduling.visitType)}
          </span>
          <span className="rounded-full bg-white px-3 py-1 text-sm font-medium text-slate-600 shadow-sm">
            {urgencyLabel(scheduling.urgency)}
          </span>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-slate-600">{scheduling.rationale}</p>

        {booked ? (
          <div className="mt-4">
            <p className="text-sm font-medium text-core-800">Request sent ✓</p>
            <p className="mt-1 text-xs text-slate-500">
              Prototype: in production this would reach the clinic&apos;s scheduling system with your brief attached.
            </p>
          </div>
        ) : dismissed ? (
          <div className="mt-4">
            <p className="text-sm text-slate-600">
              No problem. Your summary is saved, and it&apos;ll be here whenever you&apos;re ready.{" "}
              <button onClick={() => setDismissed(false)} className="font-medium text-core-700 hover:underline">
                Actually, book it
              </button>
            </p>
          </div>
        ) : (
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              onClick={() => setBooked(true)}
              className="rounded-xl bg-core-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-core-700"
            >
              {scheduling.visitType === "crisis" ? "Connect me with someone now" : "Book this visit"}
            </button>
            <button
              onClick={() => setDismissed(true)}
              className="rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
            >
              Not right now
            </button>
          </div>
        )}
      </Card>

      {/* Clinician brief (the warm handoff) */}
      <Card>
        <button
          onClick={() => setShowClinician((v) => !v)}
          className="flex w-full items-center justify-between text-left"
        >
          <span>
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Clinician pre-visit brief
            </span>
            <span className="mt-1 block text-sm font-medium text-slate-800">{clinicianBrief.headline}</span>
          </span>
          <span className="text-xs text-core-700">{showClinician ? "Hide" : "Preview what your team sees"}</span>
        </button>

        {showClinician && (
          <div className="mt-4 space-y-4 border-t border-slate-100 pt-4">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Overall</span>
              <span
                className="rounded-full px-2.5 py-0.5 text-xs font-semibold text-white"
                style={{ background: tierColor(clinicianBrief.overallTier) }}
              >
                {tierLabel(clinicianBrief.overallTier)}
              </span>
            </div>

            <p className="text-sm leading-relaxed text-slate-700">{clinicianBrief.narrative}</p>

            {clinicianBrief.redFlags.length > 0 && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-red-700">Flags</div>
                <ul className="mt-1 list-disc pl-5 text-sm text-red-800">
                  {clinicianBrief.redFlags.map((f, i) => (
                    <li key={i}>{f}</li>
                  ))}
                </ul>
              </div>
            )}

            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Instruments administered</div>
              <table className="mt-2 w-full text-sm">
                <tbody>
                  {clinicianBrief.results.map((r) => (
                    <tr key={r.instrumentId} className="border-b border-slate-100 last:border-0">
                      <td className="py-1.5 pr-2 font-medium text-slate-700">{r.shortName}</td>
                      <td className="py-1.5 pr-2 tabular-nums text-slate-500">
                        {r.score}/{r.maxScore}
                      </td>
                      <td className="py-1.5 text-slate-600">
                        {r.band.label}
                        {r.skipped > 0 && (
                          <span className="ml-1 text-amber-600">· {r.skipped} skipped</span>
                        )}
                      </td>
                      <td className="py-1.5 pl-2 text-right">
                        <span
                          className="inline-block h-2 w-2 rounded-full"
                          style={{ background: tierColor(r.band.tier) }}
                          title={tierLabel(r.band.tier)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {clinicianBrief.suggestedFocus.length > 0 && (
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Suggested focus</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {clinicianBrief.suggestedFocus.map((f, i) => (
                    <span key={i} className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">
                      {f}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {clinicianBrief.trajectoryNotes.length > 0 && (
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Trend across visits</div>
                <ul className="mt-1 space-y-0.5 text-sm text-slate-700">
                  {clinicianBrief.trajectoryNotes.map((n, i) => (
                    <li key={i} className="tabular-nums">
                      {n}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <p className="text-[11px] text-slate-400">
              Screening summary generated by CoreCareOne · scores computed deterministically from validated instruments ·
              not a diagnosis.
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}
