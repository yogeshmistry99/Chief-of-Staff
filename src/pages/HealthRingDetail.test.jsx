import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import HealthRingDetail from './HealthRingDetail'

// RENDER tests. The property that matters most: opening a ring from Today must
// NOT call Google again — the reading is handed over in router state. Opened
// cold there is nothing to inherit, so a single fetch is correct there.

const mockFetchHealth = vi.fn()
vi.mock('../lib/healthClient', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchHealth: (...a) => mockFetchHealth(...a),
}))
vi.mock('../lib/haptic', () => ({ haptic: new Proxy({}, { get: () => () => {} }) }))

const health = {
  ok: true,
  date: '2026-08-19',
  metrics: {
    sleep: {
      value: 332, absent: null, minutesAsleep: 332, minutesAwake: 41,
      minutesInSleepPeriod: 373, minutesToFallAsleep: 0, efficiency: 332 / 373,
      type: 'STAGES', stages: { DEEP: 48, REM: 69, LIGHT: 214, AWAKE: 41 },
      range: { min: 15, max: 543, n: 15 }, position: 0.6,
    },
    hrv: {
      value: 33.35, absent: null, position: 0.43, range: { min: 24.25, max: 45.15, n: 24 },
      raw: { nonRemHeartRateBeatsPerMinute: '62', entropy: 2.974, deepSleepRootMeanSquareOfSuccessiveDifferencesMilliseconds: 32.6 },
    },
    rhr: { value: 65, absent: null },
    cardio: { value: 3, absent: null, position: 0, range: { min: 4, max: 34, n: 4 }, zones: { FAT_BURN: 2, CARDIO: 1 } },
  },
}

const draw = (key, state = { health }) => render(
  <MemoryRouter initialEntries={[{ pathname: `/health/ring/${key}`, state }]}>
    <Routes><Route path="/health/ring/:key" element={<HealthRingDetail />} /></Routes>
  </MemoryRouter>,
)

beforeEach(() => { vi.clearAllMocks(); mockFetchHealth.mockResolvedValue(health) })

describe('HealthRingDetail', () => {
  it('does NOT fetch when the reading arrives in router state', async () => {
    draw('sleep')
    // The figure appears twice on purpose — in the ring and in the summary row.
    await waitFor(() => expect(screen.getAllByText('5h 32m').length).toBeGreaterThan(0))
    expect(mockFetchHealth).not.toHaveBeenCalled()
  })

  it('fetches once when opened cold, with no state to inherit', async () => {
    draw('sleep', null)   // null, not undefined: undefined would take the default arg
    await waitFor(() => expect(mockFetchHealth).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.getAllByText('5h 32m').length).toBeGreaterThan(0))
  })

  it('keeps the ring at the top of its own screen', async () => {
    const { container } = draw('sleep')
    await waitFor(() => expect(screen.getAllByText('5h 32m').length).toBeGreaterThan(0))
    expect(container.querySelector('svg circle')).toBeTruthy()
  })

  it('states what the arc is relative to, in numbers', async () => {
    draw('sleep')
    expect(await screen.findByText('Days measured')).toBeInTheDocument()
    expect(screen.getByText('15')).toBeInTheDocument()
  })

  it('breaks sleep down by stage', async () => {
    draw('sleep')
    // "Deep" also labels the stage bar's key, so scope to the breakdown card.
    const card = (await screen.findByText('Time in each stage')).closest('div').parentElement
    expect(within(card).getByText('Deep')).toBeInTheDocument()
    expect(within(card).getByText('48m')).toBeInTheDocument()
    expect(within(card).getByText('REM')).toBeInTheDocument()
  })

  it('shows cardio minutes by zone — real returned data, not a derived peak', async () => {
    draw('cardio')
    // "Cardio" is both the ring's name and a zone name, so scope to the card.
    const card = (await screen.findByText('Minutes by zone')).closest('div').parentElement
    expect(within(card).getByText('Fat burn')).toBeInTheDocument()
    expect(within(card).getByText('2 min')).toBeInTheDocument()
    expect(within(card).getByText('Cardio')).toBeInTheDocument()
  })

  it('brings the ring\'s existing rows with it', async () => {
    draw('hrv')
    expect(await screen.findByText('Resting heart rate')).toBeInTheDocument()
    expect(screen.getByText('65 bpm')).toBeInTheDocument()
  })

  it('surfaces the extra fields the API returns alongside HRV', async () => {
    draw('hrv')
    expect(await screen.findByText('Non-REM heart rate')).toBeInTheDocument()
    expect(screen.getByText('62 bpm')).toBeInTheDocument()
  })

  it('states that a classic night has no stage detail instead of drawing empty stages', async () => {
    // Four zero-width segments would read as "no deep sleep, no REM" — a false
    // claim about a real night. This assertion moved here when the stage bar left
    // the today screen.
    draw('sleep', {
      health: { ...health, metrics: { ...health.metrics, sleep: { ...health.metrics.sleep, type: 'CLASSIC', stages: null, stagesAbsent: 'no_stages' } } },
    })
    expect(await screen.findByText(/recorded without stage detail/i)).toBeInTheDocument()
    expect(screen.queryByText('Deep')).not.toBeInTheDocument()
  })

  it('says plainly when there is no range to place the reading in', async () => {
    draw('cardio', { health: { ...health, metrics: { ...health.metrics, cardio: { value: 3, absent: null, position: null, range: null } } } })
    expect(await screen.findByText(/not enough recent days/i)).toBeInTheDocument()
  })

  it('renders an absent reading as its reason, never as a number', async () => {
    draw('cardio', {
      health: { ...health, metrics: { ...health.metrics, cardio: { value: null, absent: 'no_activity', detail: 'No active zone minutes yet today.', position: null, range: null } } },
    })
    // Shown as the ring's caption and again in the zone card — both are reasons,
    // and neither is a number.
    await waitFor(() => expect(screen.getAllByText(/no active zone minutes yet today/i).length).toBeGreaterThan(0))
    expect(screen.queryByText('0')).toBeNull()
  })
})
