import Link from "next/link";

function Feature({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-sm font-semibold text-core-800">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">{body}</p>
    </div>
  );
}

export default function Home() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-14">
      <header className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-core-600 text-lg font-bold text-white">
          C1
        </div>
        <div>
          <div className="text-lg font-semibold text-slate-900">CoreCareOne</div>
          <div className="text-xs text-slate-500">Pre-Visit Companion · for Core Care Clinic</div>
        </div>
      </header>

      <section className="mt-14">
        <p className="inline-flex rounded-full bg-core-100 px-3 py-1 text-xs font-medium text-core-800">
          Situation-first · validated instruments · never a diagnosis
        </p>
        <h1 className="mt-5 max-w-3xl text-4xl font-bold leading-tight tracking-tight text-slate-900 sm:text-5xl">
          Walk in already understood.
        </h1>
        <p className="mt-5 max-w-2xl text-lg leading-relaxed text-slate-600">
          Tell CoreCareOne what&apos;s going on in your life, not a checklist of symptoms. It asks the{" "}
          <span className="font-medium text-slate-800">right validated questions</span> for your situation, shows you
          what it&apos;s picking up, and hands your care team a clear brief so your visit starts where you left off.
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-4">
          <Link
            href="/companion"
            className="rounded-xl bg-core-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-core-700"
          >
            Start a check-in
          </Link>
          <span className="text-sm text-slate-500">Takes ~3–5 minutes · you can skip anything</span>
        </div>
      </section>

      <section className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Feature
          title="Situation-first, not symptom-first"
          body="Describe your life ('I'm an athlete and my times are slipping and I feel flat') and the companion builds a screening pathway from the areas that matter for you."
        />
        <Feature
          title="Built on validated instruments"
          body="Every question comes from an established screener (PHQ-9, GAD-7, AUDIT-C, and more) with published scoring. The AI handles the wording; it never invents a score or a diagnosis."
        />
        <Feature
          title="A transparent signal ledger"
          body="As you talk, you can see what the companion is picking up and why. Each signal traces back to a specific question, so nothing is a black box."
        />
        <Feature
          title="Risk is stratified, not binary"
          body="Results land on a spectrum, from minimal to needs-prompt-attention, so the nuance survives. It's a starting point for a conversation, not a verdict."
        />
        <Feature
          title="Safety first"
          body="If something you share suggests you're at risk, the companion stops screening and points you to real people and the 988 Lifeline right away. It doesn't try to be your therapist."
        />
        <Feature
          title="A clear handoff to your team"
          body="You leave with a plain-language summary; your clinician gets a short pre-visit brief. For Core Care's integrated model, it suggests a medical, behavioral, or combined visit."
        />
      </section>

      <section className="mt-16 rounded-2xl border border-amber-200 bg-amber-50 p-5">
        <h2 className="text-sm font-semibold text-amber-900">Important</h2>
        <p className="mt-2 text-sm leading-relaxed text-amber-800">
          CoreCareOne is a preparation and screening companion. It is not a doctor, therapist, or diagnosis, and not for
          emergencies. If you&apos;re in crisis or thinking about harming yourself, call or text{" "}
          <span className="font-semibold">988</span> (U.S. Suicide &amp; Crisis Lifeline) or call{" "}
          <span className="font-semibold">911</span> right now.
        </p>
      </section>

      <footer className="mt-14 text-xs text-slate-400">
        Prototype · clinic-agnostic architecture · Core Care Clinic is the first configured tenant.
      </footer>
    </main>
  );
}
