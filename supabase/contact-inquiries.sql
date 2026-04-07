-- Contact inquiries table for website contact form submissions
create table if not exists public.contact_inquiries (
  id bigserial primary key,
  inquiry_id text unique,
  name text not null,
  email text not null,
  phone text,
  car_model_interest text,
  message text not null,
  created_at timestamptz not null default now()
);

alter table public.contact_inquiries enable row level security;

-- Admin authenticated users can read inquiries in dashboard via client
drop policy if exists "Allow select for authenticated users" on public.contact_inquiries;
create policy "Allow select for authenticated users"
on public.contact_inquiries
for select
to authenticated
using (true);

-- Optional: allow anon insert only if you choose to post directly from frontend.
-- Server-side inserts with service role do not require this policy.
-- drop policy if exists "Allow anon insert contact inquiries" on public.contact_inquiries;
-- create policy "Allow anon insert contact inquiries"
-- on public.contact_inquiries
-- for insert
-- to anon
-- with check (true);
n p