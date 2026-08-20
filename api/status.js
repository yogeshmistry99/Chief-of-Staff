import { createClient } from '@supabase/supabase-js'
import { monthWindow, summarise } from './_lib/spendReport.js'

// ─── Admin Usage & Cost report ──────────────────────────────────────────────
//
// SECURITY: this is the ONLY place the Anthropic Admin key (sk-ant-admin…) is
// used, and it lives solely in process.env.ANTHROPIC_ADMIN_KEY — a server-side
// Vercel env var with NO `VITE_` prefix, so Vite never inlines it into the
// client bundle. The browser calls this endpoint; this endpoint calls Anthropic
// and returns only aggregated numbers. The key is never in a response.
//
// If the key is absent the endpoint says so plainly ({ available:false }); the
// card degrades to "unavailable" rather than showing a fabricated figure.
//
// No new serverless function: this rides the existing /api/status endpoint via
// ?report=cost, keeping api/*.js at 11/12.

const ANTHROPIC_BASE = 'https://api.anthropic.com/v1/organizations'

// One GET against the Admin API, following pagination up to a small cap. Returns
// the merged payload, or null on any failure (non-200, network, timeout, bad
// JSON) — a null tells the summariser to mark that section unavailable, never 0.
//
// TEMP DIAGNOSTIC (2026-08-20): logs the raw status + body of each request under
// the `[cost-debug]` prefix, and — when `debug` is passed — collects the first
// page's status/body so the caller can return it. Remove once the live beta
// schema is confirmed and the field mapping is corrected.
async function safeGet(path, params, headers, debug) {
  const merged = { data: [] }
  let page = null
  for (let i = 0; i < 6; i += 1) {
    const qs = new URLSearchParams(params)
    if (page) qs.set('page', page)
    const url = `${ANTHROPIC_BASE}/${path}?${qs.toString()}`
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 8000)
    let res
    let bodyText
    try {
      res = await fetch(url, { headers, signal: controller.signal })
      bodyText = await res.text()
    } catch (e) {
      console.error('[cost-debug]', path, 'fetch-threw', e?.message ?? e)
      if (debug) debug.push({ path, error: String(e?.message ?? e) })
      return null
    } finally {
      clearTimeout(timer)
    }
    console.log('[cost-debug]', path, 'status', res.status, 'body', bodyText.slice(0, 2000))
    if (i === 0 && debug) debug.push({ path, status: res.status, body: bodyText.slice(0, 6000) })
    if (!res.ok) return null
    let json
    try { json = JSON.parse(bodyText) } catch { return null }
    if (Array.isArray(json?.data)) merged.data.push(...json.data)
    else return json // unfamiliar envelope — hand it to the summariser to judge
    if (!json.has_more || !json.next_page) break
    page = json.next_page
  }
  return merged
}

async function costReport(req, res) {
  const adminKey = process.env.ANTHROPIC_ADMIN_KEY
  if (!adminKey) {
    return res.status(200).json({ available: false, reason: 'admin-key-missing' })
  }

  const { startingAt } = monthWindow()
  const headers = {
    'x-api-key': adminKey,
    'anthropic-version': '2023-06-01',
  }

  // Diagnostic pass: minimal params (no group_by yet) so the base shape and any
  // 4xx reason come back clean. `?debug=1` echoes the raw first-page bodies.
  const debug = req.query.debug === '1' ? [] : null
  const [cost, usage] = await Promise.all([
    safeGet('cost_report', { starting_at: startingAt, limit: '31' }, headers, debug),
    safeGet('usage_report/messages', { starting_at: startingAt, bucket_width: '1d', limit: '31' }, headers, debug),
  ])

  const body = summarise({ cost, usage }, new Date())
  const out = {
    available: true,
    currency: 'USD',
    fetchedAt: new Date().toISOString(),
    ...body,
  }
  if (debug) out._debug = debug
  return res.status(200).json(out)
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  // The Life OS API bill lives behind ?report=cost.
  if (req.query.report === 'cost') return costReport(req, res)

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
    // Whether the cost dashboard can pull billed figures — drives the card's
    // "connect the admin key" hint without exposing anything about the key.
    anthropicAdmin: !!process.env.ANTHROPIC_ADMIN_KEY,
    todoist:        !!process.env.TODOIST_API_KEY,
    googleCalendar: calendarStatus.connected,
    calendarEmail:  calendarStatus.email,
  })
}
