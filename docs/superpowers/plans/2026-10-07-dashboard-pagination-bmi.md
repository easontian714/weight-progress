# Dashboard Pagination and BMI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add stable five-item milestone pagination, repair the trend toolbar overlap, and add a profile-specific BMI card using Chinese adult thresholds.

**Architecture:** Pure calculation and pagination helpers live in `lib/weight-calculations.ts` and are covered by Node tests. Profile height is stored as a nullable constrained column on `weight_profiles`, loaded through the existing repository, and edited by the dashboard. The existing `WeightTracker` component renders the BMI card and milestone pager without changing weight, plan, or milestone storage.

**Tech Stack:** React 19, TypeScript, Supabase/Postgres, CSS, Node test runner, Vite/GitHub Pages.

## Global Constraints

- Show five milestones per page on desktop and mobile.
- Default to the page containing the latest settled milestones and immediate future milestones.
- Keep milestone page state after edits when valid and clamp it when the page count changes.
- Use Chinese adult BMI thresholds: underweight below 18.5, normal 18.5 through 23.9, overweight 24.0 through 27.9, obesity 28.0 and above.
- Store height per profile; seed Eason at 178 cm and leave other profiles nullable.
- Accept height only from 100 through 250 cm.
- Apply the database migration before publishing frontend code that selects `height_cm`.
- Preserve `全部` as the default trend range.
- Do not change existing weight entries, plans, or milestone data.

---

### Task 1: Calculation and pagination helpers

**Files:**
- Modify: `lib/weight-calculations.ts`
- Test: `tests/weight-calculations.test.mjs`

**Interfaces:**
- Produces: `calculateBmi(weightKg:number,heightCm:number):number`
- Produces: `classifyChineseBmi(bmi:number):"underweight"|"normal"|"overweight"|"obesity"`
- Produces: `normalWeightRange(heightCm:number):{min:number;max:number}`
- Produces: `bmiMarkerPercent(bmi:number):number`
- Produces: `milestonePageForContext(milestones:Array<{state:string}>,pageSize?:number):number`
- Produces: `clampPage(page:number,itemCount:number,pageSize?:number):number`

- [ ] **Step 1: Add failing helper tests**

```js
import {bmiMarkerPercent,calculateBmi,classifyChineseBmi,clampPage,milestonePageForContext,normalWeightRange} from "../lib/weight-calculations.ts";

test("calculates and classifies Chinese adult BMI",()=>{
  assert.equal(calculateBmi(86.7,178),27.4);
  assert.equal(classifyChineseBmi(18.4),"underweight");
  assert.equal(classifyChineseBmi(18.5),"normal");
  assert.equal(classifyChineseBmi(24),"overweight");
  assert.equal(classifyChineseBmi(28),"obesity");
  assert.deepEqual(normalWeightRange(178),{min:58.6,max:75.7});
  assert.equal(bmiMarkerPercent(10),0);
  assert.equal(bmiMarkerPercent(40),100);
});

test("selects and clamps milestone pages",()=>{
  const states=["completed","missed","missed","future","future","future","future","future"].map(state=>({state}));
  assert.equal(milestonePageForContext(states,5),0);
  assert.equal(clampPage(3,8,5),1);
  assert.equal(clampPage(1,0,5),0);
});
```

- [ ] **Step 2: Run the calculation tests and confirm failure**

Run: `node --test tests/weight-calculations.test.mjs`

Expected: FAIL because the six new exports do not exist.

- [ ] **Step 3: Implement the helpers**

```ts
export function calculateBmi(weightKg:number,heightCm:number){
  return Math.round(weightKg/((heightCm/100)**2)*10)/10;
}

export function classifyChineseBmi(bmi:number){
  if(bmi<18.5)return "underweight" as const;
  if(bmi<24)return "normal" as const;
  if(bmi<28)return "overweight" as const;
  return "obesity" as const;
}

export function normalWeightRange(heightCm:number){
  const metres=heightCm/100;
  return {min:Math.round(18.5*metres*metres*10)/10,max:Math.round(23.9*metres*metres*10)/10};
}

export function bmiMarkerPercent(bmi:number){
  return Math.max(0,Math.min(100,(bmi-15)/(35-15)*100));
}

export function clampPage(page:number,itemCount:number,pageSize=5){
  return Math.max(0,Math.min(page,Math.max(0,Math.ceil(itemCount/pageSize)-1)));
}

export function milestonePageForContext(items:Array<{state:string}>,pageSize=5){
  const firstFuture=items.findIndex(item=>item.state==="future");
  const anchor=firstFuture<0?Math.max(0,items.length-1):Math.max(0,firstFuture-2);
  return clampPage(Math.floor(anchor/pageSize),items.length,pageSize);
}
```

- [ ] **Step 4: Run the calculation tests**

Run: `node --test tests/weight-calculations.test.mjs`

Expected: all tests pass.

- [ ] **Step 5: Commit the helper layer**

```bash
git add lib/weight-calculations.ts tests/weight-calculations.test.mjs
git commit -m "feat: add BMI and milestone pagination calculations"
```

### Task 2: Persist profile height safely

**Files:**
- Create: `supabase/migrations/20261007000000_add_profile_height.sql`
- Modify: `supabase/schema.sql`
- Modify: `lib/weight-repository.ts`
- Test: `tests/rendered-html.test.mjs`

**Interfaces:**
- Extends: `Profile` with `heightCm:number|null`
- Produces: `updateProfileHeight(profileId:string,heightCm:number):Promise<Profile>`
- Consumes: existing public `weight_profiles` table and its update policy.

- [ ] **Step 1: Verify current Supabase guidance and CLI capabilities**

Run: `curl -fsSL https://supabase.com/changelog.md | rg -n "breaking-change|Postgres|migration" | head -n 30`

Run: `npx supabase --version && npx supabase migration new add_profile_height`

Expected: a timestamped migration file is created under `supabase/migrations/`.

- [ ] **Step 2: Add the schema migration**

```sql
alter table public.weight_profiles
  add column if not exists height_cm numeric(5,1);

alter table public.weight_profiles
  drop constraint if exists weight_profiles_height_cm_check;

alter table public.weight_profiles
  add constraint weight_profiles_height_cm_check
  check (height_cm is null or height_cm between 100 and 250);

update public.weight_profiles
set height_cm = 178.0
where normalized_name = 'eason' and height_cm is null;
```

- [ ] **Step 3: Mirror the final column and constraint in `supabase/schema.sql`**

Add `height_cm numeric(5,1) check (height_cm is null or height_cm between 100 and 250)` to the canonical profile definition, keeping it nullable.

- [ ] **Step 4: Extend repository reads and writes**

```ts
export type Profile={id:string;name:string;heightCm:number|null};
const profileFields="id,name,height_cm";
const mapProfile=(row:{id:string;name:string;height_cm:number|null})=>({id:row.id,name:row.name,heightCm:row.height_cm==null?null:Number(row.height_cm)});

export async function updateProfileHeight(profileId:string,heightCm:number){
  if(!Number.isFinite(heightCm)||heightCm<100||heightCm>250)throw fail("请输入 100–250 cm 之间的身高。");
  const {data,error}=await supabase.from("weight_profiles").update({height_cm:heightCm}).eq("id",profileId).select(profileFields).single();
  if(error)throw fail("身高保存失败，请重试。");
  return mapProfile(data);
}
```

Update `loadProfiles`, `createProfile`, and `renameProfile` to select `profileFields` and return `mapProfile` output.

- [ ] **Step 5: Apply and verify the remote migration before frontend publication**

Use the connected Supabase SQL tool or supported CLI command to apply the exact migration SQL. Then query:

```sql
select name,height_cm from public.weight_profiles order by created_at;
```

Expected: Eason has `178.0`; existing other profiles remain `null`; no weight, plan, or milestone rows change.

- [ ] **Step 6: Run database advisors and migration checks**

Run the connected Supabase advisors, then run `npx supabase migration list --local`.

Expected: no new security or performance error caused by `height_cm`; the migration is present locally.

- [ ] **Step 7: Commit persistence changes**

```bash
git add supabase/migrations supabase/schema.sql lib/weight-repository.ts tests/rendered-html.test.mjs
git commit -m "feat: store height per weight profile"
```

### Task 3: Build milestone pagination and non-overlapping trend toolbar

**Files:**
- Modify: `app/weight-tracker.tsx`
- Modify: `app/globals.css`
- Test: `tests/rendered-html.test.mjs`

**Interfaces:**
- Consumes: `clampPage` and `milestonePageForContext` from Task 1.
- Produces: five-node page slice and accessible previous/next controls.

- [ ] **Step 1: Add failing source assertions**

```js
assert.match(component,/MILESTONE_PAGE_SIZE=5/);
assert.match(component,/milestone-pager/);
assert.match(component,/上一页/);
assert.match(component,/下一页/);
assert.doesNotMatch(component,/showAllMilestones/);
assert.doesNotMatch(component,/查看全部目标/);
assert.match(component,/trend-toolbar/);
assert.doesNotMatch(css,/margin-top:-20px/);
```

- [ ] **Step 2: Run rendered-source tests and confirm failure**

Run: `npm run build && node --test tests/rendered-html.test.mjs`

Expected: FAIL on the new pagination and toolbar assertions.

- [ ] **Step 3: Replace expansion state with page state**

Introduce `const MILESTONE_PAGE_SIZE=5`, `milestonePage`, `milestonePageCount`, and `visibleMilestones=derivedMilestones.slice(milestonePage*5,milestonePage*5+5)`. Reset the page with `milestonePageForContext(derivedMilestones,MILESTONE_PAGE_SIZE)` after profile changes, clamp it when milestones change, and preserve it after node edits when valid.

- [ ] **Step 4: Render the pager**

```tsx
<nav className="milestone-pager" aria-label="里程碑分页">
  <button type="button" aria-label="上一页" disabled={milestonePage===0} onClick={()=>setMilestonePage(page=>page-1)}>‹</button>
  <span>{milestonePage+1} / {milestonePageCount}</span>
  <button type="button" aria-label="下一页" disabled={milestonePage>=milestonePageCount-1} onClick={()=>setMilestonePage(page=>page+1)}>›</button>
</nav>
```

- [ ] **Step 5: Put range selection and record count in one toolbar**

Move the count into `RecentTrendChart` as a `totalCount` prop and render:

```tsx
<div className="trend-toolbar">
  <span>{totalCount} 次记录</span>
  <div className="trend-range" role="group" aria-label="趋势时间范围">
    {([["7d","7天"],["30d","30天"],["all","全部"]] as const).map(([value,text])=><button key={value} type="button" className={range===value?"active":""} aria-pressed={range===value} onClick={()=>chooseRange(value)}>{text}</button>)}
  </div>
</div>
```

Remove the old `.chart-heading` count and the negative `margin-top` positioning from `.trend-range`.

- [ ] **Step 6: Add stable card and control styles**

Use a five-row milestone body, a three-column pager, native disabled styling, and a wrapping `.trend-toolbar`. At `max-width:760px`, keep the toolbar on one or two clean rows without absolute positioning or negative margins.

- [ ] **Step 7: Run tests and lint**

Run: `npm run lint && npm run build && node --test tests/rendered-html.test.mjs`

Expected: tests pass; lint has no new errors.

- [ ] **Step 8: Commit dashboard layout changes**

```bash
git add app/weight-tracker.tsx app/globals.css tests/rendered-html.test.mjs
git commit -m "feat: paginate weekly milestones"
```

### Task 4: Build the profile BMI card and height editor

**Files:**
- Modify: `app/weight-tracker.tsx`
- Modify: `app/globals.css`
- Modify: `tests/rendered-html.test.mjs`

**Interfaces:**
- Consumes: BMI helpers from Task 1.
- Consumes: `Profile.heightCm` and `updateProfileHeight` from Task 2.
- Produces: full-width `.bmi-card`, `.bmi-scale`, and height dialog.

- [ ] **Step 1: Add failing BMI UI assertions**

```js
assert.match(component,/中国成人标准/);
assert.match(component,/正常体重/);
assert.match(component,/设置身高/);
assert.match(component,/updateProfileHeight/);
assert.match(component,/bmi-scale/);
assert.match(css,/\.bmi-card/);
assert.match(css,/\.bmi-marker/);
```

- [ ] **Step 2: Run rendered-source tests and confirm failure**

Run: `npm run build && node --test tests/rendered-html.test.mjs`

Expected: FAIL because the BMI card and editor are absent.

- [ ] **Step 3: Add active-profile height state and save flow**

Derive `activeProfile` from `profiles`, calculate BMI only when `heightCm` exists, and add `heightOpen` plus `height` form state. On save, call `updateProfileHeight`, replace the matching profile in state, close the dialog, and show `身高已更新。`; surface repository errors in the existing notice.

- [ ] **Step 4: Render the BMI card**

Render below `.stats`. With height, show BMI, category copy (`偏瘦/正常/超重/肥胖`), normal weight range, the four labelled zones, and a marker using `left:${bmiMarkerPercent(bmi)}%`. Without height, show `设置身高后显示 BMI 和正常体重范围` plus a `设置身高` button.

- [ ] **Step 5: Render the height editor**

Use the existing dialog language with a numeric input `min="100"`, `max="250"`, `step="0.1"`, and submit label `保存身高`. The pencil button and empty-state button open the same form.

- [ ] **Step 6: Style desktop and mobile BMI layouts**

Use the approved full-width card: summary and normal range on one row, scale beneath, labels visible at all widths. On mobile, stack summary text above the scale and prevent marker or labels from overflowing. Provide focus, hover, disabled, and reduced-motion-compatible states.

- [ ] **Step 7: Run the complete local verification suite**

Run: `node --test tests/weight-calculations.test.mjs && npm run lint && npm run build && node --test tests/rendered-html.test.mjs && npm run build:pages`

Expected: all tests and builds pass; only previously known lint warnings may remain.

- [ ] **Step 8: Verify interactively at desktop and mobile widths**

Check that the trend toolbar never overlaps, the milestone card stays fixed across all pages, boundary pager buttons disable correctly, Eason shows BMI 27.4 at 178 cm, height edits survive reload, and a profile without height shows the empty state.

- [ ] **Step 9: Commit generated Pages assets and BMI UI**

```bash
git add app/weight-tracker.tsx app/globals.css tests/rendered-html.test.mjs docs/index.html docs/assets
git commit -m "feat: add profile BMI summary"
```

### Task 5: Publish and verify production

**Files:**
- No source changes expected.

**Interfaces:**
- Consumes: committed migration, frontend, and generated GitHub Pages assets.
- Produces: verified production deployment.

- [ ] **Step 1: Confirm a clean worktree and push**

Run: `git status --short && git push origin main`

Expected: clean worktree, then a successful push.

- [ ] **Step 2: Monitor GitHub Pages deployment**

Check the workflow run for the pushed commit until it completes successfully.

- [ ] **Step 3: Verify the production page**

Open `https://easontian714.github.io/weight-progress/`, wait for shared data, and repeat the desktop/mobile checks from Task 4 against production.
