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

  // Positions of every plotted point, keyed by its label, so a point can be
  // followed across a filter change.
  const plotted = (container) =>
    Object.fromEntries(
      [...container.querySelectorAll('circle')].map((c) => [
        c.querySelector('title')?.textContent ?? '',
        `${c.getAttribute('cx')},${c.getAttribute('cy')}`,
      ]),
    )

  it('does NOT rescale the axes when filtering — surviving points stay put', async () => {
    const { container } = renderTracker()
    await screen.findByText('House search')
    await waitFor(() => expect(container.querySelectorAll('circle').length).toBeGreaterThan(0))
    const before = plotted(container)

    fireEvent.click(screen.getByRole('button', { name: /^Filters/ }))
    fireEvent.click(await screen.findByRole('button', { name: /^Langley/ }))

    await waitFor(() =>
      expect(container.querySelectorAll('circle').length).toBeLessThan(Object.keys(before).length),
    )

    const after = plotted(container)
    expect(Object.keys(after).length).toBeGreaterThan(0)
    for (const [label, pos] of Object.entries(after)) {
      // Same coordinates as before the filter: the frame is fixed to the whole
      // dataset, so filtering removes points without moving the survivors.
      expect(pos).toBe(before[label])
    }
  })

  it('empties the chart via a price bound without losing the axes', async () => {
    const { container } = renderTracker()
    fireEvent.click(await screen.findByRole('button', { name: /^Filters/ }))

    // Take the highest offered bound from the DOM rather than inventing a
    // number — a value that is not one of the generated options would leave the
    // select unchanged and the test would pass without filtering anything.
    const [minPrice] = screen.getAllByRole('combobox')
    const highest = [...minPrice.options].map((o) => o.value).filter(Boolean).pop()
    fireEvent.change(minPrice, { target: { value: highest } })

    await waitFor(() =>
      expect(container.querySelectorAll('circle').length).toBeLessThan(
        Object.keys(plotted(container)).length + 1,
      ),
    )
    // Whatever survives, the frame is still drawn — the chart never collapses
    // to a bare message mid-adjustment.
    const svg = container.querySelector('svg')
    expect(svg).toBeInTheDocument()
    // Axis label still drawn inside the chart (the same string also appears as
    // a filter label, hence scoping to the svg).
    expect(within(svg).getByText('Asking price')).toBeInTheDocument()
  })

  it('renders the chart above the filters, the summary and the table', async () => {
    const { container } = renderTracker()
    await screen.findByText('House search')
    await waitFor(() => expect(container.querySelector('svg')).toBeInTheDocument())

    const svg = container.querySelector('svg')
    const after = (el) => svg.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING
    // Everything that can change size must come after the chart, or applying a
    // filter would move it.
    expect(after(screen.getByRole('button', { name: /^Filters/ }))).toBeTruthy()
    expect(after(screen.getByText('Median price'))).toBeTruthy()
    expect(after(screen.getByRole('button', { name: /All records/i }))).toBeTruthy()
  })

  it('pins the chart so it cannot move when filters open', async () => {
    const { container } = renderTracker()
    await screen.findByText('House search')
    await waitFor(() => expect(container.querySelector('svg')).toBeInTheDocument())

    const pinned = container.querySelector('svg').closest('.sticky')
    expect(pinned).toBeTruthy()
    expect(pinned.className).toMatch(/top-0/)
    // Nothing renders before it inside the scrolling area.
    expect(pinned.previousElementSibling).toBeNull()
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
