-- Product reviews table for PDP review widgets
-- Run this in Supabase SQL Editor.

create table if not exists public.product_reviews (
  id bigserial primary key,
  product_slug text not null,
  product_name text not null,
  customer_name text not null,
  rating smallint not null check (rating between 1 and 5),
  review_text text not null,
  image_data_url text,
  status text not null default 'approved' check (status in ('pending', 'approved', 'rejected')),
  source text not null default 'website',
  created_at timestamptz not null default now()
);

create index if not exists idx_product_reviews_slug_status_created
  on public.product_reviews (product_slug, status, created_at desc);

create index if not exists idx_product_reviews_created_at
  on public.product_reviews (created_at desc);

alter table public.product_reviews enable row level security;

drop policy if exists "Public can read approved product reviews" on public.product_reviews;
create policy "Public can read approved product reviews"
on public.product_reviews
for select
to anon, authenticated
using (status = 'approved');

drop policy if exists "Admins can manage product reviews" on public.product_reviews;
create policy "Admins can manage product reviews"
on public.product_reviews
for all
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
);
