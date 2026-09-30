create extension if not exists pgcrypto;

create table if not exists public.weight_profiles (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) > 0),
  normalized_name text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.weight_profiles(id,name,normalized_name) values
('00000000-0000-4000-8000-000000000001','Eason','eason'),
('00000000-0000-4000-8000-000000000002','Claire','claire')
on conflict (id) do nothing;

alter table public.weight_plan add column if not exists profile_id uuid;
alter table public.weight_entries add column if not exists profile_id uuid;
alter table public.weight_milestones add column if not exists profile_id uuid;

update public.weight_plan set profile_id='00000000-0000-4000-8000-000000000001' where profile_id is null;
update public.weight_entries set profile_id='00000000-0000-4000-8000-000000000001' where profile_id is null;
update public.weight_milestones set profile_id='00000000-0000-4000-8000-000000000001' where profile_id is null;

alter table public.weight_plan alter column profile_id set not null;
alter table public.weight_entries alter column profile_id set not null;
alter table public.weight_milestones alter column profile_id set not null;

alter table public.weight_plan drop constraint if exists weight_plan_pkey;
alter table public.weight_entries drop constraint if exists weight_entries_pkey;
alter table public.weight_milestones drop constraint if exists weight_milestones_pkey;
alter table public.weight_plan drop column if exists id;
alter table public.weight_plan add primary key (profile_id);
alter table public.weight_entries add primary key (profile_id,entry_date);
alter table public.weight_milestones add primary key (profile_id,milestone_date);

alter table public.weight_plan add constraint weight_plan_profile_fk foreign key (profile_id) references public.weight_profiles(id) on delete cascade;
alter table public.weight_entries add constraint weight_entries_profile_fk foreign key (profile_id) references public.weight_profiles(id) on delete cascade;
alter table public.weight_milestones add constraint weight_milestones_profile_fk foreign key (profile_id) references public.weight_profiles(id) on delete cascade;

insert into public.weight_plan(profile_id,start_date,start_weight,target_date,target_weight)
values ('00000000-0000-4000-8000-000000000002','2026-10-01',55.0,'2026-12-31',45.0)
on conflict (profile_id) do nothing;

insert into public.weight_milestones(profile_id,milestone_date,target_weight,status,is_manual)
select '00000000-0000-4000-8000-000000000002', d::date,
       round((55.0 + (45.0-55.0) * ((d::date-'2026-10-01'::date)::numeric / ('2026-12-31'::date-'2026-10-01'::date)))::numeric,1),
       'future',false
from generate_series('2026-10-05'::date,'2026-12-28'::date,'7 days') d
on conflict (profile_id,milestone_date) do nothing;
insert into public.weight_milestones(profile_id,milestone_date,target_weight,status,is_manual)
values ('00000000-0000-4000-8000-000000000002','2026-12-31',45.0,'future',false)
on conflict (profile_id,milestone_date) do nothing;

alter table public.weight_profiles enable row level security;
revoke all on public.weight_profiles from anon,authenticated;
grant select,insert,update,delete on public.weight_profiles to anon,authenticated;
drop policy if exists "public shared weight profiles" on public.weight_profiles;
create policy "public shared weight profiles" on public.weight_profiles for all to anon,authenticated using (true) with check (true);

drop trigger if exists weight_profiles_touch on public.weight_profiles;
create trigger weight_profiles_touch before update on public.weight_profiles for each row execute function public.touch_weight_updated_at();

create or replace function public.prevent_last_weight_profile_delete() returns trigger language plpgsql set search_path='' as $$
begin
  perform pg_advisory_xact_lock(hashtext('weight_profiles_minimum_one'));
  if (select count(*) from public.weight_profiles) <= 1 then
    raise exception 'at least one weight profile is required' using errcode='check_violation';
  end if;
  return old;
end $$;
revoke execute on function public.prevent_last_weight_profile_delete() from public,anon,authenticated;
drop trigger if exists keep_one_weight_profile on public.weight_profiles;
create trigger keep_one_weight_profile before delete on public.weight_profiles for each row execute function public.prevent_last_weight_profile_delete();
