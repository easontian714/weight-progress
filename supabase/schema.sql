create table if not exists public.weight_plan (
  id boolean primary key default true check (id),
  start_date date not null,
  start_weight numeric(5,1) not null check (start_weight between 20 and 400),
  target_date date not null check (target_date > start_date),
  target_weight numeric(5,1) not null check (target_weight between 20 and 400),
  updated_at timestamptz not null default now()
);

create table if not exists public.weight_entries (
  entry_date date primary key,
  weight numeric(5,1) not null check (weight between 20 and 400),
  updated_at timestamptz not null default now()
);

create table if not exists public.weight_milestones (
  milestone_date date primary key,
  target_weight numeric(5,1) not null check (target_weight between 20 and 400),
  is_manual boolean not null default false,
  status text not null default 'future' check (status in ('future','pending','completed','missed')),
  actual_weight numeric(5,1),
  reference_date date,
  settled_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.weight_audit_log (
  id bigint generated always as identity primary key,
  table_name text not null,
  action text not null,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.touch_weight_updated_at() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end $$;

create or replace function public.audit_weight_change() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.weight_audit_log(table_name, action, old_data, new_data)
  values (tg_table_name, tg_op, to_jsonb(old), to_jsonb(new));
  return coalesce(new, old);
end $$;
revoke execute on function public.touch_weight_updated_at() from public, anon, authenticated;
revoke execute on function public.audit_weight_change() from public, anon, authenticated;

drop trigger if exists weight_plan_touch on public.weight_plan;
create trigger weight_plan_touch before update on public.weight_plan for each row execute function public.touch_weight_updated_at();
drop trigger if exists weight_entries_touch on public.weight_entries;
create trigger weight_entries_touch before update on public.weight_entries for each row execute function public.touch_weight_updated_at();
drop trigger if exists weight_milestones_touch on public.weight_milestones;
create trigger weight_milestones_touch before update on public.weight_milestones for each row execute function public.touch_weight_updated_at();

drop trigger if exists weight_plan_audit on public.weight_plan;
create trigger weight_plan_audit after insert or update or delete on public.weight_plan for each row execute function public.audit_weight_change();
drop trigger if exists weight_entries_audit on public.weight_entries;
create trigger weight_entries_audit after insert or update or delete on public.weight_entries for each row execute function public.audit_weight_change();
drop trigger if exists weight_milestones_audit on public.weight_milestones;
create trigger weight_milestones_audit after insert or update or delete on public.weight_milestones for each row execute function public.audit_weight_change();

alter table public.weight_plan enable row level security;
alter table public.weight_entries enable row level security;
alter table public.weight_milestones enable row level security;
alter table public.weight_audit_log enable row level security;
revoke all on public.weight_plan, public.weight_entries, public.weight_milestones, public.weight_audit_log from anon, authenticated;
grant select, insert, update, delete on public.weight_plan, public.weight_entries, public.weight_milestones to anon, authenticated;

drop policy if exists "public shared weight plan" on public.weight_plan;
create policy "public shared weight plan" on public.weight_plan for all to anon, authenticated using (true) with check (true);
drop policy if exists "public shared weight entries" on public.weight_entries;
create policy "public shared weight entries" on public.weight_entries for all to anon, authenticated using (true) with check (true);
drop policy if exists "public shared weight milestones" on public.weight_milestones;
create policy "public shared weight milestones" on public.weight_milestones for all to anon, authenticated using (true) with check (true);
drop policy if exists "deny public audit access" on public.weight_audit_log;
create policy "deny public audit access" on public.weight_audit_log for select to anon, authenticated using (false);

insert into public.weight_plan(id,start_date,start_weight,target_date,target_weight) values (true,'2026-09-01',90.1,'2026-12-31',80.0)
on conflict (id) do update set start_date=excluded.start_date,start_weight=excluded.start_weight,target_date=excluded.target_date,target_weight=excluded.target_weight;

insert into public.weight_entries(entry_date,weight) values
('2026-09-01',90.1),('2026-09-09',90.1),('2026-09-10',90.1),('2026-09-11',90.1),
('2026-09-12',88.5),('2026-09-13',89.0),('2026-09-15',89.5),('2026-09-16',89.6),
('2026-09-17',88.3),('2026-09-18',89.0),('2026-09-19',89.6),('2026-09-28',90.2)
on conflict (entry_date) do update set weight=excluded.weight;

insert into public.weight_milestones(milestone_date,target_weight,status,actual_weight,reference_date,settled_at) values
('2026-09-07',89.6,'missed',90.1,'2026-09-01','2026-09-08T00:00:00Z'),
('2026-09-14',89.0,'missed',90.1,'2026-09-01','2026-09-15T00:00:00Z'),
('2026-09-21',88.4,'missed',89.0,'2026-09-18','2026-09-22T00:00:00Z'),
('2026-09-28',87.8,'missed',90.2,'2026-09-28','2026-09-28T12:00:00Z'),
('2026-10-05',87.3,'future',null,null,null),('2026-10-12',86.7,'future',null,null,null),
('2026-10-19',86.1,'future',null,null,null),('2026-10-26',85.5,'future',null,null,null),
('2026-11-02',84.9,'future',null,null,null),('2026-11-09',84.3,'future',null,null,null),
('2026-11-16',83.8,'future',null,null,null),('2026-11-23',83.2,'future',null,null,null),
('2026-11-30',82.6,'future',null,null,null),('2026-12-07',82.0,'future',null,null,null),
('2026-12-14',81.4,'future',null,null,null),('2026-12-21',80.8,'future',null,null,null),
('2026-12-28',80.3,'future',null,null,null),('2026-12-31',80.0,'future',null,null,null)
on conflict (milestone_date) do update set target_weight=excluded.target_weight,status=excluded.status,actual_weight=excluded.actual_weight,reference_date=excluded.reference_date,settled_at=excluded.settled_at;

alter table if exists public.weight_profiles add column if not exists height_cm numeric(5,1);
alter table if exists public.weight_profiles drop constraint if exists weight_profiles_height_cm_check;
alter table if exists public.weight_profiles add constraint weight_profiles_height_cm_check check (height_cm is null or height_cm between 100 and 250);
