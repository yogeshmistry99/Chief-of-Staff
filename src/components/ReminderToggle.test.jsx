import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import ReminderToggle from './ReminderToggle'

// A RENDER test, because the failure modes here are invisible from the pure layer:
// the time control renders only when reminders are enabled, and it added two
// hooks to a component that already had two — and a hook placed above the value
// it depends on white-screens the app while building perfectly clean.
//
// The behaviour that matters most is the revert: a time that fails to save must
// snap back and say so. A picker that keeps showing the new time after a failed
// write is exactly the silent failure this app rules out — the user would only
// find out when the nudge came at the old time, or not at all.

const mockStatus = vi.fn()
const mockRead = vi.fn()
const mockSave = vi.fn()

vi.mock('../lib/push', () => ({
  reminderStatus: () => mockStatus(),
  enableReminders: vi.fn(),
  disableReminders: vi.fn(),
  sendTestNotification: vi.fn(),
  pushSupported: () => true,
  isConfigured: () => true,
  shouldAutoEnable: () => false,
}))

vi.mock('../lib/reminderSettings', async (importOriginal) => ({
  ...(await importOriginal()),
  readReminderTime: () => mockRead(),
  saveReminderTime: (t) => mockSave(t),
  listenForReminderTone: () => () => {},
}))

vi.mock('../lib/haptic', () => ({ haptic: new Proxy({}, { get: () => () => {} }) }))

const timeInput = () => screen.getByLabelText('Remind me at')

beforeEach(() => {
  vi.clearAllMocks()
  mockStatus.mockResolvedValue({ enabled: true, permission: 'granted' })
  mockRead.mockResolvedValue('21:00')
  mockSave.mockImplementation(async (t) => t)
})

describe('ReminderToggle — the reminder time control', () => {
  it('renders without throwing and shows the stored time', async () => {
    render(<ReminderToggle />)
    await waitFor(() => expect(timeInput()).toHaveValue('21:00'))
  })

  it('saves a new time', async () => {
    render(<ReminderToggle />)
    await waitFor(() => expect(timeInput()).toHaveValue('21:00'))

    fireEvent.change(timeInput(), { target: { value: '22:30' } })

    await waitFor(() => expect(mockSave).toHaveBeenCalledWith('22:30'))
    expect(timeInput()).toHaveValue('22:30')
  })

  it('reverts and explains when the save fails', async () => {
    mockSave.mockRejectedValue(new Error('Could not save the reminder time: network down'))
    render(<ReminderToggle />)
    await waitFor(() => expect(timeInput()).toHaveValue('21:00'))

    fireEvent.change(timeInput(), { target: { value: '07:15' } })

    await waitFor(() => expect(screen.getByText(/could not save the reminder time/i)).toBeInTheDocument())
    // Snapped back to what is actually stored, not what was typed.
    expect(timeInput()).toHaveValue('21:00')
  })

  it('does not attempt to save a cleared or half-typed value', async () => {
    render(<ReminderToggle />)
    await waitFor(() => expect(timeInput()).toHaveValue('21:00'))

    fireEvent.change(timeInput(), { target: { value: '' } })

    await waitFor(() => expect(timeInput()).toHaveValue('21:00'))
    expect(mockSave).not.toHaveBeenCalled()
  })

  it('hides the time control when reminders are off — nothing to schedule', async () => {
    mockStatus.mockResolvedValue({ enabled: false, permission: 'default' })
    render(<ReminderToggle />)
    await waitFor(() => expect(screen.getByText('Evening reminder')).toBeInTheDocument())
    expect(screen.queryByLabelText('Remind me at')).toBeNull()
  })
})
