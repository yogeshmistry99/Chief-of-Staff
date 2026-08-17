import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import TaskEditSheet from './TaskEditSheet'

// A RENDER test, and that is the point of it.
//
// The property under test is not visible from the pure layer: that a save from
// this sheet writes ONLY the fields the user changed in it. The sheet used to send
// its whole field set every time, so a title edit also rewrote `description` — and
// if that description had been changed out of band while the sheet sat open (MCP
// via Claude.ai, a Head chat, CoS), the sheet's stale copy silently reverted it.
// Yogesh edits from all three surfaces routinely, so this is normal use.
//
// `row` below stands in for the Supabase row, and the `updateTaskRow` mock applies
// a patch to it the way `tasksRepo.patchToRow` does: keys present in the patch are
// written, keys absent are left untouched. An out-of-band edit is a direct write to
// `row` — the sheet's `task` prop deliberately keeps the older copy, which is
// exactly the situation that used to lose data.

let row
const updateTaskRow = vi.fn(async (id, patch) => {
  for (const [k, v] of Object.entries(patch)) row[k] = v
  return { ...row }
})

vi.mock('../lib/taskCache', () => ({
  updateTaskRow: (...a) => updateTaskRow(...a),
  createTaskRow: vi.fn(),
}))

vi.mock('../lib/haptic', () => ({
  haptic: new Proxy({}, { get: () => () => {} }),
}))

const makeTask = () => ({
  id: 't1',
  content: 'Renew passport',
  priority: 3,
  description: 'photos already taken',
  due: { date: '2026-09-01' },
  consequence: 4, reversibility: 2, compounding: 3, effort: 'M',
  is_completed: false,
  project_id: 'p9',
})

// The sheet's copy of the task, captured at load. Kept separate from `row` on
// purpose: after an out-of-band write the two diverge, and the sheet must not
// push its stale copy over the newer row.
function open() {
  const loaded = makeTask()
  const view = render(<TaskEditSheet open task={loaded} allTasks={[]} />)
  return { loaded, ...view }
}

// The title <p> is itself the click target that enters edit mode — and the click
// unmounts it in favour of a textarea, so hold the surrounding div, not the <p>.
function editTitle(value) {
  const p = screen.getByText('Renew passport')
  const field = p.parentElement
  fireEvent.click(p)
  fireEvent.change(field.querySelector('textarea'), { target: { value } })
}

// The description is behind an icon-only pencil, so reach it through the section
// heading rather than by role — every pencil in the sheet looks identical.
function descSection() {
  return screen.getByText('Description').closest('div')
}
function editDescription(value) {
  const section = descSection()
  fireEvent.click(section.querySelector('button'))
  fireEvent.change(section.querySelector('textarea'), { target: { value } })
}

function tapSave() {
  const btn = screen.getByText('Save')
  fireEvent.pointerDown(btn)
  fireEvent.pointerUp(btn)
}

const lastPatch = () => updateTaskRow.mock.calls.at(-1)[1]

beforeEach(() => {
  row = makeTask()
  updateTaskRow.mockClear()
})

describe('TaskEditSheet — sends only diverged fields', () => {
  it('an out-of-band description survives an explicit save that never touched it', async () => {
    open()

    // Another surface edits the description while the sheet sits open.
    row.description = 'MCP: renewal booked for 3 Sept'

    editTitle('Renew passport URGENTLY')
    tapSave()

    await waitFor(() => expect(updateTaskRow).toHaveBeenCalled())
    expect(lastPatch()).not.toHaveProperty('description')
    expect(lastPatch()).toEqual({ content: 'Renew passport URGENTLY' })
    expect(row.description).toBe('MCP: renewal booked for 3 Sept')
    expect(row.content).toBe('Renew passport URGENTLY')
  })

  it('still writes the description when the description IS what changed', async () => {
    open()
    editDescription('photos collected, form posted')
    tapSave()

    await waitFor(() => expect(updateTaskRow).toHaveBeenCalled())
    expect(lastPatch()).toEqual({ description: 'photos collected, form posted' })
    expect(row.description).toBe('photos collected, form posted')
  })

  it('writes nothing at all when no field diverged', async () => {
    open()
    tapSave()
    // Give a write the chance to happen before asserting it did not.
    await act(async () => { await Promise.resolve() })
    expect(updateTaskRow).not.toHaveBeenCalled()
  })

  it('leaves fields the sheet does not own out of the patch', async () => {
    open()
    editTitle('changed')
    tapSave()

    await waitFor(() => expect(updateTaskRow).toHaveBeenCalled())
    for (const key of ['is_completed', 'completed_at', 'project_id', 'parent_id', 'pinned', 'id']) {
      expect(lastPatch()).not.toHaveProperty(key)
    }
  })
})

describe('TaskEditSheet — the autosave path is covered too', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('autosave writes only the changed field, sparing an out-of-band description', async () => {
    // The autosave is the likelier trigger of the original bug: it fires 1.5s after
    // a keystroke, without the user deciding to save anything.
    open()
    row.description = 'MCP: renewal booked for 3 Sept'

    editTitle('Renew passport soon')
    await act(async () => { await vi.advanceTimersByTimeAsync(1600) })

    expect(updateTaskRow).toHaveBeenCalledTimes(1)
    expect(lastPatch()).toEqual({ content: 'Renew passport soon' })
    expect(row.description).toBe('MCP: renewal booked for 3 Sept')
  })

  it('a second autosave does not re-send what the first one already wrote', async () => {
    // The baseline has to advance on every successful write. If it did not, this
    // second save would still see `content` as dirty and push the sheet's value
    // over the out-of-band retitle — the same bug, one step later.
    open()

    editTitle('first edit')
    await act(async () => { await vi.advanceTimersByTimeAsync(1600) })
    expect(lastPatch()).toEqual({ content: 'first edit' })

    row.content = 'MCP retitled this'

    editDescription('second edit')
    await act(async () => { await vi.advanceTimersByTimeAsync(1600) })

    expect(updateTaskRow).toHaveBeenCalledTimes(2)
    expect(lastPatch()).toEqual({ description: 'second edit' })
    expect(lastPatch()).not.toHaveProperty('content')
    expect(row.content).toBe('MCP retitled this')
  })
})
