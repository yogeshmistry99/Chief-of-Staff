import { describe, it, expect, vi, afterEach } from 'vitest'
import { SYSTEM_PROMPTS, REFRESH_PROMPTS, sendMessage } from './claude.js'

const tasks = [
  { id: 'a', content: 'ACTIVE-FINANCE', priority: 4, _projectName: 'Finance', is_completed: false },
  { id: 'b', content: 'DONE-FINANCE',   priority: 4, _projectName: 'Finance', is_completed: true },
  { id: 'c', content: 'ACTIVE-HEALTH',  priority: 2, _projectName: 'Health',  is_completed: false },
  { id: 'd', content: 'DONE-HEALTH',    priority: 2, _projectName: 'Health',  is_completed: true },
]
const text = (blocks) => blocks.map((b) => b.text).join('\n')

describe('the refresh prompts exclude completed work', () => {
  // A refresh reprioritises OPEN tasks. Shipping the completed ones was ~8,900
  // tokens a sweep of rows that could never appear in its output, and it also
  // invited the model to "reprioritise" something already done.
  it('leaves completed tasks out of the CoS refresh', () => {
    const t = text(REFRESH_PROMPTS.cos(tasks, {}))
    expect(t).toContain('ACTIVE-FINANCE')
    expect(t).toContain('ACTIVE-HEALTH')
    expect(t).not.toContain('DONE-FINANCE')
    expect(t).not.toContain('DONE-HEALTH')
  })

  it('leaves completed tasks out of a Head refresh, and other buckets too', () => {
    const t = text(REFRESH_PROMPTS.head('Finance', tasks, {}))
    expect(t).toContain('ACTIVE-FINANCE')
    expect(t).not.toContain('DONE-FINANCE')
    expect(t).not.toContain('ACTIVE-HEALTH')
  })

  it('says so plainly when a bucket has only completed work', () => {
    const done = tasks.filter((t) => t.is_completed)
    expect(text(REFRESH_PROMPTS.cos(done, {}))).toContain('No tasks loaded.')
  })

  it('does not change what the chat prompts show', () => {
    // The chat already filtered completed; this must not have regressed.
    const t = text(SYSTEM_PROMPTS.cos(tasks, {}))
    expect(t).toContain('ACTIVE-FINANCE')
    expect(t).not.toContain('DONE-FINANCE')
  })
})

describe('the tool-definition opt-out', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  const capture = () => {
    const calls = []
    vi.stubGlobal('fetch', async (_url, init) => {
      calls.push(JSON.parse(init.body))
      return { ok: true, json: async () => ({ content: '', tasks: null }) }
    })
    return calls
  }

  it('omits tools only when a caller explicitly asks', async () => {
    const calls = capture()
    await sendMessage([{ role: 'user', content: 'hi' }], null, null, { tools: false })
    expect(calls[0].tools).toBe(false)
  })

  it('leaves tools ON by default — silence must never disarm the chat', async () => {
    // Opt-out, not opt-in. A new chat surface that forgets to ask for tools
    // would otherwise lose the ability to save anything, which is the exact
    // failure this codebase already spent three days on.
    const calls = capture()
    await sendMessage([{ role: 'user', content: 'hi' }], null, null, {})
    expect(calls[0].tools).toBeUndefined()

    await sendMessage([{ role: 'user', content: 'hi' }], null, null, { tools: true })
    expect(calls[1].tools).toBeUndefined()
  })
})
