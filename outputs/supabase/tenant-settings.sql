alter table public.barbershops
  add column if not exists whatsapp_phone text;

do $$
begin
  alter table public.barbershops
    add constraint barbershops_whatsapp_phone_check
    check (whatsapp_phone is null or whatsapp_phone ~ '^[0-9]{10,15}$');
exception
  when duplicate_object then null;
end;
$$;

create or replace function public.set_barbershop_whatsapp(
  p_barbershop_id uuid,
  p_whatsapp_phone text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_phone text := nullif(regexp_replace(coalesce(p_whatsapp_phone, ''), '\D', '', 'g'), '');
begin
  if v_phone is not null and length(v_phone) not between 10 and 15 then
    raise exception 'Informe o número com código do país e DDD, contendo de 10 a 15 dígitos.';
  end if;

  if not exists (
    select 1 from public.memberships
    where barbershop_id = p_barbershop_id and user_id = auth.uid()
  ) then
    raise exception 'Sua conta não tem acesso a esta barbearia.';
  end if;

  update public.barbershops
  set whatsapp_phone = v_phone
  where id = p_barbershop_id;

  if not found then
    raise exception 'Barbearia não encontrada.';
  end if;
end;
$$;

revoke all on function public.set_barbershop_whatsapp(uuid, text) from public, anon;
grant execute on function public.set_barbershop_whatsapp(uuid, text) to authenticated;
