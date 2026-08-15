import { createClient } from '@supabase/supabase-js'

// Shared Google auth + Drive access.
//
// The token handling here was lifted out of api/calendar.js so the calendar and
// the journal share one implementation rather than drifting apart. The stored
// key is still `google_calendar_auth` even though it now also covers Drive —
// renaming a live key for cosmetic accuracy is exactly the trap just closed on
// `todoist_task_cache`, so it stays.

export const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/userinfo.email',
  // Per-file Drive access: the app can only touch files it created itself.
  // Least privilege, and enough to create documents inside a named folder.
  'https://www.googleapis.com/auth/drive.file',
  // Read-only access to Sheets, for the trackers.
  //
  // drive.file above is NOT sufficient for them: it covers only files this app
  // created, and the tracker spreadsheets were made by hand. Without this scope
  // every tracker fetch 404s no matter what else is configured.
  //
  // READ-ONLY IS THE POINT. The trackers never write back, and using the
  // read-only scope makes that a property of the grant rather than a rule the
  // code has to keep remembering. Do not "upgrade" this to the read/write
  // spreadsheets scope to add a feature — that silently removes the guarantee.
  'https://www.googleapis.com/auth/spreadsheets.readonly',
]

export const AUTH_KEY = 'google_calendar_auth'

export function getSupabase() {
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

export async function getStoredAuth(sb) {
  if (!sb) return null
  const { data } = await sb.from('app_data').select('value').eq('key', AUTH_KEY).single()
  return data?.value ?? null
}

export async function saveStoredAuth(sb, updates, existing) {
  if (!sb) return
  await sb.from('app_data').upsert({
    key: AUTH_KEY,
    value: { ...existing, ...updates },
    updated_at: new Date().toISOString(),
  })
}

// True when the stored grant covers a scope. The Drive scope was added after
// the original consent, so an existing token predates it — this lets the UI say
// "reconnect Google" up front instead of failing at filing time.
export function hasScope(stored, scope) {
  const granted = stored?.scope
  if (!granted) return false
  return String(granted).split(/\s+/).includes(scope)
}

export function hasDriveScope(stored) {
  return hasScope(stored, 'https://www.googleapis.com/auth/drive.file')
}

export function hasSheetsScope(stored) {
  return hasScope(stored, 'https://www.googleapis.com/auth/spreadsheets.readonly')
}

// Exchange the refresh token for a fresh access token, persisting it so the
// next request skips the round trip.
export async function getAccessToken(sb, stored) {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } = process.env

  if (stored.access_token && stored.expiry_date && stored.expiry_date - 60_000 > Date.now()) {
    return stored.access_token
  }

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: stored.refresh_token,
      grant_type: 'refresh_token',
    }),
  })
  const data = await res.json()
  if (!res.ok) {
    const isRevoked = data.error === 'invalid_grant'
    throw Object.assign(new Error(data.error_description ?? data.error ?? 'token_refresh_failed'), { isRevoked })
  }

  await saveStoredAuth(sb, {
    access_token: data.access_token,
    expiry_date: data.expires_in ? Date.now() + data.expires_in * 1000 : null,
    // Google returns the granted scopes on refresh; keep them current so
    // hasDriveScope() reflects reality rather than what we asked for once.
    ...(data.scope ? { scope: data.scope } : {}),
  }, stored)

  return data.access_token
}

// ─── Errors ───────────────────────────────────────────────────────────────────

// An https Google Cloud Console URL, or null. Anything else is discarded rather
// than passed to the client, so a malformed or unexpected value can never reach
// an anchor's href.
export function safeGoogleUrl(raw) {
  try {
    const u = new URL(String(raw))
    const ok = u.protocol === 'https:'
      && (u.hostname === 'console.developers.google.com' || u.hostname === 'console.cloud.google.com')
    return ok ? u.toString() : null
  } catch {
    return null
  }
}

// Build the error for a failed Google API call.
//
// THE POINT OF THIS IS TELLING TWO 403s APART, and getting it wrong costs real
// time. A 403 usually means the stored grant is missing a scope, which a
// reconnect fixes. But Google also returns 403 when the API itself has never
// been enabled on the Cloud project — and no amount of reconnecting will ever
// fix that. Reporting the second as the first sends the user round a loop that
// cannot terminate; that happened here, twice, on 2026-08-15 with the Sheets
// API, and again earlier with Drive.
//
// SERVICE_DISABLED is the discriminator, and Google hands it over explicitly in
// `error.details[].reason` along with an activation URL. Keep that URL: it is
// the whole fix, and it names the project so there is no guessing which one.
export function googleApiError(res, data, fallback) {
  const err = data?.error
  const detail = (err?.details ?? []).find((d) => d?.reason === 'SERVICE_DISABLED')
  const serviceDisabled = err?.status === 'PERMISSION_DENIED' && !!detail

  if (serviceDisabled) {
    const name = detail.metadata?.serviceTitle ?? 'This Google API'
    // The URL is rendered as a link, so it is validated rather than trusted.
    // It arrives from Google's own authenticated API, but a bare string going
    // into an anchor deserves a host check regardless of where it came from.
    const url = safeGoogleUrl(detail.metadata?.activationUrl)
    return Object.assign(
      // The URL stays in the message as well as being returned structurally:
      // callers that only render error text (the journal) would otherwise lose
      // the one thing that fixes the problem.
      new Error(`${name} is not enabled on your Google Cloud project. Enable it here, then retry: ${url ?? '(see Google Cloud Console)'}`),
      { status: res.status, serviceDisabled: true, activationUrl: url, needsReconsent: false },
    )
  }

  return Object.assign(new Error(err?.message ?? data?.raw ?? fallback ?? `Google returned ${res.status}`), {
    status: res.status,
    serviceDisabled: false,
    needsReconsent: res.status === 401 || res.status === 403,
  })
}

// ─── Drive ────────────────────────────────────────────────────────────────────

const DRIVE = 'https://www.googleapis.com/drive/v3'
const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3'

// Documents are created as NATIVE GOOGLE DOCS, not .docx.
//
// That is deliberate and it is what answers the revision-trail requirement:
// native Docs keep unlimited automatic version history, so re-saving an edited
// entry updates the same file and every earlier version remains recoverable.
// Binary uploads also revision, but Drive can prune revisions not marked
// keepForever — weaker for something that is evidence in a live claim.
// Export to .docx or PDF whenever a copy is needed for the solicitor.
const GOOGLE_DOC = 'application/vnd.google-apps.document'

function multipartBody(metadata, html, boundary) {
  return [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify(metadata),
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    '',
    html,
    `--${boundary}--`,
    '',
  ].join('\r\n')
}

async function driveRequest(url, { token, method, metadata, html }) {
  const boundary = `boundary_${Math.random().toString(36).slice(2)}`
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body: multipartBody(metadata, html, boundary),
  })
  const text = await res.text()
  let data
  try { data = text ? JSON.parse(text) : {} } catch { data = { raw: text } }
  // 403 here is usually a grant predating the Drive scope — but not always; see
  // googleApiError, which separates that from the Drive API being switched off.
  if (!res.ok) throw googleApiError(res, data, `Drive returned ${res.status}`)
  return data
}

// Create a Google Doc from HTML inside a folder. Drive converts the HTML, so
// headings, tables and emphasis survive into the document.
export async function driveCreateDoc(token, { name, parentId, html }) {
  return driveRequest(
    `${DRIVE_UPLOAD}/files?uploadType=multipart&fields=id,name,webViewLink`,
    {
      token,
      method: 'POST',
      metadata: { name, mimeType: GOOGLE_DOC, parents: [parentId] },
      html,
    },
  )
}

// Replace the content of an existing Doc. Same file id, new revision — never a
// duplicate. This is what makes re-saving an edited entry safe.
export async function driveUpdateDoc(token, fileId, { name, html }) {
  return driveRequest(
    `${DRIVE_UPLOAD}/files/${encodeURIComponent(fileId)}?uploadType=multipart&fields=id,name,webViewLink`,
    {
      token,
      method: 'PATCH',
      metadata: name ? { name } : {},
      html,
    },
  )
}

// Confirm a file id still exists and isn't in the bin, so a stored id that has
// been deleted by hand results in a fresh file rather than a silent failure.
export async function driveFileExists(token, fileId) {
  try {
    const res = await fetch(
      `${DRIVE}/files/${encodeURIComponent(fileId)}?fields=id,trashed`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
    if (!res.ok) return false
    const data = await res.json()
    return data?.trashed !== true
  } catch {
    return false
  }
}

// ─── Sheets ───────────────────────────────────────────────────────────────────

const SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets'

// Read tabs from a spreadsheet WITH their link metadata.
//
// This uses spreadsheets.get and NOT values.get, and the difference is the whole
// reason the trackers work. values.get returns display text only: a cell reading
// "Open Auto Trader" or "View document" comes back as exactly that string, and
// the URL behind it is gone with no error and no indication anything was lost.
// Only grid data carries `hyperlink` and `textFormatRuns[].format.link`.
//
// `ranges` is always supplied by the caller's config so a wide sheet cannot pull
// an unbounded payload, and the fields mask keeps the response to the four
// things the parser actually reads.
const GRID_FIELDS = [
  'properties.title',
  'sheets(properties(title,index),merges,',
  'data(rowData(values(formattedValue,hyperlink,',
  'textFormatRuns(startIndex,format(link(uri)))))))',
].join('')

export async function sheetsFetchGrid(token, spreadsheetId, ranges = []) {
  const params = new URLSearchParams({ includeGridData: 'true', fields: GRID_FIELDS })
  for (const r of ranges) params.append('ranges', r)

  const res = await fetch(`${SHEETS}/${encodeURIComponent(spreadsheetId)}?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const text = await res.text()
  let data
  try { data = text ? JSON.parse(text) : {} } catch { data = { raw: text } }

  // 403 is normally a missing scope, and 404 on a real id usually means the same
  // thing (a grant that cannot see a file is indistinguishable from the file not
  // existing) — but a 403 can also be the Sheets API being disabled outright,
  // which a reconnect cannot fix. googleApiError tells them apart.
  if (!res.ok) throw googleApiError(res, data, `Sheets returned ${res.status}`)
  return data
}

// Resolve requested tab titles against what the spreadsheet actually has.
//
// The exact tab titles could not be read when the configs were written, so a
// mismatch has to be diagnosable: this returns the available titles rather than
// letting the caller see an empty result and guess.
export async function sheetsFetchTitles(token, spreadsheetId) {
  const res = await fetch(
    `${SHEETS}/${encodeURIComponent(spreadsheetId)}?fields=properties.title,sheets.properties.title`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  const text = await res.text()
  let data
  try { data = text ? JSON.parse(text) : {} } catch { data = { raw: text } }
  if (!res.ok) throw googleApiError(res, data, `Sheets returned ${res.status}`)
  return {
    title: data?.properties?.title ?? null,
    titles: (data?.sheets ?? []).map((s) => s?.properties?.title).filter(Boolean),
  }
}

// Match a configured tab name against the spreadsheet's real tab titles.
//
// The configs name tabs from the sheets' visible banner headings, which are not
// guaranteed to equal the tab names underneath them, so an exact match cannot be
// assumed. Tried in order, most to least strict; anything looser than these
// would risk binding a tracker to the wrong tab, which is worse than an error.
export function matchTitle(wanted, titles) {
  const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  const w = norm(wanted)
  return titles.find((t) => t === wanted)
    ?? titles.find((t) => norm(t) === w)
    ?? titles.find((t) => norm(t).startsWith(w) || w.startsWith(norm(t)))
    ?? null
}

export function resolveTabs(titles, wanted) {
  const resolved = wanted.map((w) => ({ wanted: w, actual: matchTitle(w, titles) }))
  return { available: titles, resolved, missing: resolved.filter((r) => !r.actual).map((r) => r.wanted) }
}
