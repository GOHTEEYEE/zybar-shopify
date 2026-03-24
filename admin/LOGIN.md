# Admin login: ZYBAR vs ZYBAR.MY

## Terminal: which server to run

| Environment | Command | URL | Admin login |
|-------------|---------|-----|-------------|
| **ZYBAR** (production) | `npm run dev` | http://localhost:3000 | Email + admin code |
| **ZYBAR.MY** (test) | `npm run dev:test` | http://localhost:3001 | No login |

- **ZYBAR**: one terminal runs `npm run dev`. Open http://localhost:3000 and go to `/admin/` to sign in with email + code.
- **ZYBAR.MY**: one terminal runs `npm run dev:test`. Open http://localhost:3001 (redirects to `?env=zybar.my`). Go to http://localhost:3001/admin/ — no login.

**Windows (PowerShell)** — for zybar.my test server:
```powershell
$env:PORT=3001; $env:ZYBAR_MY=1; node server.js
```

---

## ZYBAR (production / real data)

1. **Open the admin**
   - Go to: `https://your-site.com/admin/`  
   - Or locally: `http://localhost:3000/admin/`

2. **Sign in**
   - **Email**: Your admin email (e.g. `you@example.com`).
   - **Admin code**: A one-time code from the Supabase `admin_codes` table.

3. **Where the code comes from**
   - In **Supabase** → SQL Editor, run the script in `supabase/admin_codes.sql` if you haven’t already (creates the table and `validate_and_use_admin_code` function).
   - Insert a code, e.g.:
     ```sql
     INSERT INTO public.admin_codes (code) VALUES ('YOUR-SECRET-CODE') ON CONFLICT (code) DO NOTHING;
     ```
   - Use that exact code on the login form. The first successful login ties the code to the email you enter; the same email can log in again with the same code later.

4. **After login**
   - You stay logged in for the browser session (sessionStorage).  
   - To require login on every visit, set `window.ADMIN_REQUIRE_LOGIN_EVERY_TIME = true` in `admin/config.js`.

---

## ZYBAR.MY (test / virtual data)

1. **Turn on test mode**
   - Open the main site with: `?env=zybar.my`  
   - Example: `http://localhost:3000/?env=zybar.my`  
   - You should see the black banner: **ZYBAR.MY - TESTING ENVIRONMENT (VIRTUAL DATA ONLY**.

2. **Open the admin**
   - Go to: `http://localhost:3000/admin/`  
   - Or use “Back to site” then the main nav; the “Back to site” link in test mode points to `/?env=zybar.my`.

3. **No login**
   - There is no login form. You are taken straight to the Dashboard with virtual data (no Supabase, no admin code).

4. **Turn off test mode**
   - Click **“Exit test mode”** in the top black bar, or close all tabs and open the site again without `?env=zybar.my`.

---

## Quick reference

|                | ZYBAR (production)     | ZYBAR.MY (test)        |
|----------------|-------------------------|-------------------------|
| **URL**        | `/admin/`               | `/?env=zybar.my` then `/admin/` |
| **Login**      | Email + admin code      | None                    |
| **Data**       | Real (Supabase)         | Virtual (mock)          |
| **Banner**     | No                      | Yes (black bar)        |
