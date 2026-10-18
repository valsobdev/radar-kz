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

-- Fixe les champs de suivi : created_by/created_at non modifiables par le client
create or replace function public.set_tracking_fields() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.created_at := pg_catalog.now();
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

drop trigger if exists elements_set_updated_at on public.elements;
drop trigger if exists elements_set_tracking on public.elements;
drop function if exists public.set_updated_at();
create trigger elements_set_tracking
  before insert or update on public.elements
  for each row execute function public.set_tracking_fields();

-- Vrai si l'utilisateur connecté est un éditeur
create or replace function public.is_editor() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.editors where user_id = auth.uid());
$$;

grant execute on function public.is_editor() to anon, authenticated;

-- Droits explicites sur les tables
grant select on public.elements to anon, authenticated;
grant insert, update, delete on public.elements to authenticated;
grant select on public.editors to authenticated;
revoke insert, update, delete on public.elements from anon;
revoke insert, update, delete on public.editors from anon, authenticated;
revoke truncate, references, trigger on public.elements, public.editors from anon, authenticated;

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
