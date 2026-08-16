import { SYMPTOM_GROUPS, PROMPTS, scoreLabel, isInverted, MAX_SCORE } from './journalSymptoms.js'
import { MEDICINES, medicineName, normaliseMedicines } from './journalMedicines.js'

// Builds the document filed to Drive.
//
// DIVISION OF LABOUR: the scores and severity labels in the table are rendered
// HERE, deterministically, from the stored row. The model never sees or repeats
// a figure, so it cannot transpose one — a wrong number in a symptom diary is a
// factual error in evidence.
//
// What the model DOES do is write the entry itself: the free-text brain dump and
// the short prompt answers are rewritten into the measured first-person prose of
// the existing journal (26.05.14–26.08.12 - Yogesh Mistry - Head Injury Journal),
// rather than being pasted in raw. The verbatim original always remains in the
// database `free_text` column, so nothing is lost by tidying it here.

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

// Matches the convention already used in the case folder, which includes the
// full name: "26.05.14-26.08.12 - Yogesh Mistry - Head Injury Journal.docx".
export function driveFileName(entryDate) {
  const [y, m, d] = String(entryDate).split('-')
  return `${y.slice(2)}.${m}.${d} - ${FULL_NAME} - Head Injury Journal`
}

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

// Mean across items where a higher number means a worse day. sleep_quality is
// excluded because it runs the other way and would cancel out real symptom load.
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

// ─── What the model is given ──────────────────────────────────────────────────

// Severity is passed as WORDS, never figures, so the model has no number it
// could carry into prose incorrectly.
export function narrativeInput(entry) {
  const items = scoredItems(entry)
  const parts = []

  parts.push(`Date of entry: ${formatLongDate(entry.entry_date)}`)

  if (items.length) {
    parts.push('\nSymptom levels he recorded today:')
    parts.push(...items.map((i) =>
      `- ${i.label}: ${scoreLabel(i.key, i.score)}${i.note ? ` — his note: "${i.note}"` : ''}`
    ))
  }

  const answered = PROMPTS.filter((p) => entry?.prompts?.[p.key])
  if (answered.length) {
    parts.push('\nHis short answers to the daily questions:')
    parts.push(...answered.map((p) => `- ${p.question} — "${entry.prompts[p.key]}"`))
  }

  if (entry?.free_text) {
    parts.push('\nHis own notes for the day, written quickly and unedited:')
    parts.push(`"""${entry.free_text}"""`)
  }

  return parts.join('\n')
}

// Written to match the voice of the existing journal: first person, measured,
// specific, British English. The model is tidying his words, not composing.
export const NARRATIVE_SYSTEM = `You are helping Yogesh Mistry write up his daily journal entry. He sustained a traumatic brain injury in November 2025. The journal is a symptom record for his neurologist and neuropsychologist, and evidence in an ongoing personal injury claim.

He records his symptoms in the app and types quick, unedited notes about the day. Your job is to turn those notes into a written journal entry in HIS voice, matching the entries he has already written.

His established style, which you must match:
- First person, past tense, British English. "I woke up tired." Never third person, never "Mr Mistry".
- Measured and plain. He states what happened and how it affected him, without drama and without self-pity.
- Specific. He keeps concrete details: times, durations, places, who he saw, what he could not do.
- He connects a symptom to its practical effect: not "I was fatigued" but that he napped at lunch and was still exhausted by 3:45pm.
- Flowing paragraphs. No headings, no bullet points, no bold.

Hard rules:
- Do NOT invent anything. Every fact, time, name and event must come from what he wrote. If he did not say why something happened, do not supply a reason.
- Do NOT add encouragement, sympathy, reassurance, or medical opinion. Do not tell him things will improve.
- Do NOT repeat the numeric scores — they appear in a table elsewhere. Refer to severity in words, and only where it adds something.
- Keep his own phrasing where it is already clear. You are tidying grammar, spelling and structure, not rewriting his thinking or upgrading his vocabulary.
- Match his length. A couple of scrappy lines becomes a short paragraph, not an essay. Do not pad.
- Weave his answers to the daily questions into the prose rather than listing them.

Return ONLY the entry text. No preamble, no headings, no quotation marks around the whole thing.`

// Per-symptom notes are typed one-handed into a small box, so they arrive as
// fragments: "behind the eyes all day", "couldnt settle". They are tidied for
// the table PRESENTATIONALLY ONLY — sentence case and a closing full stop — and
// never reworded. His comment against a symptom score is the thing a clinician
// or a solicitor reads next to the figure; changing its words would change the
// evidence. The prose rewriting happens in the narrative above, from the same
// material, where it is clearly his account rather than a data cell.
export function tidyNote(note) {
  const s = String(note ?? '').trim()
  if (!s) return ''
  const cased = s[0].toUpperCase() + s.slice(1)
  return /[.!?]$/.test(cased) ? cased : `${cased}.`
}

// The model may return prose directly, or wrapped in fences. Take the text.
export function cleanNarrative(text) {
  if (!text) return null
  const out = String(text).trim()
    .replace(/^```[a-z]*\s*/i, '')
    .replace(/```$/, '')
    .trim()
  return out || null
}

// ─── The document ─────────────────────────────────────────────────────────────

function paragraphs(text) {
  return String(text)
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p style="margin:0 0 12px 0;">${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('')
}

// Medicines, rendered ONLY from the stored row.
//
// Every figure here is printed from the record, exactly as the symptom scores
// are — the model is never handed a dose or a count. A wrong medication figure
// in a document disclosed to a solicitor is a factual error in evidence.
//
// The section is omitted entirely when nothing was recorded, rather than
// printing a table of blanks: "not recorded" is not the same as "not taken",
// and a document must not imply the second when it means the first.
export function medicinesSection(entry) {
  const m = normaliseMedicines(entry?.medicines)
  const rows = MEDICINES
    .map((med) => {
      const v = m[med.key]
      if (!v) return null
      const answer = med.schedule === 'as_needed'
        ? (v.doses === 0 ? 'None taken' : `${v.doses} ${v.doses === 1 ? 'dose' : 'doses'}`)
        : (v.taken ? 'Taken' : 'Not taken')
      return { name: medicineName(med), note: med.note ?? '', answer }
    })
    .filter(Boolean)

  if (!rows.length) return ''

  const html = rows.map((r) => `
    <tr>
      <td style="padding:5px 10px;border:1px solid #d0d0d0;">${escapeHtml(r.name)}</td>
      <td style="padding:5px 10px;border:1px solid #d0d0d0;">${escapeHtml(r.answer)}</td>
      <td style="padding:5px 10px;border:1px solid #d0d0d0;">${escapeHtml(r.note)}</td>
    </tr>`).join('')

  return `
<h2 style="font-family:Arial,Helvetica,sans-serif;font-size:12pt;margin:20px 0 8px 0;">Medication</h2>
<table style="border-collapse:collapse;font-size:10pt;width:100%;margin:0 0 6px 0;">
  <tr style="background:#efefef;">
    <th style="padding:5px 10px;border:1px solid #d0d0d0;text-align:left;">Medicine</th>
    <th style="padding:5px 10px;border:1px solid #d0d0d0;text-align:left;">Today</th>
    <th style="padding:5px 10px;border:1px solid #d0d0d0;text-align:left;">Prescribed as</th>
  </tr>
  ${html}
</table>
<p style="margin:0 0 16px 0;font-size:9pt;color:#555;">
Only medicines recorded on the day are listed; an omission here means nothing was recorded, not that a dose was missed.
</p>
`
}

export function buildDocumentHtml(entry, narrative) {
  const items = scoredItems(entry)
  const mean = meanSeverity(entry)
  const backdated = wasBackdated(entry)
  const authored = entry.authored_at ? new Date(entry.authored_at) : null
  const updated = entry.updated_at ? new Date(entry.updated_at) : null
  const hasInverted = items.some((i) => isInverted(i.key))

  const rows = items.map((i) => `
    <tr>
      <td style="padding:5px 10px;border:1px solid #d0d0d0;">${escapeHtml(i.label)}</td>
      <td style="padding:5px 10px;border:1px solid #d0d0d0;text-align:center;">${i.score} / ${MAX_SCORE}</td>
      <td style="padding:5px 10px;border:1px solid #d0d0d0;">${escapeHtml(scoreLabel(i.key, i.score))}</td>
      <td style="padding:5px 10px;border:1px solid #d0d0d0;">${escapeHtml(tidyNote(i.note))}</td>
    </tr>`).join('')

  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="font-family:Arial,Helvetica,sans-serif;font-size:11pt;line-height:1.5;color:#000;">

<h1 style="font-family:Arial,Helvetica,sans-serif;font-size:16pt;margin:0 0 4px 0;">Head Injury Journal</h1>
<p style="margin:0 0 4px 0;font-size:12pt;"><strong>${escapeHtml(formatLongDate(entry.entry_date))}</strong></p>
<p style="margin:0 0 20px 0;font-size:11pt;">${escapeHtml(FULL_NAME)}</p>
${backdated && authored
  ? `<p style="margin:0 0 20px 0;font-size:10pt;font-style:italic;">Written on ${escapeHtml(formatLongDate(
      `${authored.getFullYear()}-${String(authored.getMonth() + 1).padStart(2, '0')}-${String(authored.getDate()).padStart(2, '0')}`
    ))}.</p>`
  : ''}

${narrative ? paragraphs(narrative) : ''}

<h2 style="font-family:Arial,Helvetica,sans-serif;font-size:12pt;margin:20px 0 8px 0;">Symptoms recorded</h2>
<table style="border-collapse:collapse;font-size:10pt;width:100%;margin:0 0 6px 0;">
  <tr style="background:#efefef;">
    <th style="padding:5px 10px;border:1px solid #d0d0d0;text-align:left;">Symptom</th>
    <th style="padding:5px 10px;border:1px solid #d0d0d0;width:50px;">Score</th>
    <th style="padding:5px 10px;border:1px solid #d0d0d0;text-align:left;">Severity</th>
    <th style="padding:5px 10px;border:1px solid #d0d0d0;text-align:left;">Notes</th>
  </tr>
  ${rows}
</table>
<p style="margin:0 0 16px 0;font-size:9pt;color:#555;">
Scored 0&ndash;4, where 0 is none and 4 is very severe.${hasInverted
  ? ' Sleep quality is scored on the same scale in the opposite direction, where 4 is good sleep.'
  : ''}${mean != null ? ` Mean severity ${mean}${hasInverted ? ', excluding sleep quality' : ''}.` : ''}
</p>

${medicinesSection(entry)}
<hr style="border:none;border-top:1px solid #ddd;margin:24px 0 8px 0;">
<p style="font-size:8pt;color:#777;margin:0;">
${escapeHtml(entry.entry_date)}${authored ? ` &middot; recorded ${escapeHtml(authored.toLocaleString('en-GB', { timeZone: 'Europe/London' }))}` : ''}${
  updated && entry.revision > 1 ? ` &middot; last edited ${escapeHtml(updated.toLocaleString('en-GB', { timeZone: 'Europe/London' }))}` : ''
} &middot; revision ${entry.revision ?? 1}
</p>

</body></html>`
}
