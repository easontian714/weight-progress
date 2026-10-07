# Milestone Pagination and Chart Toolbar Design

## Goal

Keep the recent-trend and milestone cards visually aligned while making all milestones reachable, and remove the overlap between the trend range selector and record count.

## Milestone pagination

- Replace the expand/collapse milestone interaction with pagination inside the milestone card.
- Show five milestones per page on desktop and mobile.
- Render a compact footer with previous and next buttons plus `current / total` page status.
- On initial load and after a profile change, select the page containing the current milestone context: the latest settled milestones followed by upcoming milestones.
- Keep the current page after editing and reloading a milestone when that page remains valid; clamp it when the number of pages changes.
- Disable previous and next controls at the first and last pages.
- Keep the card height stable so it does not stretch the trend chart row.

## Trend toolbar

- Place the total record count and the `7天 / 30天 / 全部` range selector in one dedicated toolbar row.
- Give the selector its own flex group instead of positioning it with negative margins.
- Allow the toolbar to wrap cleanly on narrow screens without overlapping labels.
- Preserve `全部` as the default range.

## Accessibility and states

- Pagination controls use native buttons with descriptive accessible labels.
- The current page is announced as text, and disabled controls use the native disabled state.
- Focus, hover, active, and disabled styles follow the existing green interface language.
- No data model or Supabase changes are required.

## Verification

- Unit-test page selection and page clamping helpers.
- Assert that the old expand/collapse milestone control is removed.
- Verify five milestones per page, disabled boundary controls, and the non-overlapping trend toolbar.
- Run lint, calculation tests, rendered-source tests, production build, and desktop/mobile browser checks.
