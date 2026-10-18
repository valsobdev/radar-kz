-- Radar KZ : schéma Supabase. À coller en une fois dans SQL Editor.

-- Liste des éditeurs (les seuls autorisés à modifier les éléments)
create table if not exists editors (
  user_id uuid primary key references auth.users on delete cascade
);

-- Éléments de la carte (radars, zones, postes, etc.)
create table if not exists elements (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('speed_camera','camera','average_zone','police_post','mobile_control','other')),
  lat double precision,
  lon double precision,
  directions integer[] not null default '{}',
  maxspeed integer check (maxspeed is null or maxspeed between 5 and 200),
  controls text check (controls is null or controls in ('speed','red_light','other')),
  path jsonb,
  note text,
  expires_at timestamptz,
  overrides text,
  hidden boolean not null default false,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Met à jour updated_at à chaque modification
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists elements_set_updated_at on elements;
create trigger elements_set_updated_at
  before update on elements
  for each row execute function public.set_updated_at();

-- Vrai si l'utilisateur connecté est un éditeur
create or replace function public.is_editor() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from editors where user_id = auth.uid());
$$;

grant execute on function public.is_editor() to anon, authenticated;

-- Sécurité par lignes (RLS)
alter table editors enable row level security;
alter table elements enable row level security;

-- elements : lecture pour tous, écriture réservée aux éditeurs
drop policy if exists "elements_select" on elements;
create policy "elements_select" on elements
  for select to anon, authenticated using (true);

drop policy if exists "elements_insert" on elements;
create policy "elements_insert" on elements
  for insert to authenticated with check (public.is_editor());

drop policy if exists "elements_update" on elements;
create policy "elements_update" on elements
  for update to authenticated using (public.is_editor()) with check (public.is_editor());

drop policy if exists "elements_delete" on elements;
create policy "elements_delete" on elements
  for delete to authenticated using (public.is_editor());

-- editors : chacun ne voit que sa propre ligne (ajout depuis SQL Editor)
drop policy if exists "editors_select_own" on editors;
create policy "editors_select_own" on editors
  for select to authenticated using (user_id = auth.uid());
