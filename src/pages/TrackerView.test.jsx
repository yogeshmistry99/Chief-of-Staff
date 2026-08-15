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

// Open the panel, then a named category inside it. Categories are collapsed by
// default, so their controls do not exist until expanded.
const openCategory = async (label) => {
  // findBy, not getBy: this is often the first interaction in a test and the
  // tracker's fetch has not resolved yet.
  const panel = await screen.findByRole('button', { name: /^Filters/ })
  const re = new RegExp(`^${label}`)
  // A category header always carries a hint or a selection after its label
  // ("Area  9 options ▼"), so excluding an exact-text match separates it from
  // the colour-picker chip of the same name.
  const headers = () =>
    screen.queryAllByRole('button', { name: re }).filter((b) => b.textContent.trim() !== label)
  if (!headers().length) fireEvent.click(panel)
  await waitFor(() => expect(headers().length).toBeGreaterThan(0))
  fireEvent.click(headers()[0])
}

// Tap the colour toggle that lives on a category's own row.
const colorByCategory = async (label) => {
  const btn = () => screen.queryByRole('button', { name: `Colour the chart by ${label}` })
  if (!btn()) fireEvent.click(await screen.findByRole('button', { name: /^Filters/ }))
  await waitFor(() => expect(btn()).toBeTruthy())
  fireEvent.click(btn())
}

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
    await openCategory('Area')
    fireEvent.click(await screen.findByRole('button', { name: /^Langley/ }))

    await waitFor(() => {
      const header = screen.getByRole('button', { name: /^Filters/ })
      expect(within(header).getByText(/of \d+/)).toBeInTheDocument()
    })
  })

  it('collapses every filter category by default, and opens one on tap', async () => {
    renderTracker()
    fireEvent.click(await screen.findByRole('button', { name: /^Filters/ }))

    // The categories are listed…
    expect(screen.getByRole('button', { name: /^Area/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Property type/ })).toBeInTheDocument()
    // …but none of their controls exist yet. Seven categories open at once ran
    // well past a screen, which is the reason for this.
    expect(screen.queryByRole('button', { name: /^Langley/ })).not.toBeInTheDocument()
    expect(screen.queryAllByRole('combobox')).toHaveLength(0)

    fireEvent.click(screen.getByRole('button', { name: /^Area/ }))
    expect(await screen.findByRole('button', { name: /^Langley/ })).toBeInTheDocument()
  })

  it('opens categories independently rather than as an accordion', async () => {
    renderTracker()
    await openCategory('Area')
    fireEvent.click(screen.getByRole('button', { name: /^Asking price/ }))

    // Comparing an area against a price band means having both open.
    expect(await screen.findByRole('button', { name: /^Langley/ })).toBeInTheDocument()
    expect(screen.getAllByRole('combobox').length).toBeGreaterThan(0)
  })

  it('a collapsed category still states that it is filtering', async () => {
    renderTracker()
    await openCategory('Area')
    fireEvent.click(await screen.findByRole('button', { name: /^Langley/ }))

    fireEvent.click(screen.getByRole('button', { name: /^Area/ }))
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /^Langley/ })).not.toBeInTheDocument(),
    )

    // Hiding a control must never hide that it is active.
    expect(screen.getByRole('button', { name: /^Area/ }).textContent).toMatch(/Langley/)
    // And the panel's own count still reflects it.
    const header = screen.getByRole('button', { name: /^Filters/ })
    expect(within(header).getByText(/of \d+/)).toBeInTheDocument()
  })

  it('shows a range selection on the collapsed category header', async () => {
    renderTracker()
    await openCategory('Asking price')
    const [minPrice] = screen.getAllByRole('combobox')
    const lowest = [...minPrice.options].map((o) => o.value).filter(Boolean)[0]
    fireEvent.change(minPrice, { target: { value: lowest } })

    fireEvent.click(screen.getByRole('button', { name: /^Asking price/ }))
    await waitFor(() => expect(screen.queryAllByRole('combobox')).toHaveLength(0))
    expect(screen.getByRole('button', { name: /^Asking price/ }).textContent).toMatch(/£.*\+/)
  })

  // Open the record table and read one column out of the rendered rows.
  const openTable = async () =>
    fireEvent.click(await screen.findByRole('button', { name: /All records/i }))
  const columnText = (container, index) =>
    [...container.querySelectorAll('tbody tr')].map(
      (tr) => tr.children[index]?.textContent?.trim() ?? '',
    )

  it('sorts the record list by a tapped heading, and reverses on a second tap', async () => {
    const { container } = renderTracker()
    await openTable()

    const money = (s) => Number(s.replace(/[^0-9.]/g, ''))
    const priceCol = 2 // ID, Address, Asking price

    fireEvent.click(screen.getByRole('button', { name: /^Asking price/ }))
    await waitFor(() => {
      const v = columnText(container, priceCol).map(money).filter(Boolean)
      expect([...v].sort((a, b) => a - b)).toEqual(v)
    })

    fireEvent.click(screen.getByRole('button', { name: /^Asking price/ }))
    await waitFor(() => {
      const v = columnText(container, priceCol).map(money).filter(Boolean)
      expect([...v].sort((a, b) => b - a)).toEqual(v)
    })
  })

  it('a third tap clears that column and the sort line disappears', async () => {
    renderTracker()
    await openTable()
    const head = () => screen.getByRole('button', { name: /^Asking price/ })

    fireEvent.click(head())
    expect(await screen.findByText(/Sorted by Asking price ↑/)).toBeInTheDocument()
    fireEvent.click(head())
    expect(await screen.findByText(/Sorted by Asking price ↓/)).toBeInTheDocument()
    fireEvent.click(head())
    await waitFor(() => expect(screen.queryByText(/^Sorted by/)).not.toBeInTheDocument())
  })

  it('a second heading becomes the tie-breaker, not a replacement', async () => {
    const { container } = renderTracker()
    await openTable()

    fireEvent.click(screen.getByRole('button', { name: /^Listing status/ }))
    fireEvent.click(screen.getByRole('button', { name: /^Asking price/ }))

    // Precedence is stated in tap order.
    expect(
      await screen.findByText(/Sorted by Listing status ↑, then Asking price ↑/),
    ).toBeInTheDocument()

    // And applied that way: statuses stay grouped, prices ascend inside them.
    const statuses = columnText(container, 5) // …, £/sq ft, Listing status
    expect([...statuses].sort((a, b) => a.localeCompare(b))).toEqual(statuses)
  })

  it('Clear sort removes every key at once', async () => {
    renderTracker()
    await openTable()
    fireEvent.click(screen.getByRole('button', { name: /^Listing status/ }))
    fireEvent.click(screen.getByRole('button', { name: /^Asking price/ }))
    await screen.findByText(/^Sorted by/)

    fireEvent.click(screen.getByRole('button', { name: /Clear sort/i }))
    await waitFor(() => expect(screen.queryByText(/^Sorted by/)).not.toBeInTheDocument())
  })

  it('filtering drives the table, not just the count', async () => {
    renderTracker()
    fireEvent.click(await screen.findByRole('button', { name: /All records/i }))
    const before = screen.getAllByRole('row').length

    await openCategory('Area')
    fireEvent.click(await screen.findByRole('button', { name: /^Langley/ }))

    await waitFor(() => expect(screen.getAllByRole('row').length).toBeLessThan(before))
  })

  it('clears filters back to the full set', async () => {
    renderTracker()
    await openCategory('Area')
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

    await openCategory('Area')
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

  const fills = (container) =>
    Object.fromEntries(
      [...container.querySelectorAll('circle')].map((c) => [
        c.querySelector('title')?.textContent ?? '',
        c.getAttribute('fill'),
      ]),
    )

  it('colours the points by a chosen column, with a legend', async () => {
    const { container } = renderTracker()
    await screen.findByText('House search')
    const before = new Set(Object.values(fills(container)))
    expect(before.size).toBe(1) // one default colour until asked

    await colorByCategory('Area')

    await waitFor(() => expect(new Set(Object.values(fills(container))).size).toBeGreaterThan(1))
    // Identity is never colour alone: a legend names every colour on screen.
    const legendNames = [...container.querySelectorAll('span')]
      .map((s) => s.textContent)
      .filter(Boolean)
    expect(legendNames.some((t) => t === 'Langley')).toBe(true)
  })

  it('does not repaint surviving points when a filter is applied', async () => {
    const { container } = renderTracker()
    await screen.findByText('House search')
    await colorByCategory('Area')
    await waitFor(() => expect(new Set(Object.values(fills(container))).size).toBeGreaterThan(1))
    const before = fills(container)

    await openCategory('Area')
    fireEvent.click(await screen.findByRole('button', { name: /^Langley/ }))
    await waitFor(() =>
      expect(container.querySelectorAll('circle').length).toBeLessThan(Object.keys(before).length),
    )

    // Colour follows the entity, not its rank — a filter must never change the
    // colour of a point that survived it.
    for (const [label, fill] of Object.entries(fills(container))) {
      expect(fill).toBe(before[label])
    }
  })

  it('colours by a numeric column as a gradient', async () => {
    const { container } = renderTracker()
    await screen.findByText('House search')
    await colorByCategory('Asking price')

    await waitFor(() => {
      const used = new Set(Object.values(fills(container)))
      expect(used.size).toBeGreaterThan(1)
      // Every fill comes from the one-hue ramp, not the categorical palette.
      for (const f of used) expect(f.toLowerCase()).toMatch(/^#(9ec5f4|6da7ec|3987e5|256abf|184f95|0d366b)$/)
    })
  })

  it('colours only one column at a time', async () => {
    const { container } = renderTracker()
    await screen.findByText('House search')
    await colorByCategory('Area')
    await waitFor(() => expect(new Set(Object.values(fills(container))).size).toBeGreaterThan(1))

    await colorByCategory('Asking price')
    await waitFor(() => {
      for (const f of new Set(Object.values(fills(container)))) {
        expect(f.toLowerCase()).toMatch(/^#(9ec5f4|6da7ec|3987e5|256abf|184f95|0d366b)$/)
      }
    })
  })

  it('turns colour off again', async () => {
    const { container } = renderTracker()
    await screen.findByText('House search')
    await colorByCategory('Area')
    await waitFor(() => expect(new Set(Object.values(fills(container))).size).toBeGreaterThan(1))

    // The same button again turns it off.
    await colorByCategory('Area')
    await waitFor(() => expect(new Set(Object.values(fills(container))).size).toBe(1))
  })

  it('empties the chart via a price bound without losing the axes', async () => {
    const { container } = renderTracker()
    await openCategory('Asking price')

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

  it('pins the summary AND the chart together, above everything that can resize', async () => {
    const { container } = renderTracker()
    await screen.findByText('House search')
    await waitFor(() => expect(container.querySelector('svg')).toBeInTheDocument())

    const pinned = container.querySelector('svg').closest('.sticky')
    expect(pinned).toBeTruthy()
    expect(pinned.className).toMatch(/top-0/)
    // Nothing renders before it inside the scrolling area, so it cannot be
    // pushed down by anything.
    expect(pinned.previousElementSibling).toBeNull()

    // Both live readouts are INSIDE the pinned block.
    expect(pinned.contains(screen.getByText('Median price'))).toBe(true)
    expect(pinned.contains(container.querySelector('svg'))).toBe(true)

    // Everything that changes height sits after it.
    const after = (el) => pinned.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING
    expect(after(screen.getByRole('button', { name: /^Filters/ }))).toBeTruthy()
    expect(after(screen.getByRole('button', { name: /All records/i }))).toBeTruthy()
  })

  // A stat's value is the second <p> of the card carrying its label.
  const statValue = (label) =>
    screen.getByText(label).parentElement.querySelector('p:last-child').textContent

  it('keeps the pinned block a constant height when a filter is applied', async () => {
    const { container } = renderTracker()
    await screen.findByText('House search')
    await waitFor(() => expect(container.querySelector('svg')).toBeInTheDocument())

    const pinned = container.querySelector('svg').closest('.sticky')
    // jsdom has no layout, so height is asserted through the things that
    // determine it: the same number of stat cards, a fixed chart aspect ratio,
    // and every line of text clamped so none can wrap.
    const shape = () => ({
      blocks: pinned.children.length,
      cards: pinned.querySelectorAll('[class*="min-w-"]').length,
      viewBox: pinned.querySelector('svg').getAttribute('viewBox'),
      allClamped: [...pinned.querySelectorAll('p')].every(
        (p) => p.className.includes('truncate') || p.className.includes('h-['),
      ),
    })
    const before = shape()
    expect(before.allClamped).toBe(true)

    await openCategory('Area')
    fireEvent.click(await screen.findByRole('button', { name: /^Langley/ }))
    await waitFor(() => expect(screen.getByText(/Showing \d+ of \d+/)).toBeInTheDocument())

    expect(shape()).toEqual(before)
  })

  it('updates the summary figures as filters change — that is why it is pinned', async () => {
    renderTracker()
    await screen.findByText('Median price')
    expect(statValue('Records')).toBe(String(houseTab.rows.length))

    await openCategory('Area')
    const langley = await screen.findByRole('button', { name: /^Langley/ })
    const langleyCount = Number(langley.textContent.match(/(\d+)\s*$/)[1])
    fireEvent.click(langley)

    // The strip is a live readout of the filtered set.
    await waitFor(() => expect(statValue('Records')).toBe(String(langleyCount)))
    expect(langleyCount).toBeLessThan(houseTab.rows.length)
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
