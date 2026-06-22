export function isoDate(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function addDays(d, n) {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

export function startOfWeek(d) {
  const r = new Date(d)
  r.setDate(r.getDate() - ((r.getDay() + 6) % 7)) // Monday
  return r
}

export function formatTime(dateTime, timeZone) {
  if (!dateTime) return null
  return new Date(dateTime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone })
}

export function formatDuration(start, end) {
  if (!start || !end) return null
  const mins = Math.round((new Date(end) - new Date(start)) / 60000)
  if (mins < 60) return `${mins}m`
  const h = Math.floor(mins / 60), m = mins % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

export function getEventAccent(e) {
  const selfRsvp = e.attendees?.find((a) => a.self)?.responseStatus
  if (selfRsvp === 'declined')       return { bg: 'bg-red-50',      bar: 'bg-red-300',    time: 'text-red-400',    label: 'text-red-400 opacity-60' }
  if (selfRsvp === 'tentative')      return { bg: 'bg-amber-50',    bar: 'bg-amber-300',  time: 'text-amber-600',  label: 'text-[#1C1B1F]' }
  if (e._calendarType === 'holiday') return { bg: 'bg-[#E8F5E9]',   bar: 'bg-[#81C784]',  time: 'text-[#2E7D32]',  label: 'text-[#2E7D32]' }
  if (e._readOnly)                   return { bg: 'bg-[#F5F5F5]',   bar: 'bg-[#BDBDBD]',  time: 'text-[#9E9E9E]',  label: 'text-[#757575]' }
  const hasVideo     = !!(e.hangoutLink ?? e.conferenceData?.entryPoints?.find((ep) => ep.entryPointType === 'video'))
  const hasAttendees = (e.attendees?.length ?? 0) > 0
  if (hasVideo)      return { bg: 'bg-[#E0F7FA]', bar: 'bg-[#26C6DA]', time: 'text-[#00838F]', label: 'text-[#1C1B1F]' }
  if (hasAttendees)  return { bg: 'bg-[#E3F2FD]', bar: 'bg-[#42A5F5]', time: 'text-[#0D47A1]', label: 'text-[#1C1B1F]' }
  return               { bg: 'bg-[#EDE7F6]',       bar: 'bg-[#6750A4]', time: 'text-[#6750A4]', label: 'text-[#1C1B1F]' }
}
