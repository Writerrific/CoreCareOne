import { NextResponse } from "next/server";
import { computeTrajectories, listPatients } from "@/lib/patients";
import { tierRank } from "@/lib/risk";
import type { PatientRecord, RiskTier, Trajectory } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface QueueEntry {
  patient: PatientRecord;
  latestTier: RiskTier;
  latestAt: number;
  safetyEver: boolean;
  trajectories: Trajectory[];
}

// PROTOTYPE: no auth. A production console sits behind clinician login with
// role-based access and an audit log of every record view.
export async function GET() {
  try {
    const entries: QueueEntry[] = listPatients().map((patient) => {
      const latest = patient.sessions[patient.sessions.length - 1];
      return {
        patient,
        latestTier: latest.overallTier,
        latestAt: latest.at,
        safetyEver: patient.sessions.some((s) => s.safetyTriggered),
        trajectories: computeTrajectories(patient.patientId),
      };
    });

    // Triage order: highest current tier first, safety histories float, then recency.
    entries.sort(
      (a, b) =>
        Number(b.safetyEver) - Number(a.safetyEver) ||
        tierRank(b.latestTier) - tierRank(a.latestTier) ||
        b.latestAt - a.latestAt,
    );

    const counts: Record<RiskTier, number> = { minimal: 0, low: 0, moderate: 0, high: 0, urgent: 0 };
    for (const e of entries) counts[e.latestTier]++;

    return NextResponse.json({ entries, counts });
  } catch (err) {
    console.error("clinic queue failed", err);
    return NextResponse.json({ error: "Could not load queue" }, { status: 500 });
  }
}
