import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { haptic } from '../lib/haptic'
import {
  SYMPTOM_GROUPS, SCALE, PROMPTS, scoreLabel, isInverted,
} from '../../api/_lib/journalSymptoms.js'
import {
  readEntries, readEntry, writeEntry, onJournalChanged, fileToDrive, driveStatus,
  localDate, shiftDate, seedFromPrevious, isBackdated, driveDocUrl,
  publishState, PUBLISH_LABEL,
} from '../lib/journal'
import JournalTrends from '../components/JournalTrends'
import ReminderToggle from '../components/ReminderToggle'

// Daily head-injury symptom journal.
//
// The design constraint is the injury being tracked: cognitive fatigue and
// reduced executive function mean anything effortful won't get used on the days
// the data matters most. So:
//
//   • TAP TARGETS, NOT SLIDERS. A slider needs a precise drag, which is the
//     wrong control for a tired evening on a phone. Five buttons, one tap each.
//   • 0–4 with None/Mild/Moderate/Severe/Very severe — the Rivermead
//     Post-Concussion Symptoms Questionnaire scale, so the record reads as a
//     recognised instrument to a clinician rather than an invented one.
//   • Quick mode is the default: 17 taps and done. Notes, prompts and the open
//     box are there when wanted and invisible when not.
//   • Missed days are shown neutrally. No streaks, no red marks.

const TODAY_LABEL = (d) => {
  const today = localDate()
  if (d === today) return 'Today'
  if (d === shiftDate(today, -1)) return 'Yesterday'
  const [y, m, day] = d.split('-').map(Number)
  return new Date(y, m - 1, day).toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short',
  })
}

// ─── One symptom row ──────────────────────────────────────────────────────────

function SymptomRow({ symptom, value, onScore, onNote }) {
  const [noteOpen, setNoteOpen] = useState(!!value?.note)
  const score = value?.score
  const carried = value?.carried === true

  return (
    <div className="py-2.5 border-b border-[#F3EDF7] last:border-0">
      <div className="flex items-baseline justify-between gap-2 mb-1.5">
        <span className="text-sm text-[#1C1B1F] leading-snug">{symptom.label}</span>
        <span className={`text-[11px] flex-shrink-0 ${carried ? 'text-[#CAC4D0]' : 'text-[#79747E]'}`}>
          {score == null ? '—' : scoreLabel(symptom.key, score)}
        </span>
      </div>

      <div className="flex gap-1.5" role="radiogroup" aria-label={symptom.label}>
        {SCALE.map((s) => {
          const active = score === s.score
          return (
            <button
              key={s.score}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={`${symptom.label}: ${scoreLabel(symptom.key, s.score)}`}
              onClick={() => { haptic.light(); onScore(s.score) }}
              className={`flex-1 h-11 rounded-xl text-xs font-medium transition-colors ${
                active
                  ? carried
                    // Carried-over values read as filled but unconfirmed, so a
                    // glance shows what's actually been reviewed today.
                    ? 'bg-[#E8DEF8] text-[#4A4458] ring-1 ring-[#CAC4D0]'
                    : 'bg-[#6750A4] text-white'
                  : 'bg-[#F3EDF7] text-[#79747E]'
              }`}
            >
              {s.score}
            </button>
          )
        })}
      </div>

      {noteOpen ? (
        <input
          type="text"
          value={value?.note ?? ''}
          onChange={(e) => onNote(e.target.value)}
          placeholder="Anything specific about this today?"
          className="mt-2 w-full text-sm px-3 py-2 rounded-xl border border-[#CAC4D0] bg-white text-[#1C1B1F] placeholder:text-[#CAC4D0]"
        />
      ) : (
        <button
          type="button"
          onClick={() => { haptic.light(); setNoteOpen(true) }}
          className="mt-1.5 text-[11px] text-[#6750A4]"
        >
          + add a note
        </button>
      )}
    </div>
  )
}

// ─── The entry form ───────────────────────────────────────────────────────────

function EntryForm({ entryDate, existing, previous, onSaved, onCancel }) {
  const [symptoms, setSymptoms] = useState(
    () => existing?.symptoms ?? seedFromPrevious(previous)
  )
  const [prompts, setPrompts] = useState(() => existing?.prompts ?? {})
  const [freeText, setFreeText] = useState(() => existing?.free_text ?? '')
  const [showDetail, setShowDetail] = useState(() => existing?.mode === 'full')
  const [openGroup, setOpenGroup] = useState(SYMPTOM_GROUPS[0].key)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const total = SYMPTOM_GROUPS.reduce((n, g) => n + g.symptoms.length, 0)
  const answered = Object.values(symptoms).filter((v) => v?.score != null).length
  const reviewed = Object.values(symptoms).filter((v) => v?.score != null && !v.carried).length

  function setScore(key, score) {
    // Touching a control clears `carried` — this is the moment a pre-filled
    // value becomes one the user actually stands behind.
    setSymptoms((prev) => ({ ...prev, [key]: { ...prev[key], score, carried: false } }))
  }
  function setNote(key, note) {
    setSymptoms((prev) => ({ ...prev, [key]: { ...prev[key], note, carried: false } }))
  }

  // Save and publish are two actions, not one.
  //
  // The day is written in pieces — something is remembered mid-afternoon and
  // added — and only submitted once, at the end. Filing on every save would put
  // a half-written day into the case file and rewrite the document each time.
  // So `publish` is an explicit second step, and saving alone is a complete,
  // normal thing to do.
  async function handleSave({ publish }) {
    if (saving) return
    setSaving(true)
    setError(null)
    try {
      // Nothing is confirmed until the database hands the row back. writeEntry
      // throws if it doesn't.
      const saved = await writeEntry({
        entry_date: entryDate,
        symptoms,
        prompts,
        free_text: freeText,
        mode: showDetail ? 'full' : 'quick',
      })
      haptic.success()

      if (!publish) {
        onSaved(saved, null)
        return
      }
      // The entry is already safely stored. Filing is a separate step whose
      // failure is reported separately — it can never cost the entry.
      const filed = await fileToDrive(entryDate)
      onSaved(saved, filed)
    } catch (e) {
      haptic.error()
      setError(e.message || 'Could not save. Your entry is still here — try again.')
    } finally {
      setSaving(false)
    }
  }

  const state = publishState(existing)
  const backdated = entryDate !== localDate()

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        <div className="flex items-center justify-between py-3">
          <div>
            <h2 className="text-lg font-semibold text-[#1C1B1F]">{TODAY_LABEL(entryDate)}</h2>
            <p className="text-xs text-[#79747E]">
              {answered} of {total} recorded
              {answered > reviewed && ` · ${answered - reviewed} carried over`}
            </p>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            {existing?.drive_status === 'filed' && driveDocUrl(existing.drive_file_id) && (
              <a
                href={driveDocUrl(existing.drive_file_id)}
                target="_blank"
                rel="noreferrer"
                onClick={() => haptic.light()}
                className="text-sm text-[#6750A4] underline"
              >
                View filed document
              </a>
            )}
            <button onClick={onCancel} className="text-sm text-[#6750A4]">Close</button>
          </div>
        </div>

        {backdated && (
          <div className="mb-3 px-3 py-2 rounded-xl bg-[#FFF8E1] text-[#5D4037] text-xs leading-relaxed">
            You're writing this for {TODAY_LABEL(entryDate).toLowerCase()}. The record will note
            that it was written later — that keeps it honest as evidence.
          </div>
        )}

        {SYMPTOM_GROUPS.map((group) => {
          const open = openGroup === group.key
          const done = group.symptoms.filter((s) => symptoms[s.key]?.score != null).length
          return (
            <div key={group.key} className="mb-2 rounded-2xl bg-white border border-[#CAC4D0] overflow-hidden">
              <button
                type="button"
                onClick={() => { haptic.light(); setOpenGroup(open ? null : group.key) }}
                className="w-full flex items-center justify-between px-4 py-3"
              >
                <span className="text-sm font-medium text-[#1C1B1F]">{group.title}</span>
                <span className="text-xs text-[#79747E]">
                  {done}/{group.symptoms.length}
                  <span className={`inline-block ml-2 transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>
                </span>
              </button>
              {open && (
                <div className="px-4 pb-2">
                  {group.symptoms.map((s) => (
                    <SymptomRow
                      key={s.key}
                      symptom={s}
                      value={symptoms[s.key]}
                      onScore={(v) => setScore(s.key, v)}
                      onNote={(v) => setNote(s.key, v)}
                    />
                  ))}
                </div>
              )}
            </div>
          )
        })}

        {!showDetail ? (
          <button
            type="button"
            onClick={() => { haptic.light(); setShowDetail(true) }}
            className="w-full py-3 text-sm text-[#6750A4]"
          >
            + add reflections and notes
          </button>
        ) : (
          <div className="mt-2 space-y-3">
            {PROMPTS.map((p) => (
              <div key={p.key}>
                <label className="block text-xs text-[#49454F] mb-1">{p.question}</label>
                <textarea
                  rows={2}
                  value={prompts[p.key] ?? ''}
                  onChange={(e) => setPrompts((prev) => ({ ...prev, [p.key]: e.target.value }))}
                  className="w-full text-sm px-3 py-2 rounded-xl border border-[#CAC4D0] bg-white text-[#1C1B1F]"
                />
              </div>
            ))}
            <div>
              <label className="block text-xs text-[#49454F] mb-1">Anything else</label>
              <textarea
                rows={4}
                value={freeText}
                onChange={(e) => setFreeText(e.target.value)}
                className="w-full text-sm px-3 py-2 rounded-xl border border-[#CAC4D0] bg-white text-[#1C1B1F]"
              />
            </div>
          </div>
        )}
      </div>

      <div className="flex-shrink-0 px-4 py-3 border-t border-[#F3EDF7] bg-white">
        {error && (
          <div className="mb-2 px-3 py-2 rounded-xl bg-[#FCEEEE] text-[#8C1D18] text-xs leading-relaxed break-words">
            <strong>Not saved.</strong> {error}
          </div>
        )}
        <div className="flex gap-2">
          <button
            onClick={() => handleSave({ publish: false })}
            disabled={saving || answered === 0}
            className="flex-1 py-3 rounded-full border border-[#6750A4] text-[#6750A4] text-sm font-semibold disabled:opacity-40"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button
            onClick={() => handleSave({ publish: true })}
            disabled={saving || answered === 0}
            className="flex-1 py-3 rounded-full bg-[#6750A4] text-white text-sm font-semibold disabled:opacity-40"
          >
            {state === 'published' || state === 'edited' ? 'Republish' : 'Publish'}
          </button>
        </div>
        <p className="mt-2 text-[10px] text-[#79747E] text-center">
          {state === 'published'
            ? 'Published — saving again keeps it a draft until you republish.'
            : state === 'edited'
              ? 'Edited since publishing. Republish to update the filed document.'
              : 'Save as often as you like through the day. Publish files it to Drive.'}
        </p>
      </div>
    </div>
  )
}

// ─── Link to the filed document ───────────────────────────────────────────────

function DocIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" height="20" viewBox="0 -960 960 960" width="20" fill="currentColor">
      <path d="M320-240h320v-80H320v80Zm0-160h320v-80H320v80ZM240-80q-33 0-56.5-23.5T160-160v-640q0-33 23.5-56.5T240-880h320l240 240v480q0 33-23.5 56.5T720-80H240Zm280-520v-200H240v640h480v-440H520ZM240-800v200-200 640-640Z" />
    </svg>
  )
}

// ─── History list ─────────────────────────────────────────────────────────────

function HistoryRow({ entry, date, onOpen }) {
  const logged = !!entry
  const avg = logged
    ? (() => {
        const vals = Object.entries(entry.symptoms ?? {})
          .filter(([k, v]) => v?.score != null && !isInverted(k))
          .map(([, v]) => v.score)
        return vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length) : null
      })()
    : null

  // The row is a div, not a button: the document link is an anchor, and an
  // anchor nested inside a button is invalid and makes the two tap targets
  // fight each other. Two siblings instead — body opens the editor, icon opens
  // the filed document.
  const state = publishState(entry)
  // The link stays available once a document exists, including while the entry
  // has unpublished edits — the filed version is still the filed version, and
  // being able to see what was submitted is the point.
  const docUrl = logged && entry.drive_file_id ? driveDocUrl(entry.drive_file_id) : null

  return (
    <div className="flex items-center border-b border-[#F3EDF7]">
      <button
        onClick={() => { haptic.light(); onOpen(date) }}
        className="flex-1 min-w-0 flex items-center gap-3 py-3 text-left"
      >
        <span
          className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${logged ? 'bg-[#6750A4]' : 'bg-[#E7E0EC]'}`}
          aria-hidden
        />
        <span className="flex-1 min-w-0">
          <span className="block text-sm text-[#1C1B1F]">{TODAY_LABEL(date)}</span>
          <span className="block text-xs text-[#79747E]">
            {logged
              ? <>Logged{avg != null && ` · average ${avg.toFixed(1)}`}{isBackdated(entry) && ' · written later'}</>
              : 'Not logged'}
          </span>
        </span>
      </button>

      {/* A draft is a normal mid-day state, not a fault — it must not be
          dressed as the red "filing broke" pill, or the one that genuinely
          needs chasing stops standing out. Published needs no pill at all;
          the document icon beside it already says so. */}
      {logged && state && state !== 'published' && (
        <span
          className={`text-[10px] px-2 py-0.5 rounded-full flex-shrink-0 ml-2 ${
            state === 'failed'
              ? 'bg-[#FCEEEE] text-[#8C1D18]'
              : 'bg-[#F3EDF7] text-[#49454F]'
          }`}
        >
          {state === 'edited' ? 'Edited' : PUBLISH_LABEL[state]}
        </span>
      )}

      {docUrl && (
        <a
          href={docUrl}
          target="_blank"
          rel="noreferrer"
          onClick={() => haptic.light()}
          aria-label={`Open the filed document for ${TODAY_LABEL(date)}`}
          className="flex-shrink-0 w-11 h-11 flex items-center justify-center text-[#6750A4] rounded-full"
        >
          <DocIcon />
        </a>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Journal() {
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [editing, setEditing] = useState(null)   // { date, existing, previous }
  const [days, setDays] = useState(30)
  const [filing, setFiling] = useState(null)     // outcome of the last filing
  const [draftSaved, setDraftSaved] = useState(null) // date saved without filing
  const [drive, setDrive] = useState(null)       // { connected, drive }
  const [view, setView] = useState('history')    // 'history' | 'trends'

  const refresh = useCallback(async () => {
    try {
      const rows = await readEntries({ limit: 400 })
      setEntries(rows)
      setError(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { driveStatus().then(setDrive) }, [])

  useEffect(() => {
    refresh()
    const off = onJournalChanged(refresh)
    const onFocus = () => { if (document.visibilityState === 'visible') refresh() }
    window.addEventListener('visibilitychange', onFocus)
    return () => { off(); window.removeEventListener('visibilitychange', onFocus) }
  }, [refresh])

  const byDate = useMemo(
    () => Object.fromEntries(entries.map((e) => [e.entry_date, e])),
    [entries]
  )

  const dates = useMemo(() => {
    const out = []
    let d = localDate()
    for (let i = 0; i < days; i++) { out.push(d); d = shiftDate(d, -1) }
    return out
  }, [days])

  const today = localDate()
  const todayEntry = byDate[today]

  async function openDate(date) {
    // The previous entry seeds the form. Read fresh rather than trusting the
    // list, so an edit made on another device is what gets carried forward.
    let previous = null
    for (let i = 1; i <= 14 && !previous; i++) {
      previous = byDate[shiftDate(date, -i)] ?? null
    }
    let existing = byDate[date] ?? null
    try { existing = (await readEntry(date)) ?? existing } catch { /* fall back to the list copy */ }
    setEditing({ date, existing, previous })
  }

  if (editing) {
    return (
      <EntryForm
        entryDate={editing.date}
        existing={editing.existing}
        previous={editing.previous}
        onSaved={(saved, filed) => {
          setEditing(null)
          setFiling(filed)
          // A save with no filing is a draft, and still deserves a confirmation
          // — a write that reports nothing is exactly how this app has lost
          // user trust before.
          setDraftSaved(filed ? null : saved?.entry_date ?? null)
          refresh()
        }}
        onCancel={() => setEditing(null)}
      />
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="bg-[#F3EDF7] px-4 pt-4 pb-3 flex-shrink-0">
        <h1 className="text-lg font-semibold text-[#1C1B1F]">Journal</h1>
        <p className="text-xs text-[#79747E]">Daily symptom record</p>

        <div className="flex gap-1.5 mt-3" role="tablist">
          {[['history', 'History'], ['trends', 'Trends']].map(([key, label]) => (
            <button
              key={key}
              role="tab"
              aria-selected={view === key}
              onClick={() => { haptic.light(); setView(key) }}
              className={`flex-1 py-2 rounded-full text-xs font-medium transition-colors ${
                view === key ? 'bg-white text-[#1C1B1F] shadow-sm' : 'text-[#49454F]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4">
        {error && (
          <div className="my-3 px-3 py-2 rounded-xl bg-[#FCEEEE] text-[#8C1D18] text-xs">
            Couldn't load your entries: {error}
          </div>
        )}

        {draftSaved && !filing && (
          <div className="mt-3 px-3 py-2.5 rounded-xl bg-[#F3EDF7] text-[#1C1B1F] text-xs leading-relaxed flex items-start justify-between gap-3">
            <span className="min-w-0">
              <strong>Saved as a draft.</strong> Not filed to Drive yet — add to it through
              the day and publish when you're done.
            </span>
            <button
              onClick={() => setDraftSaved(null)}
              className="underline text-[#6750A4] flex-shrink-0"
            >
              Dismiss
            </button>
          </div>
        )}

        {filing && (
          <div
            className={`mt-3 px-3 py-2.5 rounded-xl text-xs leading-relaxed break-words ${
              filing.ok ? 'bg-[#E8F5E9] text-[#1B5E20]' : 'bg-[#FCEEEE] text-[#8C1D18]'
            }`}
          >
            {filing.ok ? (
              <>
                <strong>Saved and filed to Drive.</strong>{' '}
                {filing.updated ? 'The existing document was updated.' : 'A new document was created.'}
                {filing.url && (
                  <>
                    {' '}
                    <a href={filing.url} target="_blank" rel="noreferrer" className="underline">
                      Open it
                    </a>
                  </>
                )}
              </>
            ) : (
              <>
                <strong>Saved, but not filed to Drive.</strong> {filing.error}
                <div className="mt-1.5 flex gap-3">
                  <button
                    onClick={async () => {
                      setFiling({ ok: false, error: 'Retrying…' })
                      setFiling(await fileToDrive(today))
                    }}
                    className="underline font-semibold"
                  >
                    Try filing again
                  </button>
                  <button onClick={() => setFiling(null)} className="underline">Dismiss</button>
                </div>
              </>
            )}
          </div>
        )}

        {drive && drive.connected && !drive.drive && (
          <div className="mt-3 px-3 py-2.5 rounded-xl bg-[#FFF8E1] text-[#5D4037] text-xs leading-relaxed">
            <strong>Drive filing isn't enabled yet.</strong> Google is connected for Calendar but
            hasn't granted Drive access. Entries will still save — reconnect Google in Settings to
            start filing them.
          </div>
        )}

        <button
          onClick={() => openDate(today)}
          className="w-full my-3 py-3.5 rounded-2xl bg-[#6750A4] text-white text-sm font-semibold"
        >
          {todayEntry ? "Edit today's entry" : 'Log today'}
        </button>

        {view === 'history' && <ReminderToggle />}

        {loading ? (
          <p className="text-sm text-[#79747E] py-4">Loading…</p>
        ) : view === 'trends' ? (
          // Mounted only while the tab is open. App.jsx renders every screen in
          // the swipe strip at once, so an always-mounted chart would be built
          // on every app load whether or not it is ever looked at.
          <JournalTrends entries={entries} />
        ) : (
          <>
            {dates.map((d) => (
              <HistoryRow key={d} date={d} entry={byDate[d]} onOpen={openDate} />
            ))}
            {days < 365 && (
              <button
                onClick={() => setDays((n) => (n < 90 ? 90 : n < 180 ? 180 : 365))}
                className="w-full py-4 text-sm text-[#6750A4]"
              >
                Show more
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
