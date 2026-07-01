import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  // Check Google Calendar connection status from Supabase
  let calendarStatus = { connected: false, email: null }
  try {
    const url = process.env.VITE_SUPABASE_URL
    const key = process.env.VITE_SUPABASE_ANON_KEY
    if (url && key) {
      const sb = createClient(url, key)
      const { data } = await sb.from('app_data').select('value').eq('key', 'google_calendar_auth').single()
      if (data?.value?.refresh_token) {
        calendarStatus = { connected: true, email: data.value.email ?? null }
      }
    }
  } catch {}

  res.status(200).json({
    anthropic:      !!process.env.ANTHROPIC_API_KEY,
    todoist:        !!process.env.TODOIST_API_KEY,
    googleCalendar: calendarStatus.connected,
    calendarEmail:  calendarStatus.email,
  })
}
