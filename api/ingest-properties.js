import { createClient } from '@supabase/supabase-js'
import { runIngest } from './_lib/ingest/pipeline.js'
import { DEFAULT_AREA } from './_lib/ingest/config.js'

// Weekly property-market ingestion. Registered as a Vercel cron in vercel.json
// (Mondays 07:00 UTC). Discovers new/changed listings across configured portals,
// deduplicates to permanent P### identities, records every change as history, and
// enriches a bounded batch — all deterministic, NO LLM (zero token cost).
//
// Auth mirrors cron-weekly-backup.js: the Vercel-injected CRON_SECRET bearer for
// scheduled runs, or CRON_SECRET / MCP_API_KEY via ?token= for manual triggers.
//
// This file is the ONE new serverless function; the retired sync-all-buckets.js
// was deleted to keep the Vercel Hobby count at 12/12.

function authorized(req) {
  const bearer = (req.headers['authorization'] ?? '').replace('Bearer ', '')
  const token = req.query.token ?? bearer ?? ''
  const cronSecret = process.env.CRON_SECRET
  const mcpKey = process.env.MCP_API_KEY
  if (cronSecret && (bearer === cronSecret || token === cronSecret)) return true
  if (mcpKey && token === mcpKey) return true
  return false
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (!authorized(req)) return res.status(401).json({ error: 'Unauthorized' })

  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) return res.status(500).json({ error: 'Supabase env vars missing' })

  const sb = createClient(url, key)
  const area = req.query.area || DEFAULT_AREA

  try {
    const result = await runIngest(sb, { area })
    return res.status(result.ok ? 200 : 500).json(result)
  } catch (e) {
    // The pipeline is designed to degrade internally; a throw here is unexpected.
    console.error('ingest failed', e)
    return res.status(500).json({ ok: false, error: e.message })
  }
}
