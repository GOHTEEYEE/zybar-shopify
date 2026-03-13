# ZYBAR Analytics & Admin Dashboard

## Verification (current state)

- **Supabase URL**: `https://haebgpoowyrsufhqfexw.supabase.co` (set in `admin/config.js`, `admin/index.html`, and all pages that use analytics).
- **Anon key**: Set in `admin/config.js`, `admin/index.html`, `index.html`, `collections/all/index.html`, and each `products/*/index.html`. The admin client is created in `admin/config.js` after the Supabase script loads.
- **Authorization**: RLS in `supabase/schema.sql` allows:
  - **Anonymous**: INSERT only into `sessions`, `events`, `page_views`.
  - **Authenticated admin** (user with `profiles.role = 'admin'`): SELECT on `profiles`, `sessions`, `events`, `page_views`, `products`.
  - **Profiles**: Users can read own profile; admins can read all. Trigger `on_auth_user_created` creates a profile on signup (default role `user`).

**You still need to (in Supabase Dashboard):**
1. Run `supabase/schema.sql` in the SQL Editor if you haven’t already.
2. Create a user in **Authentication → Users** (or sign up via the admin login form).
3. In **Table Editor → profiles**, set `role` = `admin` for that user’s row (or ensure the trigger/metadata sets it).

---

## 1. Supabase setup

1. Create a project at [supabase.com](https://supabase.com).
2. In the SQL Editor, run the contents of `supabase/schema.sql` to create tables, RLS policies, and the trigger.
3. In Authentication > Users, create an admin user (or sign up via your app).
4. In Table Editor, open `profiles` and set `role` = `admin` for that user (or set `role` in user metadata when signing up).

## 2. Site tracking (analytics.js)

1. In `index.html` (and any other pages that include the script), set:
   - `window.ZYBAR_ANALYTICS_URL` = your Supabase project URL (e.g. `https://xxxx.supabase.co`)
   - `window.ZYBAR_ANALYTICS_ANON_KEY` = your Supabase anon/public key
2. The script loads with `async` so it does not block page load.
3. It records: page views, product views (on `/products/:slug`), add-to-cart clicks (elements with `data-analytics-add-to-cart` and `data-product-id`), and session start (visitor_id in localStorage, session resets after 30 min inactivity).

## 3. Admin dashboard

1. Open `/admin/` (e.g. `http://localhost:3000/admin/`).
2. URL and anon key are set in `admin/config.js` and `admin/index.html` (same project as analytics).
3. Sign in with an account that has `role = 'admin'` in the `profiles` table.
4. Use the sidebar: **Dashboard** (overview stats), **Analytics** (charts), **Products** (product-level analytics).

## Files

- `supabase/schema.sql` – run once in Supabase SQL Editor
- `js/analytics.js` – frontend tracking (include on every page with config)
- `admin/index.html` – admin app shell and login
- `admin/dashboard.js` – dashboard overview
- `admin/analytics.js` – analytics charts (Chart.js)
- `admin/products.js` – product analytics table
- `admin/auth.js` – auth check and admin-only redirect
- `admin/router.js` – hash routing
- `admin/styles.css` – admin layout and components

## Security

- Only users with `profiles.role = 'admin'` can read analytics data (enforced by RLS).
- Anonymous users can only INSERT into `page_views`, `events`, and `sessions`.
- Non-admin authenticated users are redirected to `/` when visiting `/admin`.
