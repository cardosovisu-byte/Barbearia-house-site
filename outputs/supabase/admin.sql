create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  barbershop_id uuid not null references public.barbershops(id) on delete cascade,
  customer_name text not null default '' check (length(customer_name) <= 100),
  customer_phone text not null default '' check (length(customer_phone) <= 30),
  status text not null default 'pending' check (status in ('pending', 'completed', 'cancelled')),
  total numeric(12,2) not null default 0 check (total >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null check (length(product_name) between 1 and 120),
  quantity integer not null check (quantity between 1 and 100),
  unit_price numeric(10,2) not null check (unit_price >= 0),
  line_total numeric(12,2) not null check (line_total >= 0)
);

create table if not exists public.cash_transactions (
  id uuid primary key default gen_random_uuid(),
  barbershop_id uuid not null references public.barbershops(id) on delete cascade,
  entered_by uuid not null default auth.uid() references auth.users(id),
  order_id uuid references public.orders(id) on delete restrict,
  kind text not null check (kind in ('income', 'expense')),
  category text not null check (length(category) between 1 and 60),
  description text not null default '' check (length(description) <= 240),
  amount numeric(12,2) not null check (amount > 0),
  occurred_on date not null default current_date,
  created_at timestamptz not null default now()
);

alter table public.cash_transactions
  alter column entered_by set default auth.uid();

create index if not exists orders_shop_created_idx
  on public.orders (barbershop_id, created_at desc);
create index if not exists cash_transactions_shop_date_idx
  on public.cash_transactions (barbershop_id, occurred_on desc);

alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.cash_transactions enable row level security;

drop policy if exists "Members can view shop orders" on public.orders;
create policy "Members can view shop orders"
on public.orders for select to authenticated
using (public.is_barbershop_member(barbershop_id));

drop policy if exists "Members can view shop order items" on public.order_items;
create policy "Members can view shop order items"
on public.order_items for select to authenticated
using (
  exists (
    select 1 from public.orders o
    where o.id = order_id and public.is_barbershop_member(o.barbershop_id)
  )
);

drop policy if exists "Members can view shop cash" on public.cash_transactions;
create policy "Members can view shop cash"
on public.cash_transactions for select to authenticated
using (public.is_barbershop_member(barbershop_id));

drop policy if exists "Members can add manual cash entries" on public.cash_transactions;
create policy "Members can add manual cash entries"
on public.cash_transactions for insert to authenticated
with check (
  order_id is null
  and entered_by = auth.uid()
  and public.is_barbershop_member(barbershop_id)
);

drop policy if exists "Members can update manual cash entries" on public.cash_transactions;
create policy "Members can update manual cash entries"
on public.cash_transactions for update to authenticated
using (order_id is null and public.is_barbershop_member(barbershop_id))
with check (
  order_id is null
  and entered_by = auth.uid()
  and public.is_barbershop_member(barbershop_id)
);

drop policy if exists "Members can delete manual cash entries" on public.cash_transactions;
create policy "Members can delete manual cash entries"
on public.cash_transactions for delete to authenticated
using (order_id is null and public.is_barbershop_member(barbershop_id));

grant select on public.orders, public.order_items, public.cash_transactions to authenticated;
grant insert, update, delete on public.cash_transactions to authenticated;
revoke insert, update, delete on public.orders, public.order_items from anon, authenticated;
revoke all on public.orders, public.order_items, public.cash_transactions from anon;

create or replace function public.create_order(
  p_barbershop_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_items jsonb
)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  v_order_id uuid;
  v_item jsonb;
  v_product_id uuid;
  v_quantity integer;
  v_product_name text;
  v_unit_price numeric(10,2);
  v_total numeric(12,2) := 0;
begin
  if auth.uid() is null or not public.is_barbershop_member(p_barbershop_id) then
    raise exception 'Acesso não autorizado a esta barbearia.';
  end if;
  if length(coalesce(trim(p_customer_name), '')) > 100
    or length(coalesce(trim(p_customer_phone), '')) > 30 then
    raise exception 'Os dados do cliente excedem o limite permitido.';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array'
    or jsonb_array_length(p_items) not between 1 and 50 then
    raise exception 'O pedido deve conter de 1 a 50 itens.';
  end if;

  insert into public.orders (barbershop_id, customer_name, customer_phone)
  values (p_barbershop_id, coalesce(trim(p_customer_name), ''), coalesce(trim(p_customer_phone), ''))
  returning id into v_order_id;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    begin
      v_product_id := (v_item ->> 'product_id')::uuid;
      v_quantity := (v_item ->> 'quantity')::integer;
    exception when invalid_text_representation or numeric_value_out_of_range then
      raise exception 'Um item do pedido tem dados inválidos.';
    end;
    if v_quantity not between 1 and 100 then
      raise exception 'A quantidade de cada produto deve estar entre 1 e 100.';
    end if;

    select p.name, p.price into v_product_name, v_unit_price
    from public.products p
    where p.id = v_product_id
      and p.barbershop_id = p_barbershop_id
      and p.active;
    if not found then
      raise exception 'Um produto não pertence a esta barbearia ou está indisponível.';
    end if;

    insert into public.order_items (order_id, product_id, product_name, quantity, unit_price, line_total)
    values (v_order_id, v_product_id, v_product_name, v_quantity, v_unit_price, v_unit_price * v_quantity);
    v_total := v_total + (v_unit_price * v_quantity);
  end loop;

  update public.orders set total = v_total, updated_at = now() where id = v_order_id;
  return v_order_id;
end;
$$;

create or replace function public.set_order_status(p_order_id uuid, p_status text)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
begin
  if auth.uid() is null then
    raise exception 'É necessário entrar para alterar um pedido.';
  end if;
  if p_status is null or p_status not in ('completed', 'cancelled') then
    raise exception 'Status de pedido inválido.';
  end if;

  select * into v_order
  from public.orders o
  where o.id = p_order_id and public.is_barbershop_member(o.barbershop_id)
  for update;
  if not found then
    raise exception 'Pedido não encontrado ou sem permissão.';
  end if;
  if v_order.status = p_status then
    return;
  end if;
  if v_order.status = 'cancelled' or (v_order.status = 'completed' and p_status <> 'cancelled') then
    raise exception 'Esta alteração de status não é permitida.';
  end if;

  update public.orders
  set status = p_status, updated_at = now()
  where id = p_order_id;

  if p_status = 'completed' and v_order.total > 0 then
    insert into public.cash_transactions (
      barbershop_id, entered_by, order_id, kind, category, description, amount, occurred_on
    ) values (
      v_order.barbershop_id, auth.uid(), v_order.id, 'income', 'Venda',
      'Venda do pedido ' || left(v_order.id::text, 8), v_order.total, current_date
    );
  elsif v_order.status = 'completed' and v_order.total > 0 then
    insert into public.cash_transactions (
      barbershop_id, entered_by, order_id, kind, category, description, amount, occurred_on
    ) values (
      v_order.barbershop_id, auth.uid(), v_order.id, 'expense', 'Estorno de venda',
      'Estorno do pedido ' || left(v_order.id::text, 8), v_order.total, current_date
    );
  end if;
end;
$$;

create or replace function public.get_cash_month_summary(p_barbershop_id uuid, p_month date)
returns table(income numeric, expenses numeric)
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_month_start date;
begin
  if auth.uid() is null or not public.is_barbershop_member(p_barbershop_id) then
    raise exception 'Acesso não autorizado a esta barbearia.';
  end if;
  if p_month is null then
    raise exception 'Informe um mês válido.';
  end if;

  v_month_start := date_trunc('month', p_month::timestamp)::date;
  return query
  select
    coalesce(sum(t.amount) filter (where t.kind = 'income'), 0),
    coalesce(sum(t.amount) filter (where t.kind = 'expense'), 0)
  from public.cash_transactions t
  where t.barbershop_id = p_barbershop_id
    and t.occurred_on >= v_month_start
    and t.occurred_on < (v_month_start + interval '1 month')::date;
end;
$$;

revoke all on function public.create_order(uuid, text, text, jsonb) from public;
revoke all on function public.set_order_status(uuid, text) from public;
revoke all on function public.get_cash_month_summary(uuid, date) from public;
grant execute on function public.create_order(uuid, text, text, jsonb) to authenticated;
grant execute on function public.set_order_status(uuid, text) to authenticated;
grant execute on function public.get_cash_month_summary(uuid, date) to authenticated;

drop policy if exists "Members can update shop appointment status" on public.appointments;
create policy "Members can update shop appointment status"
on public.appointments for update to authenticated
using (public.is_barbershop_member(barbershop_id))
with check (public.is_barbershop_member(barbershop_id));
grant update (status) on public.appointments to authenticated;
