import { NextResponse } from "next/server";
import { submitAnswer } from "@/lib/engine";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { sessionId, value, label } = body ?? {};
    if (typeof sessionId !== "string" || typeof value !== "number" || typeof label !== "string") {
      return NextResponse.json({ error: "sessionId, value, label required" }, { status: 400 });
    }
    const session = getSession(sessionId);
    if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });

    const updated = await submitAnswer(session, value, label);
    return NextResponse.json({ session: updated });
  } catch (err) {
    console.error("turn failed", err);
    return NextResponse.json({ error: "Could not process answer" }, { status: 500 });
  }
}
