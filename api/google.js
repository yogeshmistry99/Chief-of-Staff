import { getSupabase, getStoredAuth, hasDriveScope, SCOPES, AUTH_KEY } from './_lib/google.js'

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
  if (action === 'disconnect') return disconnect(req, res)
  return startAuth(req, res)
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
