# Changes

## File modified
`src/pages/DiscussionThread.jsx`

## What changed

1. Added `const [descOpen, setDescOpen] = useState(false)` state directly after the existing `editingTitle` state (line 24).

2. Replaced the non-editing title button: changed `onClick` from `setEditingTitle(true)` to `setDescOpen(o => !o)`, and changed the h1 className from `truncate` to `break-words` so long titles wrap fully instead of being clipped.

3. Added a conditional description dropdown (`{descOpen && ...}`) immediately after the title button and before the bucket subtitle. It displays the first message's text content clamped to 4 lines, or "No messages yet." if there are no messages.

## What the Tester should focus on
- Long titles wrap across multiple lines (no ellipsis).
- Tapping the title on an existing discussion toggles the description dropdown open and closed.
- The dropdown shows the first message text (clamped to 4 lines) or "No messages yet." when empty.
- `descOpen` is false on load — dropdown is closed by default.
- New discussions (`isNew` = true) still show the title input immediately; the dropdown is not shown while `editingTitle` is true.
- Back button, bucket subtitle, message list, and chat input are unaffected.
