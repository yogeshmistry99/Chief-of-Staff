// Canonical task construction — THE single choke point for creating a task.
//
// Every create path must build its task object here so all tasks share one
// shape and one id scheme (crypto.randomUUID; the legacy `local_` minting is
// retired). This is also the single place where future AI category
// auto-assignment and priority scoring will hook, via enrichNewTask.
//
// Callers: api/mcp.js createTask, api/claude.js executeTool create_task, and
// api/create-task.js (used by the app: notifications accept + subtask add).

export const PROJECTS = {
  Finance:  '6gmVXCpMmXX8V5MV',
  Health:   '6gmVXCm3jxXfXVWw',
  Home:     '6gmVXCpQQxw3gFgw',
  Work:     '6gmVXCv7j946mv75',
  Family:   '6gmVXCpr8mc6mjjX',
  Personal: '6gmcXJpGfj6gh4Gc',
  Systems:  '6gmVXCmRw6X6cgpM',
}
export const PROJECT_NAMES = Object.fromEntries(Object.entries(PROJECTS).map(([n, id]) => [id, n]))

function resolveProject(project_name) {
  if (!project_name) return { bucketName: null, project_id: null }
  const entry = Object.entries(PROJECTS).find(
    ([n]) => n.toLowerCase() === String(project_name).toLowerCase()
  )
  if (!entry) throw new Error(`Unknown bucket "${project_name}". Valid: ${Object.keys(PROJECTS).join(', ')}`)
  return { bucketName: entry[0], project_id: entry[1] }
}

// ─── Scoring field validators ─────────────────────────────────────────────────
export function validScore(v)  { return Number.isInteger(v) && v >= 1 && v <= 5 ? v : null }
export function validEffort(v) { return v === 'S' || v === 'M' || v === 'L' ? v : null }
export function isScored(t) {
  return validScore(t?.consequence) !== null
    && validScore(t?.reversibility) !== null
    && validScore(t?.compounding) !== null
    && validEffort(t?.effort) !== null
}

// Build a canonical task object from a normalized input:
//   content     (required) — task title
//   priority    (int 1–4, 4=urgent; defaults to 1)
//   project_name(bucket name) or null
//   category    or null
//   parent_id   or null
//   description or null
//   due         ({ date: 'YYYY-MM-DD' } object) or null
//   consequence / reversibility / compounding (int 1–5) — optional, default null
//   effort      ('S'|'M'|'L') — optional, default null
// Scoring fields default to null = unscored; enrichNewTask fills them.
export function buildTask(input = {}) {
  if (!input.content) throw new Error('content is required')
  const { bucketName, project_id } = resolveProject(input.project_name)
  const p = Number.isInteger(input.priority) ? input.priority : 1
  return {
    id: crypto.randomUUID(),
    content: input.content,
    priority: p >= 1 && p <= 4 ? p : 1,
    due: input.due ?? null,
    is_completed: false,
    completed_at: null,
    parent_id: input.parent_id ?? null,
    description: input.description ?? null,
    project_id,
    section_id: null,
    _projectName: bucketName,
    _sectionName: null,
    _category: input.category ?? null,
    created_at: new Date().toISOString(),
    consequence: validScore(input.consequence),
    reversibility: validScore(input.reversibility),
    compounding: validScore(input.compounding),
    effort: validEffort(input.effort),
    pinned: input.pinned === true,
  }
}

// ─── Scoring rubric ───────────────────────────────────────────────────────────
// Server-side constant. Anchors for every level of every field, with
// cross-bucket examples baked into the anchor text so Haiku scores
// consistently whether the task is Finance, Health, Family, or Systems.
export const SCORING_RUBRIC = `Score the task on four dimensions using these anchors.

CONSEQUENCE — real-world impact of doing vs. not doing this task:
1: Negligible — cosmetic or optional; nothing changes if skipped this month. (Reorganising app icons; alphabetising the bookshelf; trying a new podcast.)
2: Minor — small friction or a missed nicety; recoverable in stride. (Renewing a library card; replacing a worn gym bag; tidying one drawer.)
3: Moderate — real money, health, or relationship value at stake, but bounded. (Disputing a mid-size bill; booking an overdue dental check-up; planning a family weekend away.)
4: Major — significant financial, health, career, or family impact. (Filing a tax return; investigating a recurring health symptom; preparing a career-defining client presentation; a child's school application.)
5: Critical — life-altering or existential for finances, health, family, or livelihood. (Exchange on a house purchase; urgent medical treatment; a safeguarding issue at home; an event that could cost the job.)

REVERSIBILITY — how recoverable the situation is if this is delayed or missed (5 = window closes forever):
1: Fully reversible — can be done any time with no loss. (Updating a playlist; rearranging furniture; drafting notes for a someday-project.)
2: Mostly reversible — small cost or friction to recover. (Rebooking a gym class; re-ordering a returned item; rescheduling a coffee catch-up.)
3: Partly reversible — recovery possible but costly or lossy. (Missing an early-bird price; mending a strained friendship after a forgotten commitment; redoing paperwork after a form lapses.)
4: Hard to reverse — a narrow window; recovery uncertain and expensive. (A visa or exam deadline; a limited job-application window; delaying treatment for something that quietly worsens.)
5: Irreversible — the option disappears entirely. (Missing a critical medical referral; letting a mortgage offer expire; missing an irreplaceable early milestone with a young child; a statutory filing deadline with penalties.)

COMPOUNDING — leverage: does completing this unlock or ease other things over time:
1: None — self-contained, no downstream effect. (Buying a single gift; a one-off errand.)
2: Slight — a small convenience later. (Organising files for one project; saving a reusable template.)
3: Moderate — makes a recurring activity easier from now on. (Setting up autopay; a weekly meal-prep routine; documenting a work process.)
4: High — unlocks other tasks or builds an appreciating asset. (Automating savings; fixing sleep habits; building a reusable client pipeline; teaching a child to read.)
5: Foundational — reshapes many future weeks. (Restructuring finances; a health regimen that reverses a chronic risk; a hiring/delegation system; the Life OS itself.)

EFFORT — honest size of the work:
S: under ~30 minutes of focused work. (A phone call; a form; a decisive email.)
M: about a half-day block, or several short sessions. (Comparing insurance quotes; preparing a meeting pack.)
L: multi-day or sustained multi-week effort. (A renovation phase; a professional certification; migrating bank accounts.)`

// ─── AI scoring ───────────────────────────────────────────────────────────────
// One Haiku call scoring a task against the rubric. Returns
// { consequence, reversibility, compounding, effort } or null on ANY failure
// (missing key, timeout, bad JSON, out-of-range values). Callers fail open.
const SCORING_TIMEOUT_MS = 4000

export async function aiScoreTask(task) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), SCORING_TIMEOUT_MS)
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 200,
        temperature: 0,
        system: `${SCORING_RUBRIC}\n\nRespond with ONLY a JSON object: {"consequence":n,"reversibility":n,"compounding":n,"effort":"S"|"M"|"L"} — no prose.`,
        messages: [{
          role: 'user',
          content: JSON.stringify({
            task: task.content,
            bucket: task._projectName ?? null,
            description: task.description ?? null,
            due_date: task.due?.date ?? null,
          }),
        }],
      }),
    })
    if (!res.ok) return null
    const data = await res.json()
    const text = data?.content?.find((b) => b.type === 'text')?.text ?? ''
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) return null
    const parsed = JSON.parse(match[0])
    const scores = {
      consequence: validScore(parsed.consequence),
      reversibility: validScore(parsed.reversibility),
      compounding: validScore(parsed.compounding),
      effort: validEffort(parsed.effort),
    }
    if (scores.consequence === null || scores.reversibility === null
      || scores.compounding === null || scores.effort === null) return null
    return scores
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

// Enrich a freshly built task with AI scores. NEVER blocks creation: any
// scoring failure returns the task unchanged (unscored, fields stay null).
// Tasks that already carry valid scores (e.g. provided explicitly) are
// passed through untouched.
export async function enrichNewTask(task) {
  if (isScored(task)) return task
  const scores = await aiScoreTask(task)
  return scores ? { ...task, ...scores } : task
}
