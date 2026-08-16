// The daily medicines checklist.
//
// Shared by the browser and the document builder, exactly like journalSymptoms —
// a filed record whose app labels and document labels disagree is worse than
// useless when the document is disclosed in a claim.
//
// EVERY ENTRY BELOW COMES FROM THE MEDICAL TRACKER, not from memory. Sources are
// recorded per item so a future change can be checked against the record rather
// than argued about:
//
//   Sertraline 50 mg     GP review, medication started (tracker row 17); NHS
//                        prescriptions collected 14 Jul and 10 Aug 2026.
//   Candesartan 8 mg     Dr Bhavini Patel, for headache prevention. Titrated
//                        2 mg → 4 mg → 8 mg (tracker rows 62, 66, 70); NHS
//                        prescription for 4 mg and 8 mg collected 7 Aug 2026.
//   Mometasone furoate   ENT, Mr Stephen J Wood, Princess Margaret Hospital,
//   Fluticasone prop.    consultation 8 Jun 2026 (tracker row 56). BOTH are
//                        recorded there; NO DOSE OR FREQUENCY is recorded for
//                        either, so none is stated here. Do not invent one —
//                        a wrong dose in a medical record is a factual error in
//                        evidence. Add it when the prescription itself is filed.
//   Paracetamol          As needed for headaches; present throughout the acute
//                        records (tracker rows 6, 12, 14).
//
// If a dose changes, change it HERE and note the source. The document renders
// these labels verbatim.

export const MEDICINES = [
  {
    key: 'sertraline',
    label: 'Sertraline',
    dose: '50 mg',
    schedule: 'daily',
    note: 'Once daily',
  },
  {
    key: 'candesartan',
    label: 'Candesartan',
    dose: '8 mg',
    schedule: 'daily',
    note: 'Once daily — headache prevention',
  },
  {
    key: 'mometasone',
    label: 'Mometasone furoate',
    dose: null,
    schedule: 'daily',
    note: 'Nasal spray — ENT',
  },
  {
    key: 'fluticasone',
    label: 'Fluticasone propionate',
    dose: null,
    schedule: 'daily',
    note: 'Nasal spray — ENT',
  },
  {
    key: 'paracetamol',
    label: 'Paracetamol',
    dose: null,
    // As-needed, so "taken / missed" is the wrong question — the useful figure
    // is HOW MANY, since painkiller use is itself a measure of the headaches.
    schedule: 'as_needed',
    note: 'As needed for headaches',
  },
]

export const MEDICINE_KEYS = MEDICINES.map((m) => m.key)
export const MAX_DOSES = 12 // a guard against a stuck finger, not clinical advice

export function medicineByKey(key) {
  return MEDICINES.find((m) => m.key === key) ?? null
}

// Full display name: "Candesartan 8 mg", or just the name when no dose is on
// record. Never fabricates a dose.
export function medicineName(med) {
  if (!med) return ''
  return med.dose ? `${med.label} ${med.dose}` : med.label
}

// Keep only what belongs, and only in the shapes the UI can produce.
//
// A daily medicine is taken or missed; an as-needed one has a dose count.
// Anything else is dropped rather than stored — the medicines column feeds a
// medical document, so a malformed value must not survive to be rendered.
export function normaliseMedicines(input) {
  if (!input || typeof input !== 'object') return {}
  const out = {}

  for (const med of MEDICINES) {
    const v = input[med.key]
    if (!v || typeof v !== 'object') continue

    if (med.schedule === 'as_needed') {
      const n = Number(v.doses)
      if (!Number.isFinite(n) || n < 0) continue
      // 0 is a real answer — "none today" is not the same as not recorded.
      out[med.key] = { doses: Math.min(Math.floor(n), MAX_DOSES) }
    } else if (typeof v.taken === 'boolean') {
      out[med.key] = { taken: v.taken }
    }
  }
  return out
}

// How the day reads at a glance, for the history row and the document.
export function medicineSummary(medicines) {
  const m = normaliseMedicines(medicines)
  const daily = MEDICINES.filter((x) => x.schedule !== 'as_needed')
  const recorded = daily.filter((x) => m[x.key] != null)
  const taken = daily.filter((x) => m[x.key]?.taken === true)
  const missed = daily.filter((x) => m[x.key]?.taken === false)
  const doses = MEDICINES
    .filter((x) => x.schedule === 'as_needed')
    .reduce((n, x) => n + (m[x.key]?.doses ?? 0), 0)

  return {
    recorded: recorded.length,
    total: daily.length,
    taken: taken.length,
    missed: missed.map((x) => x.label),
    asNeededDoses: doses,
    any: recorded.length > 0 || doses > 0,
  }
}
