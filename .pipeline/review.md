# Audit Review — Chief of Staff
Reviewer verdict for morning review. Date: 2026-06-26

## VERDICT: NEEDS WORK

The planner's spec is high quality: I spot-checked the top findings (S1, S2, B5, B8, DC3) against the actual source and all reproduce exactly as described, with correct file/line citations. No false positives in the sampled set. The blocking concern is security (S1/S2), not correctness of the audit itself.

There is one HIGH security issue that must be fixed before this is considered shippable to anything beyond a single trusted user. Everything else is real but non-blocking. Hence NEEDS WORK rather than BLOCK (the app runs; it is not broken) and not SHIP (open-CORS secret-proxying is not acceptable to leave as-is).

Note on scope: the recent commits (HEAD~5..HEAD) only touch Settings cost calc, BottomNav, claude.js timeout, and the pipeline scaffolding — none of them address or worsen the findings below. The findings are pre-existing.

---

## HIGH

### S1 — Open CORS + no auth on secret-proxying API routes  (CONFIRMED)
- Files: `api/claude.js:274`, `api/calendar.js:2`, `api/todoist.js:2`, `api/status.js:2`, `api/mcp.js:306`
- Verified: `api/todoist.js:2` and `api/claude.js:274` both set `Access-Control-Allow-Origin: *` with no token check. These routes use server-side `ANTHROPIC_API_KEY` / `TODOIST_API_KEY` / Google Calendar creds. Any origin can drive the owner's paid Anthropic account and read/write their calendar and tasks.
- Fix: restrict `Allow-Origin` to the app's deployed origin, AND require a shared-secret header on `claude`, `calendar`, `todoist`, `status` (mirror the `MCP_API_KEY` pattern already in `api/mcp.js`). CORS alone does not stop direct (non-browser) calls — the token is the real control.

### S2 — `api/todoist.js` is an open path-proxy  (CONFIRMED)
- File: `api/todoist.js:11-13`
- Verified: `const { path = 'tasks', ...params } = req.query` is interpolated raw into `https://api.todoist.com/api/v1/${path}`. With S1's open CORS this is an open proxy into the owner's Todoist account.
- Fix: allow-list `path` (`tasks`, `sections`, `tasks/:id`, `tasks/:id/close`) and reject anything else with 400. Pairs with the S1 token fix.

---

## MEDIUM

### B5 — Home and ChiefPage share localStorage key `cos_home_messages`  (CONFIRMED)
- `src/pages/Home.jsx:646,725` and `src/pages/ChiefPage.jsx:29,97` read/write the identical key with different save-filters. Chat history bleeds between the two surfaces and they overwrite each other.
- Fix: give ChiefPage a distinct key (e.g. `cos_chief_messages`) unless the cross-surface shared thread is intentional — if intentional, unify the save filter so neither truncates the other's history.

### B8 — `update_task` reports "verified" but never persists to Todoist  (CONFIRMED)
- `api/claude.js:172-188`. Verified: it mutates only the in-memory `tasks` copy and returns `{ success: true, verified: {...} }`. Unlike `complete_task` (`:155-168`, which calls Todoist `/close`), it never writes to Todoist. The model tells the user the edit is "verified" while Todoist is untouched; the change is lost on next sync.
- Fix: either make `update_task` issue the Todoist POST to `tasks/:id` (consistent with `complete_task`), or stop returning the word "verified" and document that updates are local-only via the `tasks_updated` → Supabase path. Do not claim verification you did not perform.

### B1 — Dev server (`server.js`) routes diverge from prod API
- `server.js:20,39` expose `/api/ai` and a `/api/todoist` POST contract that don't match the client (`/api/claude`, `GET /api/todoist?path=`). Stale/misleading; running via `server.js` breaks Claude/Todoist/Calendar.
- Fix: either align `server.js` with the Vercel `api/*` handlers or delete it and document `vercel dev` as the dev workflow.

### DC3 — `StepSummary` references undefined `bucket`  (CONFIRMED)
- `src/pages/WeeklyReview.jsx:329` — `<QuickAdd ... initialBucket={bucket} />`. Verified `StepSummary`'s signature (`:195`) is `{ intention, bucketReviews, allTasks, onNext, setTasksAdded }` — no `bucket`. (`quickAddOpen`/`setQuickAddOpen` DO exist at `:200`, so the spec's note on those is the only minor over-statement.) `bucket` is `undefined` and only works because `QuickAdd`'s `initialBucket` default fires on `undefined`.
- Fix: pass a real default, e.g. `initialBucket="Work"`, or remove the prop.

### P1 — Repeated `JSON.parse(localStorage...)` inside list renders
- `src/pages/BucketDetail.jsx:311-314,721,1027,1040`, `src/pages/Buckets.jsx:11,14`, `src/pages/Home.jsx:447,789`. O(rows × parse) on every render.
- Fix: lift reads to state / `useMemo`; parse once per render and pass down.

### DC1 — `src/pages/Chat.jsx` is unused, stubbed
- Not routed anywhere; superseded by ChiefPage/Home chat. Safe to delete.

---

## LOW (acknowledged, not blocking)

The spec's LOW items are sound and correctly cited. Grouped for the human, no per-item re-verification needed:
- Security/data: S3 dev proxy unauth, S4 committed personal data + project IDs, C1 migration skips task cache/notifications, C5 fire-and-forget close with no reconciliation.
- Bugs: B2 `getTabIdx` -1 (clamp to >=0), B4 stale-closure useEffect deps, B6/B7 notif "Respond"/accept UX gaps, B9 calendar verify window TZ edge, B10 `task.due.date` needs optional chaining, B11 hard-coded `Europe/London`, B12 duplicated `extractJSON`, B13 calendar fetch window perf.
- Perf: P2/P3 repeated discussion/headConfig parses per row, P5 swallowed SSE parse errors.
- Dead code/style: DC2 unused Home state/refs, DC4 unused `useCallback`/`BUCKET_WEIGHTS` in BucketDetail, DC8 dead TaskEditSheet swipe-nav, DC9/DC10 unused exports, C2 cost mis-attribution of Opus→haiku bucket, C3 priority-mapping two sources of truth, C4 markdown parser limits.
- Process: no ESLint config; adding `eslint-plugin-react-hooks` + `no-unused-vars` auto-catches B4/DC2/DC4.

---

## FIX THIS FIRST (top 5)

1. **S1** — Add a shared-secret/auth check + tighten `Allow-Origin` on `api/claude.js`, `api/calendar.js`, `api/todoist.js`, `api/status.js`. (HIGH, security, leaks paid creds.)
2. **S2** — Allow-list `path` in `api/todoist.js:11`. (HIGH, open proxy; trivial fix.)
3. **B8** — Make `api/claude.js:172-188` `update_task` either persist to Todoist or stop reporting "verified". (MEDIUM, data integrity + misleading the user.)
4. **B5** — Split the `cos_home_messages` key between Home and ChiefPage. (MEDIUM, data loss between surfaces.)
5. **DC3 + DC1** — Fix undefined `bucket` at `WeeklyReview.jsx:329`; delete dead `Chat.jsx`. (MEDIUM, latent bug + cleanup, both cheap.)

## Why not SHIP / why not BLOCK
- Not SHIP: leaving owner's Anthropic/Calendar/Todoist behind open CORS with no auth (S1/S2) is unacceptable to defer.
- Not BLOCK: the app is functional and the audit is accurate; tests-green-but-code-wrong does not apply (this is a findings audit, no behavioural regression introduced by recent commits). Fix S1/S2 and the MEDIUMs, then re-review.
