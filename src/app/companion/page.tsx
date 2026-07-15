"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Briefs, ItemChoice, Session } from "@/lib/types";
import { Chat } from "@/components/Chat";
import { SignalLedger } from "@/components/SignalLedger";
import { BriefView } from "@/components/BriefView";
import { IntakeForm, type IntakePayload } from "@/components/IntakeForm";

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function postJSON<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new HttpError(res.status, `${url} failed: ${res.status}`);
  return res.json();
}

export default function CompanionPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [briefs, setBriefs] = useState<Briefs | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadingBriefs, setLoadingBriefs] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(async (payload: IntakePayload) => {
    setBusy(true);
    setError(null);
    try {
      const { session } = await postJSON<{ session: Session }>("/api/session", payload);
      setSession(session);
    } catch {
      setError("Something went wrong starting your check-in. Please try again.");
    } finally {
      setBusy(false);
    }
  }, []);

  // Shared path for answer / skip / free-text: optimistic patient bubble, POST,
  // roll back on failure, and drop to intake if the session has expired.
  const sendTurn = useCallback(
    async (url: string, extra: Record<string, unknown>, optimisticText: string, failMsg: string) => {
      if (!session) return;
      setBusy(true);
      setError(null);
      const optimisticId = `local_${Date.now()}`;
      setSession((prev) =>
        prev
          ? { ...prev, messages: [...prev.messages, { id: optimisticId, speaker: "patient", text: optimisticText, at: Date.now() }] }
          : prev,
      );
      try {
        const { session: updated } = await postJSON<{ session: Session }>(url, { sessionId: session.id, ...extra });
        setSession(updated);
      } catch (e) {
        setSession((prev) =>
          prev ? { ...prev, messages: prev.messages.filter((m) => m.id !== optimisticId) } : prev,
        );
        if (e instanceof HttpError && e.status === 404) {
          setSession(null);
          setBriefs(null);
          setError("That check-in timed out, so we'll start fresh. Nothing you shared was stored.");
        } else {
          setError(failMsg);
        }
      } finally {
        setBusy(false);
      }
    },
    [session],
  );

  const answer = useCallback(
    (value: number, label: string) => sendTurn("/api/turn", { value, label }, label, "Something went wrong saving that answer. Please try again."),
    [sendTurn],
  );
  const skip = useCallback(
    () => sendTurn("/api/skip", {}, "Skipped", "Something went wrong skipping. Please try again."),
    [sendTurn],
  );
  const freeText = useCallback(
    (text: string) => sendTurn("/api/freetext", { text }, text, "Something went wrong sending that. Please try again."),
    [sendTurn],
  );

  // Auto-generate briefs when the conversation reaches summary or safety.
  useEffect(() => {
    if (!session || briefs || loadingBriefs) return;
    if (session.phase !== "summary" && session.phase !== "safety") return;
    setLoadingBriefs(true);
    postJSON<{ briefs: Briefs }>("/api/brief", { sessionId: session.id })
      .then(({ briefs }) => setBriefs(briefs))
      .catch(() => setError("I couldn't build your summary. Please try again."))
      .finally(() => setLoadingBriefs(false));
  }, [session, briefs, loadingBriefs]);

  const pendingChoices: ItemChoice[] | null = useMemo(() => {
    if (!session || session.phase !== "screening") return null;
    for (let i = session.messages.length - 1; i >= 0; i--) {
      const m = session.messages[i];
      if (m.choices && m.choices.length) return m.choices;
    }
    return null;
  }, [session]);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-core-600 text-sm font-bold text-white">
              C1
            </div>
            <span className="text-sm font-semibold text-slate-800">CoreCareOne</span>
          </Link>
          <span className="text-xs text-slate-400">Pre-Visit Companion · not for emergencies · call 988/911</span>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        {error && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>
        )}

        {!session && <IntakeForm onStart={start} busy={busy} />}

        {session && briefs && (
          <div>
            <div className="mb-6 text-center">
              <h1 className="text-2xl font-bold text-slate-900">Here&apos;s your summary</h1>
              <p className="mt-1 text-sm text-slate-500">Yours to keep, and ready for your Core Care team.</p>
            </div>
            <BriefView briefs={briefs} safetyTriggered={session.safetyTriggered} />
            <div className="mt-8 text-center">
              <button
                onClick={() => {
                  setSession(null);
                  setBriefs(null);
                }}
                className="text-sm font-medium text-core-700 hover:underline"
              >
                Start another check-in
              </button>
            </div>
          </div>
        )}

        {session && !briefs && (
          <div className="grid gap-4 lg:grid-cols-[1fr_340px] lg:gap-6">
            <div className="flex h-[68vh] min-h-[420px] flex-col rounded-2xl border border-slate-200 bg-white lg:h-[calc(100vh-150px)]">
              <Chat
                messages={session.messages}
                pendingChoices={pendingChoices}
                onAnswer={answer}
                onSkip={skip}
                onFreeText={freeText}
                busy={busy || loadingBriefs}
              />
            </div>
            <div className="h-[46vh] min-h-[300px] lg:h-[calc(100vh-150px)]">
              <SignalLedger signals={session.signals} overallTier={session.overallTier} />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
