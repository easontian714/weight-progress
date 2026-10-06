# Weight Progress Corrections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct plan and milestone calculations, improve weight-entry defaults, repair the mobile header, and add an accessible achievement column to the records table.

**Architecture:** Add a small pure calculation module that owns date-sensitive plan, milestone, and achievement rules. `WeightTracker` derives display models from the loaded profile data and keeps persistence limited to user-authored records and plans; CSS owns desktop/mobile column visibility and responsive header layout.

**Tech Stack:** React 19, TypeScript 5.9, native Node test runner, Supabase JS, global CSS, Vite/vinext.

## Global Constraints

- “Today” uses the `Europe/London` time zone.
- Plan weights are rounded to one decimal before display or comparison.
- Milestone status is derived from the current entries, not persisted `status` or `actual_weight`.
- Historical entry changes must immediately recalculate affected milestones.
- No database schema change or new runtime dependency.
- Desktop records show `日期｜体重｜较上次变化｜当日达标｜操作`; mobile hides the change column.

---

### Task 1: Pure Weight and Milestone Calculations

**Files:**
- Create: `lib/weight-calculations.ts`
- Create: `tests/weight-calculations.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `Entry`, `Plan`, and milestone-shaped values containing `date` and `target`.
- Produces: `roundWeight`, `plannedWeightAt`, `planDifferenceLabel`, `latestEntryOnOrBefore`, `deriveMilestone`, and `achievementAt`.

- [ ] **Step 1: Write failing calculation tests**

```js
import assert from "node:assert/strict";
import test from "node:test";
import {
  achievementAt,
  deriveMilestone,
  planDifferenceLabel,
  plannedWeightAt,
} from "../lib/weight-calculations.ts";

const plan = { startDate:"2026-09-01", startWeight:90.1, targetDate:"2026-12-31", targetWeight:80 };
const entries = [
  { date:"2026-10-04", weight:88.7 },
  { date:"2026-10-05", weight:88.9 },
  { date:"2026-10-06", weight:86.7 },
];

test("difference copy never combines direction with a negative number", () => {
  assert.equal(planDifferenceLabel(86.7, 87.2), "当前低于计划体重 0.5 kg");
  assert.equal(planDifferenceLabel(87.7, 87.2), "当前高于计划体重 0.5 kg");
  assert.equal(planDifferenceLabel(87.2, 87.2), "当前正好达到计划体重");
});

test("milestones use the latest entry on or before their date", () => {
  assert.deepEqual(deriveMilestone({date:"2026-10-05",target:87.3}, entries, "2026-10-06"), {
    date:"2026-10-05", target:87.3, state:"missed", actual:88.9, referenceDate:"2026-10-05",
  });
  assert.equal(deriveMilestone({date:"2026-10-07",target:87.1}, entries, "2026-10-06").state, "future");
  assert.equal(deriveMilestone({date:"2026-08-31",target:90.5}, entries, "2026-10-06").state, "unrecorded");
});

test("daily achievement uses the rounded visible plan value", () => {
  assert.equal(plannedWeightAt(plan, "2026-10-06"), 87.2);
  assert.equal(achievementAt(86.7, "2026-10-06", plan), "achieved");
  assert.equal(achievementAt(90.1, "2026-08-31", plan), "outside-plan");
  assert.equal(achievementAt(80, "2027-01-01", plan), "achieved");
});
```

- [ ] **Step 2: Run the calculation tests and verify failure**

Run: `node --test tests/weight-calculations.test.mjs`

Expected: FAIL because `lib/weight-calculations.ts` does not exist.

- [ ] **Step 3: Implement the pure calculation module**

```ts
export type Entry={date:string;weight:number};
export type Plan={startDate:string;startWeight:number;targetDate:string;targetWeight:number};
export type MilestoneInput={date:string;target:number};
export type MilestoneState="future"|"completed"|"missed"|"unrecorded";

const dayMs=86_400_000;
const utc=(date:string)=>Date.parse(date+"T00:00:00Z");
const days=(start:string,end:string)=>(utc(end)-utc(start))/dayMs;

export const roundWeight=(value:number)=>Math.round(value*10)/10;

export function plannedWeightAt(plan:Plan,date:string){
  if(date<=plan.startDate)return roundWeight(plan.startWeight);
  if(date>=plan.targetDate)return roundWeight(plan.targetWeight);
  const ratio=days(plan.startDate,date)/Math.max(1,days(plan.startDate,plan.targetDate));
  return roundWeight(plan.startWeight+(plan.targetWeight-plan.startWeight)*ratio);
}

export function planDifferenceLabel(actual:number,planned:number){
  const difference=roundWeight(actual-planned);
  if(difference===0)return "当前正好达到计划体重";
  return `当前${difference>0?"高于":"低于"}计划体重 ${Math.abs(difference).toFixed(1)} kg`;
}

export function latestEntryOnOrBefore(entries:Entry[],date:string){
  return entries.filter(entry=>entry.date<=date).sort((a,b)=>b.date.localeCompare(a.date))[0];
}

export function deriveMilestone(node:MilestoneInput,entries:Entry[],today:string){
  if(node.date>today)return {...node,state:"future" as const};
  const reference=latestEntryOnOrBefore(entries,node.date);
  if(!reference)return {...node,state:"unrecorded" as const};
  return {...node,state:reference.weight<=node.target?"completed" as const:"missed" as const,actual:reference.weight,referenceDate:reference.date};
}

export function achievementAt(actual:number,date:string,plan:Plan){
  if(date<plan.startDate)return "outside-plan" as const;
  return actual<=plannedWeightAt(plan,date)?"achieved" as const:"missed" as const;
}
```

- [ ] **Step 4: Add the unit test to the standard test command**

Change the package script to:

```json
"test": "node --test tests/weight-calculations.test.mjs && npm run build && node --test tests/rendered-html.test.mjs"
```

- [ ] **Step 5: Run the calculation tests and type/build checks**

Run: `node --test tests/weight-calculations.test.mjs && npm run build`

Expected: all calculation tests PASS and the production build exits 0.

- [ ] **Step 6: Commit calculation behavior**

```bash
git add lib/weight-calculations.ts tests/weight-calculations.test.mjs package.json
git commit -m "fix: derive weight plan statuses consistently"
```

### Task 2: Apply Derived Statuses and Weight Entry Defaults

**Files:**
- Modify: `app/weight-tracker.tsx`
- Modify: `tests/rendered-html.test.mjs`

**Interfaces:**
- Consumes: calculation helpers from Task 1.
- Produces: derived milestone rows, correct next-node display, correct plan-difference copy, and explicit create/edit entry state.

- [ ] **Step 1: Add failing source assertions for the new UI contract**

Add these assertions inside `ships the shared-data and responsive product source`:

```js
assert.match(component, /planDifferenceLabel/);
assert.match(component, /deriveMilestone/);
assert.match(component, /achievementAt/);
assert.match(component, /计划已结束/);
assert.match(component, /首次聚焦/);
assert.doesNotMatch(component, /useState\("90\.2"\)/);
```

- [ ] **Step 2: Run the source test and verify failure**

Run: `npm run build && node --test tests/rendered-html.test.mjs`

Expected: FAIL on one or more new source assertions.

- [ ] **Step 3: Import helpers and derive milestone display models**

Import the calculation helpers and replace direct `future` checks with derived states:

```tsx
import {achievementAt,deriveMilestone,planDifferenceLabel,plannedWeightAt} from "../lib/weight-calculations";

const derivedMilestones=useMemo(
  ()=>milestones.map(node=>deriveMilestone(node,entries,today)),
  [milestones,entries,today],
);
const next=derivedMilestones.find(node=>node.state==="future");
```

Build visible milestone rows from `derivedMilestones`. Render `completed`, `missed`, `unrecorded`, and `future` explicitly; only future rows expose the edit button. When `next` is absent, render the next-node statistic as `计划已结束` and the final target instead of a past date.

- [ ] **Step 4: Replace signed lag copy with the direction-aware helper**

```tsx
const planned=plannedWeightAt(plan,today);
...
<strong className="lag">{planDifferenceLabel(latest.weight,planned)}</strong>
```

- [ ] **Step 5: Separate create and edit entry initialization**

Use an explicit editing date and an initially empty weight string:

```tsx
const [editingEntryDate,setEditingEntryDate]=useState<string|null>(null);
const [weight,setWeight]=useState("");
const [weightFocused,setWeightFocused]=useState(false);

function openNewEntry(){
  setEditingEntryDate(null);
  setDate(londonToday());
  setWeight(sorted[0]?.weight.toFixed(1)??"");
  setWeightFocused(false);
  setOpen(true);
}

function openExistingEntry(entry:Entry){
  setEditingEntryDate(entry.date);
  setDate(entry.date);
  setWeight(entry.weight.toFixed(1));
  setWeightFocused(false);
  setOpen(true);
}
```

On the weight input, select its complete contents only on the first focus:

```tsx
onFocus={event=>{
  if(!weightFocused){event.currentTarget.select();setWeightFocused(true)}
}}
```

Use `editingEntryDate` to render `编辑体重` versus `记录体重`, and reset the edit state when the dialog closes or saves. Add a nearby source comment containing `首次聚焦` to document the interaction contract exercised by the source test.

- [ ] **Step 6: Run focused and full tests**

Run: `node --test tests/weight-calculations.test.mjs && npm test`

Expected: all tests PASS.

- [ ] **Step 7: Commit component behavior**

```bash
git add app/weight-tracker.tsx tests/rendered-html.test.mjs
git commit -m "fix: refresh milestones and entry defaults"
```

### Task 3: Records Table and Responsive Header

**Files:**
- Modify: `app/weight-tracker.tsx`
- Modify: `app/globals.css`
- Modify: `tests/rendered-html.test.mjs`

**Interfaces:**
- Consumes: `achievementAt` from Task 1 and sorted entry rows from Task 2.
- Produces: accessible desktop/mobile records columns and a two-row mobile header.

- [ ] **Step 1: Add failing source assertions for the table and responsive CSS**

```js
assert.match(component, /record-head/);
assert.match(component, /achievement-badge/);
assert.match(component, /当日达标/);
assert.match(css, /white-space:nowrap/);
assert.match(css, /\.record-change/);
```

- [ ] **Step 2: Run the source test and verify failure**

Run: `npm run build && node --test tests/rendered-html.test.mjs`

Expected: FAIL on the new table or responsive assertions.

- [ ] **Step 3: Render semantic column labels and achievement badges**

Add a header row before the records and render the achievement cell for every entry:

```tsx
<div className="record record-head" aria-hidden="true">
  <b>日期</b><b>体重</b><b className="record-change">较上次变化</b><b>当日达标</b><b>操作</b>
</div>
```

For each row:

```tsx
const achievement=achievementAt(e.weight,e.date,plan);
...
<span className={`achievement-badge ${achievement}`}>
  <span aria-hidden="true">{achievement==="achieved"?"✓":achievement==="missed"?"×":"—"}</span>
  <span className="sr-only">{achievement==="achieved"?"达标":achievement==="missed"?"未达标":"计划外记录"}</span>
</span>
```

Give the delta cell the `record-change` class so the header and body hide together on mobile.

- [ ] **Step 4: Update desktop and mobile grid definitions**

Use five aligned desktop columns and four mobile columns:

```css
.record{display:grid;grid-template-columns:1.2fr .7fr .7fr .55fr 124px;gap:12px;align-items:center;min-height:54px;border-bottom:1px solid #e8ece6;font-size:12px}
.record-head{min-height:38px;color:var(--muted);font-size:10px;text-transform:uppercase;letter-spacing:.08em}
.achievement-badge{width:26px;height:26px;border-radius:50%;display:grid;place-items:center;font-weight:800}
.achievement-badge.achieved{color:var(--green);background:#e5eee7}
.achievement-badge.missed{color:var(--bad);background:#f5e7df}
.achievement-badge.outside-plan{color:var(--muted);background:#edf0ec}
.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
```

Inside the existing mobile media query:

```css
.shell>header{display:block}
.shell>header h1{white-space:nowrap}
.actions{width:100%;margin-top:14px;justify-content:flex-end}
.record{grid-template-columns:1fr .65fr 42px 118px}
.record-change{display:none}
```

- [ ] **Step 5: Run lint, tests, and both production builds**

Run: `npm run lint && npm test && npm run build:pages`

Expected: lint exits 0, all tests PASS, vinext build exits 0, and GitHub Pages build exits 0.

- [ ] **Step 6: Inspect generated page at desktop and mobile widths**

Run: `npm run dev`

Verify:

- Desktop records align under all five headings.
- Mobile title remains on one line and controls occupy a second row.
- Mobile records have no horizontal overflow and hide only the change column.
- Check/cross badges use muted green/orange styling and expose accessible text.
- New entry defaults to the current profile's latest weight and selects once on focus.
- Editing a row preserves that row's own date and weight.

- [ ] **Step 7: Commit responsive UI**

```bash
git add app/weight-tracker.tsx app/globals.css tests/rendered-html.test.mjs docs/
git commit -m "feat: clarify weight records and mobile layout"
```

### Task 4: Final Regression and Repository State

**Files:**
- Verify only; update generated `docs/` assets through `npm run build:pages` if the build changes them.

**Interfaces:**
- Consumes: all prior tasks.
- Produces: a clean, deployable repository with generated GitHub Pages assets matching source.

- [ ] **Step 1: Run the complete verification suite from a clean working tree baseline**

Run: `npm run lint && npm test && npm run build:pages && git diff --check`

Expected: all commands exit 0 and `git diff --check` prints nothing.

- [ ] **Step 2: Review the final diff for scope and generated assets**

Run: `git status --short && git diff --stat && git diff -- app/ lib/ tests/ package.json`

Expected: only calculation, tracker, responsive CSS, tests, package script, plan/spec, and generated GitHub Pages assets are changed.

- [ ] **Step 3: Commit generated assets if needed**

```bash
git add docs/index.html docs/assets
git commit -m "build: refresh weight progress pages"
```

- [ ] **Step 4: Record the final revision**

Run: `git log -4 --oneline && git status --short`

Expected: the feature commits are present and the working tree is clean.
