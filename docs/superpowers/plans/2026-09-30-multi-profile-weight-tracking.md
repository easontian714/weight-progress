# Multi-Profile Weight Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add shared, unauthenticated multi-user weight tracking with profile switching, unique editable names, protected deletion, and isolated plans, entries, and milestones.

**Architecture:** Add a `weight_profiles` parent table and scope every existing weight table by `profile_id`. Keep Supabase as the shared source of truth, centralize all profile-scoped queries in a repository module, and add a compact profile menu plus focused management dialogs to the existing React page.

**Tech Stack:** React 19, TypeScript, Supabase JS 2.57.4, PostgreSQL/RLS, Vite 8, GitHub Pages, Node test runner.

## Global Constraints

- The site remains shared and unauthenticated; every visitor may switch and manage profiles.
- Existing production data must remain unchanged and become Eason's data.
- Claire starts with the plan `2026-10-01 / 55.0 kg → 2026-12-31 / 45.0 kg` and no actual weight entries.
- Profile names are trimmed, non-empty, and unique case-insensitively.
- Deleting a profile requires a second confirmation and is disabled for the last profile.
- No test may create, overwrite, or delete real weight records.
- Existing design, London-date validation, historical entry editing, charts, and mobile behavior must remain intact.

---

## File Structure

- Create `lib/weight-repository.ts`: typed profile and profile-scoped Supabase reads/writes.
- Create `app/profile-menu.tsx`: selector and add/rename/delete dialogs.
- Modify `app/weight-tracker.tsx`: active-profile state, empty-plan state, and repository integration.
- Modify `app/globals.css`: selector, menu, destructive confirmation, and empty-state styling.
- Modify `supabase/schema.sql`: canonical multi-profile schema and idempotent seed/migration SQL.
- Create `supabase/migrations/20260930000000_add_weight_profiles.sql`: deployable migration generated with the Supabase CLI and renamed to this stable repository path.
- Create `tests/profile-model.test.mjs`: schema and source-level isolation tests.
- Modify `tests/rendered-html.test.mjs`: rendered/source regression assertions.
- Rebuild `docs/`: GitHub Pages production assets.

---

### Task 1: Lock the Multi-Profile Contract With Failing Tests

**Files:**
- Create: `tests/profile-model.test.mjs`
- Modify: `tests/rendered-html.test.mjs`

**Interfaces:**
- Consumes: current `app/weight-tracker.tsx` and `supabase/schema.sql`.
- Produces: assertions for `Profile`, `profile_id`, unique normalized names, scoped queries, profile menu actions, and empty-plan behavior.

- [ ] **Step 1: Add the failing schema and source tests**

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("schema scopes all weight data to unique profiles", async () => {
  const sql = await readFile(new URL("supabase/schema.sql", root), "utf8");
  assert.match(sql, /create table if not exists public\.weight_profiles/);
  assert.match(sql, /normalized_name text not null unique/);
  assert.match(sql, /profile_id uuid not null references public\.weight_profiles\(id\)/);
  assert.match(sql, /primary key \(profile_id, entry_date\)/);
  assert.match(sql, /primary key \(profile_id, milestone_date\)/);
  assert.match(sql, /Eason/);
  assert.match(sql, /Claire/);
});

test("application scopes reads and writes by profile", async () => {
  const [repository, tracker, menu] = await Promise.all([
    readFile(new URL("lib/weight-repository.ts", root), "utf8"),
    readFile(new URL("app/weight-tracker.tsx", root), "utf8"),
    readFile(new URL("app/profile-menu.tsx", root), "utf8"),
  ]);
  assert.match(repository, /loadProfileData/);
  assert.match(repository, /\.eq\("profile_id", profileId\)/);
  assert.match(tracker, /activeProfileId/);
  assert.match(tracker, /localStorage/);
  assert.match(menu, /添加用户/);
  assert.match(menu, /重命名当前用户/);
  assert.match(menu, /删除当前用户/);
  assert.match(menu, /该用户名已存在，请使用其他名称/);
});
```

Append to the existing source regression test:

```js
assert.match(component, /ProfileMenu/);
assert.match(component, /activeProfileId/);
assert.match(css, /\.profile-switcher/);
```

- [ ] **Step 2: Run the tests and confirm the new contract fails**

Run: `node --test tests/profile-model.test.mjs tests/rendered-html.test.mjs`

Expected: FAIL because the profile table, repository, menu, and scoped state do not exist.

- [ ] **Step 3: Commit the failing contract tests**

```bash
git add tests/profile-model.test.mjs tests/rendered-html.test.mjs
git commit -m "test: define multi-profile weight contract"
```

---

### Task 2: Add and Deploy the Profile-Scoped Database Model

**Files:**
- Modify: `supabase/schema.sql`
- Create: `supabase/migrations/20260930000000_add_weight_profiles.sql`

**Interfaces:**
- Consumes: existing Eason rows in `weight_plan`, `weight_entries`, and `weight_milestones`.
- Produces: `weight_profiles(id, name, normalized_name, created_at, updated_at)` and `profile_id` foreign keys on all weight tables.

- [ ] **Step 1: Check current Supabase guidance and CLI commands**

Run:

```bash
curl -fsSL https://supabase.com/changelog.md | rg -n "breaking-change|RLS|Postgres" | head -40
supabase --version
supabase migration new add_weight_profiles
```

Expected: a new timestamped SQL file appears under `supabase/migrations/`. If the CLI is unavailable, create the migration through the connected Supabase MCP workflow and save the exact executed SQL into the generated migration path before continuing.

Rename the generated empty file to `supabase/migrations/20260930000000_add_weight_profiles.sql` before adding SQL so the repository path is deterministic.

- [ ] **Step 2: Write the idempotent migration**

The migration must use deterministic profile IDs so reruns do not duplicate seeds:

```sql
create extension if not exists pgcrypto;

create table if not exists public.weight_profiles (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) > 0),
  normalized_name text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.weight_profiles(id, name, normalized_name)
values
  ('00000000-0000-4000-8000-000000000001', 'Eason', 'eason'),
  ('00000000-0000-4000-8000-000000000002', 'Claire', 'claire')
on conflict (id) do nothing;
```

Add nullable `profile_id`, assign all existing rows to Eason, then make the columns non-null. Replace single-column primary keys with composite keys:

```sql
alter table public.weight_entries drop constraint weight_entries_pkey;
alter table public.weight_entries add primary key (profile_id, entry_date);
alter table public.weight_milestones drop constraint weight_milestones_pkey;
alter table public.weight_milestones add primary key (profile_id, milestone_date);
alter table public.weight_plan drop constraint weight_plan_pkey;
alter table public.weight_plan drop column id;
alter table public.weight_plan add primary key (profile_id);
```

Insert Claire's plan and generated weekly milestones with `on conflict` clauses. Add `on delete cascade` foreign keys. Reject deletion of the last profile with this trigger:

```sql
create or replace function public.prevent_last_weight_profile_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtext('weight_profiles_minimum_one'));
  if (select count(*) from public.weight_profiles) <= 1 then
    raise exception 'at least one weight profile is required' using errcode = 'check_violation';
  end if;
  return old;
end;
$$;

create trigger keep_one_weight_profile
before delete on public.weight_profiles
for each row execute function public.prevent_last_weight_profile_delete();
```

Enable RLS on `weight_profiles`, grant `select`, `insert`, `update`, and `delete` only to `anon` and `authenticated`, and add an explicit shared-edit policy with `using (true) with check (true)` matching the existing product model.

- [ ] **Step 3: Update the canonical schema**

Make `supabase/schema.sql` represent a clean install of the final schema: create profiles first, include `profile_id` in all weight-table definitions, seed Eason and Claire, and scope every seed conflict target to `(profile_id, date)`.

- [ ] **Step 4: Validate SQL statically before deployment**

Run:

```bash
node --test tests/profile-model.test.mjs
```

Expected: schema assertions PASS; application-source assertions still FAIL.

- [ ] **Step 5: Apply the migration and verify production rows**

Use the connected Supabase SQL execution surface to run the migration, then run these read-only checks:

```sql
select name, normalized_name from public.weight_profiles order by created_at;
select p.name, count(e.*) as entry_count
from public.weight_profiles p
left join public.weight_entries e on e.profile_id = p.id
group by p.id, p.name
order by p.name;
select p.name, wp.start_date, wp.start_weight, wp.target_date, wp.target_weight
from public.weight_profiles p
left join public.weight_plan wp on wp.profile_id = p.id
order by p.name;
```

Expected: Eason owns every pre-migration entry; Claire has zero entries and the `2026-10-01 / 55.0 → 2026-12-31 / 45.0` plan.

- [ ] **Step 6: Run database security checks**

Run `supabase db advisors` or the Supabase MCP advisors tool.

Expected: no new critical RLS or exposed-table findings. Fix migration SQL before proceeding if findings are caused by this change.

- [ ] **Step 7: Commit the database model**

```bash
git add supabase/schema.sql supabase/migrations
git commit -m "feat: add profile-scoped weight data"
```

---

### Task 3: Centralize Profile-Scoped Supabase Access

**Files:**
- Create: `lib/weight-repository.ts`

**Interfaces:**
- Produces:
  - `type Profile = { id: string; name: string }`
  - `loadProfiles(): Promise<Profile[]>`
  - `createProfile(name: string): Promise<Profile>`
  - `renameProfile(profileId: string, name: string): Promise<Profile>`
  - `deleteProfile(profileId: string): Promise<void>`
  - `loadProfileData(profileId: string): Promise<{ entries: Entry[]; milestones: Node[]; plan: Plan | null }>`
  - profile-scoped save and delete functions for entries, plans, and milestones.

- [ ] **Step 1: Implement normalized-name and error translation helpers**

```ts
export const normalizeProfileName = (name: string) => name.trim().toLocaleLowerCase("en-GB");

function profileError(error: { code?: string } | null) {
  if (error?.code === "23505") return new Error("该用户名已存在，请使用其他名称。");
  return new Error("用户信息保存失败，请检查网络后重试。");
}
```

- [ ] **Step 2: Implement profile CRUD with trimmed names**

Use `weight_profiles`, write both `name` and `normalized_name`, select the saved row, and throw the translated error. Reject an empty trimmed name before calling Supabase.

- [ ] **Step 3: Implement `loadProfileData(profileId)`**

Every query must include `.eq("profile_id", profileId)`. Use `.maybeSingle()` for the optional plan. Map numeric database values to JavaScript numbers before returning.

- [ ] **Step 4: Move all existing writes behind profile-scoped functions**

Entry upsert must use:

```ts
supabase.from("weight_entries").upsert(
  { profile_id: profileId, entry_date: date, weight },
  { onConflict: "profile_id,entry_date" },
);
```

Entry deletion, plan updates, milestone deletion, and milestone updates must all include `.eq("profile_id", profileId)`.

- [ ] **Step 5: Run the contract test**

Run: `node --test tests/profile-model.test.mjs`

Expected: repository assertions PASS; tracker/menu assertions still FAIL.

- [ ] **Step 6: Commit the repository boundary**

```bash
git add lib/weight-repository.ts
git commit -m "refactor: scope weight repository by profile"
```

---

### Task 4: Build the Profile Switcher and Management Dialogs

**Files:**
- Create: `app/profile-menu.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: `Profile` and profile CRUD functions from `lib/weight-repository.ts`.
- Produces:

```ts
type ProfileMenuProps = {
  profiles: Profile[];
  activeProfile: Profile;
  busy: boolean;
  onSelect(profileId: string): void;
  onProfilesChanged(next: Profile[], activeProfileId: string): void;
  onNotice(message: string): void;
};
```

- [ ] **Step 1: Create the selector and menu**

Render a `.profile-switcher` button in the header. Its menu lists profiles as buttons, marks the active profile, and provides `添加用户`, `重命名当前用户`, and `删除当前用户` actions.

- [ ] **Step 2: Add the create and rename dialogs**

Both dialogs use a text input with `maxLength={40}`. On submit, trim the name, reject empty input, call the repository, and keep the dialog open when an error occurs. Display the exact duplicate-name message returned by the repository.

- [ ] **Step 3: Add destructive confirmation**

The first delete action opens a dialog explaining that the plan, entries, and milestones will be removed. The final button reads `确认删除 ${activeProfile.name}`. Disable deletion when `profiles.length === 1`, and show `至少需要保留一个用户`.

- [ ] **Step 4: Style desktop and mobile states**

Add `.profile-switcher`, `.profile-menu`, `.profile-option`, `.profile-actions`, `.danger-primary`, and `.empty-profile` rules. Keep the selector inside the header on desktop and allow the header actions to wrap cleanly below 760 px.

- [ ] **Step 5: Run source tests**

Run: `node --test tests/profile-model.test.mjs tests/rendered-html.test.mjs`

Expected: menu and CSS assertions PASS; tracker state assertion still FAIL.

- [ ] **Step 6: Commit the profile UI**

```bash
git add app/profile-menu.tsx app/globals.css
git commit -m "feat: add profile management menu"
```

---

### Task 5: Integrate Active Profiles Into the Weight Tracker

**Files:**
- Modify: `app/weight-tracker.tsx`

**Interfaces:**
- Consumes: `ProfileMenu`, `loadProfiles`, `loadProfileData`, and all profile-scoped repository writes.
- Produces: a complete active-profile page with isolated reads/writes and an empty state for profiles without plans.

- [ ] **Step 1: Add profile bootstrap state**

Add `profiles`, `activeProfileId`, and `profileLoading`. On mount, load profiles, restore `weight-active-profile` from `localStorage` when valid, otherwise select Eason or the first profile, then load only that profile's data.

- [ ] **Step 2: Make switching race-safe**

When `activeProfileId` changes, set loading state, fetch the matching profile data, and only apply the result if the requested ID is still active. On success persist the ID to `localStorage`; on failure preserve the previous rendered data and show a Chinese notice.

- [ ] **Step 3: Replace direct Supabase calls**

Remove the direct `supabase` import. Route entry, plan, milestone, and delete actions through repository functions and pass `activeProfileId` to every function. After a successful write, reload only the active profile.

- [ ] **Step 4: Place `ProfileMenu` in the header**

Keep `编辑计划` and `记录体重` unchanged. Place the selector before those actions so it remains the rightmost contextual control group without disrupting existing page hierarchy.

- [ ] **Step 5: Add the no-plan empty state**

When `plan === null`, render the normal header plus a centered `.empty-profile` card containing the active name, `还没有减重计划`, and a `设置计划` button. The plan dialog must support insert-on-first-save and update thereafter. Do not render chart calculations until a plan exists.

- [ ] **Step 6: Preserve record behavior**

Continue to call `londonToday()` whenever either add-record button opens, retain `max={today}`, retain the save-time future-date guard, and keep historical edit dates unchanged.

- [ ] **Step 7: Run all tests and lint**

Run:

```bash
npm test
npm run lint
node --test tests/profile-model.test.mjs
```

Expected: all tests PASS and ESLint exits 0.

- [ ] **Step 8: Commit the integrated application**

```bash
git add app/weight-tracker.tsx tests
git commit -m "feat: isolate weight tracking by profile"
```

---

### Task 6: Build, Publish, and Verify Without Mutating Real Records

**Files:**
- Modify: `docs/index.html`
- Create/Modify: `docs/assets/*`

**Interfaces:**
- Consumes: complete multi-profile application and migrated Supabase schema.
- Produces: verified GitHub Pages deployment.

- [ ] **Step 1: Build the GitHub Pages bundle**

Run: `npm run build:pages`

Expected: Vite exits 0 and updates `docs/index.html` plus hashed assets.

- [ ] **Step 2: Perform local read-only browser verification**

Verify without saving or deleting data:

- selector lists Eason and Claire;
- Eason retains the existing plan and records;
- Claire displays 55.0 kg to 45.0 kg and no actual records;
- switcher works at desktop and mobile widths;
- add/rename dialogs reject blank names in client validation;
- delete dialog requires a second confirmation, but do not press the final destructive button;
- record dialog still defaults to London today and blocks future dates.

- [ ] **Step 3: Commit production assets**

```bash
git add docs
git commit -m "build: publish multi-profile weight tracker"
```

- [ ] **Step 4: Push the complete change**

Run: `git push origin main`

Expected: local `main` and `origin/main` point to the same commit.

- [ ] **Step 5: Verify the live GitHub Pages site**

Open `https://easontian714.github.io/weight-progress/` with a commit query string to bypass stale caches. Repeat the read-only checks from Step 2 and confirm the live asset hash matches `docs/index.html`.

- [ ] **Step 6: Report migration and deployment evidence**

Provide the final commit hash, passing commands, live URL, Eason/Claire read-only verification results, and explicit confirmation that no real weight record was created, overwritten, or deleted during testing.
