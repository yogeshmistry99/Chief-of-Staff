// Removes stored Google OAuth tokens — disconnects Calendar
import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).end()

  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) return res.status(500).json({ error: 'Supabase not configured' })

  const sb = createClient(url, key)

  // Optionally revoke the token with Google so it can't be reused
  try {
    const { data } = await sb.from('app_data').select('value').eq('key', 'google_calendar_auth').single()
    const token = data?.value?.access_token ?? data?.value?.refresh_token
    if (token) {
      await fetch(`https://oauth2.googleapis.com/revoke?token=${token}`, { method: 'POST' }).catch(() => {})
    }
  } catch {}

  await sb.from('app_data').delete().eq('key', 'google_calendar_auth')
  return res.status(200).json({ ok: true })
}
