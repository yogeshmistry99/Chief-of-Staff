import { useLocation, useNavigate } from 'react-router-dom'
import { formatTime, formatDuration } from '../lib/calendarUtils'

function formatDate(dateStr) {
  if (!dateStr) return null
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: '2-digit', year: '2-digit' })
}

function Section({ icon, children }) {
  return (
    <div className="flex items-start gap-3 py-3 border-b border-[#F3EDF7] last:border-0">
      <span className="text-[#79747E] mt-0.5 flex-shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  )
}

export default function CalendarEvent() {
  const navigate  = useNavigate()
  const location  = useLocation()
  const event     = location.state?.event

  if (!event) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <p className="text-sm text-[#49454F]">Event not found.</p>
        <button onClick={() => navigate('/calendar')} className="text-xs text-[#6750A4]">← Back</button>
      </div>
    )
  }

  const isAllDay     = !!event.start?.date && !event.start?.dateTime
  const startDate    = event.start?.date ?? event.start?.dateTime?.split('T')[0]
  const endDate      = event.end?.date ?? event.end?.dateTime?.split('T')[0]
  const startTime    = formatTime(event.start?.dateTime, event.start?.timeZone)
  const endTime      = formatTime(event.end?.dateTime,   event.end?.timeZone)
  const duration     = formatDuration(event.start?.dateTime, event.end?.dateTime)
  const multiDay     = startDate && endDate && startDate !== endDate
  const attendees    = event.attendees ?? []
  const selfAttendee = attendees.find((a) => a.self)
  const organiser    = event.organizer
  const meetLink     = event.hangoutLink ?? event.conferenceData?.entryPoints?.find((e) => e.entryPointType === 'video')?.uri
  const description  = event.description?.replace(/<[^>]*>/g, '').trim()

  const statusColor = {
    accepted:  'text-green-700 bg-green-50',
    declined:  'text-red-700 bg-red-50',
    tentative: 'text-amber-700 bg-amber-50',
    needsAction: 'text-[#79747E] bg-[#F3EDF7]',
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-[#D3E4FF] px-4 pt-4 pb-4">
        <button onClick={() => navigate(-1)} className="opacity-60 p-1 -ml-1 mb-2 block">
          <svg xmlns="http://www.w3.org/2000/svg" height="20" viewBox="0 -960 960 960" width="20" fill="currentColor">
            <path d="M560-240 320-480l240-240 56 56-184 184 184 184-56 56Z" />
          </svg>
        </button>
        <h1 className="text-lg font-semibold text-[#001D36] leading-snug">{event.summary ?? 'Untitled event'}</h1>
        {event.calendarId && event.calendarId !== 'primary' && (
          <p className="text-xs text-[#001D36] opacity-60 mt-1">{event.calendarId}</p>
        )}
      </div>

      {/* Details */}
      <div className="flex-1 overflow-y-auto px-4 py-2">
        <div className="bg-white border border-[#CAC4D0] rounded-2xl px-4 py-1 mb-4 shadow-sm">

          {/* Date / time */}
          <Section icon={
            <svg xmlns="http://www.w3.org/2000/svg" height="18" viewBox="0 -960 960 960" width="18" fill="currentColor">
              <path d="M200-80q-33 0-56.5-23.5T120-160v-560q0-33 23.5-56.5T200-800h40v-80h80v80h320v-80h80v80h40q33 0 56.5 23.5T840-720v560q0 33-23.5 56.5T760-80H200Zm0-80h560v-400H200v400Zm0-480h560v-80H200v80Z"/>
            </svg>
          }>
            {isAllDay ? (
              <p className="text-sm text-[#1C1B1F]">
                {formatDate(startDate)}
                {multiDay && <> — {formatDate(endDate)}</>}
                <span className="ml-2 text-xs text-[#79747E]">All day</span>
              </p>
            ) : (
              <>
                <p className="text-sm font-medium text-[#1C1B1F]">{formatDate(startDate)}</p>
                <p className="text-sm text-[#49454F]">
                  {startTime} – {endTime}
                  {duration && <span className="text-xs text-[#79747E] ml-2">({duration})</span>}
                </p>
              </>
            )}
          </Section>

          {/* Location */}
          {event.location && (
            <Section icon={
              <svg xmlns="http://www.w3.org/2000/svg" height="18" viewBox="0 -960 960 960" width="18" fill="currentColor">
                <path d="M480-480q33 0 56.5-23.5T560-560q0-33-23.5-56.5T480-640q-33 0-56.5 23.5T400-560q0 33 23.5 56.5T480-480Zm0 294q122-112 181-203.5T720-560q0-117-74.5-188.5T480-820q-91 0-165.5 71.5T240-560q0 75 59 166.5T480-186Zm0 106Q319-217 239.5-334.5T160-560q0-150 96.5-245T480-900q127 0 223.5 95T800-560q0 112-79.5 229.5T480-80Zm0-480Z"/>
              </svg>
            }>
              <p className="text-sm text-[#1C1B1F]">{event.location}</p>
            </Section>
          )}

          {/* Meet link */}
          {meetLink && (
            <Section icon={
              <svg xmlns="http://www.w3.org/2000/svg" height="18" viewBox="0 -960 960 960" width="18" fill="currentColor">
                <path d="M160-160q-33 0-56.5-23.5T80-240v-480q0-33 23.5-56.5T160-800h480q33 0 56.5 23.5T720-720v180l160-160v440L720-420v180q0 33-23.5 56.5T640-160H160Z"/>
              </svg>
            }>
              <a
                href={meetLink}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-[#6750A4] font-medium underline-offset-2 hover:underline"
              >
                Join video call
              </a>
            </Section>
          )}

          {/* Your RSVP */}
          {selfAttendee && (
            <Section icon={
              <svg xmlns="http://www.w3.org/2000/svg" height="18" viewBox="0 -960 960 960" width="18" fill="currentColor">
                <path d="M480-480q-66 0-113-47t-47-113q0-66 47-113t113-47q66 0 113 47t47 113q0 66-47 113t-113 47ZM160-160v-112q0-34 17.5-62.5T224-378q62-31 128.5-46.5T480-440q66 0 132.5 15.5T741-378q29 15 46.5 43.5T805-272v112H160Z"/>
              </svg>
            }>
              <div className="flex items-center gap-2">
                <span className="text-sm text-[#1C1B1F]">Your status</span>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${statusColor[selfAttendee.responseStatus] ?? statusColor.needsAction}`}>
                  {selfAttendee.responseStatus === 'needsAction' ? 'Not responded' : selfAttendee.responseStatus}
                </span>
              </div>
            </Section>
          )}

          {/* Organiser */}
          {organiser && !organiser.self && (
            <Section icon={
              <svg xmlns="http://www.w3.org/2000/svg" height="18" viewBox="0 -960 960 960" width="18" fill="currentColor">
                <path d="M480-480q-66 0-113-47t-47-113q0-66 47-113t113-47q66 0 113 47t47 113q0 66-47 113t-113 47ZM160-160v-112q0-34 17.5-62.5T224-378q62-31 128.5-46.5T480-440q66 0 132.5 15.5T741-378q29 15 46.5 43.5T805-272v112H160Z"/>
              </svg>
            }>
              <p className="text-xs text-[#79747E] mb-0.5">Organised by</p>
              <p className="text-sm text-[#1C1B1F]">{organiser.displayName ?? organiser.email}</p>
            </Section>
          )}

          {/* Attendees */}
          {attendees.filter((a) => !a.self).length > 0 && (
            <Section icon={
              <svg xmlns="http://www.w3.org/2000/svg" height="18" viewBox="0 -960 960 960" width="18" fill="currentColor">
                <path d="M0-240v-63q0-43 44-70t116-27q13 0 25 .5t23 2.5q-14 21-21 44t-7 48v65H0Zm240 0v-65q0-32 17.5-58.5T307-410q32-20 76.5-30t96.5-10q53 0 97.5 10t76.5 30q32 20 49 46.5t17 58.5v65H240Zm540 0v-65q0-26-6.5-49T754-397q11-2 22.5-2.5t23.5-.5q72 0 116 26.5t44 70.5v63H780Z"/>
              </svg>
            }>
              <p className="text-xs text-[#79747E] mb-1">
                {attendees.length} attendee{attendees.length !== 1 ? 's' : ''}
              </p>
              <div className="space-y-1">
                {attendees.slice(0, 8).map((a, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full bg-[#EADDFF] flex items-center justify-center flex-shrink-0">
                      <span className="text-[10px] font-bold text-[#6750A4]">
                        {(a.displayName ?? a.email ?? '?')[0].toUpperCase()}
                      </span>
                    </div>
                    <p className="text-sm text-[#1C1B1F] truncate flex-1">
                      {a.displayName ?? a.email}
                      {a.self && <span className="text-xs text-[#79747E] ml-1">(you)</span>}
                    </p>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full capitalize flex-shrink-0 ${statusColor[a.responseStatus] ?? statusColor.needsAction}`}>
                      {a.responseStatus === 'needsAction' ? '?' : a.responseStatus === 'accepted' ? '✓' : a.responseStatus === 'declined' ? '✗' : '~'}
                    </span>
                  </div>
                ))}
                {attendees.length > 8 && (
                  <p className="text-xs text-[#79747E]">+{attendees.length - 8} more</p>
                )}
              </div>
            </Section>
          )}

          {/* Description */}
          {description && (
            <Section icon={
              <svg xmlns="http://www.w3.org/2000/svg" height="18" viewBox="0 -960 960 960" width="18" fill="currentColor">
                <path d="M320-240h320v-80H320v80Zm0-160h320v-80H320v80ZM240-80q-33 0-56.5-23.5T160-160v-640q0-33 23.5-56.5T240-880h320l240 240v480q0 33-23.5 56.5T720-80H240Z"/>
              </svg>
            }>
              <p className="text-sm text-[#1C1B1F] whitespace-pre-wrap leading-relaxed">{description}</p>
            </Section>
          )}
        </div>
      </div>
    </div>
  )
}
