import {
  getSupabase, getStoredAuth, getAccessToken, hasDriveScope,
  driveCreateDoc, driveUpdateDoc, driveFileExists,
} from './_lib/google.js'
import { getEntryByDate, setDriveResult } from './_lib/journalRepo.js'
import {
  buildDocumentHtml, driveFileName, narrativeInput, NARRATIVE_SYSTEM, cleanNarrative,
} from './_lib/journalDocument.js'
import { recordUsage } from './_lib/usage.js'

// Files a journal entry to Google Drive as a dated document.
//
// Destination: "Irwin Mitchell - Yogesh Mistry - Head Injury" →
// "06 - Personal Evidence" → "Symptoms & Personal Statements". Verified by
// reading the actual folder; the case file has a numbered taxonomy and a
// symptom diary is personal evidence, so filing at the case root would break it.
const JOURNAL_FOLDER_ID = process.env.JOURNAL_DRIVE_FOLDER_ID
  ?? '1IjrNwHyZFdLnGmWUNWidnjcuLpyuZzvE'

// The entry is read from the database here, NOT taken from the request body.
// The filed document must reflect what is actually stored — if the two could
// differ, the evidence and the record would disagree.
export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })

  const entryDate = req.body?.entry_date
  const sb = getSupabase()
  if (!sb) return res.status(500).json({ ok: false, error: 'Supabase not configured' })

  let entry
  try {
    entry = await getEntryByDate(sb, entryDate)
  } catch (err) {
    return res.status(400).json({ ok: false, error: err.message })
  }
  if (!entry) {
    return res.status(404).json({ ok: false, error: `No journal entry saved for ${entryDate}` })
  }

  try {
    const stored = await getStoredAuth(sb)
    if (!stored?.refresh_token) {
      return await recordFailure(sb, entryDate, res, 'Google is not connected. Connect it in Settings to file entries.', { needsReconsent: true })
    }
    if (!hasDriveScope(stored)) {
      // The original consent predates the Drive scope, so the existing grant
      // cannot write files. Say so precisely rather than letting Drive 403.
      return await recordFailure(sb, entryDate, res,
        'Google is connected but has no Drive permission yet. Reconnect Google in Settings to grant it.',
        { needsReconsent: true })
    }

    const token = await getAccessToken(sb, stored)

    // Narrative is best-effort: if the model call fails, the document is still
    // filed with the full recorded data and no summary. Losing a paragraph of
    // prose must never cost the entry its filing.
    let narrative = null
    try {
      narrative = await writeNarrative(entry)
    } catch (err) {
      console.warn('[journal] narrative generation failed, filing without it:', err.message)
    }

    const html = buildDocumentHtml(entry, narrative)
    const name = driveFileName(entry.entry_date)

    // Re-saving an edited entry must update the same file, never create a
    // second one. If the stored id no longer resolves (deleted by hand), fall
    // through to creating a fresh document rather than failing.
    let file
    const reuse = entry.drive_file_id && await driveFileExists(token, entry.drive_file_id)
    if (reuse) {
      file = await driveUpdateDoc(token, entry.drive_file_id, { name, html })
    } else {
      file = await driveCreateDoc(token, { name, parentId: JOURNAL_FOLDER_ID, html })
    }

    if (!file?.id) {
      // Drive answered without a file id — treat as failure, never as success.
      return await recordFailure(sb, entryDate, res, 'Drive did not return a file id — the entry was not filed.')
    }

    await setDriveResult(sb, entryDate, { ok: true, fileId: file.id, documentMd: html })
    return res.status(200).json({
      ok: true,
      fileId: file.id,
      name: file.name ?? name,
      url: file.webViewLink ?? `https://drive.google.com/file/d/${file.id}/view`,
      updated: !!reuse,
    })
  } catch (err) {
    console.error('[journal] filing failed:', err)
    return await recordFailure(sb, entryDate, res, err.message, { needsReconsent: err.needsReconsent || err.isRevoked })
  }
}

// Every failure is written to the entry so it surfaces in the history list as
// retryable. Nothing here is swallowed — the entry itself is already saved and
// is never at risk, but a filing that didn't happen must never look like one
// that did.
async function recordFailure(sb, entryDate, res, message, extra = {}) {
  try {
    await setDriveResult(sb, entryDate, { ok: false, error: message })
  } catch (err) {
    console.error('[journal] could not even record the filing failure:', err)
  }
  return res.status(200).json({ ok: false, error: message, ...extra })
}

async function writeNarrative(entry) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      // The entry is now the document's main content rather than a one-paragraph
      // summary, so a long brain dump needs room to be rewritten in full. Still
      // bounded — the prompt tells it to match his length, not to expand.
      max_tokens: 1600,
      system: NARRATIVE_SYSTEM,
      messages: [{ role: 'user', content: narrativeInput(entry) }],
    }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data?.error?.message ?? `narrative ${res.status}`)

  await recordUsage('claude-sonnet-4-6', data.usage)

  const text = data?.content?.find((b) => b.type === 'text')?.text
  return cleanNarrative(text)
}
