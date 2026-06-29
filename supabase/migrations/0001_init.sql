-- 冰箱救星 Fridge Saver — 初始資料表 + RLS
-- Supabase / PostgreSQL

create extension if not exists "pgcrypto";

-- ── households（家庭共享冰箱）──────────────
create table if not exists public.households (
  id         uuid primary key default gen_random_uuid(),
  name       text,
  owner_id   uuid,
  created_at timestamptz not null default now()
);

-- ── users ─────────────────────────────────
create table if not exists public.users (
  id           uuid primary key default gen_random_uuid(),
  line_user_id text unique,
  email        text,
  plan         text not null default 'free'
                 check (plan in ('free','pro','family')),
  household_id uuid references public.households(id) on delete set null,
  created_at   timestamptz not null default now()
);

alter table public.households
  add constraint households_owner_fk
  foreign key (owner_id) references public.users(id) on delete set null;

-- ── items（食材）──────────────────────────
create table if not exists public.items (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name         text not null,
  category     text,            -- 蔬菜/肉類/海鮮/乳製品/蛋/熟食/調味/其他
  qty          numeric(10,2),
  unit         text,
  bought_date  date default current_date,
  expire_date  date,
  image_url    text,
  status       text default 'fresh' check (status in ('fresh','soon','expired')),
  notified     boolean not null default false,
  created_at   timestamptz not null default now()
);
create index if not exists idx_items_household on public.items(household_id);
create index if not exists idx_items_expire    on public.items(expire_date);

-- ── recipes（AI 生成食譜快取）──────────────
create table if not exists public.recipes (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  title        text,
  used_items   text[] default '{}',
  ingredients  jsonb,
  steps        jsonb,
  created_at   timestamptz not null default now()
);
create index if not exists idx_recipes_household on public.recipes(household_id);

-- ── notifications ─────────────────────────
create table if not exists public.notifications (
  id       uuid primary key default gen_random_uuid(),
  user_id  uuid not null references public.users(id) on delete cascade,
  type     text not null,       -- 'expiry' | 'recipe'
  payload  jsonb,
  channel  text,                -- 'line' | 'email' | 'web'
  sent_at  timestamptz not null default now()
);
create index if not exists idx_notifications_user on public.notifications(user_id);

-- ── Row Level Security ────────────────────
alter table public.households    enable row level security;
alter table public.users         enable row level security;
alter table public.items         enable row level security;
alter table public.recipes       enable row level security;
alter table public.notifications enable row level security;

-- 取得目前使用者所屬 household
create or replace function public.current_household() returns uuid
language sql stable as $$
  select household_id from public.users where id = auth.uid()
$$;

-- users 只能讀寫自己
create policy "users self" on public.users
  for all using (id = auth.uid()) with check (id = auth.uid());

-- households：屬於該家庭的成員可讀；owner 可寫
create policy "household members read" on public.households
  for select using (id = public.current_household());
create policy "household owner write" on public.households
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- items / recipes：限同一 household
create policy "items household" on public.items
  for all using (household_id = public.current_household())
  with check (household_id = public.current_household());

create policy "recipes household" on public.recipes
  for all using (household_id = public.current_household())
  with check (household_id = public.current_household());

-- notifications 只能讀自己
create policy "notifications owner" on public.notifications
  for select using (user_id = auth.uid());
