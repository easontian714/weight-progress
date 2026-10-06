# Weight Progress Usability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make historical records, chart values, plan context, and initial loading easier to understand without changing persistence or permissions.

**Architecture:** Extend the existing pure calculation module with deterministic range filtering, keep chart interaction local to `RecentTrendChart`, and let `WeightTracker` own record expansion and initial-loading state. Add one focused skeleton component and consolidate all status styling behind semantic CSS variables.

**Tech Stack:** React 19, TypeScript 5.9, native Node test runner, inline SVG, global CSS, Vite/vinext, Supabase JS.

## Global Constraints

- Recent trend defaults to `all`; `7d` and `30d` end at the latest entry date.
- Desktop hover/focus and touch click reveal the same point details.
- Desktop and mobile both show 7 records by default.
- Initial load never renders seed data before the first profile request settles.
- Failed reads may show a clearly labelled local preview.
- No database, permission, or runtime dependency changes.
- Status styling uses semantic success, warning, and danger variables.

---

### Task 1: Trend Range Calculation

**Files:**
- Modify: `lib/weight-calculations.ts`
- Modify: `tests/weight-calculations.test.mjs`

**Interfaces:**
- Consumes: ascending or unsorted `Entry[]` and `"7d" | "30d" | "all"`.
- Produces: `filterEntriesByRange(entries, range): Entry[]`, sorted ascending and anchored to the latest entry.

- [ ] **Step 1: Add failing range tests**

```js
import {filterEntriesByRange} from "../lib/weight-calculations.ts";

test("trend ranges end at the latest recorded date",()=>{
  const entries=[
    {date:"2026-09-01",weight:90.1},
    {date:"2026-09-07",weight:89.6},
    {date:"2026-09-30",weight:89.1},
    {date:"2026-10-06",weight:86.7},
  ];
  assert.deepEqual(filterEntriesByRange(entries,"7d").map(entry=>entry.date),["2026-09-30","2026-10-06"]);
  assert.deepEqual(filterEntriesByRange(entries,"30d").map(entry=>entry.date),["2026-09-07","2026-09-30","2026-10-06"]);
  assert.deepEqual(filterEntriesByRange(entries,"all").map(entry=>entry.date),["2026-09-01","2026-09-07","2026-09-30","2026-10-06"]);
  assert.deepEqual(filterEntriesByRange([],"7d"),[]);
});
```

- [ ] **Step 2: Run the unit test and confirm it fails**

Run: `node --test tests/weight-calculations.test.mjs`

Expected: FAIL because `filterEntriesByRange` is not exported.

- [ ] **Step 3: Implement deterministic range filtering**

```ts
export type TrendRange="7d"|"30d"|"all";

export function filterEntriesByRange(entries:Entry[],range:TrendRange){
  const sorted=[...entries].sort((a,b)=>a.date.localeCompare(b.date));
  if(range==="all"||sorted.length===0)return sorted;
  const end=sorted.at(-1)!.date;
  const inclusiveDays=range==="7d"?7:30;
  const startDate=new Date(utc(end)-(inclusiveDays-1)*dayMs).toISOString().slice(0,10);
  return sorted.filter(entry=>entry.date>=startDate);
}
```

- [ ] **Step 4: Run unit tests**

Run: `node --test tests/weight-calculations.test.mjs`

Expected: all tests PASS.

- [ ] **Step 5: Commit the range helper**

```bash
git add lib/weight-calculations.ts tests/weight-calculations.test.mjs
git commit -m "test: define trend range behavior"
```

### Task 2: Interactive Recent Trend

**Files:**
- Modify: `app/weight-tracker.tsx`
- Modify: `app/globals.css`
- Modify: `tests/rendered-html.test.mjs`

**Interfaces:**
- Consumes: `filterEntriesByRange`, `plannedWeightAt`, entries, and plan.
- Produces: range selector, focusable points, and an HTML tooltip positioned within the chart stage.

- [ ] **Step 1: Add failing source-contract assertions**

```js
assert.match(component,/trend-range/);
assert.match(component,/chart-tooltip/);
assert.match(component,/7天/);
assert.match(component,/30天/);
assert.match(component,/全部/);
assert.match(component,/与计划/);
assert.match(css,/\.chart-stage/);
```

- [ ] **Step 2: Run the rendered-source test and confirm failure**

Run: `npm run build && node --test tests/rendered-html.test.mjs`

Expected: FAIL on the new chart contract.

- [ ] **Step 3: Refactor `RecentTrendChart` to own range and active-point state**

```tsx
type ActivePoint={entry:Entry;xPercent:number;yPercent:number;align:"left"|"center"|"right"};

function RecentTrendChart({data,plan}:{data:Entry[];plan:Plan}){
  const [range,setRange]=useState<TrendRange>("all");
  const [active,setActive]=useState<ActivePoint|null>(null);
  const visible=useMemo(()=>filterEntriesByRange(data,range),[data,range]);
  function chooseRange(next:TrendRange){setRange(next);setActive(null)}
  // Reuse the existing coordinate calculation with `visible`.
}
```

Render the selector before the chart:

```tsx
<div className="trend-range" role="group" aria-label="趋势时间范围">
  {([["7d","7天"],["30d","30天"],["all","全部"]] as const).map(([value,text])=><button key={value} type="button" className={range===value?"active":""} aria-pressed={range===value} onClick={()=>chooseRange(value)}>{text}</button>)}
</div>
```

Wrap the SVG in `.chart-stage`. Each rendered circle receives `tabIndex={0}`, an `aria-label`, mouse enter/leave, focus/blur, click, and Escape handlers. Set `active` with x/y percentages and left/center/right alignment. Render one sibling `.chart-tooltip` with:

```tsx
<b>{label(active.entry.date)}</b>
<span>实际 {active.entry.weight.toFixed(1)} kg</span>
<span>计划 {plannedWeightAt(plan,active.entry.date).toFixed(1)} kg</span>
<span>{planDifferenceLabel(active.entry.weight,plannedWeightAt(plan,active.entry.date))}</span>
```

- [ ] **Step 4: Add selector and tooltip styling**

```css
.chart-stage{position:relative}
.trend-range{display:flex;gap:4px;padding:3px;border:1px solid var(--line);border-radius:999px}
.trend-range button{border:0;background:transparent;color:var(--muted);border-radius:999px;padding:6px 10px;font-size:11px}
.trend-range button.active{background:var(--ink);color:#fff}
.chart-tooltip{position:absolute;z-index:2;min-width:150px;padding:10px 12px;border:1px solid var(--line);border-radius:12px;background:var(--paper);box-shadow:0 10px 26px #173b2924;pointer-events:none;transform:translate(-50%,-100%)}
.chart-tooltip.align-left{transform:translate(0,-100%)}
.chart-tooltip.align-right{transform:translate(-100%,-100%)}
.chart-tooltip span{display:block;margin-top:3px;font-size:10px;color:var(--muted)}
.chart circle:focus-visible{outline:none;stroke:var(--success);stroke-width:5}
```

- [ ] **Step 5: Run lint, tests, and build**

Run: `npm run lint && npm test`

Expected: no lint errors and all tests PASS.

- [ ] **Step 6: Commit the chart interaction**

```bash
git add app/weight-tracker.tsx app/globals.css tests/rendered-html.test.mjs
git commit -m "feat: add interactive trend ranges and details"
```

### Task 3: Record Disclosure and Plan Context

**Files:**
- Modify: `app/weight-tracker.tsx`
- Modify: `app/globals.css`
- Modify: `tests/rendered-html.test.mjs`

**Interfaces:**
- Consumes: sorted entries, `latest`, `planned`, and active profile ID.
- Produces: seven-row default list, disclosure control, last-recorded date, and today-plan copy.

- [ ] **Step 1: Add failing source assertions**

```js
assert.match(component,/查看全部记录/);
assert.match(component,/收起记录/);
assert.match(component,/记录于/);
assert.match(component,/今日计划/);
assert.doesNotMatch(css,/record:not\(\.record-head\):nth-child/);
```

- [ ] **Step 2: Run the rendered-source test and confirm failure**

Run: `npm run build && node --test tests/rendered-html.test.mjs`

Expected: FAIL because the disclosure and context copy are missing and CSS still hides rows by position.

- [ ] **Step 3: Add record disclosure state and reset it when profiles switch**

```tsx
const [showAllRecords,setShowAllRecords]=useState(false);
const visibleRecords=showAllRecords?sorted:sorted.slice(0,7);

async function switchProfile(profileId:string){
  if(profileId===activeProfileId)return;
  setShowAllRecords(false);
  // Keep the existing loading and profile-switch logic.
}
```

Render `visibleRecords`. When `sorted.length>7`, append the existing secondary full-width button pattern with `查看全部记录（${sorted.length}）` or `收起记录`.

- [ ] **Step 4: Add current-record date and today-plan context**

Render the current-weight statistic as:

```tsx
<article><span>当前体重</span>{entries.length?<><b>{latest.weight.toFixed(1)} kg</b><small>记录于 {label(latest.date)}</small></>:<><b>暂无记录</b><small>记录第一条体重后显示</small></>}</article>
```

Place this immediately above the direction copy:

```tsx
<span className="today-plan">今日计划 {planned.toFixed(1)} kg</span>
```

- [ ] **Step 5: Remove positional mobile hiding and style context/disclosure**

Delete `.record:not(.record-head):nth-child(n+5){display:none}`. Add `.stats small`, `.today-plan`, and `.records .milestone-toggle` rules using the existing muted and semantic tokens.

- [ ] **Step 6: Run lint and tests**

Run: `npm run lint && npm test`

Expected: no lint errors and all tests PASS.

- [ ] **Step 7: Commit record and context improvements**

```bash
git add app/weight-tracker.tsx app/globals.css tests/rendered-html.test.mjs
git commit -m "feat: clarify current weight and record history"
```

### Task 4: Initial Skeleton and Semantic State Tokens

**Files:**
- Modify: `app/weight-tracker.tsx`
- Modify: `app/globals.css`
- Modify: `tests/rendered-html.test.mjs`

**Interfaces:**
- Consumes: initial `profileBusy`, empty `activeProfileId`, load success, and load failure.
- Produces: `WeightTrackerSkeleton`, explicit local-preview notice, and centralized status colors.

- [ ] **Step 1: Add failing skeleton and token assertions**

```js
assert.match(component,/function WeightTrackerSkeleton/);
assert.match(component,/本地预览/);
assert.match(css,/--success:/);
assert.match(css,/--warning:/);
assert.match(css,/--danger:/);
assert.match(css,/\.skeleton/);
```

- [ ] **Step 2: Run the rendered-source test and confirm failure**

Run: `npm run build && node --test tests/rendered-html.test.mjs`

Expected: FAIL because the skeleton and semantic tokens do not exist.

- [ ] **Step 3: Add the focused skeleton component and initial render gate**

```tsx
function WeightTrackerSkeleton(){return <main className="shell skeleton" aria-busy="true" aria-label="正在加载体重数据"><header><div className="skeleton-title"/><div className="skeleton-actions"/></header><section className="skeleton-hero"/><section className="skeleton-stats"><i/><i/><i/></section><section className="skeleton-grid"><i/><i/></section><section className="skeleton-records"/></main>}
```

At the start of `WeightTracker` rendering, return the skeleton only while `profileBusy && !activeProfileId`. Keep old profile content in place during later profile switches. Change the load-failure notice to `共享数据暂时无法读取，当前显示本地预览。`.

- [ ] **Step 4: Centralize state tokens and replace hard-coded state colors**

Add to `:root`:

```css
--success:#2f7d4f;--success-soft:#e5eee7;--warning:#99583c;--warning-soft:#f5e7df;--danger:#8f3f34;--danger-soft:#f6e3df;
```

Replace status uses of `#2f7d4f`, `var(--bad)`, `#f5e7df`, and destructive button colors with semantic variables. Preserve `--green` for brand and charts.

- [ ] **Step 5: Style the skeleton and reduced-motion behavior**

```css
.skeleton [class^="skeleton-"],.skeleton i{display:block;border-radius:16px;background:linear-gradient(90deg,#e4e9e2 25%,#f0f3ee 50%,#e4e9e2 75%);background-size:200% 100%;animation:skeleton-shift 1.4s ease-in-out infinite}
.skeleton-title{width:190px;height:64px}.skeleton-actions{width:310px;height:46px}.skeleton-hero{height:300px;margin-top:34px}.skeleton-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:12px}.skeleton-stats i{height:100px}.skeleton-grid{display:grid;grid-template-columns:1.55fr .85fr;gap:12px;margin-top:12px}.skeleton-grid i{height:390px}.skeleton-records{height:260px;margin-top:12px}
@keyframes skeleton-shift{to{background-position:-200% 0}}
@media(prefers-reduced-motion:reduce){.skeleton [class^="skeleton-"],.skeleton i{animation:none}}
```

Add mobile skeleton grid adjustments inside the existing breakpoint.

- [ ] **Step 6: Run full verification**

Run: `npm run lint && npm test && npm run build:pages && git diff --check`

Expected: lint has no errors, all tests PASS, both builds exit 0, and diff check is empty.

- [ ] **Step 7: Commit skeleton and tokens**

```bash
git add app/weight-tracker.tsx app/globals.css tests/rendered-html.test.mjs docs/index.html docs/assets
git commit -m "feat: add stable loading and status tokens"
```

### Task 5: Browser Verification and Deployment

**Files:**
- Verify generated `docs/` assets and repository state.

**Interfaces:**
- Consumes: all prior tasks.
- Produces: a deployed GitHub Pages revision verified against real shared data.

- [ ] **Step 1: Run local browser verification**

Start `npm run dev`. Verify the default “全部” range, 7-day and 30-day filters, point hover/focus/click details, seven-row disclosure, current-record date, today-plan value, skeleton load, and mobile layout.

- [ ] **Step 2: Review final diff**

Run: `git status --short && git diff --stat && git diff --check`

Expected: only scoped source, tests, docs, generated assets, and the approved design/plan are changed.

- [ ] **Step 3: Push and monitor deployment**

Run: `git push origin main` and inspect the newest `pages build and deployment` workflow.

Expected: workflow conclusion is `success` for the pushed SHA.

- [ ] **Step 4: Verify the live page**

Open `https://easontian714.github.io/weight-progress/` and confirm the live DOM contains the new controls and real data without browser errors.
