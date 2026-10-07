# Dashboard Pagination, Chart Toolbar, and BMI Design

## Goal

Keep the recent-trend and milestone cards visually aligned while making all milestones reachable, remove the overlap between the trend range selector and record count, and add a profile-specific BMI summary using the Chinese adult classification.

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

## BMI summary

- Add a full-width BMI card below the three summary cards and above the trend and milestone row.
- Calculate BMI from the active profile's saved height and latest recorded weight.
- Use the Chinese adult classification: underweight below 18.5, normal from 18.5 through 23.9, overweight from 24.0 through 27.9, and obesity from 28.0.
- Show the current BMI to one decimal place, its category, and the normal body-weight range implied by BMI 18.5 through 23.9.
- Render a horizontal four-zone colour scale for underweight, normal, overweight, and obesity, with a marker at the current BMI.
- Treat BMI as a screening indicator rather than a diagnosis; label the scale `中国成人标准`.
- Place a pencil button in the card header. It opens a small height form for the active profile.
- Save height independently for each profile. Seed Eason at 178 cm. Profiles without height show a `设置身高` empty state and do not calculate BMI.
- Validate height from 100 through 250 cm in both the form and database constraint.

## Data storage

- Add nullable `height_cm` to `weight_profiles`; existing weight entries, plans, and milestones remain unchanged.
- Include `height_cm` when loading, creating, and updating profiles.
- Apply the schema migration before deploying frontend code so the published client never queries a missing column.

## Accessibility and states

- Pagination and BMI edit controls use native buttons with descriptive accessible labels.
- The current page is announced as text, and disabled controls use the native disabled state.
- Focus, hover, active, and disabled styles follow the existing green interface language.
- The BMI marker and colour scale have text labels, so meaning is not conveyed by colour alone.

## Verification

- Unit-test page selection, page clamping, BMI calculation, classification, normal-weight range, and marker clamping helpers.
- Assert that the old expand/collapse milestone control is removed.
- Verify five milestones per page, disabled boundary controls, the non-overlapping trend toolbar, the 178 cm Eason BMI result, and the no-height empty state.
- Run lint, calculation tests, rendered-source tests, production build, and desktop/mobile browser checks.
