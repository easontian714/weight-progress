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
