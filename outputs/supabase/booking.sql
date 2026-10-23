create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  barbershop_id uuid not null references public.barbershops(id) on delete cascade,
  service_id uuid not null references public.services(id),
  customer_name text not null check (length(customer_name) between 1 and 100),
  customer_phone text not null check (length(customer_phone) between 1 and 30),
  notes text check (notes is null or length(notes) <= 500),
  start_at timestamptz not null,
  end_at timestamptz not null,
  status text not null default 'requested' check (status in ('requested','confirmed','cancelled','completed')),
  created_at timestamptz not null default now(),
  check (end_at > start_at)
);

create index if not exists appointments_shop_start_idx
  on public.appointments (barbershop_id, start_at);

alter table public.appointments
  add constraint appointments_no_overlap
  exclude using gist (
    barbershop_id with =,
    tstzrange(start_at, end_at, '[)') with &&
  ) where (status in ('requested','confirmed'));

alter table public.appointments enable row level security;
create policy "Members can view shop appointments"
on public.appointments for select to authenticated
using (public.is_barbershop_member(barbershop_id));
grant select on public.appointments to authenticated;

create or replace function public.get_busy_slots(p_barbershop_id uuid, p_day date)
returns table(start_time time, end_time time)
language sql stable security definer
set search_path = public
as $$
  select (a.start_at at time zone 'America/Sao_Paulo')::time,
         (a.end_at at time zone 'America/Sao_Paulo')::time
  from public.appointments a
  where a.barbershop_id = p_barbershop_id
    and a.status in ('requested','confirmed')
    and a.start_at >= (p_day::timestamp at time zone 'America/Sao_Paulo')
    and a.start_at < ((p_day + 1)::timestamp at time zone 'America/Sao_Paulo');
$$;

create or replace function public.book_appointment(
  p_barbershop_id uuid,
  p_service_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_start_at timestamp without time zone,
  p_notes text default null
)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  v_duration integer;
  v_appointment_id uuid;
begin
  if p_start_at at time zone 'America/Sao_Paulo' <= now() then
    raise exception 'Escolha um horário futuro.';
  end if;
  if length(trim(p_customer_name)) not between 1 and 100
    or length(trim(p_customer_phone)) not between 1 and 30
    or (p_notes is not null and length(p_notes) > 500) then
    raise exception 'Dados do formulário inválidos.';
  end if;

  select s.duration_minutes into v_duration
  from public.services s
  join public.barbershops b on b.id = s.barbershop_id
  where s.id = p_service_id and s.barbershop_id = p_barbershop_id
    and s.active and b.active;
  if v_duration is null then
    raise exception 'Serviço ou barbearia indisponível.';
  end if;
  if extract(minute from p_start_at) not in (0, 30)
    or extract(second from p_start_at) <> 0
    or p_start_at::time < time '09:00'
    or (p_start_at + make_interval(mins => v_duration))::time > time '18:00' then
    raise exception 'Horário fora da disponibilidade da barbearia.';
  end if;

  insert into public.appointments (
    barbershop_id, service_id, customer_name, customer_phone, notes, start_at, end_at
  ) values (
    p_barbershop_id, p_service_id, trim(p_customer_name), trim(p_customer_phone),
    nullif(trim(p_notes), ''), p_start_at at time zone 'America/Sao_Paulo',
    (p_start_at at time zone 'America/Sao_Paulo') + make_interval(mins => v_duration)
  ) returning id into v_appointment_id;
  return v_appointment_id;
end;
$$;

revoke all on function public.get_busy_slots(uuid, date) from public;
revoke all on function public.book_appointment(uuid, uuid, text, text, timestamp without time zone, text) from public;
grant execute on function public.get_busy_slots(uuid, date) to anon, authenticated;
grant execute on function public.book_appointment(uuid, uuid, text, text, timestamp without time zone, text) to anon, authenticated;
