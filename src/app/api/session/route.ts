import { NextResponse } from "next/server";
import { startSession } from "@/lib/engine";
import type { PatientContext } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const context: PatientContext = {
      displayName: typeof body.displayName === "string" ? body.displayName.slice(0, 60) : undefined,
      ageBand: typeof body.ageBand === "string" ? body.ageBand : undefined,
      situationText: typeof body.situationText === "string" ? body.situationText.slice(0, 2000) : undefined,
      tags: Array.isArray(body.tags) ? body.tags.filter((t: unknown) => typeof t === "string").slice(0, 12) : [],
    };
    const session = await startSession(context);
    return NextResponse.json({ session });
  } catch (err) {
    console.error("session start failed", err);
    return NextResponse.json({ error: "Could not start session" }, { status: 500 });
  }
}
