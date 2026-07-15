# CoreCareOne — Concept & Rationale

This document captures the *why* behind CoreCareOne, so the product intent survives beyond the
first prototype.

## The problem

Core Care Clinic runs an **integrated primary-care + behavioral-health** model — Internal Medicine,
Family Medicine, and Psychiatry under one roof. Integrated / collaborative-care models are powerful
precisely because they move information *between* the medical side, the behavioral side, and the
patient. But that information transfer is exactly where things break down:

- The first 5–10 minutes of every appointment are spent reconstructing context.
- Patients under-report — especially on mood, alcohol, and safety — when asked cold, in a rushed room.
- Screening today is a **static form** the patient fills once and forgets, or a **free-form chatbot**
  that improvises clinical judgment it isn't qualified to give.
- Nothing tracks the **arc** — a patient is a fresh blank slate at every visit.

## The insight

Don't automate the clinician. **Prepare the encounter.** The highest-leverage, lowest-risk place
for AI in this workflow is the **pre-visit** window: turn the messy, human "how have you been" into
a structured, validated, risk-stratified brief that both the patient and the care team can trust.

## Three things that make it novel

### 1. Situation-first, not symptom-first
People don't experience life as a symptom checklist. They experience it as a situation: *"I'm an
athlete and my performance is slipping,"* *"I just had a baby,"* *"something happened and it won't
leave me alone."* CoreCareOne starts there and **composes** the right screening pathway from those
situations — pulling only the validated instruments that matter. The athlete gets energy + sleep +
stress + mood; the new parent gets a perinatal-shaped pathway. Same engine, different composition.

### 2. Deterministic clinical core, LLM only for language
This is the load-bearing design decision. If the AI can invent a score, the tool is undeployable in
healthcare. So it can't. Instruments, scoring, cutoff bands, tiers, and safety routing are ordinary,
testable, auditable code. The LLM does the three things it's genuinely good at and nothing else:
understand a free-text situation, phrase a validated item warmly, and narrate already-computed
results. Every clinical claim traces to an instrument item and a recorded answer.

### 3. Transparency as a feature (the Care-Signal Ledger)
Black-box health AI erodes trust in both directions — patients don't know what it "thinks," and
clinicians can't audit it. CoreCareOne shows a **live ledger**: each signal, its tier, and its
source, as it happens. For the patient it's reassurance ("it's listening, and here's what it heard").
For the clinician it's a defensible audit trail. Same artifact, two audiences.

## Guardrails that are non-negotiable

- **Stratified, never binary.** Risk lands on a five-tier spectrum. A moderate is not a crisis and a
  minimal is not "you're fine, go away." Nuance is the point.
- **Screening is not diagnosis, and the tool says so — repeatedly.**
- **Safety is a hard interrupt.** Endorse a safety item and screening stops immediately; the tool
  surfaces 988/911 and routes to a human. It never tries to be a therapist.
- **Always toward care.** Every path ends by making the *next human appointment* easier to choose
  and easier to book — the AI is a companion to the clinic relationship, not a substitute for it.

## Why it generalizes

Core Care is the first tenant, but nothing here is Core-Care-specific except the configuration. The
instrument library and situation templates are data. A pediatric clinic swaps in age-appropriate
screeners; an oncology practice swaps in distress thermometers and symptom inventories. The engine,
the ledger, the safety rails, and the warm-handoff brief are the reusable platform.

## The longer game: from "form" to "companion"

A form is a snapshot. A companion has a memory. The roadmap's most important item is **longitudinal
continuity**: persist each patient's sessions and chart their instrument trajectories over time. The
clinician doesn't just see "PHQ-9 = 12 today" — they see "PHQ-9 has climbed 4 → 8 → 12 over three
check-ins." That trend is often more clinically meaningful than any single score, and it's something
no intake form and no one-off chatbot can give you. That is the real meaning of *companion*.
