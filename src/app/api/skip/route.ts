import { NextResponse } from "next/server";
import { skipItem } from "@/lib/engine";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { sessionId } = body ?? {};
    if (typeof sessionId !== "string") {
      return NextResponse.json({ error: "sessionId required" }, { status: 400 });
    }
    const session = getSession(sessionId);
    if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });

    const updated = await skipItem(session);
    return NextResponse.json({ session: updated });
  } catch (err) {
    console.error("skip failed", err);
    return NextResponse.json({ error: "Could not skip" }, { status: 500 });
  }
}
