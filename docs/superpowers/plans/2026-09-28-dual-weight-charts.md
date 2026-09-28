# Dual Weight Charts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the cramped combined chart with separate recent-trend and long-term-plan charts, and collapse the milestone list to five items by default.

**Architecture:** Keep both SVG charts as small pure React components in `app/weight-tracker.tsx`, driven by the existing `Entry` and `Plan` state. Derive the five-item milestone window from the existing milestone array and toggle between that window and the full list without changing persistence.

**Tech Stack:** React 19, TypeScript, inline SVG, CSS, Vite, vinext, Supabase.

## Global Constraints

- Do not modify the Supabase schema or stored records.
- Preserve the existing green visual language and all edit actions.
- Both charts must remain responsive and stable with zero or one entry.
- GitHub Pages must continue to work under `/weight-progress/`.

---

### Task 1: Add source-level coverage for the dual-chart and collapsed milestone UI

**Files:**
- Modify: `tests/rendered-html.test.mjs`

**Interfaces:**
- Consumes: `app/weight-tracker.tsx` and `app/globals.css` as source text.
- Produces: regression assertions for `RecentTrendChart`, `LongTermPlanChart`, `visibleMilestones`, and the expand/collapse copy.

- [ ] **Step 1: Write the failing assertions**

Add these checks inside `ships the shared-data and responsive product source`:

```js
assert.match(component, /function RecentTrendChart/);
assert.match(component, /function LongTermPlanChart/);
assert.match(component, /visibleMilestones/);
assert.match(component, /查看全部目标/);
assert.match(component, /收起目标/);
assert.match(css, /\.chart-stack/);
assert.match(css, /\.milestone-toggle/);
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `node --test tests/rendered-html.test.mjs`

Expected: FAIL because the two chart components and milestone controls do not exist yet.

- [ ] **Step 3: Commit the failing test**

```bash
git add tests/rendered-html.test.mjs
git commit -m "test: cover dual charts and collapsed milestones"
```

### Task 2: Implement the two chart scales and five-item milestone window

**Files:**
- Modify: `app/weight-tracker.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: `Entry[]`, `Plan`, and `Node[]` from the existing tracker state.
- Produces: `RecentTrendChart({data})`, `LongTermPlanChart({plan,today})`, `visibleMilestones`, and `showAllMilestones`.

- [ ] **Step 1: Replace the combined chart with two focused components**

Implement `RecentTrendChart` with a date domain from the first to last actual entry, a weight domain from actual values plus padding, and a one-entry fallback domain of one day. Implement `LongTermPlanChart` with the full plan date and weight domains, a dashed start-to-target line, a current-plan marker clamped within the plan period, and explicit start/current/target labels.

- [ ] **Step 2: Render the charts as a vertical stack**

Replace the current `<Chart>` call with:

```tsx
<div className="chart-stack">
  <section className="chart-group">
    <div className="chart-heading"><b>近期趋势</b><span>{entries.length} 次记录</span></div>
    <RecentTrendChart data={[...sorted].reverse()} />
  </section>
  <section className="chart-group">
    <div className="chart-heading"><b>长期计划</b><span>{plan.targetWeight.toFixed(1)} kg 目标</span></div>
    <LongTermPlanChart plan={plan} today={today} />
  </section>
</div>
```

- [ ] **Step 3: Add milestone collapsing behavior**

Add `showAllMilestones` state. Derive a default window containing the two most recent non-future milestones and the first three future milestones, then fill from the ordered list if either group has fewer items. Render `visibleMilestones` and show a `查看全部目标` or `收起目标` button only when there are more than five milestones.

- [ ] **Step 4: Add scoped styles**

Add `.chart-stack`, `.chart-group`, `.chart-heading`, and `.milestone-toggle` rules. Separate the charts with a subtle top border and spacing, keep the SVG width at 100%, and remove the mobile `.node:nth-child(n+4)` hiding rule so the React-controlled five-item limit is consistent on all viewports.

- [ ] **Step 5: Run tests and builds**

Run: `node --test tests/rendered-html.test.mjs && npm run build:pages && npm run build`

Expected: all tests pass and both builds finish successfully.

- [ ] **Step 6: Commit the implementation**

```bash
git add app/weight-tracker.tsx app/globals.css tests/rendered-html.test.mjs docs
git commit -m "feat: split weight trend and plan charts"
```

### Task 3: Publish and verify GitHub Pages

**Files:**
- Modify: generated files under `docs/`

**Interfaces:**
- Consumes: the static Vite Pages entry in `pages/main.tsx`.
- Produces: the live page at `https://easontian714.github.io/weight-progress/`.

- [ ] **Step 1: Confirm generated asset references**

Run: `sed -n '1,80p' docs/index.html`

Expected: CSS and JavaScript URLs begin with `/weight-progress/assets/`.

- [ ] **Step 2: Push the verified build**

Run: `git push origin main`

Expected: the new commits are pushed to `main`.

- [ ] **Step 3: Wait for the Pages deployment and verify**

Run `gh run watch` for the new Pages workflow, then request the page and referenced JavaScript asset with `curl --fail`.

Expected: the workflow succeeds and both requests return HTTP 200.
