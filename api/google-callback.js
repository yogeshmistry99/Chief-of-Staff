// Handles Google OAuth 2.0 callback — exchanges code for tokens, stores in Supabase
import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

export default async function handler(req, res) {
  const appUrl = process.env.APP_URL ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:5173')
  const { code, state, error: oauthError } = req.query

  // Google reported an error (user denied, etc.)
  if (oauthError) {
    return res.redirect(302, `${appUrl}/settings?calendar_error=${encodeURIComponent(oauthError)}`)
  }

  if (!code) {
    return res.redirect(302, `${appUrl}/settings?calendar_error=no_code`)
  }

  // Decode the return path from state — must be a relative path to prevent open redirect
  let returnTo = '/settings'
  try {
    const decoded = JSON.parse(Buffer.from(state, 'base64url').toString())
    if (typeof decoded.returnTo === 'string' && decoded.returnTo.startsWith('/')) {
      returnTo = decoded.returnTo
    }
  } catch {}

  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } = process.env
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    return res.redirect(302, `${appUrl}/settings?calendar_error=missing_credentials`)
  }

  const redirectUri = `${appUrl}/api/google-callback`

  try {
    // Exchange authorization code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    })
    const tokens = await tokenRes.json()
    if (!tokenRes.ok || !tokens.refresh_token) {
      const detail = tokens.error_description ?? tokens.error ?? 'token_exchange_failed'
      return res.redirect(302, `${appUrl}/settings?calendar_error=${encodeURIComponent(detail)}`)
    }

    // Fetch the connected account email
    const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    })
    const userInfo = userRes.ok ? await userRes.json() : {}

    // Persist to Supabase
    const sb = getSupabase()
    if (!sb) {
      return res.redirect(302, `${appUrl}/settings?calendar_error=supabase_not_configured`)
    }
    await sb.from('app_data').upsert({
      key: 'google_calendar_auth',
      value: {
        refresh_token: tokens.refresh_token,
        access_token: tokens.access_token,
        expiry_date: tokens.expires_in ? Date.now() + tokens.expires_in * 1000 : null,
        email: userInfo.email ?? null,
      },
      updated_at: new Date().toISOString(),
    })

    return res.redirect(302, `${appUrl}${returnTo}?calendar_connected=1`)
  } catch (err) {
    console.error('OAuth callback error:', err)
    return res.redirect(302, `${appUrl}/settings?calendar_error=${encodeURIComponent(err.message)}`)
  }
}
