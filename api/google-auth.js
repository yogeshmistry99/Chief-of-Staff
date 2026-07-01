// Initiates Google OAuth 2.0 flow — redirects user to Google consent screen
export default function handler(req, res) {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } = process.env
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    return res.status(500).json({ error: 'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set in Vercel environment variables.' })
  }

  const appUrl = process.env.APP_URL ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:5173')
  const redirectUri = `${appUrl}/api/google-callback`

  // Pass the return path through state so we can redirect back after auth
  const returnTo = req.query.return ?? '/settings'
  const state = Buffer.from(JSON.stringify({ returnTo })).toString('base64url')

  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/userinfo.email',
    access_type: 'offline',
    prompt: 'consent',   // always request refresh token
    state,
  })

  res.redirect(302, `https://accounts.google.com/o/oauth2/v2/auth?${params}`)
}
