# CoreCareOne — the Pre-Visit Companion

> Walk in already understood.

CoreCareOne is an **agentic pre-visit companion** for [Core Care Clinic](https://www.corecareclinic.org/)
(and any clinic like it). A patient describes what's going on **in their life** — not a checklist
of symptoms — and the companion composes a **screening pathway** from a library of **validated
instruments**, administers it as a warm conversation, shows the patient a **transparent, traceable
ledger** of what it's noticing, and produces two artifacts:

1. **A patient reflection** — plain-language, empowering, explicitly *not* a diagnosis.
2. **A clinician pre-visit brief** — a warm handoff with instrument scores, **risk tiers (not
   binary)**, red flags, and a suggested focus — so the visit starts where the patient left off.

It ends by helping the patient decide **whether and what kind of** appointment to book — primary
care, behavioral health, or (for Core Care's integrated model) a combined visit.

---

## Why this is different

Most "AI health" tools are either **static forms** (fill out the PHQ-9) or **free-form chatbots**
that drift into pretend clinical judgment. CoreCareOne is neither.

| | Static form | AI chatbot | **CoreCareOne** |
|---|---|---|---|
| Entry point | Pick symptoms | Free chat | **Describe your situation** → pathway composed for you |
| Clinical claims | Fixed | Hallucination-prone | **Deterministic** — every score from a validated instrument |
| Transparency | A number at the end | Black box | **Live Care-Signal Ledger**, each signal traceable to an item |
| Risk | Binary cutoff | Vibes | **Stratified tiers** + hard safety escalation |
| Output | A score | A chat log | **Patient reflection + clinician brief + scheduling** |
| Over time | One-off | Forgetful | **Longitudinal** trajectory (roadmap) |

### The core design principle

**The AI never invents clinical judgment.** The clinical layer — instruments, scoring, cutoff
bands, risk tiers, safety routing — is **deterministic and auditable** (see `src/lib/`). The LLM is
used for exactly three natural-language jobs, none of which can change a score:

1. Map a free-text situation → screening **domains** (`understandSituation`)
2. Phrase a validated item warmly for *this* person (`warmItemPhrasing`)
3. Write the two brief **narratives** from already-computed results (`writeBriefs`)

That separation is what makes it defensible enough to sit in a real clinic's workflow.

---

## Novel mechanics

- **Situation-first, multi-signal intake.** "I'm a college runner, my times are slipping, I feel
  flat, and I've been drinking more" → the companion scores *every* domain from templates **and**
  direct symptom keywords and unions what's relevant (energy + mood + alcohol) — it doesn't flatten
  a person into one category.
- **Adaptive pathway composition** with **pre-screen skips** (PHQ-2 gates PHQ-9; GAD-2 gates GAD-7)
  so nobody answers questions that don't apply — **plus in-conversation expansion**: a completed
  screener that signals a related concern weaves in the right follow-up mid-session.
- **Longitudinal memory.** Use the same name across visits and the companion greets you back, carries
  forward areas that were elevated last time, and charts each instrument's **trajectory** across
  check-ins (PHQ-9 24 → 8 → …). The trend — not any single score — is the clinical payoff.
- **Care-Signal Ledger** — a transparent, real-time panel where every signal cites its source
  (`GAD-7 · item 3`). Trust for the patient, an audit trail for the clinician.
- **Stratified risk** across five tiers (`minimal → low → moderate → high → urgent`), never a
  binary "positive/negative."
- **Hard safety rails.** Any endorsed safety item (e.g. PHQ-9 item 9) instantly halts screening,
  surfaces **988 / 911**, and routes to a human. The tool never attempts counseling.
- **Warm handoff + smart scheduling.** Recommends primary care, behavioral, integrated, or crisis,
  with an urgency, from the computed results.

---

## Architecture

```
src/
  lib/
    types.ts         # domain model (clinical layer is fully typed)
    instruments.ts   # validated instrument library + scoring bands  ← auditable core
    situations.ts    # situation → domain templates + pathway composer
    risk.ts          # scoring, stratification, red-flag detection    ← no LLM
    engine.ts        # the orchestrator state machine (intake→screening→safety→summary)
    anthropic.ts     # LLM adapter for the 3 language jobs + deterministic offline fallback
    session.ts       # in-memory session store (swap for a DB in prod)
    present.ts       # client-safe presentation helpers
  app/
    page.tsx         # landing
    companion/       # the companion experience (chat + ledger + briefs)
    api/             # session / turn / brief route handlers
  components/        # Chat, SignalLedger, TierMeter, BriefView, IntakeForm
```

**Runs with or without an API key.** With no `ANTHROPIC_API_KEY`, a deterministic offline engine
handles all three language jobs via rules — the whole product works end to end (and keeps PHI off
third parties during development). Add a key to turn on the LLM layer.

### Instrument library (this prototype)

PHQ-9 (+PHQ-2 gate), GAD-7 (+GAD-2 gate), AUDIT-C, PSS-4, a brief sleep screen (ISI-modeled),
PC-PTSD-5, an energy/recovery routing screen (non-diagnostic, honestly labeled), and a brief safety
check (ASQ-modeled). Each is modeled on a well-established, freely usable clinical screener with its
published scoring bands. **Screening ≠ diagnosis.**

---

## Run it

```bash
npm install
cp .env.example .env      # optional: add ANTHROPIC_API_KEY to enable the LLM layer
npm run dev               # http://localhost:3000
```

Force the offline engine even with a key: `CORECARE_ENGINE=mock npm run dev`.

Type-check and build:

```bash
npm run typecheck
npm run build
```

---

## Safety & compliance notes

- **Not a medical device, not a diagnosis, not for emergencies.** Copy throughout reinforces this.
- **Crisis routing** is first-class: endorsing a safety item stops the flow and surfaces 988/911.
- **PHI:** the prototype stores sessions in memory. A production deployment needs a HIPAA-eligible
  datastore (encryption at rest, per-tenant isolation, audit logging, retention policy), a BAA with
  any LLM provider, and consent capture. The `Session` type is serializable so storage is a swap,
  not a rewrite.
- **Dependencies:** pinned to the latest patched Next 14.2.x. A production build should plan the
  Next 16 upgrade to clear the remaining framework advisories.

---

## Roadmap

- ✅ **Longitudinal continuity** — sessions persist per patient (in-memory + JSON file), the pathway
  carries forward prior concerns, and each instrument's trajectory is charted across check-ins.
  *(Prototype identity = the name entered; production needs real patient auth + a HIPAA datastore.)*
- ✅ **Adaptive composition** — multi-signal intake + mid-session pathway expansion (above).
- **EHR / scheduling handoff** — push the clinician brief + booking into the clinic's system.
- **Multi-tenant config** — instrument library + situation templates as per-clinic configuration.
- **Clinician review console** — a queue of incoming briefs, triaged by tier.
- **Instrument governance** — versioning + clinical sign-off on every screener and cutoff.

---

*Prototype. Core Care Clinic is the first configured tenant; the architecture is clinic-agnostic.*
