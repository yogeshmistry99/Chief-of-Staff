// The ONLY module that touches task storage.
//
// Replaces the old model where the entire task list lived as one JSON array in
// app_data.todoist_task_cache and every write was read-whole / modify /
// write-whole. Any two interleaved writes, or any write built on a stale
// snapshot, silently destroyed data — a task could be created, confirmed to the
// user, and then vanish with no error at any layer.
//
// The three properties that make this safe, and which must not be eroded:
//
//   1. A write touches ONE row and only the columns it changes. Updates are
//      partial UPDATEs, never whole-row upserts — so two surfaces editing
//      different fields of the same task both survive.
//   2. Every operation checks BOTH the error and the rows actually affected,
//      and throws when a write didn't land. Nothing reports success it has not
//      verified. This app has a history of false confirmations; they are worse
//      than errors.
//   3. Deletes are soft. Reads filter deleted_at IS NULL everywhere, so a
//      deleted task never surfaces, but the row survives and is recoverable.
//
// Takes an injected Supabase client so the browser (anon key) and the
// serverless functions (service/anon key) share identical semantics — there is
// no single server gateway available, because api/*.js is at the 12/12 Vercel
// Hobby function cap and a new endpoint file would fail the deploy.

// Columns selected for a task read. Explicit, so adding a column doesn't
// silently change what callers receive.
const COLS = 'id, content, priority, due_date, is_completed, completed_at, parent_id, description, project_id, project_name, section_id, section_name, category, consequence, reversibility, compounding, effort, pinned, created_at, updated_at'

// ─── Shape mapping ────────────────────────────────────────────────────────────
// The app and the MCP tools speak the legacy blob shape (_projectName,
// _category, due:{date}). Mapping here — rather than rewriting every consumer —
// keeps the UI and the MCP contract byte-identical from the outside.

export function rowToTask(row) {
  if (!row) return null
  return {
    id: row.id,
    content: row.content,
    priority: row.priority,
    due: row.due_date ? { date: row.due_date } : null,
    is_completed: row.is_completed,
    completed_at: row.completed_at,
    parent_id: row.parent_id,
    description: row.description,
    project_id: row.project_id,
    section_id: row.section_id,
    _projectName: row.project_name,
    _sectionName: row.section_name,
    _category: row.category,
    created_at: row.created_at,
    updated_at: row.updated_at,
    consequence: row.consequence,
    reversibility: row.reversibility,
    compounding: row.compounding,
    effort: row.effort,
    pinned: row.pinned === true,
  }
}

// Full task object → column row. Used for INSERT only.
export function taskToRow(task) {
  return {
    id: task.id,
    content: task.content,
    priority: task.priority ?? 1,
    due_date: task.due?.date ? task.due.date.slice(0, 10) : null,
    is_completed: task.is_completed === true,
    completed_at: task.completed_at ?? null,
    parent_id: task.parent_id ?? null,
    description: task.description ?? null,
    project_id: task.project_id ?? null,
    project_name: task._projectName ?? task.project_name ?? null,
    section_id: task.section_id ?? null,
    section_name: task._sectionName ?? task.section_name ?? null,
    category: task._category ?? task.category ?? null,
    consequence: task.consequence ?? null,
    reversibility: task.reversibility ?? null,
    compounding: task.compounding ?? null,
    effort: task.effort ?? null,
    pinned: task.pinned === true,
  }
}

// Partial patch (app shape) → column patch. Only keys actually present in the
// patch are emitted, so an UPDATE never overwrites a field the caller didn't
// mean to touch. This is the anti-clobber property — do not "simplify" it into
// taskToRow, which fills every column.
export function patchToRow(patch) {
  const row = {}
  const map = {
    content: 'content',
    priority: 'priority',
    is_completed: 'is_completed',
    completed_at: 'completed_at',
    parent_id: 'parent_id',
    description: 'description',
    project_id: 'project_id',
    project_name: 'project_name',
    _projectName: 'project_name',
    section_id: 'section_id',
    section_name: 'section_name',
    _sectionName: 'section_name',
    category: 'category',
    _category: 'category',
    consequence: 'consequence',
    reversibility: 'reversibility',
    compounding: 'compounding',
    effort: 'effort',
    pinned: 'pinned',
  }
  for (const [k, col] of Object.entries(map)) {
    if (Object.prototype.hasOwnProperty.call(patch, k)) row[col] = patch[k]
  }
  // `due` is the one shape-shifting field: { date } | null.
  if (Object.prototype.hasOwnProperty.call(patch, 'due')) {
    row.due_date = patch.due?.date ? patch.due.date.slice(0, 10) : null
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'due_date')) {
    row.due_date = patch.due_date ? String(patch.due_date).slice(0, 10) : null
  }
  return row
}

// ─── Failure handling ─────────────────────────────────────────────────────────

function fail(op, error) {
  throw new Error(`tasks.${op} failed: ${error?.message ?? String(error)}`)
}

function requireClient(sb) {
  if (!sb) throw new Error('tasks: Supabase client not configured')
}

// ─── Reads ────────────────────────────────────────────────────────────────────
// Every read filters deleted_at IS NULL. A soft-deleted task must never surface
// anywhere in the app or the MCP tools.

export async function listTasks(sb, { bucket = null, includeCompleted = true } = {}) {
  requireClient(sb)
  let q = sb.from('tasks').select(COLS).is('deleted_at', null)
  if (bucket) q = q.eq('project_name', bucket)
  if (!includeCompleted) q = q.eq('is_completed', false)
  const { data, error } = await q
  if (error) fail('list', error)
  return (data ?? []).map(rowToTask)
}

export async function getTask(sb, id) {
  requireClient(sb)
  if (!id) throw new Error('tasks.get: id is required')
  const { data, error } = await sb
    .from('tasks').select(COLS).eq('id', id).is('deleted_at', null).maybeSingle()
  if (error) fail('get', error)
  return rowToTask(data)
}

// ─── Writes ───────────────────────────────────────────────────────────────────

export async function createTask(sb, task) {
  requireClient(sb)
  if (!task?.id) throw new Error('tasks.create: id is required')
  if (!task?.content) throw new Error('tasks.create: content is required')
  const { data, error } = await sb
    .from('tasks').insert(taskToRow(task)).select(COLS).single()
  if (error) fail('create', error)
  if (!data) throw new Error('tasks.create: insert returned no row — task NOT saved')
  return rowToTask(data)
}

// Partial update. Returns the updated task. Throws if the row doesn't exist or
// is soft-deleted, rather than silently succeeding against nothing.
export async function updateTask(sb, id, patch) {
  requireClient(sb)
  if (!id) throw new Error('tasks.update: id is required')
  const row = patchToRow(patch ?? {})
  if (!Object.keys(row).length) return getTask(sb, id)
  const { data, error } = await sb
    .from('tasks').update(row).eq('id', id).is('deleted_at', null).select(COLS)
  if (error) fail('update', error)
  if (!data?.length) throw new Error(`tasks.update: no live task with id ${id} — nothing was saved`)
  return rowToTask(data[0])
}

export async function completeTask(sb, id, completed = true) {
  return updateTask(sb, id, {
    is_completed: completed,
    completed_at: completed ? new Date().toISOString() : null,
  })
}

// Soft delete. Children are promoted to top-level in the same operation.
//
// Why promote rather than cascade: the parent FK is ON DELETE SET NULL, so a
// hard delete would promote children. Soft delete must match that, or children
// would keep pointing at a hidden parent and disappear from every
// parent-grouped view — a silent vanishing, which is the exact class of bug
// this whole change exists to remove. Cascading instead would delete tasks the
// user never asked to delete. Promotion loses nothing.
export async function softDeleteTask(sb, id) {
  requireClient(sb)
  if (!id) throw new Error('tasks.delete: id is required')

  const { data: promoted, error: promoteErr } = await sb
    .from('tasks').update({ parent_id: null })
    .eq('parent_id', id).is('deleted_at', null).select('id')
  if (promoteErr) fail('delete(promote children)', promoteErr)

  const { data, error } = await sb
    .from('tasks').update({ deleted_at: new Date().toISOString() })
    .eq('id', id).is('deleted_at', null).select('id')
  if (error) fail('delete', error)
  if (!data?.length) throw new Error(`tasks.delete: no live task with id ${id} — nothing was deleted`)

  return { id, deleted: true, promotedChildren: promoted?.length ?? 0 }
}

// ─── Snapshot support ─────────────────────────────────────────────────────────
// Backups and the frozen app_data blob are DERIVED from live rows. They are
// written from here and never read back into the write path.

export async function snapshotTasks(sb) {
  return listTasks(sb)
}
