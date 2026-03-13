#!/usr/bin/env node
/**
 * Set a user as admin in public.profiles (bypasses RLS with service role).
 * Usage: SUPABASE_URL=https://xxx.supabase.co SUPABASE_SERVICE_ROLE_KEY=eyJ... node scripts/set-admin.js
 * Get service role key: Supabase Dashboard → Project Settings → API → service_role (secret)
 */
const userId = '67f8cf34-885c-4d73-aa9a-7611761d6688';
const url = process.env.SUPABASE_URL || 'https://haebgpoowyrsufhqfexw.supabase.co';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!key) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY. Set it from Supabase Dashboard → Settings → API → service_role (secret).');
  process.exit(1);
}

const apiUrl = `${url.replace(/\/$/, '')}/rest/v1/profiles?id=eq.${userId}`;
fetch(apiUrl, {
  method: 'PATCH',
  headers: {
    'Content-Type': 'application/json',
    'apikey': key,
    'Authorization': `Bearer ${key}`,
    'Prefer': 'return=minimal',
  },
  body: JSON.stringify({ role: 'admin' }),
})
  .then((res) => {
    if (!res.ok) {
      return res.text().then((t) => {
        throw new Error(`HTTP ${res.status}: ${t}`);
      });
    }
    console.log('Done. User', userId, 'is now admin. Sign in again.');
  })
  .catch((err) => {
    console.error(err.message || err);
    process.exit(1);
  });
