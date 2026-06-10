import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getAllTasks, PROJECTS } from '../lib/todoist'
import { scoreTask } from '../lib/priority'
import { sendMessageStream, SYSTEM_PROMPTS } from '../lib/claude'
import { loadHeadConfig } from '../lib/headConfig'
import { haptic } from '../lib/haptic'
import QuickAdd from '../components/QuickAdd'
import Markdown from '../components/Markdown'

const BUCKETS = ['Finance', 'Health', 'Work', 'Family', 'Home', 'Personal', 'Systems']

const BUCKET_META = {
  Finance:  { emoji: '💰', accent: 'bg-[#C8F5E1]', text: 'text-[#002115]' },
  Health:   { emoji: '🏃', accent: 'bg-[#FFD8E4]', text: 'text-[#31111D]' },
  Work:     { emoji: '💼', accent: 'bg-[#D3E4FF]', text: 'text-[#001D36]' },
  Family:   { emoji: '👨‍👩‍👧', accent: 'bg-[#FFE4F3]', text: 'text-[#31001D]' },
  Home:     { emoji: '🏠', accent: 'bg-[#FFF0C8]', text: 'text-[#261900]' },
  Personal: { emoji: '✨', accent: 'bg-[#E8F5E9]', text: 'text-[#1B5E20]' },
  Systems:  { emoji: '⚙️', accent: 'bg-[#EADDFF]', text: 'text-[#21005D]' },
}

const PROJECT_NAMES = Object.fromEntries(Object.entries(PROJECTS).map(([name, id]) => [id, name]))

// Steps: 0=intention, 1-7=buckets, 8=CoS summary, 9=complete
const TOTAL_STEPS = 10

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

function formatDate(d) {
  return d.toLocaleDateString('en-GB', { weekday: 'long' }) +
    ', ' + ordinal(d.getDate()) + ' ' +
    d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
}

function formatShort(d) {
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' }) +
    ', ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

// ── Step 0: Set intention ─────────────────────────────────────────────────────
function StepIntention({ onNext }) {
  const [value, setValue] = useState('')
  const ref = useRef(null)
  useEffect(() => { setTimeout(() => ref.current?.focus(), 300) }, [])

  return (
    <div className="flex flex-col h-full px-6 pt-8 pb-6">
      <div className="flex-1 flex flex-col justify-center max-w-lg mx-auto w-full">
        <h1 className="text-2xl font-bold text-[#1C1B1F] mb-1">Weekly Review</h1>
        <p className="text-sm text-[#79747E] mb-10">{formatDate(new Date())}</p>
        <label className="text-base font-semibold text-[#1C1B1F] mb-3">
          What would make this week a success?
        </label>
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="One sentence is enough."
          rows={3}
          className="w-full rounded-2xl border border-[#CAC4D0] px-4 py-3 text-sm text-[#1C1B1F] focus:outline-none focus:border-[#6750A4] resize-none bg-white"
        />
      </div>
      <div className="flex gap-3 max-w-lg mx-auto w-full">
        <button
          onClick={() => onNext('')}
          className="flex-1 py-3 rounded-full border border-[#CAC4D0] text-sm font-medium text-[#49454F] hover:bg-[#F3EDF7] transition-colors"
        >Skip</button>
        <button
          onClick={() => onNext(value.trim())}
          className="flex-[2] py-3 rounded-full bg-[#6750A4] text-white text-sm font-semibold hover:bg-[#5B4397] transition-colors"
        >Set intention →</button>
      </div>
    </div>
  )
}

// ── Steps 1–7: Bucket review ──────────────────────────────────────────────────
function BucketStep({ bucket, allTasks, onNext, reviewTextsRef, tasksAdded, setTasksAdded }) {
  const meta = BUCKET_META[bucket]
  const bucketTasks = allTasks.filter((t) => t._projectName === bucket)
  const overdueTasks = bucketTasks.filter((t) => scoreTask(t).isOverdue)
  const [aiText, setAiText] = useState('')
  const [aiLoading, setAiLoading] = useState(true)
  const [quickAddOpen, setQuickAddOpen] = useState(false)
  const endRef = useRef(null)
  const firedRef = useRef(false)

  useEffect(() => {
    if (firedRef.current) return
    firedRef.current = true
    const cfg = loadHeadConfig(bucket)
    const prompt = `You are the ${bucket} Head. Review this bucket. In three points maximum: what is urgent, what is being neglected, and what priority change would you recommend this week? Be direct.`
    sendMessageStream([{ role: 'user', content: prompt }], SYSTEM_PROMPTS.head(bucket, allTasks, cfg), (chunk) => {
      setAiText((prev) => {
        const next = prev + chunk
        reviewTextsRef.current[bucket] = next
        return next
      })
      endRef.current?.scrollIntoView({ behavior: 'smooth' })
    })
      .catch(() => setAiText('Could not load review.'))
      .finally(() => setAiLoading(false))
  }, [])

  const priorityLabel = (p) => ({ 4: 'P1', 3: 'P2', 2: 'P3', 1: 'P4' }[p] ?? 'P4')
  const priorityColor = (p) => ({
    4: 'text-red-700 bg-[#FFD8E4]',
    3: 'text-amber-800 bg-[#FFF0C8]',
  }[p] ?? 'text-[#49454F] bg-[#F3EDF7]')

  return (
    <div className="flex flex-col h-full">
      <div className={`${meta.accent} px-6 pt-4 pb-4 flex-shrink-0`}>
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <span className="text-2xl">{meta.emoji}</span>
          <div>
            <h2 className={`text-lg font-bold ${meta.text}`}>{bucket}</h2>
            <p className={`text-xs ${meta.text} opacity-60`}>
              {bucketTasks.length} task{bucketTasks.length !== 1 ? 's' : ''}
              {overdueTasks.length > 0 && ` · ${overdueTasks.length} overdue`}
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pt-4 pb-2">
        <div className="max-w-lg mx-auto space-y-3">
          {bucketTasks.length > 0 ? (
            <div className="bg-white border border-[#CAC4D0] rounded-2xl overflow-hidden">
              {bucketTasks.map((t, i) => {
                const { isOverdue, isToday } = scoreTask(t)
                const dueDate = t.due?.date
                  ? new Date(t.due.date + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' })
                  : null
                return (
                  <div key={t.id} className={`flex items-start gap-3 px-4 py-3 ${i < bucketTasks.length - 1 ? 'border-b border-[#F3EDF7]' : ''}`}>
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded mt-0.5 flex-shrink-0 ${priorityColor(t.priority)}`}>
                      {priorityLabel(t.priority)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm leading-snug ${isOverdue ? 'text-red-900' : 'text-[#1C1B1F]'}`}>{t.content}</p>
                      {dueDate && (
                        <p className={`text-xs mt-0.5 ${isOverdue ? 'text-red-600 font-medium' : isToday ? 'text-[#6750A4]' : 'text-[#79747E]'}`}>
                          {isOverdue ? 'Overdue · ' : isToday ? 'Today · ' : ''}{dueDate}
                        </p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-sm text-[#79747E] text-center py-4">No tasks in this bucket.</p>
          )}

          <div className="bg-white border border-[#CAC4D0] rounded-2xl p-4">
            <p className="text-xs font-semibold text-[#6750A4] mb-2">{bucket} Head review</p>
            {aiLoading && !aiText ? (
              <div className="flex gap-1 py-1">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="w-1.5 h-1.5 rounded-full bg-[#CAC4D0]"
                    style={{ animation: `bounce 1.2s ${i * 0.2}s infinite` }} />
                ))}
              </div>
            ) : (
              <div className="text-sm text-[#1C1B1F] leading-relaxed">
                <Markdown text={aiText} />
              </div>
            )}
            <div ref={endRef} />
          </div>
        </div>
      </div>

      <div className="border-t border-[#CAC4D0] bg-white px-4 pt-3 pb-4 flex-shrink-0">
        <div className="flex gap-3 max-w-lg mx-auto">
          <button
            onClick={() => setQuickAddOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-full border border-[#6750A4] text-[#6750A4] text-sm font-medium hover:bg-[#F3EDF7] transition-colors"
          >
            <span className="text-lg leading-none">+</span> Add task
          </button>
          <button
            onClick={onNext}
            className="flex-1 py-2.5 rounded-full bg-[#6750A4] text-white text-sm font-semibold hover:bg-[#5B4397] transition-colors"
          >Next →</button>
        </div>
      </div>

      <QuickAdd open={quickAddOpen} onClose={() => setQuickAddOpen(false)}
        onAdd={() => setTasksAdded((n) => n + 1)} initialBucket={bucket} />
    </div>
  )
}

// ── Step 8: Chief of Staff summary ────────────────────────────────────────────
function StepSummary({ intention, bucketReviews, allTasks, onNext, setTasksAdded }) {
  const [messages, setMessages] = useState([])
  const [streaming, setStreaming] = useState(true)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [quickAddOpen, setQuickAddOpen] = useState(false)
  const endRef = useRef(null)
  const firedRef = useRef(false)

  useEffect(() => {
    if (firedRef.current) return
    firedRef.current = true

    const intentionLine = intention
      ? `Yogesh's intention for this week: "${intention}".`
      : 'No specific intention was set for this week.'

    const reviewSummary = bucketReviews
      .map((r) => `${r.bucket}:\n${r.text || '(no review loaded)'}`)
      .join('\n\n')

    const prompt = `Weekly review complete. ${intentionLine}\n\nAll 7 buckets have been reviewed:\n\n${reviewSummary}\n\nBased on the full task list and bucket weighting framework, produce: (1) Top 5 priorities for this week ranked by consequence, irreversibility and compounding value. (2) Any cross-bucket conflicts or dependencies to flag. (3) One clarifying question if a decision is needed. Be direct. No waffle.`

    const cfg = loadHeadConfig('chief')
    let fullText = ''
    sendMessageStream([{ role: 'user', content: prompt }], SYSTEM_PROMPTS.cos(allTasks, cfg), (chunk) => {
      fullText += chunk
      setMessages([{ role: 'assistant', content: fullText }])
      endRef.current?.scrollIntoView({ behavior: 'smooth' })
    })
      .catch(() => setMessages([{ role: 'assistant', content: 'Could not load summary.' }]))
      .finally(() => setStreaming(false))
  }, [])

  async function handleSend() {
    if (!input.trim() || sending) return
    const userMsg = input.trim()
    setInput('')
    setSending(true)
    haptic.light()
    const newMessages = [...messages, { role: 'user', content: userMsg }]
    setMessages(newMessages)
    const cfg = loadHeadConfig('chief')
    let reply = ''
    await sendMessageStream(
      newMessages.map((m) => ({ role: m.role, content: m.content })),
      SYSTEM_PROMPTS.cos(allTasks, cfg),
      (chunk) => {
        reply += chunk
        setMessages([...newMessages, { role: 'assistant', content: reply }])
        endRef.current?.scrollIntoView({ behavior: 'smooth' })
      }
    ).catch(() => {})
    setSending(false)
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 pt-4 pb-3 border-b border-[#F3EDF7] flex-shrink-0">
        <div className="max-w-lg mx-auto">
          <h2 className="text-lg font-bold text-[#1C1B1F]">This Week</h2>
          <p className="text-xs text-[#79747E]">Chief of Staff summary</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="max-w-lg mx-auto space-y-3">
          {messages.length === 0 && (
            <div className="bg-white border border-[#CAC4D0] rounded-2xl px-4 py-3">
              <div className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="w-1.5 h-1.5 rounded-full bg-[#CAC4D0]"
                    style={{ animation: `bounce 1.2s ${i * 0.2}s infinite` }} />
                ))}
              </div>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={m.role === 'user' ? 'flex justify-end' : ''}>
              {m.role === 'user' ? (
                <div className="bg-[#6750A4] text-white text-sm rounded-2xl rounded-tr-sm px-4 py-2.5 max-w-[80%]">
                  {m.content}
                </div>
              ) : (
                <div className="bg-white border border-[#CAC4D0] rounded-2xl rounded-tl-sm px-4 py-3 text-sm text-[#1C1B1F] leading-relaxed">
                  <Markdown text={m.content} />
                  {streaming && i === messages.length - 1 && (
                    <span className="inline-flex gap-0.5 ml-1 align-middle">
                      {[0, 1, 2].map((j) => (
                        <span key={j} className="w-1 h-1 rounded-full bg-[#CAC4D0] inline-block"
                          style={{ animation: `bounce 1.2s ${j * 0.2}s infinite` }} />
                      ))}
                    </span>
                  )}
                </div>
              )}
            </div>
          ))}
          <div ref={endRef} />
        </div>
      </div>

      <div className="border-t border-[#CAC4D0] bg-white px-4 pt-2.5 pb-3 flex-shrink-0">
        <div className="max-w-lg mx-auto space-y-2">
          <div className="flex gap-2 items-end">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
              placeholder="Ask a follow-up…"
              rows={1}
              className="flex-1 rounded-2xl border border-[#CAC4D0] px-3 py-2 text-sm text-[#1C1B1F] focus:outline-none focus:border-[#6750A4] resize-none"
            />
            <button onClick={handleSend} disabled={!input.trim() || sending}
              className="w-9 h-9 flex items-center justify-center rounded-full bg-[#6750A4] text-white disabled:opacity-40 flex-shrink-0 transition-opacity">
              <svg xmlns="http://www.w3.org/2000/svg" height="18" viewBox="0 -960 960 960" width="18" fill="currentColor">
                <path d="M120-160v-640l760 320-760 320Zm80-120 474-200-474-200v140l240 60-240 60v140Zm0 0v-400 400Z"/>
              </svg>
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setQuickAddOpen(true)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-full border border-[#6750A4] text-[#6750A4] text-xs font-medium hover:bg-[#F3EDF7] transition-colors">
              + Add task
            </button>
            <button onClick={onNext} disabled={streaming}
              className="ml-auto px-5 py-1.5 rounded-full bg-[#6750A4] text-white text-xs font-semibold disabled:opacity-40 hover:bg-[#5B4397] transition-colors">
              Complete review →
            </button>
          </div>
        </div>
      </div>

      <QuickAdd open={quickAddOpen} onClose={() => setQuickAddOpen(false)}
        onAdd={() => setTasksAdded((n) => n + 1)} initialBucket={bucket} />
    </div>
  )
}

// ── Step 9: Complete ──────────────────────────────────────────────────────────
function StepComplete({ intention, tasksAdded, completedAt, onDone }) {
  return (
    <div className="flex flex-col h-full px-6 pt-8 pb-6">
      <div className="flex-1 flex flex-col justify-center max-w-lg mx-auto w-full">
        <div className="text-5xl mb-6 text-center">✅</div>
        <h1 className="text-2xl font-bold text-[#1C1B1F] mb-1 text-center">Review complete</h1>
        <p className="text-sm text-[#79747E] text-center mb-8">{formatShort(completedAt)}</p>
        <div className="bg-[#F3EDF7] rounded-2xl p-5 space-y-4">
          {intention && (
            <div>
              <p className="text-xs font-semibold text-[#6750A4] mb-1">This week's intention</p>
              <p className="text-sm text-[#1C1B1F] italic">"{intention}"</p>
            </div>
          )}
          <div>
            <p className="text-xs font-semibold text-[#6750A4] mb-1">Tasks added</p>
            <p className="text-sm text-[#1C1B1F]">{tasksAdded} task{tasksAdded !== 1 ? 's' : ''} added during this review</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-[#6750A4] mb-1">Buckets reviewed</p>
            <p className="text-sm text-[#1C1B1F]">Finance · Health · Work · Family · Home · Personal · Systems</p>
          </div>
        </div>
      </div>
      <button
        onClick={onDone}
        className="w-full max-w-lg mx-auto py-3 rounded-full bg-[#6750A4] text-white text-sm font-semibold hover:bg-[#5B4397] transition-colors"
      >
        Back to home
      </button>
    </div>
  )
}

// ── Exit confirm modal ────────────────────────────────────────────────────────
function ExitModal({ onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end justify-center" onClick={onCancel}>
      <div className="bg-white rounded-t-3xl w-full max-w-lg p-6 pb-8" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-semibold text-[#1C1B1F] mb-2">Exit review?</h3>
        <p className="text-sm text-[#79747E] mb-6">Your progress will be lost.</p>
        <div className="flex gap-3">
          <button onClick={onCancel}
            className="flex-1 py-3 rounded-full border border-[#CAC4D0] text-sm font-medium text-[#49454F] hover:bg-[#F3EDF7]">
            Continue
          </button>
          <button onClick={onConfirm}
            className="flex-1 py-3 rounded-full bg-red-50 text-red-600 text-sm font-semibold border border-red-200">
            Exit
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function WeeklyReview() {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [allTasks, setAllTasks] = useState([])
  const [intention, setIntention] = useState('')
  const [bucketReviews, setBucketReviews] = useState([])
  const [tasksAdded, setTasksAdded] = useState(0)
  const [completedAt, setCompletedAt] = useState(null)
  const [showExit, setShowExit] = useState(false)
  const reviewTextsRef = useRef({})

  useEffect(() => {
    getAllTasks()
      .then((data) => data.map((t) => ({ ...t, _projectName: PROJECT_NAMES[t.project_id] })))
      .then(setAllTasks)
      .catch(() => {})
  }, [])

  const progress = step / (TOTAL_STEPS - 1)
  const bucketIdx = step >= 1 && step <= 7 ? step - 1 : null
  const currentBucket = bucketIdx !== null ? BUCKETS[bucketIdx] : null

  function advance() { haptic.light(); setStep((s) => s + 1) }

  function handleIntention(value) { setIntention(value); advance() }

  function handleBucketNext() {
    if (bucketIdx === 6) {
      setBucketReviews(BUCKETS.map((b) => ({ bucket: b, text: reviewTextsRef.current[b] ?? '' })))
    }
    advance()
  }

  function handleSummaryNext() {
    const now = new Date()
    setCompletedAt(now)
    localStorage.setItem('lastWeeklyReview', now.toISOString())
    advance()
  }

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Progress bar row */}
      <div className="flex-shrink-0 px-4 pt-4 pb-2">
        <div className="flex items-center gap-3 max-w-lg mx-auto">
          {step < TOTAL_STEPS - 1 && (
            <button onClick={() => setShowExit(true)} className="text-[#6750A4] p-1 -ml-1 flex-shrink-0">
              <svg xmlns="http://www.w3.org/2000/svg" height="20" viewBox="0 -960 960 960" width="20" fill="currentColor">
                <path d="M560-240 320-480l240-240 56 56-184 184 184 184-56 56Z" />
              </svg>
            </button>
          )}
          <div className="flex-1 h-1.5 bg-[#E7E0EC] rounded-full overflow-hidden">
            <div
              className="h-full bg-[#6750A4] rounded-full transition-all duration-500 ease-out"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
          {step < TOTAL_STEPS - 1 && (
            <span className="text-xs text-[#79747E] w-10 text-right flex-shrink-0">
              {step + 1} / {TOTAL_STEPS - 1}
            </span>
          )}
        </div>
      </div>

      {/* Step content */}
      <div className="flex-1 overflow-hidden min-h-0">
        {step === 0 && <StepIntention onNext={handleIntention} />}

        {currentBucket && (
          <BucketStep
            key={currentBucket}
            bucket={currentBucket}
            allTasks={allTasks}
            onNext={handleBucketNext}
            reviewTextsRef={reviewTextsRef}
            tasksAdded={tasksAdded}
            setTasksAdded={setTasksAdded}
          />
        )}

        {step === 8 && (
          <StepSummary
            intention={intention}
            bucketReviews={bucketReviews}
            allTasks={allTasks}
            onNext={handleSummaryNext}
            setTasksAdded={setTasksAdded}
          />
        )}

        {step === 9 && completedAt && (
          <StepComplete
            intention={intention}
            tasksAdded={tasksAdded}
            completedAt={completedAt}
            onDone={() => navigate('/')}
          />
        )}
      </div>

      {showExit && (
        <ExitModal
          onConfirm={() => { setShowExit(false); navigate('/') }}
          onCancel={() => setShowExit(false)}
        />
      )}
    </div>
  )
}
