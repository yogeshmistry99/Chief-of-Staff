import { useCallback, useEffect, useState } from 'react'
import {
  fetchSpendReport, fmtUsd, fmtGbpEstimate, GBP_RATE_NOTE,
} from '../lib/spend'

// Two meters, kept visibly separate because confusing them is the actual problem
// this solves:
//   1. Claude subscription — this chat, Claude Code, the mobile app. A rolling
//      5-hour limit + weekly cap, available from NO public API. Explained, linked
//      out, and NEVER given a number — a fabricated percentage here is the whole
//      trap.
//   2. Anthropic API spend — what Life OS itself costs to run. Real, billed,
//      and the substance of the dashboard.

const money = 'tabular-nums'

// ─── Meter 1 ────────────────────────────────────────────────────────────────
export function SubscriptionCard() {
  return (
    <div className="rounded-2xl border border-[#B3C5E8] bg-[#EEF3FB] px-4 py-3.5 mt-2">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[15px]">👤</span>
        <p className="text-sm font-semibold text-[#1C1B1F]">Claude subscription</p>
      </div>
      <p className="text-[11px] text-[#49454F] leading-relaxed">
        This chat, Claude Code and the mobile app share a rolling <strong>5-hour session
        limit</strong> plus a <strong>weekly cap</strong>. This is a different meter from the API
        bill below, and no public API exposes it — so it isn’t shown here as a number.
      </p>
      <a
        href="https://claude.ai/settings/usage"
        target="_blank" rel="noopener noreferrer"
        className="inline-block mt-2 text-[11px] font-medium text-[#2A78D6] underline"
      >
        Check it in the Claude app → Settings → Usage ↗
      </a>
    </div>
  )
}

// A labelled local-estimate line, shown ONLY when the billed figure can't be had.
// Never dressed up as the real number — it says where it comes from.
function LocalEstimate({ usd }) {
  if (usd == null || !Number.isFinite(usd)) return null
  return (
    <p className="text-[11px] text-[#79747E] mt-2 leading-relaxed">
      Our own running estimate, from the app’s token log — <strong>not billed</strong>:{' '}
      <span className={money}>{fmtUsd(usd)}</span> {fmtGbpEstimate(usd)} <span className="text-[#938F99]">({GBP_RATE_NOTE})</span>
    </p>
  )
}

function Unavailable({ children }) {
  return <p className="text-[11px] text-[#79747E] leading-relaxed">{children}</p>
}

// ─── Meter 2 ────────────────────────────────────────────────────────────────
export function ApiSpendCard({ spendLimitUsd = 20, localEstimateUsd = null }) {
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)
  const [detailsOpen, setDetailsOpen] = useState(false)

  // Fetch on mount. This card is lazily mounted on section-open, so mount ==
  // open — matching every other surface: fetch on open, plus the Update button.
  // No polling.
  const load = useCallback(async () => {
    setLoading(true)
    setReport(await fetchSpendReport())
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  const spend = report?.spend
  const cache = report?.cache
  const tokens = report?.tokens
  const spendUsd = spend?.available ? spend.amountUsd : null
  const pct = spendUsd != null && spendLimitUsd > 0
    ? Math.min(100, (spendUsd / spendLimitUsd) * 100)
    : 0

  return (
    <div className="rounded-2xl border border-[#CAC4D0] bg-white px-4 py-3.5 mt-3">
      <div className="flex items-start justify-between gap-3 mb-1">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[#1C1B1F]">Life OS API spend</p>
          <p className="text-[11px] text-[#79747E] leading-tight">
            Anthropic API · what Life OS costs to run · billed figures
          </p>
        </div>
        <button
          onClick={() => load()}
          disabled={loading}
          className="text-[11px] font-medium px-3 py-1.5 rounded-full bg-[#EADDFF] text-[#6750A4] disabled:opacity-50 flex-shrink-0"
        >
          {loading ? 'Updating…' : 'Update'}
        </button>
      </div>

      {loading && !report ? (
        <p className="text-[11px] text-[#79747E] py-2">Loading billed figures…</p>
      ) : report?.available === false ? (
        // Endpoint reachable, but the admin key isn't configured (or the response
        // was unusable). Say which, plainly, and fall back to the labelled estimate.
        <div className="py-1">
          <Unavailable>
            {report.reason === 'admin-key-missing'
              ? 'Billed figures need an Anthropic Admin key. Add ANTHROPIC_ADMIN_KEY as a server-side Vercel environment variable (never a VITE_ variable), then tap Update.'
              : report.reason === 'admin-key-rejected'
                ? 'Anthropic rejected the Admin key (401). Check ANTHROPIC_ADMIN_KEY in Vercel: it must be an Admin key (sk-ant-admin…), with no surrounding spaces, quotes or newline, set for the Production environment — then redeploy and tap Update.'
                : 'Anthropic billing data is unavailable right now.'}
          </Unavailable>
          <LocalEstimate usd={localEstimateUsd} />
        </div>
      ) : (
        <>
          {/* ── Top: spend vs budget ── */}
          {spend?.available ? (
            <>
              <div className="flex items-end justify-between gap-2 mt-2 mb-1">
                <div className="min-w-0">
                  <span className={`text-3xl font-bold text-[#1C1B1F] ${money}`}>{fmtUsd(spendUsd)}</span>
                  <span className="text-sm text-[#79747E] ml-1">USD</span>
                </div>
                <span className="text-xs text-[#79747E] flex-shrink-0">
                  / {fmtUsd(spendLimitUsd)} budget
                </span>
              </div>
              <p className="text-[11px] text-[#6750A4] mb-1.5">
                {fmtGbpEstimate(spendUsd)} <span className="text-[#938F99]">({GBP_RATE_NOTE})</span>
              </p>

              <div className="h-2 rounded-full bg-[#F3EDF7] overflow-hidden mb-1">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${pct}%`, backgroundColor: pct >= 90 ? '#B3261E' : pct >= 70 ? '#E8A000' : '#6750A4' }}
                />
              </div>
              <div className="flex justify-between text-[11px] text-[#79747E]">
                <span>{pct.toFixed(0)}% of budget</span>
                {report.dayOfMonth != null && report.daysInMonth != null && (
                  <span>Day {report.dayOfMonth} of {report.daysInMonth}</span>
                )}
              </div>
            </>
          ) : (
            <div className="py-1">
              <Unavailable>Actual billed spend is unavailable — the cost report returned an unexpected shape.</Unavailable>
              <LocalEstimate usd={localEstimateUsd} />
            </div>
          )}

          {/* ── Cache saving — kept at the top on purpose: a mis-set breakpoint
               cost 6× per message and was invisible until audited. ── */}
          {cache?.available && (
            <div className="mt-3 pt-3 border-t border-[#F3EDF7]">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] text-[#49454F]">
                  Cached input
                  {cache.cachedInputPct != null && (
                    <span className="font-semibold text-[#1C1B1F]"> {cache.cachedInputPct.toFixed(0)}%</span>
                  )}
                </p>
                <p className="text-[11px] text-[#1B5E20]">
                  saving ~<span className={money}>{fmtUsd(cache.savingUsd)}</span> <span className="text-[#79747E]">est.</span>
                </p>
              </div>
              <p className="text-[10px] text-[#938F99] mt-0.5">
                Share of input tokens served from cache this month, and the list-price saving it bought.
              </p>
            </div>
          )}

          {/* ── Tap-through: token dimensions, by-model, and the per-surface note ── */}
          <button
            onClick={() => setDetailsOpen((o) => !o)}
            className="mt-3 text-[11px] font-medium text-[#6750A4] underline"
          >
            {detailsOpen ? 'Hide breakdown ▲' : 'Breakdown by model ▼'}
          </button>

          {detailsOpen && (
            <div className="mt-2">
              {tokens?.available ? (
                <div className="grid grid-cols-2 gap-1.5 mb-3">
                  {[
                    ['Input (uncached)', tokens.uncachedInput],
                    ['Cache read', tokens.cacheRead],
                    ['Cache write', tokens.cacheWrite],
                    ['Output', tokens.output],
                  ].map(([label, v]) => (
                    <div key={label} className="rounded-xl bg-[#F7F2FA] px-2.5 py-1.5">
                      <p className="text-[9px] text-[#79747E] leading-tight">{label}</p>
                      <p className={`text-[12px] font-semibold text-[#1C1B1F] ${money}`}>
                        {Number(v ?? 0).toLocaleString()}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <Unavailable>Token breakdown unavailable.</Unavailable>
              )}

              {report.byModel?.length > 0 && (
                <div className="mb-2">
                  {report.byModel.map((m) => (
                    <div key={m.model} className="flex items-baseline justify-between gap-3 py-1 border-b border-[#F3EDF7] last:border-0">
                      <span className="text-[11px] text-[#1C1B1F] capitalize">{m.model}</span>
                      <span className="text-[10px] text-[#79747E] flex-1 text-right truncate">
                        {(m.uncachedInput + m.cacheRead).toLocaleString()} in · {Number(m.output).toLocaleString()} out
                      </span>
                      <span className={`text-[11px] text-[#1C1B1F] ${money} flex-shrink-0`}>
                        {fmtUsd(m.estCostUsd)} <span className="text-[#79747E] font-normal">est.</span>
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Honest about what can't be split. */}
              <p className="text-[10px] text-[#79747E] leading-relaxed mt-2">
                Per-surface split (Chief of Staff · Heads · Discussions · Journal) isn’t available:
                every call uses one API key and one workspace, which are the only dimensions
                Anthropic’s usage API separates. The breakdown above is by model, and per-model
                cost is estimated from list prices — the tokens are billed, the split isn’t.
              </p>
            </div>
          )}

          {report.fetchedAt && (
            <p className="text-[10px] text-[#938F99] mt-3">
              As of {new Date(report.fetchedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
            </p>
          )}
        </>
      )}
    </div>
  )
}

export default function SpendCards(props) {
  return (
    <>
      <SubscriptionCard />
      <ApiSpendCard {...props} />
    </>
  )
}
