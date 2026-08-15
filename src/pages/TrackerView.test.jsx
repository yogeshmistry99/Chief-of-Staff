import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import houseTab from './__fixtures__/houseTab.json'

// A RENDER test, and that is the point of it.
//
// The trackers have now shipped three faults that `vite build` and pure-function
// tests both passed clean: a malformed Sheets fields mask, four wrong configs,
// and a hook dependency array referencing a `const` declared further down the
// component — which threw "Cannot access 'rows' before initialization" and took
// the entire app to the error boundary on load. None of those are visible
// without actually rendering the thing.
//
// The fixture is a real slice of the live Property Register (real headers, real
// rows, real hyperlinks), so the parsing contract is exercised rather than a
// tidied-up imitation of it.

const mockFetchTracker = vi.fn()

vi.mock('../lib/sheets', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchTracker: (...a) => mockFetchTracker(...a),
}))

vi.mock('../lib/haptic', () => ({ haptic: { light: vi.fn() } }))

const renderTracker = (key = 'house') =>
  render(
    <MemoryRouter initialEntries={[`/trackers/${key}`]}>
      <Routes>
        <Route path="/trackers/:key" element={<TrackerView />} />
      </Routes>
    </MemoryRouter>,
  )

// Imported after the mocks are registered.
const { default: TrackerView } = await import('./TrackerView')

describe('TrackerView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetchTracker.mockResolvedValue({
      ok: true,
      title: 'Property Register',
      fetchedAt: new Date().toISOString(),
      tabs: [houseTab],
    })
  })

  it('renders without throwing and shows the data', async () => {
    renderTracker()
    expect(await screen.findByText('House search')).toBeInTheDocument()
    // The summary strip is computed from the loaded rows.
    await waitFor(() => expect(screen.getByText('Median price')).toBeInTheDocument())
  })

  it('collapses the table by default and opens it on demand', async () => {
    renderTracker()
    const toggle = await screen.findByRole('button', { name: /All records/i })
    expect(screen.queryByRole('table')).not.toBeInTheDocument()

    fireEvent.click(toggle)
    expect(await screen.findByRole('table')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /All records/i }))
    await waitFor(() => expect(screen.queryByRole('table')).not.toBeInTheDocument())
  })

  it('filters the row set, and the count reflects it', async () => {
    renderTracker()
    const panel = await screen.findByRole('button', { name: /^Filters/ })
    expect(within(panel).getByText(`${houseTab.rows.length} records`)).toBeInTheDocument()

    fireEvent.click(panel)
    // Chips are labelled "<value> <count>"; Langley exists in the fixture.
    fireEvent.click(await screen.findByRole('button', { name: /^Langley/ }))

    await waitFor(() => {
      const header = screen.getByRole('button', { name: /^Filters/ })
      expect(within(header).getByText(/of \d+/)).toBeInTheDocument()
    })
  })

  it('filtering drives the table, not just the count', async () => {
    renderTracker()
    fireEvent.click(await screen.findByRole('button', { name: /All records/i }))
    const before = screen.getAllByRole('row').length

    fireEvent.click(screen.getByRole('button', { name: /^Filters/ }))
    fireEvent.click(await screen.findByRole('button', { name: /^Langley/ }))

    await waitFor(() => expect(screen.getAllByRole('row').length).toBeLessThan(before))
  })

  it('clears filters back to the full set', async () => {
    renderTracker()
    fireEvent.click(await screen.findByRole('button', { name: /^Filters/ }))
    fireEvent.click(await screen.findByRole('button', { name: /^Langley/ }))
    fireEvent.click(await screen.findByText(/Clear all filters/i))

    await waitFor(() => {
      const header = screen.getByRole('button', { name: /^Filters/ })
      expect(within(header).getByText(`${houseTab.rows.length} records`)).toBeInTheDocument()
    })
  })

  it('surfaces a disabled Sheets API with an Enable link and NO reconnect prompt', async () => {
    mockFetchTracker.mockResolvedValue({
      ok: false,
      serviceDisabled: true,
      needsReconsent: false,
      activationUrl: 'https://console.developers.google.com/apis/api/sheets.googleapis.com/overview?project=1',
      error: 'Google Sheets API is not enabled…',
    })
    renderTracker()
    expect(await screen.findByRole('link', { name: /Enable the Sheets API/i })).toBeInTheDocument()
    expect(screen.queryByText(/Reconnect Google/i)).not.toBeInTheDocument()
  })

  it('offers a reconnect for a genuine scope problem', async () => {
    mockFetchTracker.mockResolvedValue({
      ok: false,
      serviceDisabled: false,
      needsReconsent: true,
      error: 'Google refused the request',
    })
    renderTracker()
    expect(await screen.findByText(/Reconnect Google/i)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Enable the Sheets API/i })).not.toBeInTheDocument()
  })

  it('renders an unknown tracker key without crashing', async () => {
    renderTracker('does-not-exist')
    expect(await screen.findByText(/Unknown tracker/i)).toBeInTheDocument()
  })
})
