import { buildTask, enrichNewTask, aiScoreTask, isScored, persistNewTask } from './_lib/taskWrite.js'

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
    description: 'Create a new event in Google Calendar. Can create one-off OR repeating events — pass the recurrence field for anything that repeats ("every week", "daily", "each Monday until December"). Confirm with the user before calling unless they explicitly asked you to create it.',
    input_schema: {
      type: 'object',
      properties: {
        title:       { type: 'string', description: 'Event title' },
        date:        { type: 'string', description: 'Date YYYY-MM-DD. For a repeating event this is the FIRST occurrence.' },
        start_time:  { type: 'string', description: 'Start time HH:MM (24h)' },
        end_time:    { type: 'string', description: 'End time HH:MM (24h)' },
        location:    { type: 'string', description: 'Location or video link' },
        description: { type: 'string', description: 'Event description or notes' },
        recurrence:  { type: 'string', description: "Optional. RFC 5545 recurrence rule WITHOUT the 'RRULE:' prefix, to make this a repeating event. Examples: 'FREQ=DAILY' (every day), 'FREQ=WEEKLY;BYDAY=MO,WE,FR' (every Mon/Wed/Fri), 'FREQ=WEEKLY;BYDAY=TU;COUNT=8' (8 Tuesdays), 'FREQ=MONTHLY;BYMONTHDAY=15' (15th of each month), 'FREQ=WEEKLY;UNTIL=20261231T235959Z' (weekly until year-end). Omit for a one-off event." },
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
    // Construct through the single choke point (api/_lib/taskWrite.js) — UUID id,
    // canonical shape, same as MCP-created tasks.
    const newTask = await enrichNewTask(buildTask({
      content: input.content,
      priority: input.priority,
      project_name: input.project_name ?? null,
      parent_id: input.parent_id ?? null,
      due: input.due_string ? { date: input.due_string } : null,
    }))
    // AUTHORITATIVE write: persist server-side and only report success if the
    // store write actually succeeded. A failure returns an error the model must
    // surface — no false confirmation, no swallowed write.
    try {
      await persistNewTask(newTask)
    } catch (err) {
      return { error: `Task NOT saved — the store write failed: ${err.message}. Tell the user it was not created.` }
    }
    tasks.push(newTask) // reflect in the streamed tasks_updated for the client UI
    return {
      success: true,
      task_id: newTask.id,
      verified: { content: newTask.content, bucket: newTask._projectName ?? null, due_date: newTask.due?.date ?? null },
      message: `Task saved to the store: "${newTask.content}"${newTask.due?.date ? ` (due ${newTask.due.date})` : ''}`,
    }
  }

  if (name === 'complete_task') {
    const task = tasks.find((t) => t.id === input.task_id)
    if (!task) return { error: `Task not found: ${input.task_id}` }
    task.is_completed = true
    task.completed_at = new Date().toISOString()
    // Persist to Todoist so the completion survives a sync — but only for
    // genuine legacy Todoist ids. UUID (choke-point) and local_ tasks don't
    // exist in Todoist, so closing them there would 404.
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.task_id)
    if (!input.task_id.startsWith('local_') && !isUuid) {
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
    // Lazy backfill: score on touch — fail open, never block the update.
    if (!isScored(task) && !task.is_completed) {
      const scores = await aiScoreTask(task)
      if (scores) Object.assign(task, scores)
    }
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
      // Slice the wall-clock time straight from the RFC3339 string (event-local,
      // e.g. "...T13:00:00+01:00" → "13:00"). Using `new Date().toLocaleTimeString`
      // WITHOUT a timeZone renders in the server's zone (UTC on Vercel), which
      // showed every timed event 1h early during BST — the CoS saw 12:00 for a
      // 13:00 event. Matches the `date` field and the create/update verifies.
      date: e.start?.date ?? e.start?.dateTime?.slice(0, 10),
      start_time: e.start?.dateTime ? e.start.dateTime.slice(11, 16) : 'All day',
      end_time:   e.end?.dateTime   ? e.end.dateTime.slice(11, 16)   : null,
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
    // Repeating event: Google expects an array of RFC 5545 lines. Strip a leading
    // "RRULE:" in case the model already included it, then re-add exactly one.
    if (input.recurrence) {
      const rule = input.recurrence.replace(/^RRULE:/i, '').trim()
      if (rule) body.recurrence = [`RRULE:${rule}`]
    }
    const { ok, data } = await calendarRequest('POST', body)
    if (!ok) return { error: data.error ?? 'Failed to create event' }
    // Verify: re-fetch the created event. The GET expands recurring events
    // (singleEvents=true), so a recurring master's id won't appear verbatim — its
    // first occurrence is a dated instance carrying recurringEventId === master id.
    const verify = await calendarRequest('GET', null, {
      start: new Date(input.date).toISOString(),
      end:   new Date(input.date + 'T23:59:59').toISOString(),
    })
    const created = (Array.isArray(verify.data) ? verify.data : []).find(
      (e) => e.id === data.id || e.recurringEventId === data.id
    )
    if (!created) return { error: 'Event was submitted but could not be verified — please check your calendar.' }
    return { success: true, event_id: data.id, verified: { title: created.summary, date: created.start?.date ?? created.start?.dateTime?.slice(0, 10), start_time: created.start?.dateTime?.slice(11, 16) ?? 'All day', recurring: !!body.recurrence }, calendar_changed: true }
  }

  if (name === 'update_calendar_event') {
    const updates = {}
    if (input.title)       updates.summary     = input.title
    if (input.location !== undefined) updates.location    = input.location
    if (input.description !== undefined) updates.description = input.description
    if (input.date || input.start_time || input.end_time) {
      // Read the existing event first so we preserve its timed-vs-all-day type,
      // its time-of-day, and its timeZone. Without this, a date-only change
      // collapses a timed event into an all-day { date } shape and Google drops
      // it — the reported "date reverts" bug.
      const ex = await calendarRequest('GET', null, { eventId: input.event_id })
      if (!ex.ok || !ex.data || ex.data.error) {
        return { error: "Couldn't read the event to move it safely — please try again, or delete and recreate it." }
      }
      const existing = ex.data
      const isAllDay = !!existing.start?.date && !existing.start?.dateTime
      const curDate  = existing.start?.date ?? existing.start?.dateTime?.slice(0, 10)
      const targetDate = input.date ?? curDate
      if (isAllDay && !input.start_time && !input.end_time) {
        // Keep it all-day; preserve the original span (all-day end.date is exclusive).
        const span = (existing.start?.date && existing.end?.date)
          ? Math.max(1, Math.round((new Date(existing.end.date) - new Date(existing.start.date)) / 86400000))
          : 1
        const endDate = new Date(new Date(targetDate).getTime() + span * 86400000).toISOString().slice(0, 10)
        updates.start = { date: targetDate }
        updates.end   = { date: endDate }
      } else {
        // Timed event (or the user supplied a time): reuse existing time-of-day
        // and timeZone unless explicitly overridden.
        const tz = existing.start?.timeZone ?? 'Europe/London'
        const startTime = input.start_time ?? existing.start?.dateTime?.slice(11, 16) ?? '09:00'
        const endTime   = input.end_time ?? existing.end?.dateTime?.slice(11, 16) ?? startTime
        updates.start = { dateTime: `${targetDate}T${startTime}:00`, timeZone: tz }
        updates.end   = { dateTime: `${targetDate}T${endTime}:00`,   timeZone: tz }
      }
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
    // Assert the date/time actually changed — a silent revert must surface as a
    // failure, never a false success.
    if (input.date && actualDate !== input.date) {
      return { error: `Date update failed — calendar still shows ${actualDate}, expected ${input.date}. The event was not moved.` }
    }
    if (input.start_time && actualStart !== input.start_time) {
      return { error: `Time update failed — calendar still shows ${actualStart}, expected ${input.start_time}.` }
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

      res.write(`data: ${JSON.stringify({ usage: { input_tokens: totalInputTokens, output_tokens: totalOutputTokens, model: requestedModel ?? 'claude-haiku-4-5-20251001' } })}\n\n`)
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
