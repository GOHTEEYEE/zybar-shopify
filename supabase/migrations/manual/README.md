# Manual migration — if SQL Editor times out

Run **one file at a time** in Supabase → SQL → New query. Wait for **Success** before the next.

| Order | File |
|-------|------|
| 1 | `01_cart_sessions.sql` |
| 2 | `02_cart_session_items.sql` |
| 3–5 | `03` … `05_orders_*.sql` |
| 6–9 | `06` … `09_events_*.sql` (optional if step 6 times out) |
| 10 | `../20260702120000_cart_analytics_part2_indexes.sql` |
| 11 | `../20260702120000_cart_analytics_part3_rls.sql` |
| 12 | `../20260702120000_cart_analytics_part4_functions.sql` |

## If Step 1 still times out

This is **not** a SQL problem:

1. Open **Supabase Dashboard** → confirm project is **Active** (not Paused).
2. Click **Connect** in the top bar if shown.
3. Refresh the page, open a **new** query tab.
4. Try **Database → Tables → New table** — if that also fails, fix connection first.
5. Alternative: install CLI and run `supabase link` then `supabase db push` from your machine (no browser timeout).

## If only Step 6+ times out

Your `events` table is large. Skip steps 6–9 for now; cart tracking uses `cart_sessions`. Add event columns later during low traffic.
