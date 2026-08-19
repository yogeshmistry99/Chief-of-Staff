// Sleep stage names and colours.
//
// Its own module, with NO imports, because three things need it — the stage bar,
// the hypnogram, and healthClient — and the hypnogram is pure layout that should
// not drag in a Supabase client to find out what colour REM is.
//
// Colours are taken from the journal chart's palette so the two health surfaces
// agree. AWAKE last in reading order because it is the absence of sleep rather
// than a kind of it.

export const STAGE_ORDER = ['DEEP', 'REM', 'LIGHT', 'ASLEEP', 'RESTLESS', 'AWAKE']

export const STAGE_COLOR = {
  DEEP:     '#4A3AA7',
  REM:      '#0B57D0',
  LIGHT:    '#00639B',
  ASLEEP:   '#006C51',
  RESTLESS: '#8A5000',
  AWAKE:    '#CAC4D0',
}

export const STAGE_LABEL = {
  DEEP: 'Deep', REM: 'REM', LIGHT: 'Light',
  ASLEEP: 'Asleep', RESTLESS: 'Restless', AWAKE: 'Awake',
}
