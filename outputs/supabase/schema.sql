create extension if not exists pgcrypto;
create extension if not exists btree_gist;

create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);

create table if not exists public.barbershops (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.memberships (
  barbershop_id uuid not null references public.barbershops(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'staff')),
  created_at timestamptz not null default now(),
  primary key (barbershop_id, user_id)
);

create or replace function public.is_barbershop_member(p_barbershop_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.memberships m
    where m.barbershop_id = p_barbershop_id and m.user_id = auth.uid()
  );
$$;

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  barbershop_id uuid not null references public.barbershops(id) on delete cascade,
  name text not null check (length(name) between 1 and 120),
  description text not null default '' check (length(description) <= 500),
  price numeric(10,2) not null check (price >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  barbershop_id uuid not null references public.barbershops(id) on delete cascade,
  name text not null check (length(name) between 1 and 120),
  description text not null default '',
  price numeric(10,2) not null check (price >= 0),
  duration_minutes integer not null check (duration_minutes between 15 and 240),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.barbershops enable row level security;
alter table public.memberships enable row level security;
alter table public.products enable row level security;
alter table public.services enable row level security;
alter table public.platform_admins enable row level security;

create policy "Active barbershops are public"
on public.barbershops for select to anon, authenticated using (active);
create policy "Members can view their barbershops"
on public.barbershops for select to authenticated using (public.is_barbershop_member(id));
create policy "Members can read memberships"
on public.memberships for select to authenticated using (user_id = auth.uid());
create policy "Public can view active products"
on public.products for select to anon, authenticated using (
  active and exists (select 1 from public.barbershops b where b.id = barbershop_id and b.active)
);
create policy "Members can manage products"
on public.products for all to authenticated
using (public.is_barbershop_member(barbershop_id))
with check (public.is_barbershop_member(barbershop_id));
create policy "Public can view active services"
on public.services for select to anon, authenticated using (
  active and exists (select 1 from public.barbershops b where b.id = barbershop_id and b.active)
);
create policy "Members can manage services"
on public.services for all to authenticated
using (public.is_barbershop_member(barbershop_id))
with check (public.is_barbershop_member(barbershop_id));
create policy "Users can read their platform admin status"
on public.platform_admins for select to authenticated using (user_id = auth.uid());

grant usage on schema public to anon, authenticated;
grant select on public.barbershops, public.products, public.services to anon, authenticated;
grant select on public.memberships, public.platform_admins to authenticated;
grant insert, update, delete on public.products, public.services to authenticated;
