# 减重进度 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建一个无需登录、手机和电脑共用一份公开数据的「减重进度」GitHub Pages 单页应用。

**Architecture:** 前端使用原生 HTML、CSS 和 ES modules；纯计算逻辑与 DOM 渲染、Supabase 访问分离。Supabase 保存唯一计划、每日体重、周节点和审计记录；浏览器只使用 publishable key，并通过受限 RPC 完成带审计的原子写入。

**Tech Stack:** HTML5、CSS3、JavaScript ES2022、Node.js 内置测试运行器、Supabase JS v2、PostgreSQL、GitHub Pages。

## Global Constraints

- 页面名称固定为「减重进度」，英文小标题固定为 `WEIGHT JOURNEY`。
- 不提供登录；所有访问者查看和修改同一份数据。
- 体重单位固定为 kg，输入和展示保留一位小数；同一天只保存一条记录。
- 默认计划为 2026-09-01、90.1 kg 至 2026-12-31、80.0 kg。
- 周节点位于每个周一，并在目标日增加最终节点；默认目标严格线性插值。
- 已结算节点冻结；修改计划只重算当前日期之后的未结算节点。
- 趋势折线使用全部记录；手机最多约 20 个圆点/5 个日期标签，电脑最多约 40 个圆点/8 个日期标签。
- 前端不得包含 Supabase service-role key。
- 支持 320 px 及以上视口；交互触控目标不小于 44 px。

---

## File Map

- `index.html`：语义化页面骨架、表单和对话框。
- `styles.css`：响应式布局、主题、组件和状态样式。
- `src/config.js`：公开 Supabase URL 和 publishable key。
- `src/domain/dates.js`：仅处理 `YYYY-MM-DD` 日历日期，避免时区偏移。
- `src/domain/progress.js`：时间、减重和计划体重计算。
- `src/domain/milestones.js`：周一节点生成、未来节点重算和结算派生。
- `src/domain/chart.js`：趋势序列与圆点/标签抽样。
- `src/data/repository.js`：数据仓储接口和 Supabase 实现。
- `src/ui/render.js`：仪表盘、节点、记录和状态渲染。
- `src/ui/chart-view.js`：无依赖 SVG 趋势图和交互提示。
- `src/app.js`：加载、事件绑定、写入流程和错误恢复。
- `supabase/schema.sql`：表、约束、RLS、RPC、默认数据和审计逻辑。
- `tests/*.test.js`：Node 内置测试运行器覆盖纯逻辑和仓储契约。
- `README.md`：本地运行、Supabase 初始化和 GitHub Pages 部署。

---

### Task 1: Calendar-safe domain calculations

**Files:**
- Create: `package.json`
- Create: `src/domain/dates.js`
- Create: `src/domain/progress.js`
- Test: `tests/progress.test.js`

**Interfaces:**
- Produces: `parseDateKey(value)`, `formatDateKey(date)`, `daysBetween(start, end)`, `addDaysKey(value, amount)`, `calculateProgress(plan, latestWeight, today)`, `plannedWeightOn(plan, date)`.
- Dates cross module boundaries as `YYYY-MM-DD` strings; weights are numbers in kilograms.

- [ ] **Step 1: Add the Node test command and failing progress tests**

```json
{
  "name": "weight-progress",
  "private": true,
  "type": "module",
  "scripts": { "test": "node --test" }
}
```

```js
// tests/progress.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { daysBetween } from "../src/domain/dates.js";
import { calculateProgress, plannedWeightOn } from "../src/domain/progress.js";

const plan = { startDate: "2026-09-01", startWeight: 90.1, targetDate: "2026-12-31", targetWeight: 80 };

test("counts calendar days without timezone drift", () => assert.equal(daysBetween(plan.startDate, plan.targetDate), 121));
test("interpolates the September 28 target", () => assert.equal(plannedWeightOn(plan, "2026-09-28"), 87.8));
test("clamps weight progress below zero", () => {
  assert.deepEqual(calculateProgress(plan, 90.2, "2026-09-28"), {
    weightPercent: 0,
    rawWeightPercent: -0.9900990099009337,
    timePercent: 22.31404958677686,
    plannedWeight: 87.8,
    varianceKg: 2.4,
  });
});
```

- [ ] **Step 2: Run tests and verify missing-module failure**

Run: `npm test`

Expected: FAIL because `src/domain/dates.js` and `src/domain/progress.js` do not exist.

- [ ] **Step 3: Implement UTC calendar helpers and progress calculations**

```js
// src/domain/dates.js
const DAY_MS = 86_400_000;
export function parseDateKey(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}
export function formatDateKey(date) { return date.toISOString().slice(0, 10); }
export function daysBetween(start, end) { return Math.round((parseDateKey(end) - parseDateKey(start)) / DAY_MS); }
export function addDaysKey(value, amount) { return formatDateKey(new Date(parseDateKey(value).getTime() + amount * DAY_MS)); }
export function weekday(value) { return parseDateKey(value).getUTCDay(); }
```

```js
// src/domain/progress.js
import { daysBetween } from "./dates.js";
const round1 = (value) => Math.round((value + Number.EPSILON) * 10) / 10;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
export function plannedWeightOn(plan, date) {
  const total = daysBetween(plan.startDate, plan.targetDate);
  const elapsed = clamp(daysBetween(plan.startDate, date), 0, total);
  return round1(plan.startWeight + (plan.targetWeight - plan.startWeight) * elapsed / total);
}
export function calculateProgress(plan, latestWeight, today) {
  const totalDays = daysBetween(plan.startDate, plan.targetDate);
  const elapsedDays = clamp(daysBetween(plan.startDate, today), 0, totalDays);
  const rawWeightPercent = ((plan.startWeight - latestWeight) / (plan.startWeight - plan.targetWeight)) * 100;
  const plannedWeight = plannedWeightOn(plan, today);
  return {
    weightPercent: clamp(rawWeightPercent, 0, 100), rawWeightPercent,
    timePercent: elapsedDays / totalDays * 100, plannedWeight,
    varianceKg: round1(latestWeight - plannedWeight),
  };
}
```

- [ ] **Step 4: Run tests and verify all pass**

Run: `npm test`

Expected: 3 tests pass.

- [ ] **Step 5: Commit the domain foundation**

```bash
git add package.json src/domain tests/progress.test.js
git commit -m "feat: add weight progress calculations"
```

### Task 2: Milestone generation and immutable settlement

**Files:**
- Create: `src/domain/milestones.js`
- Test: `tests/milestones.test.js`

**Interfaces:**
- Consumes: `addDaysKey`, `daysBetween`, `weekday`, `plannedWeightOn`.
- Produces: `generateMilestones(plan)`, `mergeFutureMilestones(existing, plan, today)`, `settleMilestone(milestone, entry, settledAt)`.

- [ ] **Step 1: Write failing milestone tests**

```js
// tests/milestones.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { generateMilestones, mergeFutureMilestones, settleMilestone } from "../src/domain/milestones.js";
const plan = { startDate: "2026-09-01", startWeight: 90.1, targetDate: "2026-12-31", targetWeight: 80 };

test("generates Monday targets plus final date", () => {
  const nodes = generateMilestones(plan);
  assert.deepEqual(nodes.slice(0, 4).map(({ date, targetWeight }) => [date, targetWeight]), [["2026-09-07",89.6],["2026-09-14",89],["2026-09-21",88.4],["2026-09-28",87.8]]);
  assert.deepEqual(nodes.at(-1), { date: "2026-12-31", targetWeight: 80, manual: false, status: "future" });
});
test("keeps settled and today nodes while regenerating only future nodes", () => {
  const existing = [{ date:"2026-09-21",targetWeight:88.4,status:"missed",actualWeight:89,settledAt:"2026-09-21T08:00:00Z" }, { date:"2026-09-28",targetWeight:87,status:"pending" }];
  const changed = { ...plan, targetDate:"2027-01-31", targetWeight:79 };
  const merged = mergeFutureMilestones(existing, changed, "2026-09-28");
  assert.equal(merged.find(node => node.date === "2026-09-21").targetWeight, 88.4);
  assert.equal(merged.find(node => node.date === "2026-09-28").targetWeight, 87);
  assert.ok(merged.some(node => node.date === "2027-01-31"));
});
test("settles from the same-day entry", () => assert.equal(settleMilestone({date:"2026-09-28",targetWeight:87.8}, {date:"2026-09-28",weight:87.7}, "2026-09-28T09:00:00Z").status, "completed"));
```

- [ ] **Step 2: Run the milestone tests and verify failure**

Run: `node --test tests/milestones.test.js`

Expected: FAIL because the milestone module does not exist.

- [ ] **Step 3: Implement generation, merge and settlement**

```js
// src/domain/milestones.js
import { addDaysKey, weekday } from "./dates.js";
import { plannedWeightOn } from "./progress.js";
export function generateMilestones(plan) {
  const result = [];
  let date = addDaysKey(plan.startDate, (8 - weekday(plan.startDate)) % 7 || 7);
  while (date < plan.targetDate) {
    result.push({ date, targetWeight: plannedWeightOn(plan, date), manual:false, status:"future" });
    date = addDaysKey(date, 7);
  }
  result.push({ date:plan.targetDate, targetWeight:plan.targetWeight, manual:false, status:"future" });
  return result;
}
export function mergeFutureMilestones(existing, plan, today) {
  const frozen = existing.filter(node => node.date <= today);
  const generated = generateMilestones(plan).filter(node => node.date > today);
  const manual = new Map(existing.filter(node => node.date > today && node.manual).map(node => [node.date,node]));
  return [...frozen, ...generated.map(node => manual.get(node.date) || node)].sort((a,b) => a.date.localeCompare(b.date));
}
export function settleMilestone(milestone, entry, settledAt) {
  if (!entry || entry.date !== milestone.date) return { ...milestone, status:"pending" };
  return { ...milestone, actualWeight:entry.weight, referenceDate:entry.date, status:entry.weight <= milestone.targetWeight ? "completed" : "missed", settledAt };
}
```

- [ ] **Step 4: Run all domain tests**

Run: `npm test`

Expected: 6 tests pass.

- [ ] **Step 5: Commit milestone behavior**

```bash
git add src/domain/milestones.js tests/milestones.test.js
git commit -m "feat: add weekly milestone rules"
```

### Task 3: Supabase schema, audit trail and repository

**Files:**
- Create: `supabase/schema.sql`
- Create: `src/config.js`
- Create: `src/data/repository.js`
- Test: `tests/repository.test.js`

**Interfaces:**
- Produces: `createRepository(client)` returning `loadSnapshot()`, `upsertWeight(entry, expectedUpdatedAt)`, `deleteWeight(date, expectedUpdatedAt)`, `updatePlan(plan, expectedUpdatedAt)`, `updateFutureMilestone(date, targetWeight, expectedUpdatedAt)`.
- `loadSnapshot()` returns `{ plan, entries, milestones }` using camelCase fields.

- [ ] **Step 1: Write repository contract tests with a fake client**

Create `tests/repository.test.js` with a fake `client.rpc(name, args)` that records calls. Assert `upsertWeight({date:"2026-09-28",weight:90.2}, null)` calls `save_weight_entry` with `{p_entry_date:"2026-09-28",p_weight:90.2,p_expected_updated_at:null}` and then calls `loadSnapshot()`.

- [ ] **Step 2: Run repository tests and verify failure**

Run: `node --test tests/repository.test.js`

Expected: FAIL because `createRepository` does not exist.

- [ ] **Step 3: Add database tables and constrained anonymous policies**

In `supabase/schema.sql`, create singleton `weight_plan`, date-unique `weight_entries`, date-unique `weight_milestones`, and append-only `weight_audit_log`. Enable RLS. Grant anonymous `select` on the three public data tables, deny direct mutation, and grant execution only on four `security definer` RPCs: `save_weight_entry`, `delete_weight_entry`, `save_weight_plan`, and `save_future_milestone`. Each RPC must validate ranges, compare `p_expected_updated_at` when supplied, append before/after JSON to the audit table, mutate atomically, and return the new row. Revoke all access to `weight_audit_log` from `anon`.

Seed the exact plan, five confirmed weight entries, and generated milestone values from the design spec with idempotent `insert ... on conflict do update` statements.

- [ ] **Step 4: Implement the repository and public configuration**

`src/config.js` exports the existing Supabase project URL and publishable key used for deployment. `src/data/repository.js` maps snake_case database rows to the camelCase interface above, checks every Supabase `{ error }`, and throws an error with code `STALE_WRITE` when the RPC reports an optimistic-lock mismatch.

- [ ] **Step 5: Run repository and domain tests**

Run: `npm test`

Expected: all tests pass, including exact RPC names and argument mapping.

- [ ] **Step 6: Apply the schema in Supabase and verify anonymous boundaries**

Run the complete `supabase/schema.sql` in the selected Supabase project, then verify with the publishable key that public reads and the four RPCs succeed while direct table update/delete and audit-log select fail with permission errors.

- [ ] **Step 7: Commit the persistence layer**

```bash
git add supabase/schema.sql src/config.js src/data/repository.js tests/repository.test.js
git commit -m "feat: add shared Supabase persistence"
```

### Task 4: Responsive dashboard shell and accessible states

**Files:**
- Create: `index.html`
- Create: `styles.css`
- Create: `src/ui/render.js`
- Create: `src/app.js`

**Interfaces:**
- Consumes: `calculateProgress(plan, latestWeight, today)`, repository `loadSnapshot()`.
- Produces: `renderDashboard(root, snapshot, today)`, `renderLoading(root)`, `renderError(root, message)`.

- [ ] **Step 1: Create semantic HTML with stable render targets**

Add `#app`, `#dashboard`, `#progress-dial`, `#layered-progress`, `#summary-cards`, `#chart`, `#milestones`, `#weight-entries`, `#weight-dialog`, `#plan-dialog`, `#milestone-dialog`, and an `aria-live="polite"` status region. Load Supabase JS v2 followed by `src/app.js` as a module.

- [ ] **Step 2: Implement the approved responsive visual system**

Use CSS custom properties for cream, deep green, sage, warm lag and status colors. At widths below 760 px, stack all modules and make the record button full width; at 760 px and above, arrange the hero horizontally and place chart/milestones in a 3:2 grid. Give buttons and form controls a minimum 44 px block size, visible focus rings, and reduced-motion behavior.

- [ ] **Step 3: Render live dashboard values**

`renderDashboard` must derive the latest entry, progress values and next future milestone; update the conic-gradient dial, set the warm time layer width before the green actual layer, and render textual actual/time percentages plus variance in kg. Render milestone statuses using both words and colors.

- [ ] **Step 4: Implement loading, empty and retry states**

On startup call `renderLoading`, load the snapshot, and render the dashboard. On failure call `renderError` with a retry button wired to the same loader. Never replace a failed load with an empty plan.

- [ ] **Step 5: Verify responsive layout manually**

Run: `python3 -m http.server 3000`

Expected: at 320×720 the page has no horizontal scroll and the record button is visible near the top; at 1440×900 the trend and milestone cards are side by side.

- [ ] **Step 6: Commit the dashboard shell**

```bash
git add index.html styles.css src/ui/render.js src/app.js
git commit -m "feat: build responsive weight dashboard"
```

### Task 5: Weight entry, plan and milestone editing flows

**Files:**
- Modify: `index.html`
- Modify: `src/app.js`
- Modify: `src/ui/render.js`
- Modify: `styles.css`

**Interfaces:**
- Consumes: repository mutation methods and fresh snapshots returned after writes.
- Produces: dialog submit handlers with disabled in-flight state and retained input on failure.

- [ ] **Step 1: Add form validation tests to `tests/forms.test.js`**

Test pure helpers `validateWeight(value)` accepts `90.2` and rejects empty, zero, negative and more than one decimal place; `validatePlan(plan)` requires start date before target date, start weight above target weight, and weights between 20 and 400 kg.

- [ ] **Step 2: Implement validation helpers and make tests pass**

Create `src/domain/validation.js`; run `node --test tests/forms.test.js` and expect all cases to pass.

- [ ] **Step 3: Implement the daily weight dialog**

Default to today's date, use `inputmode="decimal"`, and submit through `upsertWeight`. Disable submit while saving. On success close, show a success toast and render the returned fresh snapshot. On error retain values and show inline text. Editing pre-fills the selected row. Deleting requires a confirmation dialog and calls `deleteWeight`.

- [ ] **Step 4: Implement plan editing**

Pre-fill the four plan fields. Explain in the dialog that settled nodes remain unchanged and only future nodes are regenerated. Submit with `updatePlan`, then replace the rendered snapshot.

- [ ] **Step 5: Implement future milestone editing**

Only future milestones expose an edit button. Pre-fill date and target, call `updateFutureMilestone`, and label returned manual nodes as adjusted. Settled nodes have no editing affordance.

- [ ] **Step 6: Verify overwrite, stale-write and error behavior**

In two browser tabs, edit the same date. Expected: the first save succeeds; the second receives `STALE_WRITE`, keeps its input visible and offers refresh. Saving the same day from a current snapshot updates one row rather than creating a duplicate.

- [ ] **Step 7: Commit editing flows**

```bash
git add index.html styles.css src/app.js src/ui/render.js src/domain/validation.js tests/forms.test.js
git commit -m "feat: add plan and weight editing"
```

### Task 6: Full-period interactive trend chart

**Files:**
- Create: `src/domain/chart.js`
- Create: `src/ui/chart-view.js`
- Modify: `src/ui/render.js`
- Modify: `styles.css`
- Test: `tests/chart.test.js`

**Interfaces:**
- Produces: `sampleMarkerIndexes(points, maximum)`, `sampleLabelIndexes(length, maximum)`, `buildChartSeries(snapshot)`, `renderChart(container, series, options)`.

- [ ] **Step 1: Write failing chart sampling tests**

Test that 121 input points remain 121 line coordinates, mobile markers never exceed 20, desktop markers never exceed 40, mobile labels never exceed 5, desktop labels never exceed 8, and marker indexes always include first, last, minimum-weight and maximum-weight observations.

- [ ] **Step 2: Implement deterministic sampling**

Use evenly spaced indexes, merge mandatory indexes, and if the merged set exceeds the maximum, remove non-mandatory indexes furthest from ideal intervals. Return sorted unique indexes.

- [ ] **Step 3: Build SVG paths from the complete series**

Map the entire plan date range to the x-axis and combined actual/target extent to the y-axis. Draw all actual values and all target anchors in their paths; only sampled indexes receive circles and labels.

- [ ] **Step 4: Add pointer and keyboard inspection**

Make sampled circles focusable. Pointer movement finds the nearest actual date by x coordinate. Show a tooltip containing exact date, actual weight and planned weight; Escape or pointer leave hides it.

- [ ] **Step 5: Run tests and visually inspect both breakpoints**

Run: `npm test`

Expected: all tests pass. At 390 px, no more than 20 circles/5 labels render; at 1200 px, no more than 40 circles/8 labels render while the line shape remains identical.

- [ ] **Step 6: Commit the chart**

```bash
git add src/domain/chart.js src/ui/chart-view.js src/ui/render.js styles.css tests/chart.test.js
git commit -m "feat: add full-period trend chart"
```

### Task 7: End-to-end verification and deployment documentation

**Files:**
- Create: `README.md`
- Create: `.gitignore`
- Modify: `index.html`
- Modify: `src/app.js`

**Interfaces:**
- Produces: a deployable static site with documented Supabase and GitHub Pages setup.

- [ ] **Step 1: Add safe repository ignores**

Ignore `.DS_Store`, `.superpowers/`, local screenshots and any local override configuration. Do not ignore the committed publishable `src/config.js`; it must never contain a service-role key.

- [ ] **Step 2: Document setup and recovery**

README must include local `python3 -m http.server 3000`, exact schema application order, where to set the Supabase URL/publishable key, GitHub Pages settings, and an audit-log recovery SQL example that requires privileged dashboard access.

- [ ] **Step 3: Run automated verification**

Run: `npm test`

Expected: all domain, repository, validation and chart tests pass with zero failures.

- [ ] **Step 4: Run browser verification**

Verify in mobile and desktop viewports: initial load, retry state, daily upsert, edit, delete confirmation, plan update, manual future node edit, frozen history, chart tooltip by touch/mouse/keyboard, and a simulated stale write.

- [ ] **Step 5: Run security checks**

Search the repository for `service_role`, JWT-like service secrets and private keys. Expected: no service-role credential. Using the publishable key, verify audit-log reads and direct table mutations fail while the intended RPCs succeed.

- [ ] **Step 6: Commit the release-ready site**

```bash
git add .gitignore README.md index.html src/app.js
git commit -m "docs: add deployment and recovery guide"
```

- [ ] **Step 7: Deploy and smoke test GitHub Pages**

Push `main`, enable Pages from the repository root, open the public URL on a phone and computer, create one disposable future-date entry, verify it appears on the other device, then delete it and verify removal on both.
