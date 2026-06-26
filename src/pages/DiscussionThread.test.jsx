import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

// ---- Mocks ----------------------------------------------------------------

vi.mock('../lib/claude', () => ({
  sendMessageStream: vi.fn(),
  SYSTEM_PROMPTS: { discussion: () => '' },
}))

vi.mock('../lib/headConfig', () => ({
  loadHeadConfig: vi.fn(() => ({})),
}))

vi.mock('../lib/taskCache', () => ({
  getCachedTasks: vi.fn(() => []),
  saveToCache: vi.fn(),
}))

const mockGetDiscussions = vi.fn()
const mockSaveDiscussion = vi.fn()
const mockNewDiscussion = vi.fn()

vi.mock('../lib/discussions', () => ({
  getDiscussions: (...args) => mockGetDiscussions(...args),
  saveDiscussion: (...args) => mockSaveDiscussion(...args),
  newDiscussion: (...args) => mockNewDiscussion(...args),
}))

vi.mock('../components/Markdown', () => ({
  default: ({ text }) => <span>{text}</span>,
}))

vi.mock('../components/ChatInput', () => ({
  default: ({ placeholder, disabled, textareaRef }) => (
    <textarea
      ref={textareaRef}
      placeholder={placeholder}
      disabled={disabled}
      data-testid="chat-input"
    />
  ),
}))

// ---- Helpers ---------------------------------------------------------------

function buildDiscussion(overrides = {}) {
  return {
    id: 'disc-1',
    title: 'Test Discussion',
    messages: [],
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

function renderThread(discussionId, discussion) {
  if (discussionId === 'new') {
    mockNewDiscussion.mockReturnValue(buildDiscussion({ id: 'new', title: '' }))
  } else {
    mockGetDiscussions.mockReturnValue(discussion ? [discussion] : [])
  }

  return render(
    <MemoryRouter initialEntries={[`/buckets/finance/discussions/${discussionId}`]}>
      <Routes>
        <Route
          path="/buckets/:bucket/discussions/:id"
          element={<></>}
        />
      </Routes>
    </MemoryRouter>
  )
}

// Simpler helper that actually renders the component
async function renderDiscussionThread(discussionId, discussion) {
  if (discussionId === 'new') {
    mockNewDiscussion.mockReturnValue(buildDiscussion({ id: 'new', title: '' }))
  } else {
    mockGetDiscussions.mockReturnValue(discussion ? [discussion] : [])
  }

  const { default: DiscussionThread } = await import('./DiscussionThread.jsx')

  return render(
    <MemoryRouter initialEntries={[`/buckets/finance/discussions/${discussionId}`]}>
      <Routes>
        <Route path="/buckets/:bucket/discussions/:id" element={<DiscussionThread />} />
      </Routes>
    </MemoryRouter>
  )
}

// ---- Tests -----------------------------------------------------------------

describe('DiscussionThread', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  // Verification point 5: descOpen starts false — dropdown closed on load
  it('VP5: description dropdown is closed on initial render', async () => {
    const disc = buildDiscussion({ messages: [{ role: 'user', content: 'Hello world' }] })
    await renderDiscussionThread('disc-1', disc)

    // The dropdown div has class mt-2 text-sm text-[#49454F] line-clamp-4
    // It should not exist in the DOM when descOpen is false
    const dropdown = document.querySelector('.line-clamp-4')
    expect(dropdown).not.toBeInTheDocument()
  })

  // Verification point 2: tapping title toggles dropdown open/closed
  it('VP2: tapping the title toggles the description dropdown open and closed', async () => {
    const disc = buildDiscussion({ messages: [{ role: 'user', content: 'First message content' }] })
    await renderDiscussionThread('disc-1', disc)

    const titleButton = screen.getByRole('button', { name: /test discussion/i })

    // First tap — dropdown div should appear
    fireEvent.click(titleButton)
    expect(document.querySelector('.line-clamp-4')).toBeInTheDocument()

    // Second tap — dropdown div should disappear
    fireEvent.click(titleButton)
    expect(document.querySelector('.line-clamp-4')).not.toBeInTheDocument()
  })

  // Verification point 3: when open, shows first message text
  it('VP3: dropdown shows the first message text content when open', async () => {
    const disc = buildDiscussion({
      messages: [
        { role: 'user', content: 'Opening message text' },
        { role: 'assistant', content: 'Second message only in thread' },
      ],
    })
    await renderDiscussionThread('disc-1', disc)

    fireEvent.click(screen.getByRole('button', { name: /test discussion/i }))

    const dropdown = document.querySelector('.line-clamp-4')
    expect(dropdown).toBeInTheDocument()
    expect(dropdown).toHaveTextContent('Opening message text')
    // Second message should NOT appear in the dropdown
    expect(dropdown).not.toHaveTextContent('Second message only in thread')
  })

  // Verification point 4: no messages → "No messages yet."
  it('VP4: dropdown shows "No messages yet." when discussion has no messages', async () => {
    const disc = buildDiscussion({ messages: [] })
    await renderDiscussionThread('disc-1', disc)

    fireEvent.click(screen.getByRole('button', { name: /test discussion/i }))

    expect(screen.getByText('No messages yet.')).toBeInTheDocument()
  })

  // Verification point 1: long title uses break-words (no truncate class)
  it('VP1: long title h1 has break-words class and does not have truncate class', async () => {
    const longTitle = 'Audit protection cover — fill critical illness gap for high-income earners'
    const disc = buildDiscussion({ title: longTitle })
    await renderDiscussionThread('disc-1', disc)

    const h1 = screen.getByRole('heading', { name: longTitle })
    expect(h1).toHaveClass('break-words')
    expect(h1).not.toHaveClass('truncate')
  })

  // Verification point 6: new discussion (isNew=true) shows title input, not dropdown toggle
  it('VP6: new discussion shows title input immediately; dropdown not shown while editing', async () => {
    await renderDiscussionThread('new', null)

    // Title input should be present
    const input = screen.getByPlaceholderText('Discussion title…')
    expect(input).toBeInTheDocument()

    // No title button (h1 heading) — still in edit mode
    expect(screen.queryByRole('heading')).not.toBeInTheDocument()

    // Dropdown not shown
    expect(screen.queryByText('No messages yet.')).not.toBeInTheDocument()
  })

  // Verification point 7: back button, bucket subtitle, chat input are present
  it('VP7: back button, bucket subtitle, and chat input are rendered', async () => {
    const disc = buildDiscussion()
    await renderDiscussionThread('disc-1', disc)

    // Back button (SVG button that navigates)
    const buttons = screen.getAllByRole('button')
    // At least back button + title button
    expect(buttons.length).toBeGreaterThanOrEqual(2)

    // Bucket subtitle
    expect(screen.getByText('finance · Discussion')).toBeInTheDocument()

    // Chat input
    expect(screen.getByTestId('chat-input')).toBeInTheDocument()
  })

  // Failure case: discussion with complex content object in first message
  it('extracts text from block-format first message content', async () => {
    const disc = buildDiscussion({
      messages: [
        {
          role: 'user',
          content: [{ type: 'text', text: 'Block content text' }, { type: 'image', source: {} }],
        },
      ],
    })
    await renderDiscussionThread('disc-1', disc)

    fireEvent.click(screen.getByRole('button', { name: /test discussion/i }))

    const dropdown = document.querySelector('.line-clamp-4')
    expect(dropdown).toBeInTheDocument()
    expect(dropdown).toHaveTextContent('Block content text')
  })
})
