// Streams a response chunk-by-chunk, calling onChunk(text) for each piece.
// Returns the full text when done.
export async function sendMessageStream(messages, system, onChunk) {
  const res = await fetch('/api/claude?stream=1', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, system }),
  })
  if (!res.ok) throw new Error(`Claude API error: ${res.status}`)

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  let full = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    const lines = buf.split('\n')
    buf = lines.pop()
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const raw = line.slice(6).trim()
      if (raw === '[DONE]') return full
      try {
        const evt = JSON.parse(raw)
        if (evt.error) throw new Error(evt.error)
        if (evt.text) { full += evt.text; onChunk(evt.text) }
      } catch (e) {
        if (e.message !== 'Unexpected end of JSON input') throw e
      }
    }
  }
  return full
}

export async function sendMessage(messages, system) {
  const res = await fetch('/api/claude', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, system }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? `Claude API error: ${res.status}`)
  return data.content
}

function formatTasksForPrompt(tasks) {
  if (!tasks?.length) return 'No tasks loaded.'
  return tasks.map((t) => {
    const priority = ['', 'P4', 'P3', 'P2', 'P1'][t.priority] ?? 'P4'
    const due = t.due?.date ? ` | due ${t.due.date}` : ''
    const project = t._projectName ? ` | ${t._projectName}` : ''
    return `- [${priority}${due}${project}] ${t.content}`
  }).join('\n')
}

export const SYSTEM_PROMPTS = {
  cos: (tasks) => {
    const today = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` })()
    return `You are the Chief of Staff for Yogesh Mistry, an architect at Gensler. Today is ${today}.

You oversee all areas of his life organised into seven buckets: Finance, Health, Work, Family, Home, Personal, and Systems.

Your role is to help him manage priorities, make decisions, and take action. Be concise, direct, and conversational — write in plain prose, no markdown, no bullet points, no bold text, no headers. Just clear sentences.

Here is his current Todoist task list:
${formatTasksForPrompt(tasks)}

When he asks about existing tasks, check the list above. When he adds a new task, acknowledge it and suggest which bucket and priority it belongs in. When he pastes an email, extract actionable tasks. Keep responses short unless depth is needed.`
  },

  head: (bucket, tasks) => {
    const descriptions = {
      Finance:  'investments, tax, budgeting, cash flow, and financial decisions',
      Health:   'physical fitness, medical, nutrition, sleep, and mental wellbeing',
      Work:     'professional projects, Gensler work, client relationships, and career strategy',
      Family:   'family relationships, shared goals, obligations, and important occasions',
      Home:     'property, maintenance, renovations, and household operations',
      Personal: 'personal growth, hobbies, learning, and individual interests',
      Systems:  'tools, automations, this Life OS, and productivity systems',
    }
    const bucketTasks = tasks?.filter((t) => t._projectName === bucket) ?? []
    return `You are the ${bucket} Head for Yogesh Mistry — a subject matter expert focused exclusively on ${descriptions[bucket] ?? bucket.toLowerCase()}.

Today is ${(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` })()}.

Current ${bucket} tasks:
${formatTasksForPrompt(bucketTasks)}

Be direct, specific, and conversational — write in plain prose, no markdown, no bullet points, no bold text, no headers. Help him think through decisions, surface risks, and identify the highest-leverage actions.`
  },

  discussion: (bucket, title, tasks) => {
    const bucketTasks = tasks?.filter((t) => t._projectName === bucket) ?? []
    return `You are the ${bucket} Head for Yogesh Mistry, working through a specific discussion: "${title}".

Today is ${(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` })()}.

Current ${bucket} tasks for context:
${formatTasksForPrompt(bucketTasks)}

Stay focused on this topic. Write in plain conversational prose — no markdown, no bullet points, no bold text, no headers. Help him reach a clear decision or set of actions. When a decision is reached, summarise it clearly in plain sentences.`
  },
}
