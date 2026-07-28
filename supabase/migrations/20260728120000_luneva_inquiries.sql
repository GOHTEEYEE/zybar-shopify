-- LUNEVA contact / inquiry form submissions
create table if not exists public.luneva_inquiries (
  id bigserial primary key,
  inquiry_id text unique not null,
  name text not null,
  email text not null,
  phone text,
  topic text,
  kit_interest text,
  order_number text,
  message text not null,
  page_url text,
  visitor_id text,
  status text not null default 'new',
  created_at timestamptz not null default now()
);

create index if not exists luneva_inquiries_created_at_idx
  on public.luneva_inquiries (created_at desc);

alter table public.luneva_inquiries enable row level security;

drop policy if exists "Allow select luneva inquiries for authenticated" on public.luneva_inquiries;
create policy "Allow select luneva inquiries for authenticated"
on public.luneva_inquiries
for select
to authenticated
using (true);
