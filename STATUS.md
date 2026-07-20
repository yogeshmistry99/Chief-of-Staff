# STATUS — Life OS / Chief of Staff

Single source of truth for system state. **Read this at the start of every session.
Update it at the end of any session that changes anything.**

Last updated: 2026-07-16 (storage inventory verified live against Supabase project `xrmjzglsabnnqqeyubgh`)

---

## Architecture

- Vite + React 19 PWA (mobile-first), **not** Next.js despite older product notes — served on Vercel.
- Vercel serverless functions under `/api/*` (Node, ESM) provide the backend.
- Supabase (Postgres 17, region eu-central-1) is the persistence layer: tasks, knowledge, discussions, backups.
- `/api/mcp.js` is an MCP server (JSON-RPC) exposing task/knowledge tools to Claude.ai as a custom connector.
- GitHub is version control; Vercel auto-deploys `main`. Working branch: `claude/cool-lovelace-89c1nz`.

---

## What's connected and verified

| Integration | Status | Notes |
|---|---|---|
| GitHub read/push | **Verified** | MCP tools + git push to `main` and working branch exercised. |
| Vercel API (`api.vercel.com`) | **Verified** | Deployment listing + READY polling work with `VERCEL_TOKEN` in session env. |
| Supabase via **Supabase MCP** | **Verified** | `list_tables` / `execute_sql` work in this session — used to verify this doc's inventory. |
| Supabase via the app (browser) | **Assumed** | The deployed PWA reads/writes Supabase normally; not directly observable from the sandbox. |
| Supabase via `/api/mcp` connector | **Verified** (when connected) | Life OS MCP tools return live data; connection is intermittent in-session. |
| **Direct** Supabase HTTPS egress from the sandbox | **BLOCKED** | Known platform bug: `xrmjzglsabnnqqeyubgh.supabase.co` returns 403 "Host not in allowlist" through the egress proxy. A raw `curl`/`fetch` fails — but the **Supabase MCP tools do work**. Use the MCP, not direct HTTP. |
| `*.vercel.app` from the sandbox | **BLOCKED** | Egress proxy 403s all `*.vercel.app` hosts, so `/api/*` endpoints cannot be triggered from the sandbox. Trigger from a browser. |

---

## Where data lives (highest-value section)

### Supabase tables (verified live 2026-07-16)
- **`app_data`** — key/value store, 19 rows, PK `key`, RLS enabled. Columns: `key` text, `value` jsonb, `updated_at` timestamptz. Keys present:
  - `todoist_task_cache` — **THE TASK STORE.** Full array of all tasks across all 7 buckets. **245 tasks** as of 2026-07-16. Name is legacy; it is the live source of truth, not a Todoist mirror.
  - `todoist_last_pull` — timestamp of last Todoist pull (legacy sync path; last touched 2026-06-23).
  - `head_config_${key}` — per-head config for `chief`, `Finance`, `Health`, `Work`, `Family`, `Home`, `Personal`, `Systems` (8 rows).
  - `discussions_${bucket}` — discussions per bucket, one row each for all 7 buckets.
  - `task_notifications` — per-task notifications (64 entries).
  - `google_calendar_auth` — Google OAuth token state.
  - **`app_roadmap` — referenced by code (`get_roadmap`/`update_roadmap`) but NO ROW exists yet.** Not set until the roadmap is first saved.
- **`task_backups`** — task-store snapshots (`label`, `tasks`, `task_count`, `created_at`). **12 rows — currently AT the cap.** Capped at 12 (`MAX_SNAPSHOTS`, pruned on every write in `src/lib/backups.js`).
- **`knowledge_backups`** — prior values before overwrite (`head_key`, `backed_up_at`, `value`). 10 rows. Written by `update_knowledge`, `update_roadmap`, and `/api/sync-all-buckets` (key `todoist_task_cache_snapshot`). **No retention policy — grows unbounded.**

### localStorage keys
| Key | Holds | Supabase mirror | Capped? |
|---|---|---|---|
| `cos_home_messages` | CoS chat history | **No** | **Yes — last 50**, via `safeSetItem` |
| `cos_head_${bucket}` | Head chat history per bucket | **No** | **Yes — last 50**, via `safeSetItem` |
| `cos_discussions_${bucket}` | Discussions per bucket | **Yes** (`discussions_${bucket}`) | No — persists until deleted/completed/archived |
| `todoist_task_cache` | Task cache (mirror) | Yes | Merge-by-id (dedupe, not a cap) |
| `todoist_last_pull` | Last pull timestamp | Yes | — |
| `head_instructions/context/files/model_${key}` | Head config | Yes (`head_config_${key}`) | — |
| `lastWeeklyReview` | Last weekly review ts | Yes (`last_weekly_review`) | — |
| notifications key | Task notifications | Yes (`task_notifications`) | — |
| `cos_priority_list` / `cos_priority_last_refreshed` | AI priority list + ts | No | No |
| `SPEND_LIMIT_KEY` | API spend limit | No | — |
| API usage/cost key | Accumulated API cost | No | — |
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

---

## Recent significant changes (newest first)

- **2026-07-19 (cont. 3) — Rubric calibration (partial).** Compounding-5 anchor de-self-referenced ("the Life OS itself" → "a system that permanently automates a recurring obligation"); `list_tasks` now returns the 4 score fields + pinned. Both deployed (`63c181f`, READY). Confirmed the inflation before change: all 19 active Systems tasks scored compounding ≥4 (13 at max 5), compounding mean 4.68, consequence mean 3.74. **Re-score NOT done** — two blockers: (a) the batch endpoint skips already-scored tasks, so it cannot re-score Systems without them first being nulled; (b) nulling requires a store write, and the direct Supabase write from the sandbox was blocked by the safety classifier while the batch endpoint is unreachable (`*.vercel.app` egress blocked, Vercel/Supabase MCP disconnected). Store left intact (write never executed). Resolved via Option A: `/api/score-backlog` gained `?rescore=1&bucket=<name>` (deployed `c7edb28`, READY) — re-scores already-scored tasks in a bucket. Remaining step is a one-off browser trigger (`?rescore=1&bucket=Systems&n=25&token=<MCP_API_KEY>`); sandbox can't reach `*.vercel.app`. After-mean + final top-15 owed once triggered.
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
- **The task store key is `todoist_task_cache`** despite the name. It is the live single source of truth in `app_data`, not a Todoist cache. Do not assume Todoist is authoritative.
- **The weekly backup is a Vercel cron** (`api/cron-weekly-backup.js`, `0 8 * * 0`, Sundays 08:00 UTC) — server-side, no longer dependent on the app being opened. The client-side `maybeRunAutoBackup` (Sunday, browser-gated) remains as a deduped fallback: both paths skip if a `Weekly backup%` snapshot exists in the last 6 days, so a week never stores two. Hobby-plan cron timing is accurate to ~1h and the first fire after a deploy can take up to ~24h to activate.
- **BucketDetail passes a bucket-filtered slice** of tasks to everything downstream. Anything it writes to the task store **must merge by id, never overwrite** — a full overwrite wipes the other buckets. (This is exactly the bug fixed on 2026-07-09.)
- **In-app Head chats cannot set task categories** — their task tools don't expose the field. Use the MCP (via Claude.ai) to set categories.
- **`*.vercel.app` and direct Supabase HTTP are egress-blocked from the sandbox.** To trigger an `/api/*` endpoint, open the URL in a browser; to read Supabase, use the Supabase MCP tools. Don't conclude "capability unavailable" — it works from the app/browser and via MCP, just not via raw HTTP from here.
- **`node_modules` can be reclaimed mid-session** (disk allowance). If `vite: not found`, run `npm install` before building.
