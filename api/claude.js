const PROJECTS = {
  Finance:  '6gmVXCpMmXX8V5MV',
  Health:   '6gmVXCm3jxXfXVWw',
  Home:     '6gmVXCpQQxw3gFgw',
  Work:     '6gmVXCv7j946mv75',
  Family:   '6gmVXCpr8mc6mjjX',
  Personal: '6gmcXJpGfj6gh4Gc',
  Systems:  '6gmVXCmRw6X6cgpM',
}

const TOOLS = [
  {
    name: 'create_task',
    description: 'Create a new task in Todoist for Yogesh.',
    input_schema: {
      type: 'object',
      properties: {
        content:      { type: 'string', description: 'Task title' },
        priority:     { type: 'integer', description: '4=P1 (urgent), 3=P2, 2=P3, 1=P4 (someday)', enum: [1,2,3,4] },
        due_string:   { type: 'string', description: 'Due date in natural language, e.g. "today", "tomorrow", "next Monday"' },
        project_name: { type: 'string', description: 'Bucket: Finance, Health, Work, Family, Home, Personal, or Systems', enum: Object.keys(PROJECTS) },
      },
      required: ['content'],
    },
  },
  {
    name: 'complete_task',
    description: 'Mark an existing Todoist task as complete.',
    input_schema: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: 'The Todoist task ID to complete' },
      },
      required: ['task_id'],
    },
  },
  {
    name: 'update_task',
    description: 'Update an existing Todoist task (change priority, due date, or content).',
    input_schema: {
      type: 'object',
      properties: {
        task_id:    { type: 'string', description: 'The Todoist task ID to update' },
        content:    { type: 'string', description: 'New task title (omit to keep existing)' },
        priority:   { type: 'integer', description: '4=P1, 3=P2, 2=P3, 1=P4', enum: [1,2,3,4] },
        due_string: { type: 'string', description: 'New due date in natural language, e.g. "next Friday"' },
      },
      required: ['task_id'],
    },
  },
]

async function executeTool(name, input) {
  const key = process.env.TODOIST_API_KEY
  if (!key) return { error: 'TODOIST_API_KEY not configured' }

  if (name === 'create_task') {
    const body = { content: input.content }
    if (input.priority)     body.priority = input.priority
    if (input.due_string)   body.due_string = input.due_string
    if (input.project_name) body.project_id = PROJECTS[input.project_name]
    const r = await fetch('https://api.todoist.com/rest/v2/tasks', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!r.ok) return { error: `Todoist error: ${r.status}` }
    const t = await r.json()
    return { success: true, task_id: t.id, message: `Task created: "${t.content}"` }
  }

  if (name === 'complete_task') {
    const r = await fetch(`https://api.todoist.com/rest/v2/tasks/${input.task_id}/close`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}` },
    })
    if (!r.ok) return { error: `Todoist error: ${r.status}` }
    return { success: true, message: 'Task completed.' }
  }

  if (name === 'update_task') {
    const body = {}
    if (input.content)    body.content = input.content
    if (input.priority)   body.priority = input.priority
    if (input.due_string) body.due_string = input.due_string
    const r = await fetch(`https://api.todoist.com/rest/v2/tasks/${input.task_id}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!r.ok) return { error: `Todoist error: ${r.status}` }
    return { success: true, message: 'Task updated.' }
  }

  return { error: `Unknown tool: ${name}` }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' })

  const { messages, system } = req.body ?? {}
  if (!messages?.length) return res.status(400).json({ error: 'messages required' })

  try {
    let currentMessages = messages
    let finalText = ''

    // Agentic loop — up to 5 rounds of tool use
    for (let i = 0; i < 5; i++) {
      const upstream = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1024,
          ...(system ? { system } : {}),
          messages: currentMessages,
          tools: TOOLS,
        }),
      })

      const data = await upstream.json()
      if (!upstream.ok) return res.status(upstream.status).json(data)

      const toolUseBlocks = data.content.filter((b) => b.type === 'tool_use')
      const textBlocks    = data.content.filter((b) => b.type === 'text')

      if (toolUseBlocks.length === 0) {
        finalText = textBlocks.map((b) => b.text).join('')
        break
      }

      // Execute all tools in parallel
      const toolResults = await Promise.all(
        toolUseBlocks.map(async (block) => {
          const result = await executeTool(block.name, block.input)
          return { type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result) }
        })
      )

      currentMessages = [
        ...currentMessages,
        { role: 'assistant', content: data.content },
        { role: 'user', content: toolResults },
      ]
    }

    res.status(200).json({ content: finalText })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
