import {
  getSupabase, getStoredAuth, getAccessToken, hasDriveScope, hasSheetsScope,
  sheetsFetchGrid, sheetsFetchTitles, resolveTabs, SCOPES, AUTH_KEY,
} from './_lib/google.js'
import { parseSheet } from './_lib/sheetTable.js'

// Google OAuth: start, disconnect, and status.
//
// This merges the former api/google-auth.js and api/google-disconnect.js into
// one function. Vercel's Hobby plan caps a project at 12 serverless functions
// and the project was at exactly 12, so the journal's filing endpoint needed a
// slot — this is where it came from.
//
// api/google-callback.js is deliberately NOT merged in here. Its path is the
// OAuth redirect URI registered in the Google Cloud Console; moving it would
// mean editing external config and risking calendar auth for no gain.

export default async function handler(req, res) {
  const action = req.query.action ?? (req.method === 'POST' ? 'disconnect' : 'auth')

  if (action === 'status') return status(req, res)
  if (action === 'sheet') return sheet(req, res)
  if (action === 'disconnect') return disconnect(req, res)
  return startAuth(req, res)
}

// ─── Sheets read for the trackers ─────────────────────────────────────────────
//
// This lives here rather than in an api/sheets.js because api/*.js is at 12/12,
// the Vercel Hobby function cap — a new file would fail the deploy. Same move as
// api/cron.js?job=… absorbing the journal reminder.
//
// Strictly read-only. The granted scope is spreadsheets.readonly, so no code
// path here could write to a sheet even if it tried.
async function sheet(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' })

  const spreadsheetId = req.query.id
  if (!spreadsheetId) return res.status(400).json({ error: 'Missing spreadsheet id' })

  // Ranges are always supplied by the caller's tracker config, so a wide sheet
  // cannot pull an unbounded payload.
  const ranges = [].concat(req.query.range ?? []).filter(Boolean)
  const headerRows = [].concat(req.query.headerRow ?? []).map((n) => Number(n) || 1)

  const sb = getSupabase()
  if (!sb) return res.status(500).json({ error: 'Supabase not configured' })

  const stored = await getStoredAuth(sb)
  if (!stored?.refresh_token) {
    return res.status(200).json({ ok: false, needsReconsent: true, error: 'Google is not connected. Connect it in Settings.' })
  }
  // Say this up front rather than letting Google answer 403 (or, worse, 404 —
  // a grant that cannot see a file is indistinguishable from a missing file).
  if (!hasSheetsScope(stored)) {
    return res.status(200).json({
      ok: false,
      needsReconsent: true,
      error: 'Google is connected but has no Sheets permission yet. Reconnect Google in Settings to read the trackers.',
    })
  }

  try {
    const token = await getAccessToken(sb, stored)

    // Resolve tab names BEFORE asking for grid data.
    //
    // The configs name tabs from each sheet's visible banner heading, which is
    // not guaranteed to be the tab name underneath it. Sheets rejects the whole
    // request if any range names a tab that doesn't exist, so a single guessed
    // title would take the entire tracker down. This first call is a titles-only
    // fields mask — cheap — and lets a near-miss ("Summary" vs "Model Summary")
    // bind correctly instead of failing.
    const meta = await sheetsFetchTitles(token, spreadsheetId)
    const wanted = ranges.map(rangeTabTitle)
    const { available, resolved, missing } = resolveTabs(meta.titles, wanted.filter(Boolean))
    if (missing.length) {
      return res.status(200).json({
        ok: false,
        error: `Tab not found: ${missing.join(', ')}. This spreadsheet has: ${available.join(', ')}.`,
        availableTabs: available,
      })
    }

    const actualRanges = ranges.map((r, i) => {
      const w = wanted[i]
      if (!w) return r
      const actual = resolved.find((x) => x.wanted === w)?.actual ?? w
      const cells = r.slice(r.lastIndexOf('!') + 1)
      return `'${actual.replace(/'/g, "''")}'!${cells}`
    })

    const data = await sheetsFetchGrid(token, spreadsheetId, actualRanges)

    const tabs = (data.sheets ?? []).map((s, i) =>
      parseSheet(s, { headerRow: headerRows[i] ?? headerRows[0] ?? 1 })
    )

    return res.status(200).json({
      ok: true,
      title: data?.properties?.title ?? null,
      fetchedAt: new Date().toISOString(),
      tabs,
    })
  } catch (err) {
    console.warn('[google] sheet read failed:', err.status, err.message)
    return res.status(200).json({
      ok: false,
      needsReconsent: !!err.needsReconsent,
      error: err.needsReconsent
        ? 'Google refused the request — reconnect Google in Settings to grant Sheets access.'
        : err.message,
    })
  }
}

// "'Property Register'!A1:AB400" → "Property Register". A range without a tab
// prefix targets the first tab, which is legitimate, so that yields null and is
// simply not checked.
export function rangeTabTitle(range) {
  const s = String(range ?? '')
  const bang = s.lastIndexOf('!')
  if (bang < 0) return null
  const name = s.slice(0, bang)
  return name.startsWith("'") && name.endsWith("'")
    ? name.slice(1, -1).replace(/''/g, "'")
    : name
}

function startAuth(req, res) {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } = process.env
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    return res.status(500).json({ error: 'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set in Vercel environment variables.' })
  }

  const appUrl = process.env.APP_URL ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:5173')
  const redirectUri = `${appUrl}/api/google-callback`

  const returnTo = req.query.return ?? '/settings'
  const state = Buffer.from(JSON.stringify({ returnTo })).toString('base64url')

  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',   // always request a refresh token
    state,
  })

  res.redirect(302, `https://accounts.google.com/o/oauth2/v2/auth?${params}`)
}

// Lets the app say "reconnect Google to enable journal filing" BEFORE an entry
// fails to file, rather than discovering the missing scope at filing time.
async function status(req, res) {
  const sb = getSupabase()
  if (!sb) return res.status(500).json({ error: 'Supabase not configured' })
  const stored = await getStoredAuth(sb)
  return res.status(200).json({
    connected: !!stored?.refresh_token,
    drive: hasDriveScope(stored),
    sheets: hasSheetsScope(stored),
    scopes: stored?.scope ?? null,
  })
}

async function disconnect(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).end()

  const sb = getSupabase()
  if (!sb) return res.status(500).json({ error: 'Supabase not configured' })

  // Revoke with Google where possible so the grant can't be reused.
  try {
    const stored = await getStoredAuth(sb)
    const token = stored?.access_token ?? stored?.refresh_token
    if (token) {
      await fetch(`https://oauth2.googleapis.com/revoke?token=${token}`, { method: 'POST' }).catch(() => {})
    }
  } catch { /* revocation is best-effort; the local delete below is what matters */ }

  await sb.from('app_data').delete().eq('key', AUTH_KEY)
  return res.status(200).json({ ok: true })
}
