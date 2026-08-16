import {
  getSupabase, getStoredAuth, getAccessToken, hasDriveScope, hasSheetsScope,
  hasHealthScope, healthGrantIsClean, healthFetch,
  sheetsFetchGrid, sheetsFetchTitles, resolveTabs,
  SCOPES, HEALTH_SCOPES, AUTH_KEY, HEALTH_AUTH_KEY,
} from './_lib/google.js'
import { parseSheet } from './_lib/sheetTable.js'
import {
  METRIC_KEYS, RING_METRICS, listRequest, shapeMetric, baselineValues,
  trailingRange, rangePosition, civilToday, addDays, isValidDate, absence, ABSENT,
} from './_lib/health.js'

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
  if (action === 'health') return health(req, res)
  if (action === 'health-auth') return startAuth(req, res, { grant: 'health' })
  if (action === 'disconnect') return disconnect(req, res)
  return startAuth(req, res)
}

// ─── Google Health read for the Health tab ────────────────────────────────────
//
// A sixth action rather than an api/health.js, for the same reason `sheet` lives
// here: every api/*.js file is a serverless function and the Hobby plan caps the
// project at 12. This keeps the count where it is.
//
// SHAPED FOR REUSE. `?metrics=` names what the caller wants, so the planned
// sleep-to-journal work can call `?action=health&metrics=sleep` and receive the
// identical normalised shape rather than a second endpoint being built. All the
// parsing lives in api/_lib/health.js, so a server-side caller can skip HTTP and
// import it directly.
//
// Strictly read-only: the granted scopes are the three .readonly ones, so no
// path here could write health data even if it tried.
async function health(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' })

  const asked = String(req.query.metrics ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  const wanted = asked.length ? asked.filter((k) => METRIC_KEYS.includes(k)) : METRIC_KEYS
  if (!wanted.length) return res.status(400).json({ error: 'No known metrics requested' })

  const tz = typeof req.query.tz === 'string' && req.query.tz ? req.query.tz : 'Europe/London'
  const date = isValidDate(req.query.date) ? req.query.date : civilToday(tz)

  const sb = getSupabase()
  if (!sb) return res.status(500).json({ error: 'Supabase not configured' })

  // The HEALTH grant, which is a different row from the calendar/drive/sheets
  // one. Connecting Google in Settings does not connect this.
  const stored = await getStoredAuth(sb, HEALTH_AUTH_KEY)
  if (!stored?.refresh_token) {
    return res.status(200).json({
      ok: false, needsHealthAuth: true,
      error: 'Google Health is not connected yet. It needs its own permission, separate from Calendar and Drive.',
    })
  }
  // Said up front rather than letting the Health API answer 403, which is
  // ambiguous between "no scope" and "API not enabled".
  if (!hasHealthScope(stored)) {
    return res.status(200).json({
      ok: false, needsHealthAuth: true,
      error: 'The Google Health connection is missing one or more permissions. Connect it again to read your health data.',
    })
  }
  // A health token carrying ANY other scope is refused outright by the Health
  // data plane ("Request contains disallowed OAuth scope(s)"), which otherwise
  // surfaces as eight identical unexplained failures.
  if (!healthGrantIsClean(stored)) {
    return res.status(200).json({
      ok: false, needsHealthAuth: true,
      error: 'The Google Health connection also carries Calendar or Drive permissions, which Google Health refuses. Connect Google Health again to replace it.',
    })
  }

  try {
    const token = await getAccessToken(sb, stored, HEALTH_AUTH_KEY)
    const tomorrow = addDays(date, 1)
    // Baseline window for the ring arcs. Sleep is capped at 25 rows per page by
    // the API, so a 30-day sleep window yields up to 25 nights — ample for a
    // min/max, and paginating for a display baseline would not earn its cost.
    const from30 = addDays(date, -29)

    // One call for today per metric, plus a second for the baseline window on
    // the three that carry a ring. Today and the baseline are queried
    // SEPARATELY rather than split out of one 30-day payload: that way each
    // point's day is decided by the API's own civil filter, and nothing here
    // has to infer a local date from a UTC timestamp.
    const rings = new Set(RING_METRICS)
    const results = await Promise.all(wanted.map(async (key) => {
      try {
        const payload = await healthFetch(token, listRequest(key, date, tomorrow))
        if (!rings.has(key)) return [key, { payload }]
        // Baseline is the 29 days BEFORE today, so today is never compared
        // against itself.
        let baseline = []
        try {
          const prior = await healthFetch(token, listRequest(key, from30, date))
          baseline = baselineValues(key, prior)
        } catch { /* no baseline is a missing arc, not a failed metric */ }
        return [key, { payload, baseline }]
      } catch (e) {
        return [key, { error: e }]
      }
    }))

    const metrics = {}
    const missing = []
    let needsReconsent = false
    let serviceDisabled = null

    for (const [key, out] of results) {
      if (out.error) {
        const e = out.error
        if (e.needsReconsent) needsReconsent = true
        if (e.serviceDisabled) serviceDisabled = { message: e.message, activationUrl: e.activationUrl ?? null }
        metrics[key] = absence(e.serviceDisabled ? ABSENT.API_DISABLED : ABSENT.ERROR, e.message)
        missing.push({ metric: key, reason: metrics[key].absent })
        continue
      }
      const shaped = shapeMetric(key, out.payload)
      // The arc position is computed server-side so the browser is handed a
      // number it can draw, not a rule it has to re-derive. `range` travels too
      // so the UI can caption what the arc is relative to.
      const range = out.baseline ? trailingRange(out.baseline) : null
      metrics[key] = { ...shaped, range, position: rangePosition(shaped.value, range) }
      if (shaped.absent) missing.push({ metric: key, reason: shaped.absent })
    }

    return res.status(200).json({
      ok: true, date, timeZone: tz, fetchedAt: new Date().toISOString(),
      metrics, missing, needsReconsent, serviceDisabled,
    })
  } catch (e) {
    if (e.isRevoked) {
      return res.status(200).json({ ok: false, needsReconsent: true, error: 'Google access expired. Reconnect Google in Settings.' })
    }
    return res.status(200).json({
      ok: false,
      error: e.message ?? 'Could not read health data',
      needsReconsent: !!e.needsReconsent,
      serviceDisabled: !!e.serviceDisabled,
      activationUrl: e.activationUrl ?? null,
    })
  }
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
    // Only offer a reconnect when a reconnect is actually the fix. A disabled
    // Sheets API also answers 403, and telling the user to reconnect for that
    // sends them round a loop that can never work — so Google's own message,
    // which names the project and carries the activation URL, is passed through.
    return res.status(200).json({
      ok: false,
      needsReconsent: !!err.needsReconsent,
      serviceDisabled: !!err.serviceDisabled,
      activationUrl: err.activationUrl ?? null,
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

// TWO SEPARATE GRANTS, and they must never be combined.
//
// `grant: 'health'` requests ONLY the three health scopes and the callback
// stores the result under its own key. That is not tidiness: a token carrying
// calendar/drive/sheets alongside health scopes is rejected by the Health data
// plane with "Request contains disallowed OAuth scope(s)" — reproduced live on
// 2026-08-16 with all three health scopes correctly granted.
//
// Consequence worth knowing: connecting one grant does not connect the other,
// and each needs its own consent. Nothing shares a refresh token.
function startAuth(req, res, { grant = 'main' } = {}) {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } = process.env
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    return res.status(500).json({ error: 'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set in Vercel environment variables.' })
  }

  const appUrl = process.env.APP_URL ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:5173')
  const redirectUri = `${appUrl}/api/google-callback`

  const isHealth = grant === 'health'
  const returnTo = req.query.return ?? (isHealth ? '/health' : '/settings')
  // The callback reads `grant` to decide which row to write. Unrecognised or
  // absent means the main grant, so an old link keeps working.
  const state = Buffer.from(JSON.stringify({ returnTo, grant })).toString('base64url')

  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    // Never the union of the two sets — see above.
    scope: (isHealth ? HEALTH_SCOPES : SCOPES).join(' '),
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
