# Code Quality Review — Chief of Staff (Life OS)

Review-only spec. Each finding lists: file path, line(s), issue, severity. No features to add; report findings only. Where a fix is obvious and low-risk, the recommended change is noted, but the Coder should treat this primarily as a findings report and apply fixes only if explicitly instructed.

Severity key: LOW (cosmetic / no runtime effect), MEDIUM (real bug risk, perf, or correctness in edge cases), HIGH (security or data-integrity / likely user-facing bug).

---

## SECURITY CONCERNS

### S1 — CORS `Access-Control-Allow-Origin: *` on all serverless functions — HIGH
- `api/claude.js:274`, `api/calendar.js:2`, `api/todoist.js:2`, `api/status.js:2`, `api/mcp.js:306`
- Every API route sets `Access-Control-Allow-Origin: *`. These endpoints proxy authenticated calls to Anthropic, Google Calendar, and Todoist using server-side secrets. Any website can call them from a user's browser (or directly) and consume the owner's Anthropic credits / read-write the owner's calendar and tasks. There is no per-request auth on `claude`, `calendar`, `todoist`, or `status`.
- Recommendation: restrict `Allow-Origin` to the known app origin(s), and/or add a shared-secret/auth check. `api/mcp.js` already supports a `MCP_API_KEY` token — the other routes have nothing.

### S2 — `api/todoist.js` proxies arbitrary `path` to the Todoist API — MEDIUM
- `api/todoist.js:11-16`
- `path` comes straight from `req.query` and is interpolated into `https://api.todoist.com/api/v1/${path}`. Combined with S1 (open CORS) this is an open proxy to the owner's Todoist account for any method the handler forwards. Validate `path` against an allow-list of expected endpoints (`tasks`, `sections`, `tasks/:id`, `tasks/:id/close`).

### S3 — `server.js` dev proxy is unauthenticated and uses wildcard route — LOW
- `server.js:39-55`, `57-59`
- `/api/ai` forwards request body verbatim to Anthropic with the server key, no auth. This is the local Express dev server (prod uses Vercel functions), so impact is limited, but note the dev server and the Vercel `api/*` handlers diverge (`/api/ai` here vs `/api/claude` in prod) — see B1.

### S4 — Secrets / personal data committed in source — LOW
- `src/lib/todoist.js:3-11`, `api/mcp.js:4-12` (Todoist project IDs), `src/pages/HeadConfig.jsx:18-56` (real names, family members, advisor names baked into `DEFAULT_CONTEXT`).
- Not credentials, but hard-coded personal/identifying data and account-specific project IDs in the repo. Flag for awareness; not a code defect.

---

## POTENTIAL BUGS

### B1 — Dev server route names do not match production API — MEDIUM
- `server.js:20` (`/api/todoist` expects `{ path, method, body }` in the POST body) vs `src/lib/todoist.js:13-17` (client calls `GET /api/todoist?path=...` with query params).
- `server.js:39` exposes `/api/ai`, but the client (`src/lib/claude.js:42,84`) calls `/api/claude`. The Express dev server does not implement `/api/claude`, `/api/calendar`, `/api/status`, or `/api/mcp`, and its `/api/todoist` contract differs from the client's. Running via `server.js` will break Todoist/Claude/Calendar calls. Confirm intended dev workflow (likely `vercel dev`); either way `server.js` is stale/misleading.

### B2 — `getTabIdx` can return -1 and break the swipe transform — MEDIUM
- `src/App.jsx:24-27`, used at `46`, `118`
- For a sub-route that is rendered through `TabStrip` path matching, `TABS.findIndex(...)` returns -1 when no tab matches, making `translatePct = -(-1*100)+...` = +100 and shifting the strip off screen. In practice `isSubRoute` guards most cases, but any top-level path not in `TABS` and not a sub-route (e.g. an unknown `/foo`) renders TabStrip with idx -1. Clamp idx to >= 0.

### B3 — Home `inputRef`, `inputHoldRef`, `quickAddOpen` are dead state/refs — LOW (see DC2) but `scrollRef`/`chatScrollRef` interplay is fragile — LOW
- `src/pages/Home.jsx:658-662`. `inputRef`, `inputHoldRef` are never attached. `quickAddOpen` is always false (QuickAdd never opened from Home — `setQuickAddOpen` never called). See dead-code section.

### B4 — `useEffect` missing dependencies / stale closures around `removing` and swipe handlers — LOW
- `src/pages/Home.jsx:262-269`, `src/pages/BucketDetail.jsx:438-446`
- The `removing` effect calls `onComplete(localTask.id)` but lists only `[removing]` as deps; `onComplete`/`localTask` are captured from first render. Works today because `localTask.id` is stable and `onComplete` is stable-ish, but it is a latent stale-closure bug if those props start changing. ESLint exhaustive-deps would flag. Same pattern in `App.jsx:49-116` (`onMove`/`onEnd` close over `TABS.length` constant — fine — but `navigate` is the only dep).

### B5 — `ChiefPage` and `Home` share the same localStorage key `cos_home_messages` — MEDIUM
- `src/pages/Home.jsx:646,725` and `src/pages/ChiefPage.jsx:29,97`
- Both the Home "Chief of Staff" tab and the standalone `/chief` page read and write `cos_home_messages`. Messages bleed between the two surfaces and one can overwrite the other's history (Home saves filtered messages on every `messages` change; ChiefPage does the same with a different filter). Confirm intended; if not, give them distinct keys.

### B6 — `handleRespond` / notif "Respond" pushes a user message but never sends it — LOW
- `src/pages/BucketDetail.jsx:943-949`, `src/pages/ChiefPage.jsx:211-214`, `src/pages/Home.jsx:543-546`
- "Respond" appends a `{ role: 'user', content: 'Re: ...' }` message to chat state but does not trigger `sendMessageStream`, so no assistant reply is generated (Home's version navigates with `initialMessage` which IS sent in ChiefPage's mount effect — inconsistent behaviour between surfaces). Verify intended UX.

### B7 — `acceptNotification` writes a local task but Home/Bucket lists may not re-render it — LOW
- `src/lib/notifications.js:27-45`
- `acceptNotification` calls `saveToCache` directly; the component only calls `refreshNotifs()` afterward, not a task refresh. The newly created task won't appear until the page re-reads the cache. Minor UX gap.

### B8 — `update_task` in `api/claude.js` ignores `project_name` and never persists to Todoist — MEDIUM
- `api/claude.js:172-188`
- The streaming/agentic `update_task` tool only mutates the in-memory `tasks` array (content/priority/due) and returns "verified" — but unlike `complete_task` (which calls Todoist `/close`), it never writes the change to Todoist or Supabase. The model is told the update is "verified" while the source of truth is untouched, so updates silently fail to persist across a sync. Confirm whether this is intentional (client persists via `tasks_updated`) — `claude.js:405` does emit `tasks_updated`, and `Home.jsx:740` saves to cache, so it reaches Supabase but never Todoist. Document the divergence; `complete_task` persists to Todoist, `update_task`/`create_task` do not.

### B9 — `create_calendar_event` verification window can miss events — LOW
- `api/claude.js:218-223`
- Verification re-fetches only the single `input.date` day. An all-day or time-zone-edge event created near midnight could fall outside the `new Date(input.date).toISOString()` → `+T23:59:59` window (which is computed in the server's local zone, not Europe/London), causing a false "could not be verified" error. Low frequency.

### B10 — Date string comparison assumes `due.date` is always present — LOW
- `src/lib/todoist.js:64,70` (`task.due.date.slice(...)`), `src/lib/priority.js:32` (`task.due.date.slice`)
- These guard `if (!task.due)` but then access `task.due.date` unconditionally. A task with `due` set but `due.date` null/undefined (e.g. datetime-only) throws. Todoist v1 generally returns `date`, but the `TaskItem` rendering paths handle `due.datetime` separately, implying datetime-only is possible. Use optional chaining `task.due.date?.slice(...)`.

### B11 — `formatTime`/timezone: `'Europe/London'` hard-coded in API but client uses local — LOW
- `api/claude.js:24`, `src/lib/calendarUtils.js:22`, `src/lib/claude.js:144`
- Event creation forces `Europe/London`; client rendering uses the browser locale/zone. For a user outside the UK this produces inconsistent times. Acceptable if single-user UK, but flag.

### B12 — `extractJSON` duplicated and slightly divergent — LOW
- `src/pages/BucketDetail.jsx:20-30` and `src/pages/ChiefPage.jsx:15-22` are near-identical copies. Risk of divergence; candidate for extraction to `src/lib`.

### B13 — `Math.min(weekViewStart, monthViewStart)` event window can be very large — LOW (perf)
- `src/pages/Calendar.jsx:257-268`
- Each calendar fetch spans the union of week and month windows and re-fires on every `monthOffset`/`weekOffset` change, refetching all calendars (`api/calendar.js` fans out to every calendar, `maxResults: 50` each). Frequent navigation = many multi-calendar round trips. Consider caching by window.

---

## PERFORMANCE ISSUES

### P1 — `getNotifications()` / `getDiscussions()` / `getCachedTasks()` called repeatedly during render — MEDIUM
- `src/pages/BucketDetail.jsx:311-314` (`getNotifications()` inside `TasksTab` body on every render), `:721` (`getDiscussions` in `ArchivedSection` body), `:1027,1040` (`getNotifications()` re-parsed inside the tabs IIFE on every render), `src/pages/Buckets.jsx:11,14` (parses full task cache + notifications on every render), `src/pages/Home.jsx:447,789` (`findDiscussionByTask`/`loadHeadConfig` called inside row render and JSX).
- Each call does `JSON.parse(localStorage.getItem(...))`. In lists this is O(rows × parse). Memoize with `useMemo` or lift reads to state.

### P2 — `findDiscussionByTask(bucket, localTask.id)` called twice per task row render — LOW
- `src/pages/Home.jsx:447`, `src/pages/BucketDetail.jsx:627` — each invocation re-parses `cos_discussions_<bucket>` from localStorage for every visible task row. Parse once per render and pass down.

### P3 — `loadHeadConfig('chief')` called 2–3× per render in JSX — LOW
- `src/pages/Home.jsx:789`, `src/pages/ChiefPage.jsx:128`, `src/pages/BucketDetail.jsx:83` — reads 4 localStorage keys + JSON.parse each call. Compute once.

### P4 — Large inline `QUOTES` array recreated/parsed fine but `getDailyQuote` recomputed — LOW
- `src/pages/Home.jsx:553-615` — array is module-level (good). `DailyQuote` recomputes `getDailyQuote()` each render; trivial cost, no action needed beyond noting.

### P5 — Streaming SSE parser swallows all JSON errors — LOW
- `src/lib/claude.js:75-77`, `api/claude.js:370` — bare `catch {}` around per-event parsing hides malformed frames. Acceptable for partial-frame buffering, but it also hides genuine bugs. Consider distinguishing partial-frame from real errors (already partially done client-side at `:76`).

---

## DEAD CODE

### DC1 — `src/pages/Chat.jsx` is an unused, stubbed page — MEDIUM
- Entire file `src/pages/Chat.jsx`. Not imported anywhere (`App.jsx` routes do not reference it; superseded by `ChiefPage`/Home chat). Contains a non-functional placeholder ("API connection wired up in a future step"). Safe to delete.

### DC2 — Unused state/refs in `Home.jsx` — LOW
- `src/pages/Home.jsx`:
  - `quickAddOpen`/`setQuickAddOpen` (644) — `setQuickAddOpen` never called; `<QuickAdd open={quickAddOpen}>` (948) is always closed. Dead UI path.
  - `inputRef` (658) and `inputHoldRef` (662) — declared, never attached to any element.
  - `error` (638) — `useState(null)` with no setter exported; the `{error && ...}` branches (906,908) are permanently dead.
  - `scrollRef` (659) — attached (837) but never read.

### DC3 — `WeeklyReview.jsx` `StepSummary` references undefined `bucket` in QuickAdd — MEDIUM (bug, surfaces as dead/broken)
- `src/pages/WeeklyReview.jsx:329` — `<QuickAdd ... initialBucket={bucket} />` inside `StepSummary`, but `StepSummary` has no `bucket` prop/variable in scope (its props are `intention, bucketReviews, allTasks, onNext, setTasksAdded`). `bucket` is undefined → QuickAdd falls back to default 'Work' only because `initialBucket` default param applies when arg is `undefined`. Works by accident; rename or pass a real value. Flag as latent bug.

### DC4 — `BucketDetail.jsx` unused imports / vars — LOW
- `src/pages/BucketDetail.jsx:1` imports `useCallback` — not used.
- `:6` imports `BUCKET_WEIGHTS` from priority — not used in this file.
- `:289` `TaskCard` param `onComplete` is passed through fine; but `bucket` default `''` plus `allTasks` defaults are unused noise in places.
- `:715` `ArchivedSection` declares `navigate` (716) — used; `allDiscussions` (721) used. OK.

### DC5 — `ChiefPage.jsx` unused imports — LOW
- `src/pages/ChiefPage.jsx:9` imports `prioritise, scoreTask` — `prioritise` used (131), `scoreTask` used (200); OK. But `inputRef` (36) is passed to `ChatInput` (274) — used. No dead imports here after recheck; `autoSentRef` used. (Listed to confirm none.)

### DC6 — `Calendar.jsx` unused imports — LOW
- `src/pages/Calendar.jsx:1` imports `useCallback` — used (257). `BUCKET_META` used (432). No dead imports; the `tasks`/`loading` state is used. OK after recheck.

### DC7 — `WeeklyReview.jsx` unused imports — LOW
- `src/pages/WeeklyReview.jsx:4` imports `PROJECTS` (used via `PROJECT_NAMES`), `getAllTasks` used. `pushToSupabase` used (429). No dead imports. (Confirm: `BUCKETS` const at 13 is used; `TOTAL_STEPS` used.)

### DC8 — `TaskEditSheet` `tasks`/`onNavigate` swipe-nav path is effectively never exercised — LOW
- `src/components/TaskEditSheet.jsx:146` accepts `tasks`/`onNavigate` for left/right task navigation, but all call sites pass only `task`/`allTasks` (Home `:530`, BucketDetail `:695`, ChiefPage `:319`) and never `tasks`/`onNavigate`. The entire swipe-between-tasks block (`:282-321,375-436`) is dead in practice. Not a bug, but substantial unused complexity.

### DC9 — `priorityLabel` export in `todoist.js` unused — LOW
- `src/lib/todoist.js:57-59` `priorityLabel` is exported but no importer references it (priority labels are inlined elsewhere via the `['','P4','P3','P2','P1']` array). Candidate for removal.

### DC10 — `buildContent` exported but only used internally — LOW
- `src/components/ChatInput.jsx:16` `export function buildContent` — not imported elsewhere; can be non-exported.

---

## UNUSED IMPORTS (consolidated, verified)

- `src/pages/BucketDetail.jsx:1` — `useCallback` (unused). MEDIUM-confidence; verify.
- `src/pages/BucketDetail.jsx:6` — `BUCKET_WEIGHTS` (unused).
- (Calendar.jsx, WeeklyReview.jsx, ChiefPage.jsx, Home.jsx imports re-verified as used — see DC5/DC6/DC7. The only confirmed unused imports are the two BucketDetail entries above.)

Note: this project ships no ESLint config visible in the reviewed tree; adding `eslint-plugin-react-hooks` + `no-unused-vars` would catch B4, DC2, DC4 automatically. Flag as a process recommendation.

---

## CORRECTNESS / STYLE (LOW)

### C1 — `migrateLocalStorageToSupabase` does not migrate task cache or notifications — LOW
- `src/lib/sync.js:95-135` migrates head configs, discussions, weekly review — but not `todoist_task_cache` or `task_notifications`, even though `applyToLocalStorage` (26-47) handles `todoist_task_cache`. First-device migration loses cached tasks until a manual Todoist import. Confirm intended.

### C2 — `accumulateUsage` model attribution defaults everything non-sonnet to haiku — LOW
- `src/lib/claude.js:23-29` — Opus/other models get bucketed into `haiku_*`, so `Settings.calcCost` (`:9-16`) under-/mis-prices Opus and Sonnet-4.5 usage. Cost estimate is approximate by design (noted in UI at `Settings.jsx:355`), but model mis-attribution is worth noting since `HeadConfig` offers Opus 4.8.

### C3 — `labelToTodoist`/`todoistToLabel` only in `api/mcp.js`; `src/` uses a different inline mapping — LOW
- `api/mcp.js:53-57` vs the `['','P4'...]` arrays scattered in `src/`. Two sources of truth for priority↔label conversion. Keep in sync.

### C4 — `Markdown` inline parser doesn't handle nested or unbalanced markers — LOW
- `src/components/Markdown.jsx:45-55` — `split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g)` won't match bold containing `*`, and a stray single `*` renders literally. Acceptable for the constrained assistant output (prompts request plain prose), low impact.

### C5 — `archiveTask`/`closeTask` fire-and-forget with no reconciliation on failure — LOW
- `src/pages/Home.jsx:712-714`, `src/pages/BucketDetail.jsx:930-932` — if `closeTask` (Todoist) rejects, the local cache still marks complete; the catch is empty. Task stays "archived" locally but active in Todoist. Acceptable given Supabase is source of truth, but note the divergence.

---

## SUMMARY OF HIGHEST-PRIORITY ITEMS

1. S1 (HIGH) — open CORS on all API routes exposing owner's Anthropic/Calendar/Todoist with server secrets.
2. S2 (MEDIUM) — `api/todoist.js` open path proxy.
3. B1 (MEDIUM) — `server.js` dev routes diverge from prod API (broken dev workflow / stale file).
4. B5 (MEDIUM) — shared `cos_home_messages` key between Home and ChiefPage.
5. B8 (MEDIUM) — `update_task` tool never persists to Todoist despite reporting "verified".
6. DC1 / DC3 (MEDIUM) — dead `Chat.jsx`; undefined `bucket` in WeeklyReview `StepSummary`.
7. P1 (MEDIUM) — repeated localStorage parsing in list renders.
