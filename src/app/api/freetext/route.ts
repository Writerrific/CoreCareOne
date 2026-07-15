import { NextResponse } from "next/server";
import { submitFreeText } from "@/lib/engine";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { sessionId, text } = body ?? {};
    if (typeof sessionId !== "string" || typeof text !== "string") {
      return NextResponse.json({ error: "sessionId and text required" }, { status: 400 });
    }
    const session = getSession(sessionId);
    if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });

    const updated = await submitFreeText(session, text);
    return NextResponse.json({ session: updated });
  } catch (err) {
    console.error("freetext failed", err);
    return NextResponse.json({ error: "Could not process your note" }, { status: 500 });
  }
}
