// The only module that touches push subscription storage.
//
// Modelled on api/_lib/journalRepo.js: every write reads the row back and
// throws if the database did not return it. The stakes are lower here than for
// a journal entry — the worst case is a missed reminder, not lost evidence —
// but the failure mode is the same one this app has form for: telling the user
// something is on when nothing was stored. A toggle that says "reminders on"
// and silently isn't would quietly cost entries on the days they matter.
//
// Takes an injected Supabase client so the browser and the cron function share
// identical semantics.

const COLS = 'endpoint, p256dh, auth, user_agent, created_at, last_seen_at, '
  + 'last_error, failed_at, last_sent_at'

function fail(op, error) {
  throw new Error(`push.${op}: ${error?.message ?? 'unknown error'}`)
}

// A PushSubscription as the browser gives it, reduced to what we send with.
export function toRow(subscription, userAgent = null) {
  const endpoint = subscription?.endpoint
  const p256dh = subscription?.keys?.p256dh
  const auth = subscription?.keys?.auth
  if (!endpoint || !p256dh || !auth) {
    throw new Error('push.toRow: the browser returned an incomplete subscription')
  }
  return { endpoint, p256dh, auth, user_agent: userAgent }
}

// The shape web-push wants back. Kept here so the column names live in exactly
// one place and the cron never hand-assembles it.
export function toSubscription(row) {
  return { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } }
}

// Upsert on endpoint: re-subscribing the same browser refreshes the row rather
// than duplicating it, and clears any recorded failure — a subscription that
// has just been handed to us afresh is by definition not failed.
export async function saveSubscription(sb, subscription, userAgent = null) {
  const row = toRow(subscription, userAgent)
  const now = new Date().toISOString()
  const { data, error } = await sb
    .from('push_subscriptions')
    .upsert({ ...row, last_seen_at: now, last_error: null, failed_at: null },
            { onConflict: 'endpoint' })
    .select(COLS)
    .maybeSingle()

  if (error) fail('saveSubscription', error)
  if (!data) {
    throw new Error('push.saveSubscription: the database returned no row — the subscription was NOT saved')
  }
  return data
}

export async function deleteSubscription(sb, endpoint) {
  const { error } = await sb.from('push_subscriptions').delete().eq('endpoint', endpoint)
  if (error) fail('deleteSubscription', error)
  return true
}

export async function getSubscription(sb, endpoint) {
  const { data, error } = await sb
    .from('push_subscriptions').select(COLS).eq('endpoint', endpoint).maybeSingle()
  if (error) fail('getSubscription', error)
  return data ?? null
}

export async function listSubscriptions(sb) {
  const { data, error } = await sb
    .from('push_subscriptions').select(COLS).order('created_at', { ascending: true })
  if (error) fail('listSubscriptions', error)
  return data ?? []
}

// Whether a send failure means the subscription is permanently gone.
//
// 404 and 410 are the push protocol's way of saying "this endpoint no longer
// exists" — the row is dead and should go. EVERYTHING ELSE (network blip, 429,
// 500 from the push service) is transient, and deleting on those would
// unsubscribe the user's only device because of someone else's outage.
export function isGone(statusCode) {
  return statusCode === 404 || statusCode === 410
}

// Record the outcome of a send. Never throws: a failure to write bookkeeping
// must not abort the run and stop the remaining devices being notified.
export async function recordSendResult(sb, endpoint, { ok, error, statusCode }) {
  const now = new Date().toISOString()
  try {
    if (ok) {
      await sb.from('push_subscriptions')
        .update({ last_sent_at: now, last_error: null, failed_at: null })
        .eq('endpoint', endpoint)
      return 'sent'
    }
    if (isGone(statusCode)) {
      await deleteSubscription(sb, endpoint)
      return 'removed'
    }
    await sb.from('push_subscriptions')
      .update({ last_error: String(error ?? `status ${statusCode}`), failed_at: now })
      .eq('endpoint', endpoint)
    return 'failed'
  } catch (e) {
    console.warn('[push] could not record send result for', endpoint, e.message)
    return ok ? 'sent' : 'failed'
  }
}
