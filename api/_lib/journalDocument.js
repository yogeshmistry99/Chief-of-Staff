import { SYMPTOM_GROUPS, PROMPTS, scoreLabel, isInverted, MAX_SCORE } from './journalSymptoms.js'

// Builds the document that gets filed to Drive.
//
// IMPORTANT DIVISION OF LABOUR: every number, label and quoted word in this
// document is produced HERE, deterministically, from the stored row. The model
// is asked only for a short narrative paragraph, and its output is placed in a
// clearly labelled section.
//
// That is not a stylistic preference. This document is a clinical record and
// evidence in a live personal injury claim. A model re-typing seventeen scores
// can transpose one, and a transposed score in a symptom diary is a factual
// error in evidence. Numbers come from the database; prose comes from the model.

const FULL_NAME = 'Yogesh Mistry'

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function formatLongDate(dateStr) {
  const [y, m, d] = String(dateStr).split('-').map(Number)
  if (!y || !m || !d) return String(dateStr)
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
}

// YY.MM.DD - Yogesh Mistry - Head Injury Journal
//
// Matches the convention already in use in the case folder, which includes the
// full name — the brief said "YY.MM.DD - Description.ext", but the files
// actually filed there are "26.05.14-26.08.12 - Yogesh Mistry - Head Injury
// Journal.docx". Consistency inside an evidence bundle matters more than the
// shorthand in the brief.
export function driveFileName(entryDate) {
  const [y, m, d] = String(entryDate).split('-')
  return `${y.slice(2)}.${m}.${d} - ${FULL_NAME} - Head Injury Journal`
}

// Scores present, ordered as the form presents them.
export function scoredItems(entry) {
  const out = []
  for (const group of SYMPTOM_GROUPS) {
    for (const s of group.symptoms) {
      const v = entry?.symptoms?.[s.key]
      if (v?.score == null) continue
      out.push({ ...s, group: group.title, score: v.score, note: v.note ?? null, carried: v.carried === true })
    }
  }
  return out
}

// Mean severity across the items where a higher number means a worse day.
// sleep_quality is excluded because it runs the other way — averaging it in
// would quietly cancel out real symptom load.
export function meanSeverity(entry) {
  const vals = scoredItems(entry).filter((i) => !isInverted(i.key)).map((i) => i.score)
  if (!vals.length) return null
  return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10
}

export function wasBackdated(entry) {
  if (!entry?.authored_at || !entry?.entry_date) return false
  const a = new Date(entry.authored_at)
  const authoredDate = `${a.getFullYear()}-${String(a.getMonth() + 1).padStart(2, '0')}-${String(a.getDate()).padStart(2, '0')}`
  return authoredDate !== entry.entry_date
}

// The compact factual summary handed to the model. It gets the numbers as
// labels so it never has to read or repeat a raw figure.
export function narrativeInput(entry) {
  const items = scoredItems(entry)
  const lines = items.map((i) =>
    `- ${i.label}: ${scoreLabel(i.key, i.score)}${i.note ? ` — "${i.note}"` : ''}`
  )
  const prompts = PROMPTS
    .filter((p) => entry?.prompts?.[p.key])
    .map((p) => `- ${p.question} "${entry.prompts[p.key]}"`)
  return [
    `Date: ${formatLongDate(entry.entry_date)}`,
    '',
    'Symptom levels recorded:',
    ...lines,
    prompts.length ? '\nReflections:' : '',
    ...prompts,
    entry?.free_text ? `\nOther notes: "${entry.free_text}"` : '',
  ].filter(Boolean).join('\n')
}

export const NARRATIVE_SYSTEM = `You are helping compile a daily symptom journal for a person with a traumatic brain injury sustained in November 2025. The journal has three simultaneous purposes: a symptom record for his neurologist and neuropsychologist, evidence in an ongoing personal injury claim, and a way for him to notice patterns in his own recovery.

Write ONE short paragraph (3-5 sentences) summarising the day, in plain clinical prose.

Rules, all of which matter because this is a medical and legal record:
- Write in the third person about "Mr Mistry".
- Describe only what the data says. Do not infer causes, do not speculate about prognosis, do not offer medical opinion, and do not add sympathy or encouragement.
- Do NOT repeat the numeric scores — they appear in a table elsewhere in the document. Refer to severity in words.
- Where he has written his own words, you may quote them briefly; do not paraphrase them into something he did not say.
- Note the functional impact where the data shows it (something he could not do, or found harder).
- If the day is unremarkable, say so plainly. Do not manufacture significance.
- No headings, no bullet points, no preamble. Just the paragraph.`

// ─── The document ─────────────────────────────────────────────────────────────

export function buildDocumentHtml(entry, narrative) {
  const items = scoredItems(entry)
  const mean = meanSeverity(entry)
  const backdated = wasBackdated(entry)
  const authored = entry.authored_at ? new Date(entry.authored_at) : null
  const updated = entry.updated_at ? new Date(entry.updated_at) : null

  const rows = items.map((i) => `
    <tr>
      <td style="padding:4px 10px;border:1px solid #ccc;">${escapeHtml(i.group)}</td>
      <td style="padding:4px 10px;border:1px solid #ccc;">${escapeHtml(i.label)}</td>
      <td style="padding:4px 10px;border:1px solid #ccc;text-align:center;">${i.score} / ${MAX_SCORE}</td>
      <td style="padding:4px 10px;border:1px solid #ccc;">${escapeHtml(scoreLabel(i.key, i.score))}</td>
      <td style="padding:4px 10px;border:1px solid #ccc;">${escapeHtml(i.note ?? '')}</td>
    </tr>`).join('')

  const reflections = PROMPTS
    .filter((p) => entry?.prompts?.[p.key])
    .map((p) => `<p style="margin:0 0 8px 0;"><em>${escapeHtml(p.question)}</em><br>${escapeHtml(entry.prompts[p.key])}</p>`)
    .join('')

  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="font-family:Georgia,serif;line-height:1.5;color:#111;">

<h1 style="font-size:20pt;margin:0 0 2px 0;">Head Injury Symptom Journal</h1>
<p style="margin:0 0 2px 0;font-size:12pt;"><strong>${escapeHtml(FULL_NAME)}</strong></p>
<p style="margin:0 0 16px 0;font-size:12pt;">Entry for ${escapeHtml(formatLongDate(entry.entry_date))}</p>

<p style="font-size:9pt;color:#555;border-left:3px solid #ccc;padding-left:10px;margin:0 0 18px 0;">
Self-reported daily symptom record maintained by Mr Mistry following a traumatic brain injury
sustained in November 2025. Symptom severity is recorded on a 0&ndash;4 scale
(0 = none, 4 = very severe), consistent with the Rivermead Post-Concussion Symptoms
Questionnaire. Sleep quality is recorded on the same 0&ndash;4 scale but in the opposite
direction, where 4 indicates good sleep.
${backdated && authored
  ? `<br><br><strong>This entry was completed on ${escapeHtml(formatLongDate(
      `${authored.getFullYear()}-${String(authored.getMonth() + 1).padStart(2, '0')}-${String(authored.getDate()).padStart(2, '0')}`
    ))}, describing the day recorded above.</strong>`
  : '<br><br>This entry was completed on the day it describes.'}
</p>

${narrative ? `<h2 style="font-size:13pt;margin:0 0 6px 0;">Summary</h2>
<p style="margin:0 0 6px 0;">${escapeHtml(narrative)}</p>
<p style="font-size:8pt;color:#777;margin:0 0 18px 0;">
This summary paragraph was generated from the recorded data below. The recorded values,
notes and Mr Mistry's own words are reproduced verbatim and were not generated.
</p>` : ''}

<h2 style="font-size:13pt;margin:0 0 6px 0;">Recorded symptoms</h2>
${mean != null ? `<p style="margin:0 0 8px 0;font-size:10pt;color:#444;">
Mean severity across symptoms (excluding sleep quality, which is scored in the opposite
direction): <strong>${mean} / ${MAX_SCORE}</strong>. ${items.length} of 17 items recorded.</p>` : ''}
<table style="border-collapse:collapse;font-size:10pt;width:100%;margin:0 0 18px 0;">
  <tr style="background:#f0f0f0;">
    <th style="padding:5px 10px;border:1px solid #ccc;text-align:left;">Area</th>
    <th style="padding:5px 10px;border:1px solid #ccc;text-align:left;">Symptom</th>
    <th style="padding:5px 10px;border:1px solid #ccc;">Score</th>
    <th style="padding:5px 10px;border:1px solid #ccc;text-align:left;">Severity</th>
    <th style="padding:5px 10px;border:1px solid #ccc;text-align:left;">Notes</th>
  </tr>
  ${rows}
</table>

${reflections ? `<h2 style="font-size:13pt;margin:0 0 6px 0;">Reflections</h2>${reflections}` : ''}

${entry.free_text ? `<h2 style="font-size:13pt;margin:18px 0 6px 0;">In his own words</h2>
<p style="margin:0 0 18px 0;white-space:pre-wrap;">${escapeHtml(entry.free_text)}</p>` : ''}

<hr style="border:none;border-top:1px solid #ddd;margin:24px 0 8px 0;">
<p style="font-size:8pt;color:#777;margin:0;">
Entry date: ${escapeHtml(entry.entry_date)}.
${authored ? `First recorded: ${escapeHtml(authored.toLocaleString('en-GB', { timeZone: 'Europe/London' }))}.` : ''}
${updated ? ` Last edited: ${escapeHtml(updated.toLocaleString('en-GB', { timeZone: 'Europe/London' }))}.` : ''}
Revision ${entry.revision ?? 1}.
Earlier versions of this document are retained in Google Drive's version history.
</p>

</body></html>`
}
