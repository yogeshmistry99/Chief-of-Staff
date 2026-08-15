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
  if (!res.ok) {
    const msg = data?.error?.message ?? data.raw ?? `Drive returned ${res.status}`
    throw Object.assign(new Error(msg), {
      status: res.status,
      // 403 insufficient scope means the stored grant predates the Drive scope.
      needsReconsent: res.status === 401 || res.status === 403,
    })
  }
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
