import { describe, it, expect } from 'vitest'
import fs from 'fs'
import { SYSTEM_PROMPTS, REFRESH_PROMPTS } from './claude.js'

// The cache breakpoint is worth ~6.5k tokens per chat message and is invisible
// if it goes missing: the app behaves identically, the bill quietly doubles.
// These assertions are the only thing that would notice.

const tasks = [
  { id: '1', content: 'Review pension statement', priority: 4, _projectName: 'Finance' },
  { id: '2', content: 'Book dentist', priority: 3, _projectName: 'Health' },
]
const cfg = { instructions: 'Be brief.', context: 'Lives in London.' }

const cacheBlocks = (blocks) => blocks.filter((b) => b.cache_control?.type === 'ephemeral')

describe('prompt caching', () => {
  const chatPrompts = {
    cos:        (c) => SYSTEM_PROMPTS.cos(tasks, c),
    head:       (c) => SYSTEM_PROMPTS.head('Finance', tasks, c),
    discussion: (c) => SYSTEM_PROMPTS.discussion('Finance', 'Pension', tasks, c),
  }

  for (const [name, build] of Object.entries(chatPrompts)) {
    it(`marks the last system block of ${name} as a cache breakpoint`, () => {
      // Anthropic caches the prefix tools → system → messages, so a breakpoint
      // on the FINAL block is what pulls the tool definitions into the cache
      // too. On any earlier block the tools are still charged in full.
      const blocks = build(cfg)
      expect(blocks.at(-1).cache_control).toEqual({ type: 'ephemeral' })
    })

    it(`${name} still caches when there is no knowledge config`, () => {
      const blocks = build(undefined)
      expect(blocks).toHaveLength(1)
      expect(blocks[0].cache_control).toEqual({ type: 'ephemeral' })
    })

    it(`${name} stays within the four-breakpoint limit`, () => {
      expect(cacheBlocks(build(cfg)).length).toBeLessThanOrEqual(4)
    })
  }

  it('does not spend a cache write on the one-shot refresh prompts', () => {
    // These run once per bucket with per-bucket text, so nothing ever reads the
    // entry back — a breakpoint here would buy only the 1.25x write.
    for (const blocks of [REFRESH_PROMPTS.cos(tasks, cfg), REFRESH_PROMPTS.head('Finance', tasks, cfg)]) {
      expect(blocks.at(-1).cache_control).toBeUndefined()
    }
  })
})

describe('health data stays out of every prompt', () => {
  // Explicit build constraint: the Health tab is display-only in this round and
  // the Health head is separate work. The prompt payload must be UNCHANGED, and
  // that is easy to break by accident once health data is in the app.
  const built = [
    SYSTEM_PROMPTS.cos(tasks, cfg),
    SYSTEM_PROMPTS.head('Health', tasks, cfg),
    SYSTEM_PROMPTS.discussion('Health', 'Sleep', tasks, cfg),
    REFRESH_PROMPTS.cos(tasks, cfg),
    REFRESH_PROMPTS.head('Health', tasks, cfg),
  ]

  it('mentions no health metric in any system prompt', () => {
    const terms = [
      'hrv', 'heart rate variability', 'resting heart rate', 'spo2',
      'oxygen saturation', 'respiratory rate', 'active zone minutes',
      'minutesAsleep', 'googlehealth', 'health.googleapis',
    ]
    for (const blocks of built) {
      const text = blocks.map((b) => b.text).join('\n').toLowerCase()
      for (const t of terms) expect(text).not.toContain(t)
    }
  })

  it('does not let the prompt module reach the health module', () => {
    // A single import here is all it would take for health data to start
    // riding along on every chat message.
    const src = fs.readFileSync(`${process.cwd()}/src/lib/claude.js`, 'utf8')
    expect(src).not.toMatch(/^\s*import[\s\S]*?from\s+['"].*health/im)
  })
})
