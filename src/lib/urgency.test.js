import { describe, it, expect } from 'vitest'
import {
  daysUntilDue, classifyUrgency, selectUrgent, urgencyPayload, kindPhrase, BUCKET_WEIGHTS,
} from '../../api/_lib/urgency.js'

// App-shape task, as tasksRepo.rowToTask produces it.
function task(over = {}) {
  return {
    id: over.id ?? 't1',
    content: over.content ?? 'Do the thing',
    priority: over.priority ?? 1,
    due: over.due === undefined ? null : over.due,
    is_completed: over.is_completed ?? false,
    _projectName: over._projectName ?? 'Work',
  }
}

const TODAY = '2026-08-19'

describe('daysUntilDue', () => {
  it('is 0 for today, negative for the past, positive for the future', () => {
    expect(daysUntilDue('2026-08-19', TODAY)).toBe(0)
    expect(daysUntilDue('2026-08-17', TODAY)).toBe(-2)
    expect(daysUntilDue('2026-08-22', TODAY)).toBe(3)
  })
  it('tolerates a full ISO timestamp and returns null for junk', () => {
    expect(daysUntilDue('2026-08-18T00:00:00', TODAY)).toBe(-1)
    expect(daysUntilDue(null, TODAY)).toBeNull()
    expect(daysUntilDue('2026-08-19', null)).toBeNull()
  })
})

describe('classifyUrgency', () => {
  it('flags overdue and due-today only', () => {
    expect(classifyUrgency(task({ due: { date: '2026-08-17' } }), TODAY).kind).toBe('overdue')
    expect(classifyUrgency(task({ due: { date: '2026-08-19' } }), TODAY).kind).toBe('today')
  })
  it('ignores future-dated, undated, and completed tasks', () => {
    expect(classifyUrgency(task({ due: { date: '2026-08-25' } }), TODAY)).toBeNull()
    expect(classifyUrgency(task({ due: null }), TODAY)).toBeNull()
    expect(classifyUrgency(task({ due: { date: '2026-08-17' }, is_completed: true }), TODAY)).toBeNull()
  })
  it('carries the bucket weight, defaulting unknown buckets to 5', () => {
    expect(classifyUrgency(task({ due: { date: '2026-08-19' }, _projectName: 'Finance' }), TODAY).weight)
      .toBe(BUCKET_WEIGHTS.Finance)
    expect(classifyUrgency(task({ due: { date: '2026-08-19' }, _projectName: 'Nonsense' }), TODAY).weight)
      .toBe(5)
  })
})

describe('selectUrgent ordering', () => {
  it('ranks due-today above overdue, and higher-weight buckets first', () => {
    const tasks = [
      task({ id: 'overdue-home', content: 'Overdue Home', due: { date: '2026-08-15' }, _projectName: 'Home' }),
      task({ id: 'today-finance', content: 'Today Finance', due: { date: '2026-08-19' }, _projectName: 'Finance' }),
      task({ id: 'today-home', content: 'Today Home', due: { date: '2026-08-19' }, _projectName: 'Home' }),
      task({ id: 'future', content: 'Later', due: { date: '2026-09-01' } }),
    ]
    const ordered = selectUrgent(tasks, TODAY).map((u) => u.task.id)
    expect(ordered).toEqual(['today-finance', 'today-home', 'overdue-home'])
  })
  it('lets a P1 outrank a heavier bucket within the same day band', () => {
    const tasks = [
      task({ id: 'today-finance-p4', content: 'Finance', due: { date: '2026-08-19' }, _projectName: 'Finance', priority: 1 }),
      task({ id: 'today-home-p1', content: 'Home P1', due: { date: '2026-08-19' }, _projectName: 'Home', priority: 4 }),
    ]
    // Home(10)+P1(50)=60 beats Finance(35)+P4(0)=35, both on today's base 100.
    expect(selectUrgent(tasks, TODAY)[0].task.id).toBe('today-home-p1')
  })
})

describe('kindPhrase', () => {
  it('reads plainly and pluralises overdue days', () => {
    expect(kindPhrase({ kind: 'today' })).toBe('due today')
    expect(kindPhrase({ kind: 'overdue', days: -1 })).toBe('1 day overdue')
    expect(kindPhrase({ kind: 'overdue', days: -3 })).toBe('3 days overdue')
  })
})

describe('urgencyPayload', () => {
  it('is null when nothing is urgent', () => {
    expect(urgencyPayload([])).toBeNull()
    expect(urgencyPayload(null)).toBeNull()
  })
  it('names the single item and its state', () => {
    const urgent = selectUrgent([task({ content: 'Pay the electric bill', due: { date: '2026-08-19' } })], TODAY)
    const p = urgencyPayload(urgent)
    expect(p.title).toBe('One thing needs you today')
    expect(p.body).toContain('Pay the electric bill')
    expect(p.body).toContain('due today')
    expect(p.tag).toBe('morning-brief')
    expect(p.url).toBe('/')
  })
  it('counts the rest and calls out overdue when the top is due today', () => {
    const urgent = selectUrgent([
      task({ id: 'a', content: 'Top today', due: { date: '2026-08-19' }, _projectName: 'Finance' }),
      task({ id: 'b', content: 'Late one', due: { date: '2026-08-15' } }),
      task({ id: 'c', content: 'Another late', due: { date: '2026-08-10' } }),
    ], TODAY)
    const p = urgencyPayload(urgent)
    expect(p.title).toBe('3 things need you today')
    expect(p.body).toContain('Top today')
    expect(p.body).toContain('2 more')
    expect(p.body).toContain('2 overdue')
  })
  it('truncates a long title with an ellipsis', () => {
    const long = 'A very long task title that runs well past the limit the notification allows for'
    const p = urgencyPayload(selectUrgent([task({ content: long, due: { date: '2026-08-19' } })], TODAY))
    expect(p.body).toContain('…')
    expect(p.body.length).toBeLessThan(long.length + 20)
  })
})
