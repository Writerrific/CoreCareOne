// Validated screening instrument library.
//
// These are modeled on well-established, freely usable clinical screeners.
// Scoring cutoffs follow the published bands for each instrument. This file is
// the auditable clinical core — no LLM output ever changes a score or a band.
//
// IMPORTANT: These are SCREENING tools, not diagnostic tools. A positive
// screen is a signal to talk to a clinician, never a diagnosis.

import type { Instrument } from "./types";

// Shared 4-point frequency scale used by PHQ-9 and GAD-7.
const FREQ_0_3 = [
  { label: "Not at all", value: 0 },
  { label: "Several days", value: 1 },
  { label: "More than half the days", value: 2 },
  { label: "Nearly every day", value: 3 },
];

const YES_NO = [
  { label: "No", value: 0 },
  { label: "Yes", value: 1 },
];

export const PHQ9: Instrument = {
  id: "phq9",
  name: "Patient Health Questionnaire-9",
  shortName: "PHQ-9",
  domain: "mood",
  basis: "PHQ-9 (Kroenke, Spitzer & Williams) — freely available depression screener",
  timeframe: "over the last 2 weeks",
  preScreenItemIds: ["phq9_1", "phq9_2"], // PHQ-2 pre-screen
  items: [
    { id: "phq9_1", prompt: "Little interest or pleasure in doing things", choices: FREQ_0_3 },
    { id: "phq9_2", prompt: "Feeling down, depressed, or hopeless", choices: FREQ_0_3 },
    { id: "phq9_3", prompt: "Trouble falling or staying asleep, or sleeping too much", choices: FREQ_0_3 },
    { id: "phq9_4", prompt: "Feeling tired or having little energy", choices: FREQ_0_3 },
    { id: "phq9_5", prompt: "Poor appetite or overeating", choices: FREQ_0_3 },
    { id: "phq9_6", prompt: "Feeling bad about yourself, or that you are a failure, or have let yourself or your family down", choices: FREQ_0_3 },
    { id: "phq9_7", prompt: "Trouble concentrating on things, such as reading or watching TV", choices: FREQ_0_3 },
    { id: "phq9_8", prompt: "Moving or speaking so slowly that other people could have noticed — or being so restless that you move around a lot more than usual", choices: FREQ_0_3 },
    {
      id: "phq9_9",
      prompt: "Thoughts that you would be better off dead, or of hurting yourself in some way",
      choices: FREQ_0_3,
      safetyCritical: true,
    },
  ],
  bands: [
    { min: 0, max: 4, tier: "minimal", label: "Minimal or none" },
    { min: 5, max: 9, tier: "low", label: "Mild" },
    { min: 10, max: 14, tier: "moderate", label: "Moderate" },
    { min: 15, max: 19, tier: "high", label: "Moderately severe" },
    { min: 20, max: 27, tier: "urgent", label: "Severe" },
  ],
};

export const GAD7: Instrument = {
  id: "gad7",
  name: "Generalized Anxiety Disorder-7",
  shortName: "GAD-7",
  domain: "anxiety",
  basis: "GAD-7 (Spitzer, Kroenke, Williams & Löwe) — freely available anxiety screener",
  timeframe: "over the last 2 weeks",
  preScreenItemIds: ["gad7_1", "gad7_2"], // GAD-2 pre-screen
  items: [
    { id: "gad7_1", prompt: "Feeling nervous, anxious, or on edge", choices: FREQ_0_3 },
    { id: "gad7_2", prompt: "Not being able to stop or control worrying", choices: FREQ_0_3 },
    { id: "gad7_3", prompt: "Worrying too much about different things", choices: FREQ_0_3 },
    { id: "gad7_4", prompt: "Trouble relaxing", choices: FREQ_0_3 },
    { id: "gad7_5", prompt: "Being so restless that it is hard to sit still", choices: FREQ_0_3 },
    { id: "gad7_6", prompt: "Becoming easily annoyed or irritable", choices: FREQ_0_3 },
    { id: "gad7_7", prompt: "Feeling afraid, as if something awful might happen", choices: FREQ_0_3 },
  ],
  bands: [
    { min: 0, max: 4, tier: "minimal", label: "Minimal" },
    { min: 5, max: 9, tier: "low", label: "Mild" },
    { min: 10, max: 14, tier: "moderate", label: "Moderate" },
    { min: 15, max: 21, tier: "high", label: "Severe" },
  ],
};

export const AUDITC: Instrument = {
  id: "auditc",
  name: "Alcohol Use Disorders Identification Test (Consumption)",
  shortName: "AUDIT-C",
  domain: "alcohol",
  basis: "AUDIT-C (Bush et al.) — freely available alcohol-use screener",
  timeframe: "over the past year",
  items: [
    {
      id: "auditc_1",
      prompt: "How often do you have a drink containing alcohol?",
      choices: [
        { label: "Never", value: 0 },
        { label: "Monthly or less", value: 1 },
        { label: "2–4 times a month", value: 2 },
        { label: "2–3 times a week", value: 3 },
        { label: "4 or more times a week", value: 4 },
      ],
    },
    {
      id: "auditc_2",
      prompt: "How many drinks containing alcohol do you have on a typical day when you are drinking?",
      choices: [
        { label: "1 or 2", value: 0 },
        { label: "3 or 4", value: 1 },
        { label: "5 or 6", value: 2 },
        { label: "7 to 9", value: 3 },
        { label: "10 or more", value: 4 },
      ],
    },
    {
      id: "auditc_3",
      prompt: "How often do you have six or more drinks on one occasion?",
      choices: [
        { label: "Never", value: 0 },
        { label: "Less than monthly", value: 1 },
        { label: "Monthly", value: 2 },
        { label: "Weekly", value: 3 },
        { label: "Daily or almost daily", value: 4 },
      ],
    },
  ],
  bands: [
    { min: 0, max: 2, tier: "minimal", label: "Low risk" },
    { min: 3, max: 4, tier: "low", label: "Possible hazardous use" },
    { min: 5, max: 7, tier: "moderate", label: "Hazardous use likely" },
    { min: 8, max: 12, tier: "high", label: "High-risk / possible dependence" },
  ],
};

// Perceived Stress Scale (4-item). Items 2 & 3 are positively worded; their
// choice point-values are pre-reversed here so the total sums correctly.
const PSS_NEG = [
  { label: "Never", value: 0 },
  { label: "Almost never", value: 1 },
  { label: "Sometimes", value: 2 },
  { label: "Fairly often", value: 3 },
  { label: "Very often", value: 4 },
];
const PSS_POS_REVERSED = [
  { label: "Never", value: 4 },
  { label: "Almost never", value: 3 },
  { label: "Sometimes", value: 2 },
  { label: "Fairly often", value: 1 },
  { label: "Very often", value: 0 },
];

export const PSS4: Instrument = {
  id: "pss4",
  name: "Perceived Stress Scale-4",
  shortName: "PSS-4",
  domain: "stress",
  basis: "PSS-4 (Cohen) — freely available perceived-stress screener",
  timeframe: "in the last month",
  items: [
    { id: "pss4_1", prompt: "How often have you felt that you were unable to control the important things in your life?", choices: PSS_NEG },
    { id: "pss4_2", prompt: "How often have you felt confident about your ability to handle your personal problems?", choices: PSS_POS_REVERSED },
    { id: "pss4_3", prompt: "How often have you felt that things were going your way?", choices: PSS_POS_REVERSED },
    { id: "pss4_4", prompt: "How often have you felt difficulties were piling up so high that you could not overcome them?", choices: PSS_NEG },
  ],
  bands: [
    { min: 0, max: 5, tier: "minimal", label: "Low perceived stress" },
    { min: 6, max: 8, tier: "low", label: "Mild" },
    { min: 9, max: 11, tier: "moderate", label: "Moderate" },
    { min: 12, max: 16, tier: "high", label: "High perceived stress" },
  ],
};

// Compact sleep screen, modeled on Insomnia Severity Index concepts (0–4 each).
const SLEEP_SEVERITY = [
  { label: "None", value: 0 },
  { label: "Mild", value: 1 },
  { label: "Moderate", value: 2 },
  { label: "Severe", value: 3 },
  { label: "Very severe", value: 4 },
];

export const SLEEP4: Instrument = {
  id: "sleep4",
  name: "Sleep & Recovery Screen",
  shortName: "Sleep-4",
  domain: "sleep",
  basis: "Modeled on the Insomnia Severity Index (Morin) — brief routing screen",
  timeframe: "in the last 2 weeks",
  items: [
    { id: "sleep4_1", prompt: "Difficulty falling asleep", choices: SLEEP_SEVERITY },
    { id: "sleep4_2", prompt: "Difficulty staying asleep or waking too early", choices: SLEEP_SEVERITY },
    {
      id: "sleep4_3",
      prompt: "How noticeable to you is the impact of your sleep on your daytime energy, mood, or performance?",
      choices: SLEEP_SEVERITY,
    },
    {
      id: "sleep4_4",
      prompt: "How worried or distressed are you about your current sleep?",
      choices: SLEEP_SEVERITY,
    },
  ],
  bands: [
    { min: 0, max: 3, tier: "minimal", label: "No significant sleep concern" },
    { min: 4, max: 7, tier: "low", label: "Sub-threshold sleep difficulty" },
    { min: 8, max: 11, tier: "moderate", label: "Moderate sleep difficulty" },
    { min: 12, max: 16, tier: "high", label: "Marked sleep difficulty" },
  ],
};

export const PCPTSD5: Instrument = {
  id: "pcptsd5",
  name: "Primary Care PTSD Screen (DSM-5)",
  shortName: "PC-PTSD-5",
  domain: "trauma",
  basis: "PC-PTSD-5 (Prins et al., US VA) — freely available trauma screener",
  timeframe: "in the past month",
  items: [
    { id: "pcptsd5_1", prompt: "Had nightmares about a stressful experience, or thought about it when you did not want to", choices: YES_NO },
    { id: "pcptsd5_2", prompt: "Tried hard not to think about it, or went out of your way to avoid situations that reminded you of it", choices: YES_NO },
    { id: "pcptsd5_3", prompt: "Been constantly on guard, watchful, or easily startled", choices: YES_NO },
    { id: "pcptsd5_4", prompt: "Felt numb or detached from people, activities, or your surroundings", choices: YES_NO },
    { id: "pcptsd5_5", prompt: "Felt guilty, or unable to stop blaming yourself or others, for a stressful experience", choices: YES_NO },
  ],
  bands: [
    { min: 0, max: 2, tier: "minimal", label: "Below screening threshold" },
    { min: 3, max: 3, tier: "moderate", label: "At threshold — further assessment suggested" },
    { min: 4, max: 5, tier: "high", label: "Above threshold — assessment recommended" },
  ],
};

// Energy / recovery screen — NOT a validated diagnostic instrument. It exists
// only to ROUTE (e.g. the athlete whose performance is slipping) toward the
// right conversation. Labeled honestly so no one mistakes it for a diagnosis.
export const ENERGY4: Instrument = {
  id: "energy4",
  name: "Energy & Recovery Check-in",
  shortName: "Energy-4",
  domain: "energy",
  basis: "Non-validated routing screen (overtraining/fatigue signals) — not diagnostic",
  timeframe: "in the last 2 weeks",
  items: [
    { id: "energy4_1", prompt: "Persistent fatigue or heaviness that rest is not fixing", choices: FREQ_0_3 },
    { id: "energy4_2", prompt: "Performance, motivation, or recovery is worse than you would expect", choices: FREQ_0_3 },
    { id: "energy4_3", prompt: "Appetite, weight, or eating patterns feel off to you", choices: FREQ_0_3 },
    { id: "energy4_4", prompt: "Getting sick, injured, or run-down more easily than usual", choices: FREQ_0_3 },
  ],
  bands: [
    { min: 0, max: 2, tier: "minimal", label: "No notable energy concern" },
    { min: 3, max: 5, tier: "low", label: "Some fatigue signals" },
    { min: 6, max: 8, tier: "moderate", label: "Notable fatigue signals" },
    { min: 9, max: 12, tier: "high", label: "Marked fatigue signals" },
  ],
};

// Brief safety screen, modeled on the ASQ (NIMH) concept. ANY endorsement is a
// safety flag: every item is safetyCritical, screening pauses immediately, and
// crisis resources are surfaced. The tool NEVER attempts to counsel here.
export const SAFETY: Instrument = {
  id: "safety",
  name: "Brief Safety Check",
  shortName: "Safety",
  domain: "safety",
  basis: "Modeled on the ASQ Suicide Risk Screening (NIMH) — brief safety check",
  timeframe: "in the past few weeks",
  items: [
    { id: "safety_1", prompt: "Have you wished you were dead or wished you could go to sleep and not wake up?", choices: YES_NO, safetyCritical: true },
    { id: "safety_2", prompt: "Have you had any thoughts of hurting yourself or of ending your life?", choices: YES_NO, safetyCritical: true },
  ],
  bands: [
    { min: 0, max: 0, tier: "minimal", label: "No current safety concern endorsed" },
    { min: 1, max: 2, tier: "urgent", label: "Safety concern endorsed — connect to a person now" },
  ],
};

export const INSTRUMENTS: Instrument[] = [
  PHQ9,
  GAD7,
  AUDITC,
  PSS4,
  SLEEP4,
  PCPTSD5,
  ENERGY4,
  SAFETY,
];

const BY_ID = new Map(INSTRUMENTS.map((i) => [i.id, i]));
const BY_DOMAIN = new Map<string, Instrument>();
for (const i of INSTRUMENTS) {
  // First instrument registered for a domain is the default for that domain.
  if (!BY_DOMAIN.has(i.domain)) BY_DOMAIN.set(i.domain, i);
}

export function getInstrument(id: string): Instrument | undefined {
  return BY_ID.get(id);
}

export function instrumentForDomain(domain: string): Instrument | undefined {
  return BY_DOMAIN.get(domain);
}
