# Spec: Discussion detail page — fix title clipping + add description expand/collapse

Target file (the ONLY file to modify):
`/home/user/Chief-of-Staff/src/pages/DiscussionThread.jsx`

## Context
The discussion detail page header (lines 92–125) shows the title with `truncate` (line 119),
which clips long titles with an ellipsis. The user also wants a description dropdown
within the discussion header — tapping the title area expands/collapses a preview of the
first message content (4-line clamp) instead of opening the inline title editor.

Tapping to **edit** the title should still be possible — move it to a dedicated edit icon
or only enter edit mode when `isNew` (which is already handled via `editingTitle` state).

## Existing behaviour to PRESERVE
- `editingTitle` state (line 23): `useState(isNew)` — new discussions start in edit mode.
- When `editingTitle` is true: show the `<input>` (lines 102–116). Keep exactly as-is.
- Back button (line 95): navigates to `backTo`. Keep.
- `bucket · Discussion` subtitle (line 122). Keep.
- `handleSend`, `updateDiscussion`, all message rendering. Do not touch.

## Required changes

### Change 1 — Fix title clipping (line 119)
Remove `truncate` from the h1 className. Title must wrap fully.
- Before: `"text-lg font-semibold text-[#1C1B1F] truncate"`
- After:  `"text-lg font-semibold text-[#1C1B1F] break-words"`

### Change 2 — Title tap → expand/collapse description, not edit
Currently the non-editing title is wrapped in a `<button onClick={() => setEditingTitle(true)}>` (line 118).
Change it so tapping the title toggles a `descOpen` boolean state instead.

Add state:
```js
const [descOpen, setDescOpen] = useState(false)
```

Replace the title button (lines 118–121) with:
```jsx
<button onClick={() => setDescOpen(o => !o)} className="text-left w-full">
  <h1 className="text-lg font-semibold text-[#1C1B1F] break-words">{discussion.title || 'Untitled'}</h1>
</button>
```

### Change 3 — Description dropdown below the title row
Directly after the title `<button>` (still inside the `<div className="flex-1 min-w-0">`),
add the conditional description area:

```jsx
{descOpen && (
  <div className="mt-2 text-sm text-[#49454F] line-clamp-4">
    {messages[0]?.content
      ? (typeof messages[0].content === 'string'
          ? messages[0].content
          : messages[0].content.find?.(b => b.type === 'text')?.text ?? '')
      : 'No messages yet.'}
  </div>
)}
```

Note: `messages` is already derived at line 88 (`const messages = discussion.messages ?? []`),
but that line is BELOW the header JSX. Move the `const messages = discussion.messages ?? []`
line to BEFORE the return statement (it already is at line 88, which is before `return` at
line 90 — so it is accessible). Confirm this is in scope; no changes needed to line 88.

### Change 4 — Preserve title editing via isNew only
Since the tap-to-edit is removed from the title button, the `editingTitle` state now only
activates for new discussions (`isNew` = true, set at line 23). That is the correct and
complete behaviour — no additional edit affordance is required by this spec.

## What the Tester must verify
1. A long discussion title (e.g. "Audit protection cover — fill critical illness gap") wraps
   fully across multiple lines; no ellipsis/truncation.
2. Tapping the title area on an existing discussion toggles the description dropdown open/closed.
3. When open, the first message's text content is shown (clamped to 4 lines).
4. A discussion with no messages shows "No messages yet." in the dropdown.
5. `descOpen` starts as false — the dropdown is closed on page load.
6. A NEW discussion (`isNew` = true) still shows the title input immediately (editingTitle = true),
   and the description dropdown is not shown while in edit mode.
7. The back button, bucket subtitle, message list, and chat input are unaffected.
