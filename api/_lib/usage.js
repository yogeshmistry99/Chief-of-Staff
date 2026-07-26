import { createClient } from '@supabase/supabase-js'
import { costOf, bucketOf } from './pricing.js'

// Server-side AI spend accumulator. Every path that spends the account's
// ANTHROPIC_API_KEY (CoS/Head chat, refreshes, task scoring, backlog) funnels
// its token usage through recordUsage, which atomically increments a monthly
// row in Supabase app_data. This is the single source of truth the Settings
// "AI Spend" widget reads — it captures browser-triggered *and* server- or
// MCP-triggered calls, which the old per-browser localStorage tracker could not.

function usageKey(d = new Date()) {
  return `ai_usage_${d.getFullYear()}_${String(d.getMonth() + 1).padStart(2, '0')}`
}

function getSupabase() {
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

// Normalize an Anthropic `usage` object (or already-normalized totals) into the
// four token dimensions we price. Accepts both the raw API field names and the
// short names used when aggregating across streamed rounds.
function normalize(u = {}) {
  return {
    input:      u.input      ?? u.input_tokens                 ?? 0,
    output:     u.output     ?? u.output_tokens                ?? 0,
    cacheWrite: u.cacheWrite ?? u.cache_creation_input_tokens  ?? 0,
    cacheRead:  u.cacheRead  ?? u.cache_read_input_tokens      ?? 0,
  }
}

// Record one call's usage. Never throws — spend tracking must not break the
// call it is measuring. Awaited by callers so the write completes before the
// serverless function returns (un-awaited promises can be frozen post-response).
export async function recordUsage(model, usage) {
  try {
    const sb = getSupabase()
    if (!sb) return
    const t = normalize(usage)
    if (!t.input && !t.output && !t.cacheWrite && !t.cacheRead) return
    const cost = costOf(model, t)
    const { error } = await sb.rpc('bump_ai_usage', {
      p_key:        usageKey(),
      p_model:      bucketOf(model),
      p_input:      t.input,
      p_output:     t.output,
      p_cache_write: t.cacheWrite,
      p_cache_read:  t.cacheRead,
      p_cost:       cost,
    })
    if (error) console.warn('recordUsage rpc failed:', error.message)
  } catch (e) {
    console.warn('recordUsage failed:', e?.message ?? e)
  }
}
