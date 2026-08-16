import {
  buildTask, enrichNewTask, aiScoreTask, isScored,
  persistNewTask, persistTaskUpdate, persistTaskCompletion,
} from './_lib/taskWrite.js'
import { recordUsage } from './_lib/usage.js'
import {
  isSuccessfulWrite, needsCorrection, claimsWrite, stripClaimLines,
  confirmationLine, CORRECTION_TEXT, FORCE_RETRY_PROMPT,
} from './_lib/writeClaim.js'

// Force the write the model claimed but never made.
//
// Capturing a task is the app's foundational action, so it must not depend on
// the model choosing to call a tool. When a reply claims a change and no write
// tool succeeded, this re-asks with `tool_choice: {type:'any'}` — the model then
// CANNOT answer with prose, it has to call something. The confirmation is then
// built from the tool's verified result rather than written by the model, so it
// cannot be false.
//
// One attempt only, and only on the failure path: no extra cost on a request
// that worked first time.
async function forceWriteRetry({ apiKey, model, system, messages, claimedText, tasks }) {
  const upstream = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      ...(system ? { system } : {}),
      messages: [
        ...messages,
        { role: 'assistant', content: claimedText || '(no text)' },
        { role: 'user', content: FORCE_RETRY_PROMPT },
      ],
      tools: TOOLS,
      tool_choice: { type: 'any' },
    }),
  })
  if (!upstream.ok) {
    console.warn('[claude] forced retry failed:', upstream.status, await upstream.text().catch(() => ''))
    return { wrote: false, lines: [], usage: null }
  }
  const data = await upstream.json()
  const lines = []
  let wrote = false
  for (const block of (data.content ?? []).filter((b) => b.type === 'tool_use')) {
    const result = await runTool(block.name, block.input, tasks)
    if (isSuccessfulWrite(block.name, result)) {
      wrote = true
      lines.push(confirmationLine(block.name, result))
    }
  }
  console.warn(`[claude] forced retry: tool called, write ${wrote ? 'SUCCEEDED' : 'FAILED'}`)
  return { wrote, lines, usage: data.usage ?? null }
}

// Run a tool without letting it take the request down. Most failures already
// return { error } for the model to surface, but a genuine throw inside
// executeTool used to propagate out of Promise.all — after the 200 and the SSE
// headers had already been sent, so the user saw a truncated reply and the
// server logged nothing useful. Failures are also logged here: previously a
// tool error went only to the model as a tool_result and never to the server,
// which made "the write failed" indistinguishable from "no write was attempted"
// when reading the logs after the fact.
async function runTool(name, input, tasks) {
  let result
  try {
    result = await executeTool(name, input, tasks)
  } catch (err) {
    console.error(`[claude] tool ${name} threw:`, err)
    result = { error: `${name} failed: ${err.message}` }
  }
  if (result?.error) console.warn(`[claude] tool ${name} returned an error:`, result.error)
  return result
}

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
    description:
      'Create a new task in the Life OS task list. CALL THIS whenever he wants something captured, '
      + 'added, logged, or remembered as a task — including when he describes a problem or a want and '
      + 'it should be tracked ("I need a task to…", "if I don\'t already have one…", "add a task to…", '
      + '"remind me to…"). Capturing tasks is the primary purpose of this chat: when in doubt, call it. '
      + 'Writing "task created" in your reply does NOT create anything — only this tool does. '
      + 'To create a subtask, pass the parent task\'s ID as parent_id.',
    input_schema: {
      type: 'object',
      properties: {
        content:      { type: 'string', description: 'Task title' },
        // NOTE: the scale is INVERTED — 4 is the highest priority, 1 the lowest.
        // The model used to say "P3" while passing 3 (which the app renders as
        // P2), so the spoken label disagreed with the saved value.
        priority:     { type: 'integer', description: 'Inverted scale — pass 4 to mean P1 (urgent), 3 to mean P2, 2 to mean P3, 1 to mean P4 (someday). When you name the priority in your reply, use the P-label, not this number: passing 3 means you must say "P2".', enum: [1,2,3,4] },
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
    // Persist server-side. This used to mutate only the in-memory array and
    // rely on the CLIENT to save the whole list back — which is how completions
    // were lost. The tool now owns its own write and reports only what landed.
    try {
      await persistTaskCompletion(input.task_id, true)
    } catch (err) {
      return { error: `Task NOT completed — the store write failed: ${err.message}. Tell the user it did not save.` }
    }
    task.is_completed = true
    task.completed_at = new Date().toISOString()
    return { success: true, verified: { is_completed: true, content: task.content } }
  }

  if (name === 'update_task') {
    const task = tasks.find((t) => t.id === input.task_id)
    if (!task) return { error: `Task not found: ${input.task_id}` }
    // Build a patch of only what the caller actually asked to change, so the
    // write can't clobber fields it was never told about.
    const patch = {}
    if (input.content !== undefined)  patch.content  = input.content
    if (input.priority !== undefined) patch.priority = input.priority
    if (input.remove_due_date)        patch.due      = null
    else if (input.due_string)        patch.due      = { date: input.due_string }
    Object.assign(task, patch)
    // Lazy backfill: score on touch — fail open, never block the update.
    if (!isScored(task) && !task.is_completed) {
      const scores = await aiScoreTask(task)
      if (scores) { Object.assign(task, scores); Object.assign(patch, scores) }
    }
    // Persist server-side; the tool owns its write rather than relying on the
    // client to save the whole list back.
    let saved
    try {
      saved = await persistTaskUpdate(input.task_id, patch)
    } catch (err) {
      return { error: `Task NOT updated — the store write failed: ${err.message}. Tell the user it did not save.` }
    }
    // Verify against what the database actually returned, not local state.
    return {
      success: true,
      verified: {
        content:  saved.content,
        priority: saved.priority,
        due:      saved.due ?? null,
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

  const { messages, system, tasks: initialTasks, model: requestedModel, tools: wantTools } = req.body ?? {}
  if (!messages?.length) return res.status(400).json({ error: 'messages required' })

  // The tool definitions are ~1,450 tokens on EVERY request. The chat surfaces
  // need them; the ranking and refresh calls do not — those ask for a JSON
  // object and parse it, and cannot call a tool no matter what the model does.
  // Sending them there was pure cost at Sonnet rates.
  //
  // Opt-out rather than opt-in, deliberately: a new chat surface that forgets
  // to ask for tools would silently lose the ability to save anything, which is
  // the failure this codebase has already spent three days on. A refresh call
  // that forgets to opt out merely costs a little.
  const useTools = wantTools !== false
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
      let totalCacheWrite = 0
      let totalCacheRead = 0
      // Did any state-changing tool actually land this turn, and what did the
      // model say? Compared at the end so a confirmation with no write behind
      // it corrects itself instead of quietly misleading the user.
      let writeSucceeded = false
      let assistantText = ''

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
            ...(useTools ? { tools: TOOLS } : {}),
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
        // Text streamed during THIS round. If the round turns out to end in a
        // tool call, that text was the model narrating what it was about to do
        // — and it then says the same thing again after the tool result, so the
        // user sees the confirmation twice. It is retracted below.
        let roundText = ''

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
                  assistantText += delta.text
                  roundText += delta.text
                  res.write(`data: ${JSON.stringify({ text: delta.text })}\n\n`)
                } else if (delta.type === 'input_json_delta') {
                  blocks[index].input += delta.partial_json
                }
              }

              if (evt.type === 'message_start') {
                totalInputTokens += evt.message?.usage?.input_tokens ?? 0
                totalCacheWrite  += evt.message?.usage?.cache_creation_input_tokens ?? 0
                totalCacheRead   += evt.message?.usage?.cache_read_input_tokens ?? 0
              }

              if (evt.type === 'message_delta') {
                stopReason = evt.delta?.stop_reason
                totalOutputTokens += evt.usage?.output_tokens ?? 0
              }
            } catch {}
          }
        }

        if (stopReason === 'tool_use') {
          // Retract this round's narration. Text is streamed as it arrives (so
          // the reply feels live) and we only learn the round ended in a tool
          // call once it finishes — so the client is told how many characters
          // to drop rather than the text being withheld up front. The
          // non-streaming branch already behaves this way: it keeps only the
          // text from the round that made no tool call.
          if (roundText) {
            res.write(`data: ${JSON.stringify({ drop_chars: roundText.length })}\n\n`)
            // Keep the claim detector aligned with what the user actually sees.
            assistantText = assistantText.slice(0, assistantText.length - roundText.length)
          }

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
            const result = await runTool(block.name, block.input, tasks)
            if (result.calendar_changed) calendarChanged = true
            if (isSuccessfulWrite(block.name, result)) writeSucceeded = true
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

      // The model claimed a change but called no tool. Don't just report it —
      // force the tool call so the task actually lands. Only then fall back to
      // the correction.
      //
      // Skipped entirely when this request has no tools. A ranking or refresh
      // reply is not a claim about the store even when it reads like one — its
      // summary field can legitimately say "I updated three priorities", which
      // FIRST_PERSON matches. With no tools to force, tool_choice:'any' would
      // be an API error; with tools, it would coerce a write nobody asked for.
      if (useTools && !writeSucceeded && claimsWrite(assistantText)) {
        console.warn('[claude] reply claimed a write but no write tool succeeded:', assistantText.slice(0, 300))
        const retry = await forceWriteRetry({
          apiKey,
          model: requestedModel ?? 'claude-haiku-4-5-20251001',
          system, messages: currentMessages, claimedText: assistantText, tasks,
        })
        if (retry.usage) {
          totalInputTokens += retry.usage.input_tokens ?? 0
          totalOutputTokens += retry.usage.output_tokens ?? 0
        }
        if (retry.wrote) {
          writeSucceeded = true
          // Replace the model's unbacked claim with the tool-derived one, so the
          // user sees a single confirmation that is true.
          const replacement = [stripClaimLines(assistantText), ...retry.lines].filter(Boolean).join('\n\n')
          res.write(`data: ${JSON.stringify({ drop_chars: assistantText.length })}\n\n`)
          res.write(`data: ${JSON.stringify({ text: replacement })}\n\n`)
        }
      }

      // Still nothing saved after the forced attempt — say so plainly.
      if (needsCorrection(assistantText, writeSucceeded)) {
        res.write(`data: ${JSON.stringify({ text: CORRECTION_TEXT })}\n\n`)
      }

      // Record spend server-side (single source of truth for the Settings widget).
      await recordUsage(requestedModel ?? 'claude-haiku-4-5-20251001', {
        input: totalInputTokens, output: totalOutputTokens,
        cacheWrite: totalCacheWrite, cacheRead: totalCacheRead,
      })
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
    let nsInput = 0, nsOutput = 0, nsCacheWrite = 0, nsCacheRead = 0
    let writeSucceeded = false

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
          ...(useTools ? { tools: TOOLS } : {}),
        }),
      })

      const data = await upstream.json()
      if (!upstream.ok) return res.status(upstream.status).json(data)

      nsInput      += data.usage?.input_tokens ?? 0
      nsOutput     += data.usage?.output_tokens ?? 0
      nsCacheWrite += data.usage?.cache_creation_input_tokens ?? 0
      nsCacheRead  += data.usage?.cache_read_input_tokens ?? 0

      const toolUseBlocks = data.content.filter((b) => b.type === 'tool_use')
      const textBlocks    = data.content.filter((b) => b.type === 'text')

      if (toolUseBlocks.length === 0) {
        finalText = textBlocks.map((b) => b.text).join('')
        break
      }

      const toolResults = await Promise.all(toolUseBlocks.map(async (block) => {
        const result = await runTool(block.name, block.input, tasks)
        if (isSuccessfulWrite(block.name, result)) writeSucceeded = true
        return { type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result) }
      }))

      currentMessages = [
        ...currentMessages,
        { role: 'assistant', content: data.content },
        { role: 'user', content: toolResults },
      ]
    }

    // Same recovery as the streaming branch, and the same no-tools skip.
    if (useTools && !writeSucceeded && claimsWrite(finalText)) {
      console.warn('[claude] reply claimed a write but no write tool succeeded:', finalText.slice(0, 300))
      const retry = await forceWriteRetry({
        apiKey,
        model: requestedModel ?? 'claude-haiku-4-5-20251001',
        system, messages: currentMessages, claimedText: finalText, tasks,
      })
      if (retry.usage) {
        nsInput += retry.usage.input_tokens ?? 0
        nsOutput += retry.usage.output_tokens ?? 0
      }
      if (retry.wrote) {
        writeSucceeded = true
        finalText = [stripClaimLines(finalText), ...retry.lines].filter(Boolean).join('\n\n')
      }
    }
    if (needsCorrection(finalText, writeSucceeded)) finalText += CORRECTION_TEXT

    await recordUsage(requestedModel ?? 'claude-haiku-4-5-20251001', {
      input: nsInput, output: nsOutput, cacheWrite: nsCacheWrite, cacheRead: nsCacheRead,
    })
    res.status(200).json({ content: finalText, tasks: initialTasks ? tasks : undefined })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
