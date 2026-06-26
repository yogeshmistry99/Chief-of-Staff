# Spec: Discussion list UI fix in BucketDetail.jsx

Target file (the ONLY file to modify):
`/home/user/Chief-of-Staff/src/pages/BucketDetail.jsx`

Component: `DiscussionsTab` (lines 158-249). Render block of interest: lines 183-235.

## OPEN QUESTIONS
1. The current code already implements expand/collapse, first-message preview,
   "Open discussion →" navigation, and a top-right delete button (lines 183-235). Most of
   the request is ALREADY present. The remaining genuine defect is requirement #1 (title
   clipping). Confirm with the requester whether the title is visibly clipped in their build:
   the title `<p>` (line 193) has no truncation class, so any clipping must come from a flex
   width constraint. The spec below hardens against clipping regardless of cause.
2. Requirement #2 asks to expand "a preview of the first message content." Current preview
   uses `line-clamp-4` (line 221). Assume keeping the 4-line clamp is acceptable (the full
   thread is one tap away via "Open discussion →"). Flag if full untruncated first message
   is required instead.

## Existing behavior to PRESERVE (do not regress)
- State: `const [expanded, setExpanded] = useState(null)` (line 161) holds the id of the
  expanded card, or null. No NEW state is needed.
- `handleDelete(e, id)` (lines 165-171): `e.stopPropagation()`, `confirm`, delete, refresh,
  clear `expanded` if it matched. Keep.
- Header toggle `<button>` (lines 189-197): toggles expand, does NOT navigate. Keep.
- Chevron `<button>` (lines 199-207): toggles expand + rotates 180deg when open. Keep.
- Delete `<button>` (lines 208-215): in the right-side group, outside the header toggle. Keep.
- Expanded area (lines 218-232): preview (or "No messages yet.") + "Open discussion →"
  that calls `navigate(`/buckets/${bucket}/discussions/${d.id}`, { state: { from: ... }})`. Keep.

## Required changes

### Change 1 — Guarantee full title, no clipping (lines 188-193)
1. Header `<button>` (lines 189-192): current className `"flex-1 text-left p-4 pr-2"`.
   Add `min-w-0` so the flex child can wrap instead of forcing overflow:
   → `"flex-1 min-w-0 text-left p-4 pr-2"`
2. Title `<p>` (line 193): current className
   `"text-sm font-medium text-[#1C1B1F] leading-snug"`.
   Add `break-words`; ensure NO `truncate` / `line-clamp-*` is present:
   → `"text-sm font-medium text-[#1C1B1F] leading-snug break-words"`

### Change 2 — Delete stays top-right, outside toggle (lines 198-216)
Already correct structurally (delete lives in the right-side `<div>`, separate from the
header toggle button). No change needed. After Change 1, verify:
- right-side `<div>` (line 198) keeps `"flex items-center pr-2 pt-3"`,
- delete `onClick` remains `(e) => handleDelete(e, d.id)` (keeps `stopPropagation`).

### Change 3 — Preview + Open button (lines 218-232)
No change required. Confirm `preview = d.messages[0]?.content ?? null` (line 185) and the
"No messages yet." fallback (line 223) remain intact.

## Pattern notes for the Coder
- Match existing Tailwind usage (hex color tokens e.g. `#6750A4`, `rounded-2xl` cards).
- The card header must NOT navigate — expansion only. Navigation is solely via
  "Open discussion →".
- Keep `e.stopPropagation()` on delete so it never triggers expand or navigation.

## What the Tester must verify
1. A discussion with a long, multi-line title renders the FULL title (wraps over multiple
   lines), no ellipsis/clipping, and the delete button stays visible in the top-right.
2. Tapping the card header (title area) toggles expand/collapse and does NOT navigate.
3. Tapping the chevron toggles expand/collapse; chevron rotates 180deg when open, back to 0 when closed.
4. When expanded, the first message preview shows (clamped to ~4 lines); a discussion with
   no messages shows "No messages yet." instead.
5. "Open discussion →" navigates to `/buckets/{bucket}/discussions/{d.id}` with
   `state.from = /buckets/{bucket}`.
6. Delete prompts a confirm, removes the discussion from the list, and clears `expanded`
   if the deleted card was open. Delete never navigates or expands a card.
7. Collapsing a card hides the preview/Open area.
8. Expanding a second card collapses the first (only one open at a time).
