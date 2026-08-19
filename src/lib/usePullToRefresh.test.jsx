import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act, waitFor } from '@testing-library/react'
import { useRef } from 'react'
import { usePullToRefresh } from './usePullToRefresh'

// The gesture replaces automatic refreshing, so the thing that must be right is
// WHEN it fires: only from the top of the scroller, only past the threshold, and
// never twice at once.

const onRefresh = vi.fn()

function Harness({ scrollTop = 0 }) {
  const ref = useRef(null)
  const { pull, refreshing, ready } = usePullToRefresh(ref, onRefresh, { threshold: 70 })
  return (
    <div>
      <span data-testid="state">{refreshing ? 'refreshing' : ready ? 'ready' : `pull:${Math.round(pull)}`}</span>
      <div
        ref={(el) => { if (el) { Object.defineProperty(el, 'scrollTop', { value: scrollTop, writable: true, configurable: true }); ref.current = el } }}
        data-testid="scroller"
      >
        content
      </div>
    </div>
  )
}

const touch = (el, type, y) => act(() => {
  const e = new Event(type, { bubbles: true, cancelable: true })
  const list = [{ clientY: y }]
  e.touches = type === 'touchend' ? [] : list
  e.changedTouches = list
  el.dispatchEvent(e)
})

const drag = (el, to) => { touch(el, 'touchstart', 0); touch(el, 'touchmove', to); touch(el, 'touchend', to) }

beforeEach(() => { onRefresh.mockReset(); onRefresh.mockResolvedValue(undefined) })

describe('usePullToRefresh', () => {
  it('refreshes when pulled past the threshold from the top', async () => {
    render(<Harness />)
    drag(screen.getByTestId('scroller'), 200)   // 200 * 0.5 resistance = 100 > 70
    await waitFor(() => expect(onRefresh).toHaveBeenCalledTimes(1))
  })

  it('does NOT refresh on a short pull', async () => {
    render(<Harness />)
    drag(screen.getByTestId('scroller'), 60)    // 30 after resistance
    expect(onRefresh).not.toHaveBeenCalled()
  })

  it('does NOT arm when the scroller is not at the top — that is an ordinary scroll', async () => {
    render(<Harness scrollTop={220} />)
    drag(screen.getByTestId('scroller'), 400)
    expect(onRefresh).not.toHaveBeenCalled()
  })

  it('ignores an upward drag', async () => {
    render(<Harness />)
    drag(screen.getByTestId('scroller'), -200)
    expect(onRefresh).not.toHaveBeenCalled()
  })

  it('reports readiness before release, so the label can say so', () => {
    render(<Harness />)
    const el = screen.getByTestId('scroller')
    touch(el, 'touchstart', 0)
    touch(el, 'touchmove', 60)
    expect(screen.getByTestId('state').textContent).toBe('pull:30')
    touch(el, 'touchmove', 200)
    expect(screen.getByTestId('state').textContent).toBe('ready')
  })

  it('takes over the gesture so the page does not scroll underneath it', () => {
    render(<Harness />)
    const el = screen.getByTestId('scroller')
    touch(el, 'touchstart', 0)
    const e = new Event('touchmove', { bubbles: true, cancelable: true })
    e.touches = [{ clientY: 120 }]
    act(() => { el.dispatchEvent(e) })
    expect(e.defaultPrevented).toBe(true)
  })

  it('does not fire a second refresh while one is in flight', async () => {
    let release
    onRefresh.mockImplementation(() => new Promise((r) => { release = r }))
    render(<Harness />)
    const el = screen.getByTestId('scroller')
    drag(el, 200)
    await waitFor(() => expect(onRefresh).toHaveBeenCalledTimes(1))
    drag(el, 200)
    expect(onRefresh).toHaveBeenCalledTimes(1)
    await act(async () => { release() })
  })
})
