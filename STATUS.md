# STATUS — Life OS / Chief of Staff

Single source of truth for system state. **Read this at the start of every session.
Update it at the end of any session that changes anything.**

Last updated: 2026-08-15 (Google Sheets trackers shipped; head-injury journal complete — capture, Drive filing, the filed
document, trends charts and the evening reminder push — see the newest changelog entries)

---

## Architecture

- Vite + React 19 PWA (mobile-first), **not** Next.js despite older product notes — served on Vercel.
- Vercel serverless functions under `/api/*` (Node, ESM) provide the backend.
- Supabase (Postgres 17, region eu-central-1) is the persistence layer: tasks, knowledge, discussions, backups.
- `/api/mcp.js` is an MCP server (JSON-RPC) exposing task/knowledge tools to Claude.ai as a custom connector.
- GitHub is version control; Vercel auto-deploys `main`. Working branch: `claude/calendar-recurring-events-7tsptn`.
- **`api/*.js` is at 12/12 — the Vercel Hobby function cap.** Adding an `api/*.js` file fails the
  deploy. `api/_lib/*` is excluded from the count, which is why shared logic lives there. Vercel
  cron paths accept query strings, so one function can serve several jobs (`api/cron.js?job=…`).
  Hobby also allows only **2 cron jobs**.

---

## What's connected and verified

| Integration | Status | Notes |
|---|---|---|
| GitHub read/push | **Verified** | MCP tools + git push to `main` and working branch exercised. |
| Vercel API (`api.vercel.com`) | **Verified** | Deployment listing + READY polling work with `VERCEL_TOKEN` in session env. |
| Supabase via **Supabase MCP** | **Verified** | `list_tables` / `execute_sql` work in this session — used to verify this doc's inventory. |
| Supabase via the app (browser) | **Assumed** | The deployed PWA reads/writes Supabase normally; not directly observable from the sandbox. |
| Supabase via `/api/mcp` connector | **Verified** (when connected) | Life OS MCP tools return live data; connection is intermittent in-session. |
| **Direct** Supabase HTTPS egress from the sandbox | **WORKS (retested 2026-07-26)** | The old 403 "Host not in allowlist" is **gone** — `xrmjzglsabnnqqeyubgh.supabase.co` is reachable. Proof: an unauthenticated GET to `/rest/v1/` returns Supabase's own **401 `{"message":"No API key found in request"}`**, i.e. PostgREST answered; a proxy block returns 403, not 401. The anon key isn't in the sandbox env, so an authenticated read wasn't exercised. The Supabase MCP remains the easier route (no key handling), but direct HTTP is no longer blocked. |
| `*.vercel.app` from the sandbox | **BLOCKED** | Egress proxy 403s all `*.vercel.app` hosts, so `/api/*` endpoints cannot be triggered from the sandbox. Trigger from a browser. |

---

## Where data lives (highest-value section)

### Supabase tables (tasks verified live 2026-07-26; rest 2026-07-16)
- **`tasks`** — **THE TASK STORE (since 2026-07-26). One row per task.** 335 rows. PK `id text`
  (handles all three id formats: 93 UUID, 188 Todoist-style alphanumeric, 54 `local_`).
  Typed columns incl. the four scoring fields, `parent_id` self-FK `ON DELETE SET NULL`,
  `section_id`/`section_name`, `deleted_at` (soft delete), `updated_at` via trigger. CHECK
  constraints on priority (1–4), the three 1–5 scores, effort (S/M/L), and no-self-parent.
  **Reached ONLY through `api/_lib/tasksRepo.js`** — partial UPDATEs, one row per write, throws
  when a write doesn't land. **Every read filters `deleted_at is null`.** RLS is `allow all` to
  PUBLIC (same posture as `app_data`).

- **`journal_entries`** — **THE HEAD-INJURY JOURNAL (added 2026-08-15). One row per day.**
  `entry_date date NOT NULL UNIQUE` (the database itself prevents a duplicate day), `symptoms jsonb`
  (`{key: {score 0-4, note, carried}}`), `prompts jsonb`, `free_text text`, `mode text`,
  `authored_at` (first save — deliberately distinct from `entry_date`, so a backdated entry is
  detectable), `updated_at`, `revision int`, `drive_file_id`, `drive_status`
  (`pending`/`filed`/`failed`), `drive_error`, `document_md` (the HTML as filed).
  **Reached ONLY through `api/_lib/journalRepo.js`** — every write `.select()`s the row back and
  **throws if the database returned nothing**, so the UI never confirms a save it cannot prove.
  Serves three purposes at once: clinical record, evidence in the Irwin Mitchell claim, and
  personal pattern-noticing. **See open bug 6 — this is special category health data.**

- **`app_data`** — key/value store, 19 rows, PK `key`, RLS enabled. Columns: `key` text, `value` jsonb, `updated_at` timestamptz. Keys present:
  - `todoist_task_cache` — **NO LONGER THE TASK STORE (frozen 2026-07-26).** Superseded by the
    `tasks` table. Kept as the emergency fallback and **refreshed weekly FROM live rows** by
    `api/cron-weekly-backup.js`, so it can't silently go stale. That refresh is one-directional —
    nothing reads this row back into the write path. Do not add readers.
  - `todoist_last_pull` — timestamp of last Todoist pull (legacy sync path; last touched 2026-06-23).
  - `head_config_${key}` — per-head config for `chief`, `Finance`, `Health`, `Work`, `Family`, `Home`, `Personal`, `Systems` (8 rows).
  - `discussions_${bucket}` — discussions per bucket, one row each for all 7 buckets.
  - `task_notifications` — per-task notifications (64 entries).
  - `google_calendar_auth` — Google OAuth token state. **Now a misnomer: the grant covers Drive
    too** (scopes are `calendar`, `userinfo.email`, `drive.file`). **Deliberately not renamed** —
    renaming a live key for cosmetic accuracy is the exact trap `todoist_task_cache` taught. The
    granted `scope` string is stored so the app can detect a pre-Drive grant and ask for a
    reconnect *before* filing 403s rather than after.
  - `ai_usage_${YYYY_MM}` — **THE AI SPEND STORE (added 2026-07-26).** Per-month token/cost totals for the Settings "AI Spend" widget. jsonb: `{input, output, cacheWrite, cacheRead, cost, calls, by_model:{haiku:{…}, sonnet:{…}}}`. Written server-side by every `/api/*` call that spends `ANTHROPIC_API_KEY`, via the atomic `bump_ai_usage(p_key,p_model,p_input,p_output,p_cache_write,p_cache_read,p_cost)` RPC (SECURITY DEFINER, row-locked). Replaces the old per-browser `localStorage.usage_${month}`.
  - **`app_roadmap` — referenced by code (`get_roadmap`/`update_roadmap`) but NO ROW exists yet.** Not set until the roadmap is first saved.
- **`task_backups`** — task-store snapshots (`label`, `tasks`, `task_count`, `created_at`). **12 rows — currently AT the cap.** Capped at 12 (`MAX_SNAPSHOTS`, pruned on every write in `src/lib/backups.js`).
- **`knowledge_backups`** — prior values before overwrite (`head_key`, `backed_up_at`, `value`). Written by `update_knowledge`, `update_roadmap`, and `/api/sync-all-buckets` (key `todoist_task_cache_snapshot`). **Capped at 12 (`MAX_KNOWLEDGE_BACKUPS`), prune-on-write at all three insert sites — fixed 2026-07-16.** (This line previously said "grows unbounded," contradicting the rest of the doc; corrected 2026-07-24.)

### localStorage keys
| Key | Holds | Supabase mirror | Capped? |
|---|---|---|---|
| `cos_home_messages` | CoS chat history | **No** | **Yes — last 50**, via `safeSetItem` |
| `cos_head_${bucket}` | Head chat history per bucket | **No** | **Yes — last 50**, via `safeSetItem` |
| `cos_discussions_${bucket}` | Discussions per bucket | **Yes** (`discussions_${bucket}`) | No — persists until deleted/completed/archived |
| `todoist_task_cache` | **Read-only display cache** of the `tasks` table — for first paint only. **Never a write source.** | n/a (writes go per-row to `tasks`) | Replaced wholesale on read |
| `todoist_last_pull` | Last pull timestamp | Yes | — |
| `head_instructions/context/files/model_${key}` | Head config | Yes (`head_config_${key}`) | — |
| `lastWeeklyReview` | Last weekly review ts | Yes (`last_weekly_review`) | — |
| notifications key | Task notifications | Yes (`task_notifications`) | — |
| `cos_priority_list` / `cos_priority_last_refreshed` | AI priority list + ts | No | No |
| `SPEND_LIMIT_KEY` | API spend limit | No | — |
| ~~`usage_${month}`~~ | ~~Accumulated API cost~~ | **Moved to Supabase `ai_usage_${month}` (2026-07-26)** | — |
| `LAST_AUTO_BACKUP_KEY` | Last auto-backup date | No | — |
| `supabase_migrated` | One-time migration flag | No | — |

### Survives a browser-data clear?
- **Survives** (rehydrated from Supabase via `hydrateFromSupabase`): discussions, task store, head config, notifications, weekly review.
- **Lost forever** (localStorage-only, no server copy): **CoS chat, Head chats**, priority list, spend limit, usage/cost. Disposable working memory by design.

### Grows unbounded (watch list)
- ~~`knowledge_backups`~~ — now capped at 12 (fixed 2026-07-16).
- `cos_discussions_${bucket}` — no cap; each save re-serializes and re-uploads the whole bucket's discussion history to Supabase.
- CoS/Head chats are now bounded at 50 (previously unbounded — caused the quota crash).

---

## Known bugs and open work

1. ~~**`knowledge_backups` unbounded**~~ — FIXED 2026-07-16. Now capped at 12, prune-on-write across all insert sites.
2. **Discussions full-payload re-upload** — every message save pushes the entire bucket's discussion array to Supabase. Fine now; gets slow/bandwidth-heavy as history grows. Consider per-discussion writes.
3. **Head chats can't set task categories** — the in-app Head chat task tools (`api/claude.js`) do not expose the `category` field, though the MCP tools do. Categories can only be set via the MCP (Claude.ai), not from in-app chats.
4. **Legacy Todoist code still present** — `api/todoist.js` proxy, `src/lib/todoist.js`, and `update/complete/delete` in `api/mcp.js` still call Todoist for all-numeric (legacy) task IDs. New tasks are UUID and Supabase-only. Full Todoist removal is unfinished.
5. ~~**Weekly backup is browser-and-Sunday-gated**~~ — FIXED 2026-07-16. Now a Vercel cron (`api/cron-weekly-backup.js`, `0 8 * * 0`). The old client-side `maybeRunAutoBackup` still exists as a harmless fallback.
6. **P1 — `journal_entries` is special category health data behind no authentication.** RLS is
   `allow all` to PUBLIC and the app URL has no password gate, same posture as `tasks`/`app_data`.
   That was already a standing P1; medical history raises the stakes materially. **Worth resolving
   before this table holds months of entries, not after.** Not a regression — flagged, not fixed.
7. ~~**The journal's 9pm reminder push (phase 2) is not built.**~~ — BUILT 2026-08-15, and the
   **four VAPID variables are now set in Vercel** (production + preview), so it is live rather than
   inert. All four journal phases are shipped.
8. **Cron slots are now 2/2** (weekly backup + journal reminder) — the Vercel Hobby maximum. A third
   scheduled job needs an existing one to absorb it, the same way `api/cron.js` absorbed both.

---

## Recent significant changes (newest first)

- **2026-08-15 — Google Sheets trackers: one reusable component, four configured instances.**
  Four self-updating sheets (house search, medical, car values, pub-to-home) now render inside the
  app. Adding a fifth should mean adding a config object to `src/lib/trackers.js` and nothing else.
  **Needed a new scope, and it was a hard blocker:** the stored grant was `drive.file`, which covers
  **only files the app itself created** — so the app could not read any of these hand-made sheets at
  all. Added `spreadsheets.readonly`; **requires a Google reconnect** (the third). Read-only is
  deliberate: "no write-back" is a property of the grant, not a rule the code must remember. **Never
  upgrade this to the read/write `spreadsheets` scope** — a test asserts it is absent.
  **Uses `spreadsheets.get?includeGridData=true`, NOT `values.get`.** `values.get` returns display
  text only, so a linked cell (`Open Auto Trader`, `View document`) comes back as that string with
  the URL silently gone — no error, nothing to notice. Only grid data carries `hyperlink` and
  `textFormatRuns[].format.link`.
  **Function count held at 12** — this is `api/google.js?action=sheet`, not a new file.
  **The parser exists because these sheets are not clean tables:** the header sits on row 1, 2, 3 or
  5 depending on the tab (so it is per-tab config); merged banner rows sit *inside* the data and are
  how grouping is expressed (Medical's categories, Car's per-model tabs); blank spacer rows must not
  end a table; and a trailing banner is a footnote, not a section. All in `api/_lib/sheetTable.js`,
  pure and fixture-tested since the Sheets API is unreachable from the sandbox.
  **Tab titles are resolved at fetch time**, not trusted: configs name tabs from each sheet's visible
  banner heading, which need not equal the tab name. A cheap titles-only call runs first, matches
  exactly then case/punctuation-insensitively, and on a real miss returns the titles that *do* exist.
  No writes, no persistence, no cron, no cross-tracker aggregation — fetch on open and on Update.

- **2026-08-15 — Reminder control was rendering as nothing; VAPID keys set.** The user opened the
  Journal to use the reminder and there was no control at all. Two causes.
  **The keys had never been set** — confirmed by reading the live project config, which held 12
  variables and none of the VAPID four. All four are now set (production + preview, encrypted).
  **And `ReminderToggle` returned `null` in exactly that case**, which was the real defect. It was
  written that way on the reasoning that an inert switch is worse than no switch; that is wrong. An
  **invisible** switch is worse than both, because nothing on screen distinguishes "waiting on
  setup" from "shipped broken". The control now always renders and each unavailable state says what
  it needs. A test asserts `ReminderToggle` contains no `return null` — no other test can catch
  this, since a component that renders nothing throws nothing.
  **Trap worth keeping:** `VITE_*` variables are **inlined into the bundle at build time**, not read
  at runtime. Setting one in Vercel changes nothing until a new build runs, so env vars must land
  *before* the deploy that depends on them. Verified here by grepping the built bundle for the
  public key rather than assuming (and confirming the private key is absent from it).

- **2026-08-15 — Journal phase 2: the evening reminder push.** The journal's last piece — it had no
  way to ask to be written, and the symptoms it tracks are the ones that make remembering unreliable.
  **The service worker is back on, and that reversal is only safe because of how it was done.**
  `public/sw.js` was a *caching* worker whose stale caches stopped deployed updates landing, which is
  why `src/main.jsx` unregistered every worker. The new one has **no `fetch` listener and no caching
  at all** — structurally incapable of serving a stale response — and purges every leftover cache on
  activate. **Never add a `fetch` handler to it**; a test asserts its absence.
  **Function count held at 12** by merging `api/cron-weekly-backup.js` into `api/cron.js?job=…`, which
  now serves both schedules. The backup body moved verbatim; its schedule and behaviour are unchanged.
  **No endpoint for subscriptions** — the browser writes them straight to Supabase, as tasks and
  journal entries already do. That is what paid for the cron function.
  **It does not nag:** the job reads `journal_entries` for today's *London* date first and sends
  nothing if the day is already logged. If that lookup fails it sends anyway — a redundant nudge
  costs a moment, a skipped one can cost the entry.
  **Dead endpoints are pruned on 404/410 only.** Every other failure records the error and keeps the
  row, so someone else's outage can't unsubscribe the only device.
  **Requires user setup:** `VAPID_PUBLIC_KEY`, `VITE_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`,
  `VAPID_SUBJECT` in Vercel. Inert until then, like the Drive API in 1b.
  Notification icons had to be generated as PNG (`icon-192.png`, `badge-72.png`) — Chrome does not
  render SVG for a notification icon, and `public/icons/` held only SVG.

- **2026-08-15 — Journal phase 1c: trends charts.** A History/Trends toggle on the Journal tab;
  week / month / 6-month / year windows; any symptom plus an "Overall severity" line, layered up to
  six at once. Hand-rolled inline SVG — no charting library, +6.7KB.
  **Two properties are correctness, not styling:** a day with no entry **breaks the line** rather
  than being interpolated across (a drawn-through line would show a trend nobody observed, in a
  document read beside a claim), and a **lone entry always renders as a dot** at every zoom level
  so a single observation cannot vanish into a dense window. `null` (no entry) and `0` (recorded
  as none) are kept strictly distinct.
  Sleep quality is drawn **dashed** because it is inverted, and is excluded from the overall mean —
  `overallSeverity()` is asserted equal to the document's `meanSeverity()`, so the chart and the
  evidence can't tell different stories.
  Coverage ("N entries in these 365 days") is shown with the chart: a flat-looking year with nine
  entries means something very different from one with three hundred.
  **Mounted only while the Trends tab is open** — `src/App.jsx` renders all five screens in the
  swipe strip at once, so an always-mounted chart would build on every app load.

- **2026-08-15 — Daily head-injury journal shipped (phases 1a and 1b), confirmed working live.**
  Deployed across `2e40268` (capture), `d3300ac` (Drive filing), `3ada2f5`, `1f29d3c`, `4d8c930`.
  A fifth tab: 17 symptoms scored 0–4, optional per-symptom notes, three prompted questions, an
  open text box; history with an entry/missed indicator, always editable.
  **Why the design is what it is:** the injury being recorded (cognitive fatigue, reduced executive
  function) *is* the design constraint — a form that feels like work won't get used on the days the
  data matters most. Hence tap targets rather than sliders (a slider needs a precise drag), five
  collapsible groups rather than a list of seventeen, and quick mode as the default.
  **Scale: 0–4, None/Mild/Moderate/Severe/Very severe — the Rivermead Post-Concussion Symptoms
  Questionnaire scale**, so a neurologist reads a recognised instrument rather than an invented one.
  The 17 items are Yogesh's own; only the scale is borrowed.
  **Persistence guarantee, and it is the point of the feature:** every write reads the row back and
  throws if the database returned nothing. **Saving and Drive filing are separate steps with
  separate outcomes** — the entry is stored *before* filing is attempted, so a filing failure can
  never cost it; the failure is written to the row, shown in the history list, and retryable.
  **Filing:** native Google Docs (unlimited automatic version history — .docx revisions can be
  pruned by Drive unless `keepForever`), into *06 - Personal Evidence / Symptoms & Personal
  Statements*, named `YY.MM.DD - Yogesh Mistry - Head Injury Journal` to match the convention
  already in the case folder. A re-save `files.update`s the same file — never a duplicate.
  **Function count stayed at 12** by merging `google-auth` + `google-disconnect` into
  `api/google.js?action=…` and `cron-weekly-backup` into `api/cron.js?job=…`.
  **`api/google-callback.js` was deliberately NOT merged** — its path is the OAuth redirect URI
  registered in Google Cloud Console.
  Two live blockers found and cleared: the Drive API was never enabled on Cloud project
  1096995773348 (user-side), and the resulting long error URL overflowed its card (`3ada2f5`).

- **2026-08-15 — The filed document rewritten to be his journal rather than a report about him**
  (`4d8c930`). Georgia → Arial. The narrative moved to the top and became the document; the score
  table sits under it as reference data. The model's brief changed from third-person clinical
  summary to **rewriting his brain dump in his own established voice** — first person, past tense,
  British English, specific about times and durations, connecting a symptom to what it stopped him
  doing — matched to the existing case-file journal. Prompt answers are woven into the prose, so
  the separate Reflections section is gone. Caveats removed on request: the Rivermead preamble, the
  "generated from the recorded data" label, the version-history note.
  **The backdating line stays** ("Written on <date>" when `authored_at` and `entry_date` differ) —
  that is not a caveat, it is the contemporaneity of the record, and a diary presented as same-day
  when it wasn't is worse than the delay.
  **Division of labour is deliberate and load-bearing:** every figure in the table is rendered from
  the stored row, and the model is handed severity *words* rather than numbers, so it has no figure
  it could transpose. A wrong number in a symptom diary is a factual error in evidence.

- **2026-07-28 — Task capture from CoS and the Heads was broken; restored.** Deployed (`f7eaaff`).
  **Severity: this is the app's foundational action** — logging a task is the first step of the
  whole workflow, and for a period the chat confirmed tasks and saved none of them. Three different
  phrasings failed consecutively.
  **The write path was never at fault.** MCP `create_task` writes to the same table with the same
  credentials and works. The model was answering with the confirmation sentence *instead of*
  calling `create_task`.
  **Cause — the history is a multi-shot demo of the wrong behaviour.** Chat history is persisted
  and replayed as plain `{role, content}` text, so `tool_use` blocks are stripped before it is
  sent. The model therefore saw ~25 rounds of *"user asks for a task → assistant writes a ✓ line"*
  and no example anywhere of a tool being called, and learned the sentence was the action. Creation
  worked in the morning ("Buy a cap", 16:40 UTC, in the database) and degraded through the day as
  the history filled — which is the shape of the bug.
  **Fix, four parts:** (1) `historyForModel()` in `src/lib/claude.js` strips ✓ lines from assistant
  turns before sending — applied at **all five** chat call sites; nothing is lost because the real
  task list is injected fresh every message. (2) When a reply claims a change and no write tool
  succeeded, the server **retries once with `tool_choice: {type:'any'}`** so the model cannot answer
  with prose, then builds the confirmation from the tool's *verified result* — a ✓ on that path
  cannot be false. One extra Haiku call, failure path only. (3) All three prompts (cos/head/
  discussion) now lead with the requirement to call the tool; the ✓ is demoted to a report of a
  tool result. **The head and discussion prompts previously never mentioned calling a tool at all**,
  which is why Heads failed too. (4) `create_task`'s description says *when* to call it.
  **Also fixed:** the priority enum is inverted (`4=P1`), so the model said "P3" while passing `3`,
  which the app renders as P2. Mapping made explicit.
  Not done: switching the chat to Sonnet (cost), and server-generating *every* ✓ rather than only on
  the recovery path (held as the fallback if this isn't enough).

- **2026-07-27 — Chat shows a confirmation once, not before and after the tool call.** Deployed
  (`000064d`, READY). The model narrates the change it is about to make, calls the tool, then
  states it again, so one created task rendered two identical ✓ lines in a single bubble
  (observed on "Test task 2"). The streaming path emitted every round's text including rounds
  that ended in a tool call; the **non-streaming path already discarded that narration**
  (`finalText` is only set on the round that made no tool call), so streaming was the odd one out.
  **Why not simply buffer:** whether a round ends in a tool call is only known once the round
  finishes, so withholding text would make an ordinary tool-free reply — the common case — arrive
  in one lump. The server instead streams as before and emits `{ drop_chars: n }` telling the
  client how many characters to retract.
  **Contract change:** `sendMessageStream`'s `onChunk` now receives `(delta, full)` and callers
  must render `full`. A caller that accumulates deltas itself cannot see a retraction — all six
  call sites were converted (Home, ChiefPage, BucketDetail, DiscussionThread, ×3 WeeklyReview);
  several got simpler, having kept a running string only to re-render it.
  Verified by replaying the observed transcript through the client logic: the tick line appears
  exactly once, ordinary streaming still arrives chunk-by-chunk (asserted, not assumed),
  multi-round tool use collapses to the final answer, and an oversized retraction cannot eat
  earlier text.

- **2026-07-27 — Chat can no longer confirm a write it never made.** Deployed (`97de68a`, READY).
  **The bug:** the in-app CoS chat replied with a tick confirmation for a task that was never
  created. Diagnosed by elimination against the live build: the database, `tasksRepo` and
  `/api/mcp` are healthy (a task was created and deleted through them), `/api/claude` returned
  200, `tools: TOOLS` **is** sent on both the streaming and non-streaming requests, and the
  `create_task` handler is correct. The chat model (Haiku by default) simply **did not call the
  tool and confirmed anyway**. `SYSTEM_PROMPTS.cos` already carries the rule "no tool result,
  no ✓" — a prompt is not enforcement.
  **Not a regression from the persistence work.** `api/claude.js`'s `create_task` handler and the
  CoS system prompt are byte-identical to `1f007fd` (24 July), which was itself the attempted fix
  for this same symptom — it fixed only the half where the tool *is* called, and was never
  verified in a browser.
  **The fix** (all in `api/claude.js` + new pure module `api/_lib/writeClaim.js`): the handler now
  tracks whether any state-changing tool reported success in the turn, and if the reply asserts a
  change when none landed it **appends a visible correction** to the stream. Streamed text can't
  be retracted, so a false confirmation now reports itself rather than surfacing days later as a
  missing task. Claim detection is deliberately conservative — first-person past-tense claims,
  ✓ lines naming a write, and "task/event \<verbed\>"; "shall I create one?" and "you completed 5
  tasks this week" do not trigger it.
  Two blind spots closed alongside: tool errors are now **logged server-side** (previously they
  went only to the model as a `tool_result`, so a failed write and a never-attempted write looked
  identical in the logs — which is why diagnosing this needed the user to recall what the chat
  said), and `executeTool` runs through a wrapper so a throw becomes an error result instead of
  an unhandled rejection after the SSE headers are sent.
  Deliberately **not** done: switching the chat to Sonnet. It would likely reduce the behaviour
  but costs materially more per message; the guard works regardless of model, which is the more
  durable property. `api/_lib/` is excluded from Vercel's function count, so still 12/12.

- **2026-07-27 — Read side finished: stale task reads made unexpressible.** Deployed (`6f1ff55`,
  READY). The persistence rebuild fixed writes; reads were still per-screen guesswork.
  **The bug:** Buckets, Calendar, DiscussionThread and Settings called `getCachedTasks()` once at
  mount and never looked again, so a task created in the chat, QuickAdd, another device or the MCP
  was **invisible to search** until the user reloaded the right screen. Whether a screen refreshed
  was an accident of how it was written — which is why 4 of 6 browser checks passed and 2 didn't.
  **The fix:** new `src/lib/useTasks.js` is the only way a component gets tasks. It paints from the
  display cache, immediately replaces it with live rows, and re-reads on (a) any write in this tab
  via a new change bus in `taskCache`, (b) **Postgres realtime on `public.tasks`** — newly enabled;
  it was only on `app_data` — covering another device or the Claude.ai MCP tools, and (c) tab
  focus, covering a missed realtime event. All eight screens use it.
  **`getCachedTasks` → `peekCachedTasks`**, and no screen imports it. The old name read like an
  accessor for the real data and four screens used it as exactly that; "peek" says what it is.
  **Also fixed:** Settings' backup count read a mount-time snapshot (stale); subtask-add had no
  in-flight guard, so a double-tap fired two `/api/create-task` calls each minting its own UUID —
  two rows for one subtask. Guarded by ref + disabled button. QuickAdd already guarded.
  **Timezone audit (asked for explicitly):** `isoDate`, `daysDiff` and the Home counters all use
  **local** getters and were already BST-correct — nothing judges "due today"/overdue off a raw UTC
  date. Two real defects found and fixed: the completed-date handed to the CoS sliced the raw UTC
  string, so a task finished 00:30 BST was reported as the **previous day**; and ranking urgency
  parsed the due date in the *runtime's* zone, so a task ranked differently in the browser (BST)
  than on Vercel (UTC) — now pinned to UTC so both agree. **Not reproduced:** a UTC timestamp
  *rendered in the UI* — every display path uses `toLocale*`, which is browser-local. If one is
  visible, the screen and field are needed to find it.
  **Data:** the 0.93s-apart duplicate "Check my whatsapp" was soft-deleted (recoverable). The
  twice-created "Buy birthday gift for Rohan" was **left alone** — those two are ~30 min apart with
  *different* due dates and priorities, so they are deliberate entries, not a double-submit.

- **2026-07-26/27 — TASK PERSISTENCE REWRITTEN: per-row writes, blob overwrite eliminated.**
  Deployed to production (`5c7214f`, deploy READY) and verified end-to-end against live data.
  **The bug:** the whole task list lived as one JSON array in `app_data.todoist_task_cache`, and
  all six write sites did read-whole / modify / write-whole. The client was worst: `saveToCache`
  merged onto **localStorage** (not the authoritative row) then overwrote it, so any task this
  browser hadn't seen was erased. A task created by the CoS chat could be written, confirmed, and
  vanish with no error. Confirmed the 2026-07-09 "saveToCache destructive overwrite" fix treated
  a symptom of this same mechanism, not the cause.
  **The fix:** tasks live one row per task in `tasks`, reached only via `api/_lib/tasksRepo.js`.
  Three properties, which must not be eroded: (1) a write touches one row and only the columns it
  changes — **partial UPDATE, never whole-row upsert**, so two surfaces editing different fields
  both survive; (2) every op checks the error **and** rows-affected and throws when a write didn't
  land; (3) deletes are soft and every read filters `deleted_at is null`.
  **`saveToCache` was deleted, not reimplemented** — while a write-the-whole-list function exists,
  something will call it. The four chat callbacks no longer persist at all: `api/claude.js`
  `complete_task`/`update_task` now write their own rows, so the server owns its writes instead of
  depending on the client to save the list back (that dependency was itself a silent-loss path).
  **Every blob reader was repointed** — the staleness class, not just the instance: the weekly
  cron now snapshots LIVE rows (it would otherwise have produced weekly restore points of a frozen
  list while reporting success, making every restore point worthless) and refuses to write an empty
  backup; `backups.createBackup` snapshots live rows instead of localStorage; restore upserts
  per-row and deliberately does **not** delete tasks absent from the snapshot; Settings' roadmap
  and `sync.js` hydration read live rows; `score-backlog` writes each score to its own row;
  `/api/sync-all-buckets` is **retired (410)** because it merged stale Todoist data as a
  whole-array write.
  **Schema additions:** `section_id`/`section_name` (103 tasks had a section the bucket grouping
  falls back to — would have been silently dropped), `deleted_at`, a partial index on live rows,
  and a no-self-parent CHECK. Migration verified faithful: 335/335 rows, 107 parents, 193 scored,
  103 sections, 0 dangling parents.
  **Decisions:** localStorage is a read-only display cache; offline writes **fail visibly** rather
  than queueing (a replayed queue can apply stale edits over newer ones). Soft-deleting a parent
  **promotes its children to top-level** rather than cascading — matching the FK's
  `ON DELETE SET NULL`, so no task ever silently disappears.
  **Verified:** 30 mapper/anti-clobber assertions (incl. a reproduction of the original bug that
  fails on the old logic and passes on the new); 6 database-level checks; a scratch-table proof
  that the recovery script cannot overwrite newer data; and a live create→update→delete through
  the deployed MCP tools confirming the row landed in `tasks`, a one-field update left every other
  field untouched, and a deleted task disappears from reads while its row survives.
  **Recovery script:** `sql/reconcile_blob_to_tasks.sql` — INSERT-only with `ON CONFLICT DO
  NOTHING`, so it is structurally incapable of overwriting a newer live row. Run at cutover: zero
  drift found.

- **2026-07-26 (batch 4) — Five autonomy-safe Systems tasks: legacy ID handling removed, all
  fixed max-height clamps converted, egress finding, two verifications.**
  1. **Legacy Todoist ID handling removed (201d520d) — and it was hiding a LIVE bug, not just
     dead code.** Measured the store first: of 62 active Systems tasks, **49 UUID, 12
     Todoist-style alphanumeric (e.g. `6gmqr49276wqxXGM`), 1 `local_`, ZERO all-numeric.** The
     two files disagreed on what "legacy" meant. `api/mcp.js` guarded on `/^\d+$/` (all-numeric),
     so with zero such ids its three branches in `updateTask`/`completeTask`/`deleteTask` were
     genuinely dead — removed, along with the now-orphaned `todoistFetch` and `isTodoistId`.
     But `api/claude.js` guarded on the **inverse** (`!local_ && !isUuid`), so it fired for all
     12 alphanumeric ids and, on a Todoist failure, did `return { error: … }` — meaning
     **completing one of those tasks from the in-app CoS chat could fail outright even though the
     store write succeeded.** That path is gone; completion is store-only for every id format.
     **Behaviour change, stated plainly:** those 12+ tasks are no longer closed in Todoist. That
     is the intended post-migration end state (store authoritative, Todoist retired, the Settings
     import path already disarmed) — but it is a change, not a no-op. `labelToTodoist` /
     `todoistToLabel` are **kept**: still live priority-scale converters, legacy-named but not
     ID-format handling. `api/todoist.js` and the read paths (`getAllTasks`,
     `getProjectSections`) are untouched — still open-bug 4.
  2. **All remaining fixed max-height clamps converted (ad86436a).** `BucketDetail` archived row
     (was 400px), `Home` event row (280px), `Calendar` event row (360px) now measure their content
     like the two task drawers already did. The archived rows come from a `.map()`, so
     `src/lib/useMeasuredHeight.js` gained a keyed `useMeasuredHeights()` variant
     (`measureFor(key)` + `heights[key]`, same-value writes short-circuit to avoid re-render
     churn) — extracting each row into its own component just to hold a hook would have been a
     far larger refactor for no behavioural gain. **No fixed clamps on variable content remain in
     the app.**
  3. **Direct Supabase egress RETESTED and it now WORKS (6h4Fm4JcQFwjMchv)** — see the
     connections table above; the doc had been wrong since the block lifted.
  4. **`knowledge_backups` cap verified (36e529a4) — already implemented 2026-07-16, no work
     needed.** Live table: **12 rows exactly at the cap**, oldest `2026-07-24 18:11`, newest
     `2026-07-26 20:55`, **296 kB**. The two-day-old floor proves prune-on-write is actively
     rotating, not merely present. Nothing to reclaim — it never grew past 12.
  5. **Chief of Staff head context (6h4Fm3mcWgcQpm6v)** — "life-os-context.md" is that head's
     context in Supabase, not a repo file. Inspected: **already contained no Todoist project IDs
     and no stale "source of truth" claims**, so it was substantially done; corrected only its
     now-false open-bug line about lingering legacy numeric-ID code. Repo `CONTEXT.md` needed no
     change — its two "todoist" hits are the `todoist_task_cache` key name, which is correct.
  Verified: `vite build` passes, `api/*.js` still 12/12, 18 Node assertions (update field
  application, complete/delete across all three id formats, one-code-path equivalence, keyed
  height semantics). **Not browser-verified** — sandbox can't reach the app; the three clamp
  conversions are the part that would most benefit from a visual check.

- **2026-07-26 (later) — Two live-testing bugs fixed; ComputedPreview deleted.** Both bugs were
  regressions from the batch earlier the same day, which was verified by build but never seen in a
  browser — the gap that produced them.
  1. **Scoring panel clipping (d6aeb73c) — real fix, not a bigger number.** The task-detail drawers
     in `Home.jsx` and `BucketDetail.jsx` clamped with a guessed constant
     (`maxHeight: scoringOpen ? '460px' : '180px'` + `overflow:hidden`), so a task whose
     description + open scoring panel + metadata exceeded 460px was visibly cut off where the next
     card began (confirmed live on "Create digital estate document"). Replaced with new
     `src/lib/useMeasuredHeight.js` — a `ResizeObserver`-backed hook (guarded where the API is
     absent) that measures the drawer's actual content, so `maxHeight` follows content and cannot
     clip. The 0.25s transition is preserved. This made the `scoringOpen` state and the `onToggle`
     prop pass redundant in both pages; both removed **from the pages only**.
     **`ScoringPanel.jsx` itself is deliberately untouched** — the edit-popup version is confirmed
     good, so it was not modified; its `onToggle` prop is now an unused optional no-op (trivial
     cleanup, deliberately not done). Not touched either, being unreported and scoring-panel-free:
     the fixed clamps at `BucketDetail.jsx` archived row, `Home.jsx` event row, `Calendar.jsx` —
     the archived row shares the same fragility class and is the next candidate if it ever bites.
  2. **Block nav (714dd682).** The "Upcoming events" card rendered unconditionally in the
     priorities tab, so it leaked into Priorities, Today *and* Overdue; meanwhile the Events block
     navigated away to `/calendar` and so never showed events in place. Events is now a fourth
     in-place filter state: the task-list card renders only when the filter isn't `events`, and the
     events card only when it is. Events also gets the active ring and a Clear button. Note the
     non-obvious bit: `activeBlock = BLOCK_META[blockFilter ?? 'priorities']` and the header reads
     `.title`, so `BLOCK_META` needed an `events` entry or selecting Events would throw on
     undefined.
  3. **`src/components/ComputedPreview.jsx` deleted** (approved). Was unreferenced since the
     preview left the main screen; helpers already live in `scoringDisplay.js`, and no stored
     scoring data is affected. Its stale comment reference in `scoringDisplay.js` was updated.
  Verified: `vite build` passes and 34 assertions pass across four Node suites, including new
  block→view mapping tests (each of priorities/today/overdue shows the list and no events card;
  events shows the card and no list; every filter state has a `BLOCK_META` entry so none can
  crash) and a clamp-vs-measured regression test. Bundle module count went 101→102 — the new hook
  adds one and deleting ComputedPreview removed none, because it was already unreferenced and
  therefore never in the module graph. **Still not browser-verified from the sandbox** (egress
  blocked) — that check remains manual, and is exactly where both of these bugs came from.

- **2026-07-26 — Scoring made visible, review sees completed work, main-screen blocks are now nav.**
  Five Systems tasks. Merged to `main` after the AI Spend work below (merge, not fast-forward —
  `main` had moved; the only conflict was this changelog, `.mcp.json` was byte-identical on both
  sides and `src/lib/claude.js` auto-merged cleanly since the two changes touch different regions).
  1. **Scoring surfaced (d6aeb73c + 36469a71 pt 1 — one build; they overlapped).** New
     `src/lib/scoringDisplay.js` holds helpers *extracted* from `ComputedPreview` (which was the
     only place the four scores were rendered, so removing it would have deleted the display
     logic too). New `src/components/ScoringPanel.jsx` — collapsed "Scoring" section, read-only
     or editable, explicit empty state for unscored tasks. Read-only in both task-detail drawers
     (Home, BucketDetail) and atop a Discussion with a linked task; **editable** in
     `TaskEditSheet` with effort first and largest. Two traps fixed: the detail drawers are
     clamped at `maxHeight:180px/overflow:hidden` so the panel clipped (added `onToggle` so the
     container grows), and `doSave` rebuilt its update object field-by-field so edited scores
     would have vanished on reload — the four fields now ride in both the optimistic object and
     the store write.
  2. **Date rule aligned (6a52a311).** Confirmed **no code-level filter strips dated P4s** —
     `rankPriorities`, `formatTasksForPrompt` and `rankTasks` all filter on completion only; the
     original repro was ranking, not filtering. The one real exclusion (`prioritise` dropping
     "someday") hits *undated* P4s only. But `scoreTask` gave due-tomorrow +75 / due-≤3d +55,
     outweighing P1 (+50) plus any bucket weight, so any near-dated task topped the list. Now
     overdue +90 / due-today +100 keep the auto-surface tier and everything else dated weighs in
     modestly (≤7d +15, ≤14d +8), mirroring `ranking.js`'s urgency bands. **Caveat:** `scoreTask`
     has no access to consequence/reversibility/compounding, so "weighs in alongside c/r/k" is
     only fully satisfied by converging this fallback on `rankTasks` — still open.
  3. **Review sees what shipped (8c0b46ac pt 2).** `formatTasksForCoS` strips completed tasks
     outright, so review ran blind to progress. New `reviewPeriodStart` / `completedSince` /
     `formatCompletedForPrompt` in `src/lib/claude.js`; bucket steps and the CoS summary both
     receive the completed block, bucket steps render a "Completed this period" view. Completions
     with a missing or corrupt `completed_at` are excluded (undated completions would pollute
     every period). **Also fixed:** the bucket review list filtered by bucket only, so completed
     tasks were listed indistinguishably from live work.
  4. **Computed (preview) removed from the main screen (6adad5a8)** — shipped only once the
     scoring data was visible elsewhere, per its dependency. `ComputedPreview.jsx` is now
     **unreferenced dead code** (kept on disk, not bundled — build dropped 102→101 modules).
     Deleting it is a trivial follow-up.
  5. **Blocks are primary nav (714dd682).** Assessment: kept Today / Events / Overdue, **retired
     "P1"** (a raw legacy-priority-label count, superseded by the scoring model) and gave its
     slot to **Priorities**. Blocks are now buttons that filter the Home list *in place* (no new
     routes — there are no today/overdue views); Events navigates to `/calendar`. Active block
     gets a ring, plus a Clear button. Each block's count is derived from the list it opens, so
     the number can never disagree with what tapping it shows — `todayCount` previously counted
     *completed* tasks and over-reported.
  Verified: real `vite build` passes; 47 assertions across four Node runs (scoring helpers incl.
  unscored/partial/corrupt input, score persistence round-trip, period filtering, block filters).
  **Not yet seen in a browser** — spacing/clipping in the detail drawers is worth an eye.
  Still open: 36469a71 pt 2 (banded tie-break, deferred pending evidence, per the task);
  094b2e6b stays **PARKED** (only its `.mcp.json --browser chromium` pin was applied — and that
  pin had already landed independently on `main` via `74a45e6`, so the two were identical).

- **2026-07-26 — AI Spend widget fixed: server-side tracking + correct pricing + conservative estimate.**
  The Settings "AI Spend" widget under-reported (app showed $13.13 vs Anthropic console $20.03, which
  blocked the account). Root causes were multiple, NOT "output isn't tracked" (the streamed chat path
  already tracked output): (1) **Haiku mis-priced** — hardcoded $0.80/$4.00 vs correct **$1.00/$5.00**
  (verified live 2026-07-26), and Haiku is the DEFAULT chat model; (2) **all non-streaming calls
  recorded $0** — `sendMessage` never accumulated, so `rankPriorities` (Sonnet), CoS refresh and Head
  refresh were free in the widget's eyes; (3) **server/MCP/cron scoring calls** (`aiScoreTask`) were
  invisible to the browser-only tracker; (4) **cache tokens uncounted**.
  Decided against the Anthropic Usage & Cost API: it's part of the Admin API, which is *"unavailable
  for individual accounts"* and needs an org-wide `sk-ant-admin` key — a security downgrade to embed,
  and its data lags so it can't drive a live spend gate.
  Fix (server-side, per user's choice): new `api/_lib/pricing.js` (single verified pricing source,
  incl. cache-write 1.25× / cache-read 0.1×; unknown model → most-expensive fallback) and
  `api/_lib/usage.js` `recordUsage()`, which computes cost and atomically increments
  `app_data:ai_usage_${month}` via the new `bump_ai_usage` RPC. Instrumented the three chokepoints that
  spend the API key: `api/claude.js` stream path (now also sums `cache_creation`/`cache_read`) and
  non-stream path, and `aiScoreTask` in `api/_lib/taskWrite.js` (covers all task scoring incl. MCP +
  score-backlog). Client: `getMonthlyUsage()` now reads the Supabase row (async, live via
  `onSyncChange` on the month key); removed the localStorage `accumulateUsage` path and the client
  `calcCost` duplication. Widget shows the stored `cost` × **+10% buffer, rounded up** (`SPEND_BUFFER`)
  so it never reads below actual; label reads "≈ $X" with a note that the console is source of truth.
  No new serverless function (respects the 12/12 cap — logic lives in `api/_lib`). Verified: pricing
  unit tests, `bump_ai_usage` aggregation (incl. `by_model`) against live DB, client build.
  **DEPLOYED to `main`/production 2026-07-26** (Vercel dpl for commit 9990819 READY); the RPC was
  already live in the shared Supabase project. **Seeded `ai_usage_2026_07` = $20.03 / 195 calls** from
  the Anthropic console (the real July spend), so the reset-to-$0 didn't hide incurred spend and the
  limit gate stays honest; real calls now accumulate on top. With the +10% display buffer the widget
  shows ≈ $22 of $20 (correctly over the limit — raise the limit in Settings if desired). Live
  end-to-end (real Anthropic call → row increments) still best confirmed by using the app, since the
  sandbox can't reach prod `/api` (egress-blocked). Cross-device note: spend is now shared across
  phone/desktop (was per-browser).

- **2026-07-24 — BucketDetail Category grouping re-keyed off the store's `_category`.**
  `groupBySection` (src/pages/BucketDetail.jsx) previously grouped the "Category" sort purely by
  `t.section_id` resolved against the live-Todoist section list, so UUID/Supabase-only tasks
  (which have no `section_id`) all collapsed into one unnamed group and their real MCP-set
  category was ignored. Now it groups by `t._category` first, falls back to the Todoist
  `section_id`/`sectionMap` lookup only for legacy tasks that have a `section_id` and no
  category, and still drops tasks with neither into an unnamed group. Group keys are namespaced
  (`cat:`/`sec:`/`__none__`) to prevent a category label colliding with a section id; section
  order is seeded first so legacy groups keep their Todoist order. Scope was the grouping key
  only — the live Todoist `getProjectSections` call and everything else in the file are
  untouched (open bug 4 / the Todoist read-path is unchanged). Verified with a Node unit check:
  a Systems task with `_category` groups by category, a Finance task with the old
  `section_id`/`_sectionName` still groups via `sectionMap`, category takes precedence when both
  are present, and empty seeded sections are filtered out. JSX-only, no serverless function
  added (12/12 cap unaffected). Not yet built in-session (node_modules reclaimed); relied on the
  isolated-function test.

- **2026-07-24 — STATUS doc: knowledge_backups contradiction corrected.** The storage-inventory
  line for `knowledge_backups` still read "No retention policy — grows unbounded," contradicting
  the "Grows unbounded" watch-list, the "Known bugs" list, and the 2026-07-16 changelog, which
  all correctly said capped at 12. Verified against the code: `MAX_KNOWLEDGE_BACKUPS = 12` +
  `pruneKnowledgeBackups` in `api/mcp.js`, prune-on-write at `update_knowledge`, `update_roadmap`,
  and `api/sync-all-buckets.js`. The cap is real (fixed 2026-07-16); the inventory line is now
  aligned. Any externally-tracked "knowledge_backups unbounded / task 9 open" item can be closed
  as already-fixed. Doc-only change.

- **2026-07-24 — Recurring calendar events can now be created (CoS chat).** The
  `create_calendar_event` tool (api/claude.js) gained an optional `recurrence` input (an RFC
  5545 RRULE string without the `RRULE:` prefix, e.g. `FREQ=WEEKLY;BYDAY=MO,WE,FR`,
  `FREQ=DAILY;COUNT=10`, `FREQ=WEEKLY;UNTIL=20261231T235959Z`). The handler strips any leading
  `RRULE:` and wraps it as Google's `recurrence: ["RRULE:…"]` on the events.insert body; an
  empty/whitespace rule is dropped rather than sent. `api/calendar.js` POST already forwards
  arbitrary body fields to Google, so it needed no change. Also fixed the post-create verify:
  the verify GET uses `singleEvents=true`, which expands a recurring master into dated
  instances (`<masterId>_<stamp>` ids carrying `recurringEventId === masterId`), so the old
  `e.id === data.id` match would have falsely reported "could not be verified" on a successful
  recurring create — the match now also accepts `recurringEventId === data.id`, and the result
  reports `recurring: true`. Scope: create only — `update_calendar_event` (making an existing
  single event repeat) was deliberately left as a follow-up (same verify-match widening +
  series-vs-instance semantics). No new create-event UI; creation remains chat-only.

- **2026-07-22 — Calendar read 1-hour offset fixed (BST).** `read_calendar` (api/claude.js) formatted event times with `new Date(dateTime).toLocaleTimeString('en-GB')` and no `timeZone` — on Vercel's UTC server that rendered every timed event 1h early during British Summer Time, so the CoS saw 12:00 for a 13:00 event and made wrong calls ("already midday, no change"). Now slices the wall-clock time from the RFC3339 string (event-local), matching the `date` field and the create/update verifies. Deployed `0616ee8`. This was the "times the CoS sees vs times I see" disconnect — separate from the date-move fix.

- **2026-07-22 — Calendar date-move fixed (in-app CoS chat).** Moving an event to a new date silently failed: `update_calendar_event` (api/claude.js) collapsed a timed event into an all-day `{ date }` shape because it never read the existing event, so Google dropped the change and the date "reverted" — and the verify only checked the title, reporting a false ✓. Fix: new single-event GET (`api/calendar.js` `?eventId=`); the update handler now reads the existing event and builds start/end preserving its timed-vs-all-day type, time-of-day and timeZone (date-only move keeps the time; all-day stays all-day with its span), erroring out if the event can't be read; and the verify now asserts the date/time actually changed so a silent revert surfaces as failure. Deployed `95b2fa5`. Note: updates still target the primary calendar only (pre-existing). Separately: the CoS task-write + confirmation fix remains on unmerged branch `fix/cos-chat-write-confirmation`.

- **2026-07-21 — Search results deep-link to the task.** `Buckets.jsx` search-result click now passes `state: { focusTaskId }` on navigate (was bucket name only). `BucketDetail` reads it and threads `focusTaskId` through TasksTab → TaskCard → TaskItem; the matching row scrolls into view (block:center), briefly flashes (#EADDFF, 2s), and opens its edit sheet (TaskEditSheet) directly. Subtasks already render as their own rows here, so they deep-link directly (no parent-expand needed). Completed tasks live in the collapsed Archived section → `ArchivedSection` auto-expands, scroll+highlights, and opens the row's inline detail (archived equivalent of the edit view) when it holds the target. Task-no-longer-exists: no row matches → graceful land on the bucket, no crash. Normal bucket navigation (no state) unchanged. Client-only, no ranking/search-matching changes.

- **2026-07-21 — Priorities send feedback + auto-navigate.** Hitting Send (or voice-send) on the Priorities tab now fires a crisp 15ms vibration + a brief soft ascending two-note ping (`haptic.send()`, new; AudioContext closed after play to avoid accumulating toward the browser hardware-context limit), then switches to the CoS chat view so the streaming response is visible immediately. Text-send previously stayed on Priorities with no feedback; voice-send already navigated. No animation changes.

- **2026-07-21 — Calendar truncation fixed (pagination).** `api/calendar.js` GET fetched each calendar's `/events` with `maxResults=50` and no pagination; over the ~3-month window (`Calendar.jsx` spans prev-month-start → +2 months), past events consumed the 50-slot budget (ordered by startTime) and near-future events were silently dropped. Now loops on `nextPageToken` (250/page, 20-page = 5000-event safety cap); partial page failure keeps what was gathered. Deployed `e648bb0`. VERIFIED against the live Google API (stored token, exact endpoint logic): primary `yogeshmistry99@gmail.com` has 75 events in the window — Blood Test (24 Jul) was position #55, Neurology (24 Jul) #56, Neuropsychology (8 Aug) #60, all beyond the old 50-cap and previously dropped; all three now returned. Confirmed calendar id resolves to `@gmail.com` (not `@googlemail.com`). Fix touched only the event-read loop — no task-store/OAuth writes, so no snapshot needed.

- **2026-07-19 (cont. 5) — "How to Use Life OS" Settings card (UI only).** New collapsed-by-default `CollapsibleSection` above "How Scoring Works": five rhythm rows (Daily / When something comes up / Sunday / Monthly / When building the app), each a bold cadence label + plain action text, left-accent-bordered for glanceability. Matches existing card styling. No logic changes.

- **2026-07-19 (cont. 4) — Scoring explainer + placement line (UI only).** New collapsed-by-default "How Scoring Works" `CollapsibleSection` in Settings, above Development Roadmap (styling matches existing cards). Computed-preview task rows, when tapped open, now show a plain-language placement line under the four scores: "Triage — irreversible + high consequence" / "Rank #N — score 64.0, no urgency modifier" / "Rank #N — score 18.0, ×1.5 urgency (due in 4 days)" / "Unscored — ranks below all scored tasks". `ranking.js` now attaches `rank` (1-based) + `urgency` to each entry; the copy is built in `ComputedPreview.jsx` (`placementLine`/`duePhrase`). No logic/ranking changes.

- **2026-07-19 (cont. 3) — Rubric calibration (partial).** Compounding-5 anchor de-self-referenced ("the Life OS itself" → "a system that permanently automates a recurring obligation"); `list_tasks` now returns the 4 score fields + pinned. Both deployed (`63c181f`, READY). Confirmed the inflation before change: all 19 active Systems tasks scored compounding ≥4 (13 at max 5), compounding mean 4.68, consequence mean 3.74. **Re-score NOT done** — two blockers: (a) the batch endpoint skips already-scored tasks, so it cannot re-score Systems without them first being nulled; (b) nulling requires a store write, and the direct Supabase write from the sandbox was blocked by the safety classifier while the batch endpoint is unreachable (`*.vercel.app` egress blocked, Vercel/Supabase MCP disconnected). Store left intact (write never executed). Resolved via Option A: `/api/score-backlog` gained `?rescore=1&bucket=<name>` (deployed `c7edb28`). Systems re-scored (19 tasks). RESULT: anchor change had minimal effect — compounding mean 4.68→4.58, k>=4 still 18/19, consequence 3.74→3.68. Root cause is NOT the example wording: the Systems bucket is full of literal app/roadmap-build tasks (Phase 1-6, Life OS cleanup, head instructions) that Haiku legitimately scores k5 regardless. Real fixes if damping wanted: stricter effort/consequence on build tasks, or split Life-OS-build into its own project. Also noted: re-scoring reintroduced LLM noise (Passwords/MFA drifted r4->r5 -> Tier-0 #1) — the deterministic ranking freezes scores for a reason, so re-scoring should stay deliberate. Store: 122/122 active scored.
- **2026-07-19 (cont. 2) — Backlog fully scored; verification closed.** All 122 active top-level tasks scored (0 failures). Live-create confirmed: two tasks created via deployed paths arrived scored with UUID ids. Real ranking: Tier 0 = 3 tasks (device backups, digital estate doc, estate planning/Will+LPA). Rubric drift found: (1) the k5 anchor literally names "the Life OS itself", so Life-OS/Systems tasks self-inflate on compounding — Systems has the highest bucket mean consequence (3.74) and 6 of the top 15; soften that anchor. (2) "Verify device backups" got reversibility 5 (model scored the downside, not the task's window) → #1 overall; correct via `update_task`. (3) Passwords/MFA scored r4, though the spec diagnosis called it triage-tier. Distributions otherwise healthy: c5 3%, r5 2.5%, effort S53/M60/L9, compounding is the loosest dimension (k4+k5 = 35%).
- **2026-07-19 (cont.) — Scoring MERGED + DEPLOYED (`6c60ed8`, READY).** First deploy failed: Vercel counts every `.js` under `api/` as a serverless function — helpers pushed it to 14 vs the Hobby cap of 12 (`exceeded_serverless_functions_per_deployment`). Fixed by renaming `api/lib` → `api/_lib` (underscore paths excluded); now at exactly 12/12 — **zero headroom, the next new endpoint file will fail the deploy**. Verified against the spec task (`1fa305c4…`) post-deploy: build matches, incl. bucket-order-tiebreak-only and no-numbers-in-list-view; two gaps flagged — spec wants effort "most prominently editable" in the app UI (currently editable only via MCP `update_task`), and spec says bucket tiebreak within "near-tie bands" while the build uses exact-equality ties. Real store at 301 tasks / 121 active / **0 scored** — backlog scoring awaits a browser trigger of `/api/score-backlog?n=25&token=<MCP_API_KEY>` (sandbox can't reach `*.vercel.app`; note: direct Supabase REST from the sandbox now works — the old egress 403 is gone, reads confirmed live).
- **2026-07-19 — Priority scoring build (feature branch, NOT yet merged).** Four scoring fields on every task — `consequence` (1–5), `reversibility` (1–5), `compounding` (1–5), `effort` (S/M/L) — plus `pinned` (bool), all defaulting to null/false (= unscored). `buildTask` carries them; `enrichNewTask` is now real: one Haiku call (`claude-haiku-4-5`, temp 0, 4s timeout) against a server-side anchored rubric (`SCORING_RUBRIC` in `api/lib/taskWrite.js`); ANY failure → task created unscored, never blocks. New `api/lib/ranking.js`: pure deterministic ranking (no LLM) — Tier 0 triage (reversibility 5 + consequence ≥4), Tier 1 score = (consequence × urgency × reversibility × compounding)/effort(S1/M2/L3), urgency ×2 ≤48h/overdue, ×1.5 ≤7d, ×1.2 ≤14d, ×1 otherwise or no due date (never invents dates); pinned floats within tier; bucket order breaks ties only; unscored rank last, flagged. UI: read-only "Computed (preview)" card on Priorities below the CoS list (rank + tier dot; tap reveals scores + rule) — CoS list untouched. Lazy backfill: score-on-touch in MCP `update_task` + chat `update_task`; new authed `GET /api/score-backlog?n=` scores the N oldest unscored active tasks per call. MCP `update_task` accepts/returns the 4 fields + pinned; `create_task` returns them. Verified locally: field defaults, fail-open, mocked-Haiku parse + rejection of out-of-range, urgency curve, and full ranking semantics. **Held on feature branch:** Supabase MCP down all session → could not read the spec task (`1fa305c4…`), could not snapshot (gate), could not run ranking against the real store or live-create a scored task. NOTE: api/ is now at 12 serverless functions — the Hobby-plan cap; the next new endpoint will fail to deploy.

- **2026-07-18 (cont.) — WeeklyReview reads the store; "Sync from Todoist" disarmed.** `WeeklyReview.jsx` now reads the authoritative task store (`getCachedTasks` + `readTasksFromSupabase`) instead of live Todoist via `getAllTasks` — weekly review sees current reality, including UUID tasks created since migration. Settings' "Import from Todoist" section, its button, and `handlePullTasks` were removed so a stale-Todoist merge over the store is no longer one tap away; `pullAndCacheTasks` remains in `taskCache.js` (unreferenced from UI) but nothing user-tappable triggers it. Parked as **task 16** (untouched): section grouping (`getProjectSections`), `closeTask`, and the `/api/todoist` + `src/lib/todoist.js` endpoints.
- **2026-07-18 (cont.) — Last two bypass create/edit paths rerouted; Todoist read-path confirmed live.** `QuickAdd.jsx` create now goes through `/api/create-task` → `buildTask` and persists to the store (was Todoist-only). `TaskEditSheet.saveSubtaskEdit` (an edit) now persists content changes to the store via `saveToCache` (not `/api/create-task`, which is create-only). No `/api/todoist` **write** calls remain in any UI create/edit path. **Definitive trace:** `api/todoist.js` is a real proxy to `https://api.todoist.com` (Bearer `TODOIST_API_KEY`) — NOT legacy-named Supabase reads. So `getAllTasks` (used by `pullAndCacheTasks` "Sync from Todoist" and `WeeklyReview`) and `getProjectSections` (BucketDetail section grouping) read **live Todoist** — a stale-data source post-migration (Todoist lacks all UUID tasks created since). `closeTask` (Home/BucketDetail complete) is a real Todoist write. Endpoint retire/rename is a reported bug with a plan below — NOT actioned. Held at feature branch pending snapshot + merge.
- **2026-07-18 — Task construction converged on a single choke point.** New `api/lib/taskWrite.js` exports `buildTask(input)` (canonical constructor — UUID ids, retires `local_` minting, always sets `is_completed:false`/`completed_at:null`/`_category`/`priority`/`project_id`) and `enrichNewTask(task)` (async no-op stub; the future hook for AI category + priority scoring). Routed all three named create sites through it: `api/mcp.js createTask`, `api/claude.js` chat `create_task`, and `notifications.acceptNotification` + TaskEditSheet subtask-add via a new thin `POST /api/create-task` (construction-only, no DB write; caller persists via `saveToCache`). Fixed path-3 data loss: TaskEditSheet subtask creation now persists to the store (was Todoist-only). Removed `/api/todoist` writes from TaskEditSheet edit + subtask-add. Fixed `createTask` `completed_at` asymmetry (now always `null`). `complete_task`'s Todoist-close guard now skips UUIDs (not just `local_`) so choke-point tasks don't 404. Verified: MCP-path and chat-path `buildTask` output identical 14-field shape with distinct UUIDs (logic-level; live infra was down). **NOT fully converged yet** — `QuickAdd.jsx` (5th create path) and `TaskEditSheet.saveSubtaskEdit` still write Todoist directly; `/api/todoist` remains alive for reads (`getAllTasks`, `getProjectSections`) and `closeTask`, so it was NOT deleted. Deploy held at feature branch pending a pre-start snapshot (Supabase/Vercel MCP + egress all down this session).
- **2026-07-18 — Weekly backup dedupe + verification.** The Sunday browser path and the Vercel cron could both fire on a Sunday and write two snapshots, eating two of the 12 cap slots. Added dedupe to both (`api/cron-weekly-backup.js`, `src/lib/backups.js` `maybeRunAutoBackup`): skip if a `Weekly backup%` snapshot already exists in the last 6 days, so a week never stores two. Cron endpoint gained an auth-gated `?force=1` bypass and now accepts `CRON_SECRET` via `?token=` for header-less manual triggers. Verified: cron registered on deployment `dpl_8AYB1c9…` (`0 8 * * 0`); unauthenticated call → 401 (no open route); write path + prune-to-12 + dedupe confirmed against the live `task_backups` table (snapshot of 298 tasks written, table pruned to 12, subsequent weekly runs now skip).
- **2026-07-16 — Two-way task completion.** Archived tasks in the bucket view now render the active-task completion circle (green-filled tick), tappable to reopen (via existing `handleRestore`). `update_task` gained an optional `is_completed` boolean (mirrors `parent_id`; keeps `completed_at` consistent). Settings roadmap card now subscribes to the task store via `onSyncChange('todoist_task_cache')` so completions/reopens re-render without a reload (the follow-up flagged after deploy 80822bf). Also reopened a test-ticked Phase 1 task (`9cd11218…`, Notifications) so Foundation reads 7/8 again.
- **2026-07-16 — `update_task` gained `parent_id`.** Re-parented Email integration, Whoop health, and 4-agent pipeline under Phase 3. Settings roadmap card rewired to live task-store data (category "Roadmap Phase" containers + subtasks), static content dropped.
- **2026-07-16 — `knowledge_backups` capped at 12 (prune on write).** Added prune-on-write to all three insert sites (`api/mcp.js` `updateRoadmap`/`updateKnowledge`, `api/sync-all-buckets.js`), keeping the most recent 12 by `backed_up_at`, matching `task_backups`. Was 11 rows at fix time (under cap, 0 reclaimed immediately); now bounded going forward.
- **2026-07-16 — Weekly backup is now a real server-side cron.** New `api/cron-weekly-backup.js` (reads task store → inserts `task_backups` snapshot → prunes to 12), registered as a Vercel cron `0 8 * * 0` (Sundays 08:00 UTC). Auth accepts the Vercel `CRON_SECRET` bearer OR the `MCP_API_KEY` token. `CRON_SECRET` env var set in Vercel. Replaces the old browser-and-Sunday-gated client backup. Baseline snapshot taken 2026-07-16 (245 tasks). Note: Vercel is Hobby plan (cron max once/day, ~1h timing accuracy — weekly is fine).
- **2026-07-16 — Storage inventory verified live via Supabase MCP.** Confirmed 3 tables, 19 `app_data` keys, task store at 245 tasks, `task_backups` at the 12-row cap, `knowledge_backups` at 10. Corrected the doc: `app_roadmap` is code-referenced but has no row yet. Noted that the Supabase MCP works in-session even though direct HTTPS egress is blocked.
- **2026-07-09 — localStorage quota crash fixed.** CoS chat (`cos_home_messages`) and Head chats (`cos_head_${bucket}`) capped to the most recent 50 messages, evict-oldest-on-write. New `src/lib/safeStorage.js` (`safeSetItem` try/catch + `capRecent`) wraps all three chat writes (Home, ChiefPage, BucketDetail) so a quota error logs and continues instead of throwing. Discussions intentionally left uncapped.
- **2026-07-09 — `saveToCache` destructive-overwrite bug fixed (merge-by-ID).** BucketDetail passes a bucket-filtered task slice; the head chat's `onTasksUpdated` called `saveToCache`, which full-overwrote `todoist_task_cache` and wiped the other 6 buckets (only Work/26 survived). `saveToCache` now merges incoming tasks by id into the existing cache — a filtered array can only add/update its own tasks, never delete others'. (Confirmed holding: store is back to 245 tasks.)
- **2026-07-08 — `/api/sync-all-buckets` hardened.** Added `MCP_API_KEY` token auth and a pre-write snapshot of the task cache to `knowledge_backups`. Removed the unauthenticated `/api/seed-cleanup-tasks` endpoint.
- **2026-07-08 — Category field added to MCP task tools.** `create_task`/`update_task` accept `category`; `list_tasks` filters by and returns it; stored as `_category` on the task. (In-app Head chats still do not expose it — see open bug 3.)
- **2026-07-08 — Todoist → Supabase migration completed / write path removed.** MCP `create_task` now generates a UUID and writes directly to Supabase (no Todoist). `update/complete/delete` skip Todoist for UUID tasks, still hit it for legacy numeric IDs. CoS reads all 7 buckets from Supabase; `CONTEXT.md` de-Todoist-ed.

---

## Traps and hard-won lessons

- **Supabase project ref is `xrmjzglsabnnqqeyubgh`** (`xrmjzglsabnnqqeyubgh.supabase.co`). Direct HTTP is blocked from the sandbox — query via the Supabase MCP or the app, not `curl`/`fetch`.
- **`app_data.todoist_task_cache` is NO LONGER the task store.** It was the single JSON blob that held every task; since the 2026-07-26 per-row migration the source of truth is the `tasks` table and the blob is a frozen fallback, refreshed weekly from live rows. (Its name never meant Todoist was authoritative — it isn't, and the Todoist paths are retired.)
- **The weekly backup is a Vercel cron** (`api/cron-weekly-backup.js`, `0 8 * * 0`, Sundays 08:00 UTC) — server-side, no longer dependent on the app being opened. The client-side `maybeRunAutoBackup` (Sunday, browser-gated) remains as a deduped fallback: both paths skip if a `Weekly backup%` snapshot exists in the last 6 days, so a week never stores two. Hobby-plan cron timing is accurate to ~1h and the first fire after a deploy can take up to ~24h to activate.
- **NEVER write the whole task list.** Tasks are one row per task in `tasks`, written only via
  `api/_lib/tasksRepo.js` with partial UPDATEs. There is deliberately no "save the whole list"
  function any more — if you find yourself wanting one, that is the 2026-07-26 data-loss bug trying
  to come back. Anything that reads `app_data.todoist_task_cache` as a task source is wrong: it is
  a frozen fallback, refreshed weekly from live rows.
- **All task reads must filter `deleted_at is null`.** `tasksRepo` does this; hand-rolled SQL or a
  raw `.from('tasks')` call will resurrect deleted tasks.
- **Never send chat history to the model as text-only when tools are involved.** `tool_use` blocks
  are not persisted, so a raw replay teaches the model that writing "✓ Task created" *is* the
  action — it then stops calling the tool, and tasks are confirmed but never saved. Build history
  with `historyForModel()` (`src/lib/claude.js`), which strips ✓ lines from assistant turns. Any new
  chat surface must use it.
- **The chat model will sometimes claim a write it never made.** A system-prompt rule does not stop
  it; only checking the tool results does. `api/claude.js` compares the reply against whether a
  write tool actually succeeded and appends a correction when they disagree
  (`api/_lib/writeClaim.js`). Any new state-changing tool must be added to that module's
  `WRITE_TOOLS` set, or a genuine write will be mistaken for a false confirmation.
- **`sendMessageStream`'s `onChunk` gives you `(delta, full)` — render `full`.** Accumulating
  deltas yourself looks equivalent but silently breaks the server's `drop_chars` retraction, and
  the chat starts double-printing confirmations again.
- **A tool error is only visible if it is logged.** Tool failures return to the *model* as a
  `tool_result`, not to the server log — so an unlogged failed write is indistinguishable from a
  write that was never attempted (200, clean logs, no row). `runTool` in `api/claude.js` logs both.
- **In-app Head chats cannot set task categories** — their task tools don't expose the field. Use the MCP (via Claude.ai) to set categories.
- **`*.vercel.app` and direct Supabase HTTP are egress-blocked from the sandbox.** To trigger an `/api/*` endpoint, open the URL in a browser; to read Supabase, use the Supabase MCP tools. Don't conclude "capability unavailable" — it works from the app/browser and via MCP, just not via raw HTTP from here.
- **`node_modules` can be reclaimed mid-session** (disk allowance). If `vite: not found`, run `npm install` before building.
- **The journal has NO local cache and NO offline queue — that is deliberate, not an omission.**
  A cached entry that looks saved but isn't, or a queued write replayed later over a newer edit,
  are both exactly the failure this feature cannot have. Offline means the save fails *visibly*
  and the entry stays on screen to retry. Do not "improve" it by adding a cache.
- **Never let the model near a journal figure.** Scores and severity labels are rendered from the
  stored row; `narrativeInput()` hands the model severity *words* only, so there is no number it
  could transpose. A wrong figure in a symptom diary is a factual error in evidence, and the
  document is disclosed in a personal injury claim.
- **`sleep_quality` is inverted — 4 means GOOD sleep**, the opposite of every other item. It is
  excluded from `meanSeverity()`; averaging it in silently cancels out real symptom load. Any new
  chart, mean or summary must check `isInverted()`.
- **Do not merge journal symptoms that look like duplicates.** Tinnitus vs noise sensitivity
  (internal sound vs sensitivity to external), fatigue vs sleep quality (he sleeps well and still
  wakes exhausted), people at work vs at home. Each carries a `why` note in
  `api/_lib/journalSymptoms.js` recording the reason. They are distinct in his experience and in
  the clinical record.
- **`authored_at` is not `entry_date` and must stay separate.** It is what makes a backdated entry
  detectable, and the filed document says so. Contemporaneity is an evidential property — a diary
  presented as same-day when it was written a week later is worse than the delay itself.
- **`values.get` silently drops hyperlinks.** Any Sheets read that needs a link must use
  `spreadsheets.get` with `includeGridData=true`; the display text comes back either way, so the
  loss is invisible until someone notices a dead "View document". See `api/_lib/google.js`.
- **`drive.file` cannot read files the app did not create.** It is per-file, not per-Drive. Reading
  an existing user-made file needs a different scope (`spreadsheets.readonly` here) — and the
  failure mode is a 404 that looks exactly like a wrong file id.
- **`VITE_*` env vars are baked into the bundle at BUILD time.** Adding one in Vercel does nothing
  until a new build runs, so set it *before* pushing the code that reads it — otherwise the deploy
  ships blind to it and needs a second one. Check by grepping `dist/assets/*.js` for the value, not
  by assuming.
- **A UI control that can't work must still render and say why.** Returning `null` when a dependency
  is missing makes "not set up yet" indistinguishable from "broken", and the user is left hunting
  for something that removed itself. This already happened once with the reminder toggle.
- **NEVER add a `fetch` handler or any caching to `public/sw.js`.** The service worker is push-only
  and that is the entire reason it was safe to re-enable after caching broke deployed updates. A
  worker with no `fetch` listener cannot serve stale content; one with a `fetch` listener can, and
  the app silently stops updating. A test asserts the handler's absence — if it fails, do not
  "fix" the test.
- **`api/*.js` is the constraint, not a preference.** 12/12 on Vercel Hobby. New server work goes
  into `api/_lib/` or folds into an existing function via a query param (`api/cron.js?job=…`,
  `api/google.js?action=…`). Crons are also at 2/2.
- **In the journal charts, a gap must stay a gap.** `null` means no entry and `0` means recorded as
  none — never conflate them, and never interpolate a line across a missing day. `segments()` in
  `src/lib/journalChart.js` enforces the break; a "smoother" chart that joins across gaps is
  fabricating observations in a document that goes to a solicitor.
- **Journal entry text is tidied, never reworded.** Per-symptom notes get sentence case and a full
  stop and nothing more; the model rewrites the free-text dump into his voice, and the verbatim
  original always stays in `free_text`. The words in the record are the evidence.
