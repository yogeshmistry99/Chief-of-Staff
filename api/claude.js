const BUCKETS = ['Finance', 'Health', 'Work', 'Family', 'Home', 'Personal', 'Systems']

// ─── Calendar helpers ─────────────────────────────────────────────────────────

async function calendarRequest(method, body, query = {}) {
  const base = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'http://localhost:3000'
  const url = new URL('/api/calendar', base)
  Object.entries(query).forEach(([k, v]) => url.searchParams.set(k, v))
  const res = await fetch(url.toString(), {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(method !== 'GET' ? { body: JSON.stringify(body) } : {}),
  })
  const text = await res.text()
  try { return { ok: res.ok, status: res.status, data: text ? JSON.parse(text) : {} } }
  catch { return { ok: false, status: res.status, data: { error: text } } }
}

function toGCalDateTime(dateStr, timeStr) {
  // Accept "2026-06-15" + "14:00" → RFC3339
  if (!timeStr) return { date: dateStr }
  return { dateTime: `${dateStr}T${timeStr}:00`, timeZone: 'Europe/London' }
}

// ─── Tools ────────────────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'create_task',
    description: 'Create a new task in the Life OS task list. To create a subtask, pass the parent task\'s ID as parent_id.',
    input_schema: {
      type: 'object',
      properties: {
        content:      { type: 'string', description: 'Task title' },
        priority:     { type: 'integer', description: '4=P1 (urgent), 3=P2, 2=P3, 1=P4 (someday)', enum: [1,2,3,4] },
        due_string:   { type: 'string', description: 'Due date in ISO format YYYY-MM-DD, e.g. "2026-06-15"' },
        project_name: { type: 'string', description: 'Bucket: Finance, Health, Work, Family, Home, Personal, or Systems', enum: BUCKETS },
        parent_id:    { type: 'string', description: 'ID of the parent task to nest this as a subtask.' },
      },
      required: ['content'],
    },
  },
  {
    name: 'complete_task',
    description: 'Mark an existing task as complete and remove it from the active task list.',
    input_schema: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: 'The task ID to complete' },
      },
      required: ['task_id'],
    },
  },
  {
    name: 'update_task',
    description: 'Update an existing task (change priority, due date, or content). Use remove_due_date:true to clear the due date entirely.',
    input_schema: {
      type: 'object',
      properties: {
        task_id:         { type: 'string',  description: 'The task ID to update' },
        content:         { type: 'string',  description: 'New task title (omit to keep existing)' },
        priority:        { type: 'integer', description: '4=P1, 3=P2, 2=P3, 1=P4', enum: [1,2,3,4] },
        due_string:      { type: 'string',  description: 'New due date in ISO format YYYY-MM-DD' },
        remove_due_date: { type: 'boolean', description: 'Set true to remove the due date entirely' },
      },
      required: ['task_id'],
    },
  },
  {
    name: 'read_calendar',
    description: 'Fetch events from Google Calendar for a date range. Use this proactively whenever the user mentions scheduling, availability, or calendar.',
    input_schema: {
      type: 'object',
      properties: {
        start_date: { type: 'string', description: 'Start date ISO format YYYY-MM-DD' },
        end_date:   { type: 'string', description: 'End date ISO format YYYY-MM-DD' },
      },
      required: ['start_date', 'end_date'],
    },
  },
  {
    name: 'create_calendar_event',
    description: 'Create a new event in Google Calendar. Confirm with the user before calling unless they explicitly asked you to create it.',
    input_schema: {
      type: 'object',
      properties: {
        title:       { type: 'string', description: 'Event title' },
        date:        { type: 'string', description: 'Date YYYY-MM-DD' },
        start_time:  { type: 'string', description: 'Start time HH:MM (24h)' },
        end_time:    { type: 'string', description: 'End time HH:MM (24h)' },
        location:    { type: 'string', description: 'Location or video link' },
        description: { type: 'string', description: 'Event description or notes' },
      },
      required: ['title', 'date'],
    },
  },
  {
    name: 'update_calendar_event',
    description: 'Update an existing calendar event by ID. Get the event ID from read_calendar first.',
    input_schema: {
      type: 'object',
      properties: {
        event_id:    { type: 'string', description: 'Google Calendar event ID' },
        title:       { type: 'string', description: 'New title' },
        date:        { type: 'string', description: 'New date YYYY-MM-DD' },
        start_time:  { type: 'string', description: 'New start time HH:MM (24h)' },
        end_time:    { type: 'string', description: 'New end time HH:MM (24h)' },
        location:    { type: 'string', description: 'New location' },
        description: { type: 'string', description: 'New description' },
      },
      required: ['event_id'],
    },
  },
  {
    name: 'delete_calendar_event',
    description: 'Delete or cancel a calendar event by ID. Confirm with the user before calling.',
    input_schema: {
      type: 'object',
      properties: {
        event_id: { type: 'string', description: 'Google Calendar event ID to delete' },
      },
      required: ['event_id'],
    },
  },
]

// Mutates the tasks array in place and returns a result summary. Calendar tools are async.
async function executeTool(name, input, tasks) {
  if (name === 'create_task') {
    const newTask = {
      id: `local_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      content: input.content,
      priority: input.priority ?? 1,
      _projectName: input.project_name ?? null,
      parent_id: input.parent_id ?? null,
      due: input.due_string ? { date: input.due_string } : null,
      created_at: new Date().toISOString(),
      _local: true,
    }
    tasks.push(newTask)
    return { success: true, task_id: newTask.id, message: `Task created: "${newTask.content}"` }
  }

  if (name === 'complete_task') {
    const task = tasks.find((t) => t.id === input.task_id)
    if (!task) return { error: `Task not found: ${input.task_id}` }
    task.is_completed = true
    task.completed_at = new Date().toISOString()
    // Persist to Todoist so the completion survives a sync
    if (!input.task_id.startsWith('local_')) {
      try {
        const base = process.env.VERCEL_URL
          ? `https://${process.env.VERCEL_URL}`
          : 'http://localhost:3000'
        const closeRes = await fetch(
          `${base}/api/todoist?path=tasks/${encodeURIComponent(input.task_id)}/close`,
          { method: 'POST', headers: { 'Content-Type': 'application/json' } }
        )
        if (!closeRes.ok) {
          const detail = await closeRes.text().catch(() => '')
          return { error: `Failed to close task in Todoist (${closeRes.status})${detail ? `: ${detail}` : ''}` }
        }
      } catch (err) {
        return { error: `Todoist close failed: ${err.message}` }
      }
    }
    return { success: true, verified: { is_completed: true, content: task.content } }
  }

  if (name === 'update_task') {
    const task = tasks.find((t) => t.id === input.task_id)
    if (!task) return { error: `Task not found: ${input.task_id}` }
    if (input.content !== undefined)  task.content  = input.content
    if (input.priority !== undefined) task.priority = input.priority
    if (input.remove_due_date)        task.due      = null
    else if (input.due_string)        task.due      = { date: input.due_string }
    // Return the actual resulting state so Claude can verify what changed
    return {
      success: true,
      verified: {
        content:  task.content,
        priority: task.priority,
        due:      task.due ?? null,
      },
    }
  }

  if (name === 'read_calendar') {
    const start = new Date(input.start_date).toISOString()
    const end   = new Date(input.end_date + 'T23:59:59').toISOString()
    const { ok, data } = await calendarRequest('GET', null, { start, end })
    if (!ok) return { error: data.error ?? 'Calendar fetch failed' }
    const events = (Array.isArray(data) ? data : []).map((e) => ({
      id: e.id,
      title: e.summary ?? '(No title)',
      date: e.start?.date ?? e.start?.dateTime?.slice(0, 10),
      start_time: e.start?.dateTime ? new Date(e.start.dateTime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : 'All day',
      end_time:   e.end?.dateTime   ? new Date(e.end.dateTime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })   : null,
      location: e.location ?? null,
      description: e.description ?? null,
    }))
    return { events, count: events.length }
  }

  if (name === 'create_calendar_event') {
    const body = {
      summary:     input.title,
      location:    input.location,
      description: input.description,
      start: toGCalDateTime(input.date, input.start_time),
      end:   toGCalDateTime(input.date, input.end_time ?? input.start_time),
    }
    const { ok, data } = await calendarRequest('POST', body)
    if (!ok) return { error: data.error ?? 'Failed to create event' }
    // Verify: re-fetch the created event
    const verify = await calendarRequest('GET', null, {
      start: new Date(input.date).toISOString(),
      end:   new Date(input.date + 'T23:59:59').toISOString(),
    })
    const created = (Array.isArray(verify.data) ? verify.data : []).find((e) => e.id === data.id)
    if (!created) return { error: 'Event was submitted but could not be verified — please check your calendar.' }
    return { success: true, event_id: data.id, verified: { title: created.summary, date: created.start?.date ?? created.start?.dateTime?.slice(0, 10), start_time: created.start?.dateTime?.slice(11, 16) ?? 'All day' }, calendar_changed: true }
  }

  if (name === 'update_calendar_event') {
    const updates = {}
    if (input.title)       updates.summary     = input.title
    if (input.location !== undefined) updates.location    = input.location
    if (input.description !== undefined) updates.description = input.description
    if (input.date || input.start_time) {
      const date = input.date ?? new Date().toISOString().slice(0, 10)
      updates.start = toGCalDateTime(date, input.start_time)
      updates.end   = toGCalDateTime(date, input.end_time ?? input.start_time)
    }
    const { ok, data } = await calendarRequest('PATCH', { eventId: input.event_id, ...updates })
    if (!ok) return { error: data.error ?? 'Failed to update event' }
    // Verify: re-fetch the event and check fields match
    const verifyDate = input.date ?? data.start?.date ?? data.start?.dateTime?.slice(0, 10) ?? new Date().toISOString().slice(0, 10)
    const vr = await calendarRequest('GET', null, {
      start: new Date(verifyDate).toISOString(),
      end:   new Date(verifyDate + 'T23:59:59').toISOString(),
    })
    const verified = (Array.isArray(vr.data) ? vr.data : []).find((e) => e.id === input.event_id)
    if (!verified) return { error: 'Update was submitted but event could not be re-fetched to verify.' }
    const actualTitle = verified.summary
    const actualDate  = verified.start?.date ?? verified.start?.dateTime?.slice(0, 10)
    const actualStart = verified.start?.dateTime?.slice(11, 16) ?? 'All day'
    // Check title matched if we tried to set it
    if (input.title && actualTitle !== input.title) {
      return { error: `Title update failed — calendar still shows "${actualTitle}", expected "${input.title}".` }
    }
    return { success: true, verified: { title: actualTitle, date: actualDate, start_time: actualStart }, calendar_changed: true }
  }

  if (name === 'delete_calendar_event') {
    const { ok, data } = await calendarRequest('DELETE', { eventId: input.event_id })
    if (!ok) return { error: data.error ?? 'Failed to delete event' }
    // Verify: attempt to GET the event — expect it to be gone
    const vr = await calendarRequest('GET', null, {
      start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      end:   new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
    })
    const stillExists = (Array.isArray(vr.data) ? vr.data : []).some((e) => e.id === input.event_id)
    if (stillExists) return { error: 'Delete was submitted but the event still appears in the calendar. Try again.' }
    return { success: true, verified: { deleted: true }, calendar_changed: true }
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

  const { messages, system, tasks: initialTasks, model: requestedModel } = req.body ?? {}
  if (!messages?.length) return res.status(400).json({ error: 'messages required' })
  // Mutable local copy of tasks — tools mutate this array
  const tasks = Array.isArray(initialTasks) ? initialTasks.map((t) => ({ ...t })) : []

  // Streaming branch — agentic loop with tool support
  if (req.query.stream === '1') {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('X-Accel-Buffering', 'no')
    try {
      let currentMessages = messages
      let totalInputTokens = 0
      let totalOutputTokens = 0

      for (let round = 0; round < 5; round++) {
        const upstream = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'anthropic-beta': 'prompt-caching-2024-07-31',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model: requestedModel ?? 'claude-haiku-4-5-20251001',
            max_tokens: 4096,
            stream: true,
            ...(system ? { system } : {}),
            messages: currentMessages,
            tools: TOOLS,
          }),
        })

        if (!upstream.ok) {
          const err = await upstream.text()
          res.write(`data: ${JSON.stringify({ error: err })}\n\n`)
          break
        }

        const reader = upstream.body.getReader()
        const decoder = new TextDecoder()
        let buf = ''
        // Index → accumulated block (text or tool_use)
        const blocks = {}
        let stopReason = null

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buf += decoder.decode(value, { stream: true })
          const lines = buf.split('\n')
          buf = lines.pop()

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            const raw = line.slice(6).trim()
            if (raw === '[DONE]') continue
            try {
              const evt = JSON.parse(raw)

              if (evt.type === 'content_block_start') {
                const { index, content_block: cb } = evt
                blocks[index] = cb.type === 'tool_use'
                  ? { type: 'tool_use', id: cb.id, name: cb.name, input: '' }
                  : { type: 'text', text: '' }
              }

              if (evt.type === 'content_block_delta') {
                const { index, delta } = evt
                if (!blocks[index]) continue
                if (delta.type === 'text_delta') {
                  blocks[index].text += delta.text
                  res.write(`data: ${JSON.stringify({ text: delta.text })}\n\n`)
                } else if (delta.type === 'input_json_delta') {
                  blocks[index].input += delta.partial_json
                }
              }

              if (evt.type === 'message_start') {
                totalInputTokens += evt.message?.usage?.input_tokens ?? 0
              }

              if (evt.type === 'message_delta') {
                stopReason = evt.delta?.stop_reason
                totalOutputTokens += evt.usage?.output_tokens ?? 0
              }
            } catch {}
          }
        }

        if (stopReason === 'tool_use') {
          // Build the assistant content array with parsed tool inputs
          const assistantContent = Object.values(blocks).map((b) =>
            b.type === 'tool_use'
              ? { ...b, input: (() => { try { return JSON.parse(b.input) } catch { return {} } })() }
              : b
          )
          const toolUseBlocks = assistantContent.filter((b) => b.type === 'tool_use')

          // Execute all tools
          let calendarChanged = false
          const toolResults = await Promise.all(toolUseBlocks.map(async (block) => {
            const result = await executeTool(block.name, block.input, tasks)
            if (result.calendar_changed) calendarChanged = true
            return { type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result) }
          }))

          if (calendarChanged) res.write(`data: ${JSON.stringify({ calendar_changed: true })}\n\n`)

          currentMessages = [
            ...currentMessages,
            { role: 'assistant', content: assistantContent },
            { role: 'user', content: toolResults },
          ]
          continue // next round
        }

        break // end_turn or max_tokens — done
      }

      res.write(`data: ${JSON.stringify({ usage: { input_tokens: totalInputTokens, output_tokens: totalOutputTokens } })}\n\n`)
      if (initialTasks) res.write(`data: ${JSON.stringify({ tasks_updated: tasks })}\n\n`)
      res.write('data: [DONE]\n\n')
      res.end()
    } catch (err) {
      res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`)
      res.end()
    }
    return
  }

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
          'anthropic-beta': 'prompt-caching-2024-07-31',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: requestedModel ?? 'claude-haiku-4-5-20251001',
          max_tokens: 4096,
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

      const toolResults = await Promise.all(toolUseBlocks.map(async (block) => {
        const result = await executeTool(block.name, block.input, tasks)
        return { type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result) }
      }))

      currentMessages = [
        ...currentMessages,
        { role: 'assistant', content: data.content },
        { role: 'user', content: toolResults },
      ]
    }

    res.status(200).json({ content: finalText, tasks: initialTasks ? tasks : undefined })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
