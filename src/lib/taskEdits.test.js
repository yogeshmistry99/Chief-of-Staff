import { describe, it, expect } from 'vitest'
import { editSnapshot, diffTaskEdits, EDITABLE_FIELDS } from './taskEdits'

const task = {
  id: 't1',
  content: 'Renew passport',
  priority: 3,
  description: 'photos already taken',
  due: { date: '2026-09-01' },
  consequence: 4, reversibility: 2, compounding: 3, effort: 'M',
  is_completed: false,
  project_id: 'p9',
}

describe('editSnapshot', () => {
  it('flattens a task to the sheet fields only', () => {
    expect(editSnapshot(task)).toEqual({
      content: 'Renew passport',
      priority: 3,
      description: 'photos already taken',
      due: '2026-09-01',
      consequence: 4, reversibility: 2, compounding: 3, effort: 'M',
    })
  })

  it('never carries fields the sheet does not own', () => {
    const snap = editSnapshot(task)
    for (const key of ['id', 'is_completed', 'completed_at', 'project_id', 'parent_id', 'pinned']) {
      expect(snap).not.toHaveProperty(key)
    }
    expect(Object.keys(snap).sort()).toEqual([...EDITABLE_FIELDS].sort())
  })

  it('normalises a missing due date, an unscored task and a bare task', () => {
    expect(editSnapshot({ content: 'x' }).due).toBe('')
    expect(editSnapshot({ content: 'x' }).priority).toBe(1)
    expect(editSnapshot({ content: 'x' }).consequence).toBeNull()
    expect(editSnapshot(null).content).toBe('')
  })

  it('truncates a datetime due to the date the form field holds', () => {
    // If the snapshot kept the time and the input kept the date, `due` would read
    // as changed on every save and be rewritten every time.
    expect(editSnapshot({ due: { date: '2026-09-01T09:30:00' } }).due).toBe('2026-09-01')
  })
})

describe('diffTaskEdits', () => {
  const base = editSnapshot(task)

  it('is empty when nothing changed', () => {
    expect(diffTaskEdits(base, { ...base })).toEqual({})
  })

  it('sends only the changed field', () => {
    expect(diffTaskEdits(base, { ...base, content: 'Renew passport urgently' }))
      .toEqual({ content: 'Renew passport urgently' })
  })

  it('omits description when only the title changed — the lost-update case', () => {
    const patch = diffTaskEdits(base, { ...base, content: 'new title' })
    expect(patch).not.toHaveProperty('description')
  })

  it('sends a changed description when it WAS edited', () => {
    expect(diffTaskEdits(base, { ...base, description: 'collected' }))
      .toEqual({ description: 'collected' })
  })

  it('sends several changed fields together and nothing else', () => {
    const patch = diffTaskEdits(base, { ...base, priority: 4, effort: 'L' })
    expect(patch).toEqual({ priority: 4, effort: 'L' })
  })

  it('re-inflates a changed due date to the { date } shape', () => {
    expect(diffTaskEdits(base, { ...base, due: '2026-10-05' }))
      .toEqual({ due: { date: '2026-10-05' } })
  })

  it('sends null when the due date is cleared', () => {
    // Must be an explicit null: omitting it would silently discard the clear.
    expect(diffTaskEdits(base, { ...base, due: '' })).toEqual({ due: null })
  })

  it('treats scoring a previously unscored field as a change', () => {
    const unscored = editSnapshot({ content: 'x' })
    expect(diffTaskEdits(unscored, { ...unscored, consequence: 5 })).toEqual({ consequence: 5 })
  })

  it('does not report null scores as changed', () => {
    const unscored = editSnapshot({ content: 'x' })
    expect(diffTaskEdits(unscored, { ...unscored })).toEqual({})
  })

  it('returns an empty patch with no baseline rather than writing everything', () => {
    expect(diffTaskEdits(null, base)).toEqual({})
  })
})
