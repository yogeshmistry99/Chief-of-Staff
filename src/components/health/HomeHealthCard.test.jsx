import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import HomeHealthCard from './HomeHealthCard'

// RENDER tests, and the property they protect is not cosmetic: THIS CARD MUST
// NEVER CALL THE HEALTH API. The front page is opened dozens of times a day, so a
// fetch here would hit Google on every glance at the phone. The fetch function is
// mocked and asserted un-called.
//
// The second property is honesty: a reading from an earlier day must name its day
// rather than showing a bare time that reads as this morning.

const mockRead = vi.fn()
const mockFetchHealth = vi.fn()
const mockNavigate = vi.fn()

vi.mock('../../lib/healthClient', async (importOriginal) => ({
  ...(await importOriginal()),
  readCachedRings: () => mockRead(),
  fetchHealth: (...a) => mockFetchHealth(...a),
}))

vi.mock('../../lib/haptic', () => ({ haptic: new Proxy({}, { get: () => () => {} }) }))

vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal()),
  useNavigate: () => mockNavigate,
}))

const rings = {
  sleep:  { value: 332, absent: null, position: 0.6, hasRange: true },
  hrv:    { value: 33.35, absent: null, position: 0.43, hasRange: true },
  cardio: { value: null, absent: 'no_activity', detail: 'No active zone minutes yet today.', position: null, hasRange: false },
}

const draw = () => render(<MemoryRouter><HomeHealthCard /></MemoryRouter>)

beforeEach(() => {
  vi.clearAllMocks()
  vi.setSystemTime(new Date('2026-08-19T08:00:00Z'))
  mockRead.mockResolvedValue({ date: '2026-08-19', fetchedAt: '2026-08-19T06:50:00Z', rings })
})

describe('HomeHealthCard', () => {
  it('never calls the Health API', async () => {
    draw()
    await waitFor(() => expect(screen.getByText('Health')).toBeInTheDocument())
    expect(mockFetchHealth).not.toHaveBeenCalled()
  })

  it('renders the cached ring values', async () => {
    draw()
    await waitFor(() => expect(screen.getByText('5h 32m')).toBeInTheDocument())
    expect(screen.getByText('33')).toBeInTheDocument()
  })

  it('stamps a same-day reading with the time it was taken', async () => {
    draw()
    await waitFor(() => expect(screen.getByText(/^as of \d{2}:\d{2}$/)).toBeInTheDocument())
  })

  it('names the DAY when the reading is not today\'s, rather than implying it is current', async () => {
    mockRead.mockResolvedValue({ date: '2026-08-18', fetchedAt: '2026-08-18T21:10:00Z', rings })
    draw()
    await waitFor(() => expect(screen.getByText(/as of Tuesday \d{2}:\d{2}/)).toBeInTheDocument())
  })

  it('says there is no reading rather than drawing empty rings', async () => {
    mockRead.mockResolvedValue(null)
    draw()
    await waitFor(() => expect(screen.getByText(/no reading yet/i)).toBeInTheDocument())
    expect(screen.queryByText('Sleep')).toBeNull()
  })

  it('carries an absent ring through as absent, with its own reason', async () => {
    draw()
    await waitFor(() => expect(screen.getByText('Cardio')).toBeInTheDocument())
    expect(screen.getByText(/no active zone minutes yet today/i)).toBeInTheDocument()
  })

  it('taps through to the Health bucket\'s Today tab', async () => {
    draw()
    await waitFor(() => expect(screen.getByText('Health')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Health'))
    expect(mockNavigate).toHaveBeenCalledWith('/buckets/Health', { state: { from: '/', tab: 'health' } })
  })
})
