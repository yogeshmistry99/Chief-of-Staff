import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

// A RENDER test, and that is the point of it.
//
// Everything this project has broken in a browser recently — a hook dependency
// array referencing a const declared below it, a control that returned null and
// vanished — passed `vite build` and pure-function tests without complaint. The
// only thing that catches them is rendering the component.
//
// Two properties matter most here and neither is visible from the pure layer:
//   1. the tab must NOT call Google unless it is actually being looked at
//      (App.jsx mounts every tab at once, so mounting ≠ visiting);
//   2. an absent metric must render its reason, never a 0 or a bare dash.

const mockFetchHealth = vi.fn()

vi.mock('../lib/healthClient', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchHealth: (...a) => mockFetchHealth(...a),
}))

vi.mock('../lib/haptic', () => ({ haptic: { light: vi.fn() } }))

// A ring tap now leaves the page, so the navigation itself is the assertion.
const mockNavigate = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal()),
  useNavigate: () => mockNavigate,
}))

const good = () => ({
  ok: true,
  date: '2026-08-16',
  fetchedAt: '2026-08-16T07:10:00.000Z',
  metrics: {
    sleep: {
      value: 402, absent: null,
      minutesAsleep: 402, minutesAwake: 38, minutesInSleepPeriod: 462, minutesToFallAsleep: 12,
      efficiency: 402 / 462, type: 'STAGES',
      stages: { DEEP: 61, REM: 94, LIGHT: 247, AWAKE: 38 }, stagesAbsent: null,
      range: { min: 300, max: 500, n: 20 }, position: 0.51,
    },
    hrv:    { value: 42, absent: null, range: { min: 30, max: 60, n: 20 }, position: 0.4 },
    cardio: { value: 23, absent: null, range: { min: 0, max: 60, n: 20 }, position: 0.38 },
    rhr:       { value: 54, absent: null },
    spo2:      { value: 96.4, absent: null },
    breathing: { value: 14.2, absent: null },
    skinTemp:  { value: 0.3, absent: null },
    steps:     { value: 8421, absent: null },
  },
  missing: [],
})

const renderHealth = (path = '/health') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/health" element={<Health />} />
        <Route path="/" element={<Health />} />
      </Routes>
    </MemoryRouter>,
  )

const { default: Health } = await import('./Health')

beforeEach(() => {
  mockFetchHealth.mockReset()
  mockFetchHealth.mockResolvedValue(good())
})

describe('it does not call Google unless the tab is being looked at', () => {
  it('fetches when the route is /health', async () => {
    renderHealth('/health')
    await waitFor(() => expect(mockFetchHealth).toHaveBeenCalledTimes(1))
  })

  it('does NOT fetch when mounted on another route', async () => {
    // App.jsx renders all six tabs simultaneously. Fetching on mount would hit
    // Google on every app load for a screen the user may never open.
    renderHealth('/')
    await new Promise((r) => setTimeout(r, 30))
    expect(mockFetchHealth).not.toHaveBeenCalled()
  })

  it('does NOT fetch when embedded in a bucket tab that is not selected', async () => {
    // It now lives inside the Health bucket, where BucketDetail keeps every tab
    // mounted and hides the inactive ones. Being mounted there says nothing
    // about being on screen — without the explicit `active` prop it would call
    // Google every time the Health bucket was opened for any reason at all.
    render(
      <MemoryRouter initialEntries={['/buckets/Health']}>
        <Health active={false} embedded />
      </MemoryRouter>,
    )
    await new Promise((r) => setTimeout(r, 30))
    expect(mockFetchHealth).not.toHaveBeenCalled()
  })

  it('fetches when its bucket tab becomes the active one', async () => {
    render(
      <MemoryRouter initialEntries={['/buckets/Health']}>
        <Health active embedded />
      </MemoryRouter>,
    )
    await waitFor(() => expect(mockFetchHealth).toHaveBeenCalledTimes(1))
  })

  it('drops its own title when embedded, so the bucket header is not repeated', async () => {
    render(
      <MemoryRouter initialEntries={['/buckets/Health']}>
        <Health active embedded />
      </MemoryRouter>,
    )
    await waitFor(() => expect(mockFetchHealth).toHaveBeenCalled())
    expect(screen.queryByRole('heading', { name: 'Health' })).not.toBeInTheDocument()
  })

  it('fetches once, not on every re-render', async () => {
    const { rerender } = renderHealth('/health')
    await waitFor(() => expect(mockFetchHealth).toHaveBeenCalledTimes(1))
    rerender(
      <MemoryRouter initialEntries={['/health']}>
        <Routes><Route path="/health" element={<Health />} /></Routes>
      </MemoryRouter>,
    )
    await new Promise((r) => setTimeout(r, 30))
    expect(mockFetchHealth).toHaveBeenCalledTimes(1)
  })
})

describe('the front screen', () => {
  it('renders without throwing and shows the three rings', async () => {
    renderHealth()
    expect(await screen.findByText('Sleep')).toBeInTheDocument()
    expect(screen.getByText('HRV')).toBeInTheDocument()
    expect(screen.getByText('Cardio')).toBeInTheDocument()
  })

  it('shows the measured values, sleep as hours and minutes', async () => {
    renderHealth()
    expect(await screen.findByText('6h 42m')).toBeInTheDocument()
    expect(screen.getByText('42')).toBeInTheDocument()
    expect(screen.getByText('23')).toBeInTheDocument()
  })

  it('says what the ring means rather than implying a score', async () => {
    renderHealth()
    expect(await screen.findByText(/ring shows where it sits in your own last 30 days/i)).toBeInTheDocument()
  })

  it('keeps the detail off the front screen and opens its own screen on a ring tap', async () => {
    renderHealth()
    await screen.findByText('Sleep')
    // Resting heart rate is deliberately NOT on the front screen — and no longer
    // expands in place either: the ring now has a screen of its own.
    expect(screen.queryByText('Resting heart rate')).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('HRV'))
    expect(screen.queryByText('Resting heart rate')).not.toBeInTheDocument()
    expect(mockNavigate).toHaveBeenCalledWith(
      '/health/ring/hrv',
      expect.objectContaining({ state: expect.objectContaining({ health: expect.anything() }) }),
    )
  })

  it('shows the Update button and the time it last read', async () => {
    renderHealth()
    const update = await screen.findByRole('button', { name: /update/i })
    fireEvent.click(update)
    await waitFor(() => expect(mockFetchHealth).toHaveBeenCalledTimes(2))
  })
})

describe('absence is rendered as a reason, never as a number', () => {
  it('shows an em dash and the cause when a metric was not recorded', async () => {
    mockFetchHealth.mockResolvedValue({
      ...good(),
      metrics: { ...good().metrics, hrv: { value: null, absent: 'no_data', detail: null, position: null } },
    })
    renderHealth()
    expect(await screen.findByText(/band not worn, or not synced/i)).toBeInTheDocument()
    // and emphatically not a zero
    expect(screen.queryByText('0')).not.toBeInTheDocument()
  })

  it('states that a classic night has no stage detail instead of drawing empty stages', async () => {
    // Four zero-width segments would read as "no deep sleep, no REM" — a false
    // claim about a real night.
    const g = good()
    mockFetchHealth.mockResolvedValue({
      ...g,
      metrics: { ...g.metrics, sleep: { ...g.metrics.sleep, type: 'CLASSIC', stages: null, stagesAbsent: 'no_stages' } },
    })
    renderHealth()
    expect(await screen.findByText(/recorded without stage detail/i)).toBeInTheDocument()
    expect(screen.queryByText('Deep')).not.toBeInTheDocument()
  })

  it('sends the user to the SEPARATE health consent, not the main one', async () => {
    // Google Health refuses a token carrying Calendar/Drive/Sheets scopes, so
    // the ordinary "Reconnect Google" link grants everything EXCEPT what this
    // tab needs. Pointing at it would loop the user through a consent screen
    // that cannot fix the problem — which is what happened live on 2026-08-16.
    mockFetchHealth.mockResolvedValue({
      ok: false, needsHealthAuth: true,
      error: 'Google Health is not connected yet.',
    })
    renderHealth()
    const link = await screen.findByText('Connect Google Health')
    expect(link).toHaveAttribute('href', expect.stringContaining('action=health-auth'))
  })

  it('surfaces Google\'s own message when a metric errors', async () => {
    // A generic "Could not be read." hid "Request contains disallowed OAuth
    // scope(s)" behind three identical rings and turned a one-line diagnosis
    // into a log hunt. The detail is the whole point of an error.
    const g = good()
    mockFetchHealth.mockResolvedValue({
      ...g,
      metrics: { ...g.metrics, hrv: { value: null, absent: 'error', detail: 'Request contains disallowed OAuth scope(s).' } },
    })
    renderHealth()
    expect(await screen.findByText(/disallowed OAuth scope/i)).toBeInTheDocument()
  })

  it('does NOT offer reconnect when the API is disabled — it would not help', async () => {
    // The two 403 causes need opposite remedies; this is the trap the trackers
    // hit twice.
    mockFetchHealth.mockResolvedValue({
      ok: false, serviceDisabled: true, needsReconsent: false,
      activationUrl: 'https://console.cloud.google.com/apis/api/health.googleapis.com/overview?project=1',
      error: 'not enabled',
    })
    renderHealth()
    expect(await screen.findByText(/Enable the Health API/i)).toBeInTheDocument()
    expect(screen.queryByText('Reconnect Google')).not.toBeInTheDocument()
  })
})
