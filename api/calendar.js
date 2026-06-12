export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN } = process.env
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN) {
    return res.status(500).json({ error: 'Google Calendar not configured. Add GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and GOOGLE_REFRESH_TOKEN in Vercel.' })
  }

  // Exchange refresh token for access token
  let accessToken
  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        refresh_token: GOOGLE_REFRESH_TOKEN,
        grant_type: 'refresh_token',
      }),
    })
    const tokenData = await tokenRes.json()
    if (!tokenRes.ok) return res.status(500).json({ error: 'Failed to refresh Google token', detail: tokenData })
    accessToken = tokenData.access_token
  } catch (err) {
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

  // Fetch events (GET)
  const { start, end } = req.query
  const url = new URL(BASE_CAL)
  if (start) url.searchParams.set('timeMin', start)
  if (end) url.searchParams.set('timeMax', end)
  url.searchParams.set('singleEvents', 'true')
  url.searchParams.set('orderBy', 'startTime')
  url.searchParams.set('maxResults', '50')

  try {
    const eventsRes = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    const data = await eventsRes.json()
    if (!eventsRes.ok) return res.status(eventsRes.status).json(data)
    res.status(200).json(data.items ?? [])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
