// The seventeen tracked symptoms, and the scale they are scored on.
//
// Shared by the browser (form, history, charts) and the server (document
// write-up) so the two can never drift — a legal record whose app labels and
// filed document disagree is worse than useless.
//
// SCALE: 0–4 with the anchors below. This matches the Rivermead Post-Concussion
// Symptoms Questionnaire, the standard instrument for post-concussion symptoms,
// so the journal reads as a recognised scale to a neurologist or
// neuropsychologist rather than an invented one. The RPQ's own item list is NOT
// used — the seventeen items here are Yogesh's, derived from his journal and
// medical records. Only the scale and anchors are borrowed.
export const SCALE = [
  { score: 0, label: 'None',        short: 'None' },
  { score: 1, label: 'Mild',        short: 'Mild' },
  { score: 2, label: 'Moderate',    short: 'Mod' },
  { score: 3, label: 'Severe',      short: 'Sev' },
  { score: 4, label: 'Very severe', short: 'V.sev' },
]

export const MAX_SCORE = 4

// Grouped for progressive disclosure — five short sections read as less work
// than one list of seventeen, which matters when the symptom being measured is
// cognitive fatigue.
//
// DO NOT MERGE ITEMS. Several pairs look similar and are deliberately distinct
// in his experience; the `why` note on each records the reason so a later change
// doesn't quietly collapse them:
//   • tinnitus vs noise sensitivity — internal sound vs sensitivity to external
//   • fatigue vs sleep quality — he regularly sleeps well and still wakes
//     exhausted, and separately cannot get to sleep because of the tinnitus
//   • work vs home relationships — different people, different demands
export const SYMPTOM_GROUPS = [
  {
    key: 'physical',
    title: 'Physical',
    symptoms: [
      { key: 'headaches',     label: 'Headaches' },
      { key: 'fatigue',       label: 'Fatigue',       why: 'Distinct from sleep quality — can wake exhausted after sleeping well.' },
      { key: 'sleep_quality', label: 'Sleep quality', why: 'Distinct from fatigue — how well he slept, not how tired he feels.', inverted: true },
    ],
  },
  {
    key: 'cognitive',
    title: 'Thinking',
    symptoms: [
      { key: 'word_finding',  label: 'Word-finding difficulty' },
      { key: 'memory',        label: 'Memory problems' },
      { key: 'concentration', label: 'Difficulty concentrating' },
    ],
  },
  {
    key: 'sensory',
    title: 'Senses',
    symptoms: [
      { key: 'tinnitus',          label: 'Tinnitus',           why: 'Internal sound. Distinct from noise sensitivity.' },
      { key: 'noise_sensitivity', label: 'Noise sensitivity',  why: 'Sensitivity to external sound. Distinct from tinnitus.' },
      { key: 'light_sensitivity', label: 'Light sensitivity' },
      { key: 'smell_loss',        label: 'Loss of smell' },
      { key: 'taste_change',      label: 'Loss or change of taste' },
    ],
  },
  {
    key: 'mood',
    title: 'Mood',
    symptoms: [
      { key: 'irritability', label: 'Anger or irritability' },
      { key: 'anxiety',      label: 'Anxiety' },
      { key: 'low_mood',     label: 'Low mood' },
    ],
  },
  {
    key: 'people',
    title: 'People',
    symptoms: [
      { key: 'people_work',      label: 'Difficulty with people at work', why: 'Separate from home — different people and demands.' },
      { key: 'people_home',      label: 'Difficulty with people at home', why: 'Separate from work — different people and demands.' },
      { key: 'social_withdrawal', label: 'Social withdrawal' },
    ],
  },
]

// Flat list in display order.
export const SYMPTOMS = SYMPTOM_GROUPS.flatMap((g) =>
  g.symptoms.map((s) => ({ ...s, group: g.key, groupTitle: g.title }))
)

export const SYMPTOM_KEYS = SYMPTOMS.map((s) => s.key)

export function symptomLabel(key) {
  return SYMPTOMS.find((s) => s.key === key)?.label ?? key
}

// `sleep_quality` runs the other way round: 4 is GOOD sleep, whereas 4 is a bad
// day for every other item. Charts and the written document must say which way
// a number points or the record misleads.
export function isInverted(key) {
  return SYMPTOMS.find((s) => s.key === key)?.inverted === true
}

export function scoreLabel(key, score) {
  if (score == null) return 'Not recorded'
  if (isInverted(key)) {
    return ['Very poor', 'Poor', 'Fair', 'Good', 'Very good'][score] ?? String(score)
  }
  return SCALE.find((s) => s.score === score)?.label ?? String(score)
}

// The reflective questions. Deliberately few — three, not ten. Each is answerable
// in a sentence on a bad evening, and skippable.
export const PROMPTS = [
  { key: 'hardest',   question: 'What was hardest today?' },
  { key: 'good',      question: 'Anything that went well, or felt easier than usual?' },
  { key: 'impact',    question: 'Did symptoms stop you doing something you meant to do?' },
]

export const PROMPT_KEYS = PROMPTS.map((p) => p.key)
