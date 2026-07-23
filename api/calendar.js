import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

async function getStoredAuth(sb) {
  if (!sb) return null
  const { data } = await sb.from('app_data').select('value').eq('key', 'google_calendar_auth').single()
  return data?.value ?? null
}

async function saveStoredAuth(sb, updates, existing) {
  if (!sb) return
  await sb.from('app_data').upsert({
    key: 'google_calendar_auth',
    value: { ...existing, ...updates },
    updated_at: new Date().toISOString(),
  })
}

// Exchange refresh token for a fresh access token; persist updated token to Supabase
async function getAccessToken(sb, stored) {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } = process.env

  // Token still valid (with 60s buffer)?
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

  // Persist updated access token so next request skips the refresh
  await saveStoredAuth(sb, {
    access_token: data.access_token,
    expiry_date: data.expires_in ? Date.now() + data.expires_in * 1000 : null,
  }, stored)

  return data.access_token
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const sb = getSupabase()
  const stored = await getStoredAuth(sb)

  if (!stored?.refresh_token) {
    return res.status(401).json({ error: 'auth_required' })
  }

  let accessToken
  try {
    accessToken = await getAccessToken(sb, stored)
  } catch (err) {
    if (err.isRevoked) return res.status(401).json({ error: 'auth_required' })
    return res.status(500).json({ error: err.message })
  }

  const calendarId = req.body?.calendarId ?? req.query?.calendarId ?? 'primary'
  const calEnc = encodeURIComponent(calendarId)
  const BASE_CAL = `https://www.googleapis.com/calendar/v3/calendars/${calEnc}/events`
  const authHeader = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }

  // Create event (POST)
  if (req.method === 'POST') {
    const { calendarId: _c, ...body } = req.body ?? {}
    try {
      const r = await fetch(BASE_CAL, { method: 'POST', headers: authHeader, body: JSON.stringify(body) })
      const data = await r.json()
      return res.status(r.status).json(data)
    } catch (err) { return res.status(500).json({ error: err.message }) }
  }

  // Update event (PATCH)
  if (req.method === 'PATCH') {
    const { eventId, calendarId: _c, ...updates } = req.body ?? {}
    if (!eventId) return res.status(400).json({ error: 'eventId required' })
    try {
      const r = await fetch(`${BASE_CAL}/${encodeURIComponent(eventId)}`, {
        method: 'PATCH', headers: authHeader, body: JSON.stringify(updates),
      })
      const data = await r.json()
      return res.status(r.status).json(data)
    } catch (err) { return res.status(500).json({ error: err.message }) }
  }

  // Delete event (DELETE)
  if (req.method === 'DELETE') {
    const { eventId, calendarId: _c } = req.body ?? {}
    if (!eventId) return res.status(400).json({ error: 'eventId required' })
    try {
      const r = await fetch(`${BASE_CAL}/${encodeURIComponent(eventId)}`, {
        method: 'DELETE', headers: authHeader,
      })
      return res.status(r.status).json(r.status === 204 ? { success: true } : await r.json())
    } catch (err) { return res.status(500).json({ error: err.message }) }
  }

  // Fetch a single event by id — used to read its current start/end (timed vs
  // all-day, time-of-day, timeZone) before an update. Defaults to the primary
  // calendar, matching the PATCH target.
  if (req.query.eventId) {
    try {
      const r = await fetch(`${BASE_CAL}/${encodeURIComponent(req.query.eventId)}`, { headers: authHeader })
      if (r.status === 401) return res.status(401).json({ error: 'auth_required' })
      const ev = await r.json()
      return res.status(r.status).json(ev)
    } catch (err) {
      return res.status(500).json({ error: err.message })
    }
  }

  // Fetch events (GET) — all enabled calendars
  const { start, end } = req.query

  try {
    const calListRes = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (calListRes.status === 401) return res.status(401).json({ error: 'auth_required' })
    const calList = await calListRes.json()
    const calendars = (calList.items ?? []).filter((c) => c.selected !== false)

    const results = await Promise.allSettled(
      calendars.map(async (cal) => {
        // Page through ALL events in the window — Google caps each page and
        // returns a nextPageToken; without following it, events past the first
        // page were silently dropped (near-future ones starved by past events).
        const items = []
        let pageToken = null
        let pages = 0
        do {
          const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cal.id)}/events`)
          if (start) url.searchParams.set('timeMin', start)
          if (end) url.searchParams.set('timeMax', end)
          url.searchParams.set('singleEvents', 'true')
          url.searchParams.set('orderBy', 'startTime')
          url.searchParams.set('maxResults', '250')
          if (pageToken) url.searchParams.set('pageToken', pageToken)
          const r = await fetch(url.toString(), { headers: { Authorization: `Bearer ${accessToken}` } })
          if (!r.ok) break // keep whatever we've gathered so far rather than dropping the calendar
          const data = await r.json()
          items.push(...(data.items ?? []))
          pageToken = data.nextPageToken ?? null
          pages++
        } while (pageToken && pages < 20) // safety cap: 20 × 250 = 5000 events/calendar
        const isReadOnly = cal.accessRole === 'reader'
        const isHoliday = cal.id.includes('holiday') || cal.summary?.toLowerCase().includes('holiday')
        return items.map((e) => ({
          ...e,
          _calendarId: cal.id,
          _calendarName: cal.summary,
          _readOnly: isReadOnly,
          _calendarType: isHoliday ? 'holiday' : isReadOnly ? 'subscribed' : 'personal',
        }))
      })
    )

    const allEvents = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
    allEvents.sort((a, b) => {
      const at = a.start?.dateTime ?? a.start?.date ?? ''
      const bt = b.start?.dateTime ?? b.start?.date ?? ''
      return at.localeCompare(bt)
    })
    return res.status(200).json(allEvents)
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
