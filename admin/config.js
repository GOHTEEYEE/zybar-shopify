/**
 * Admin dashboard - Supabase config
 * URL and anon key; creates the Supabase client.
 * Admin login code is managed from Supabase table public.admin_codes.
 */
window.ADMIN_SUPABASE_URL = window.ADMIN_SUPABASE_URL || 'https://haebgpoowyrsufhqfexw.supabase.co';
window.ADMIN_SUPABASE_ANON_KEY = window.ADMIN_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhhZWJncG9vd3lyc3VmaHFmZXh3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxODgwNTMsImV4cCI6MjA4ODc2NDA1M30.pMmj4-9-s7sAlYBIVm6ZU-ixxRa4aiBUyPTM9XOlnXQ';
/** Optional local fallback code. Keep empty to enforce Supabase admin_codes only. */
window.ADMIN_CODE = window.ADMIN_CODE || '';

/** Set to true to require entering the admin code on every page load/refresh (no session persistence). Default: false. */
window.ADMIN_REQUIRE_LOGIN_EVERY_TIME = window.ADMIN_REQUIRE_LOGIN_EVERY_TIME || false;

(function () {
  var url = window.ADMIN_SUPABASE_URL;
  var key = window.ADMIN_SUPABASE_ANON_KEY;
  var lib = window.supabase;
  if (url && key && key !== 'PASTE_ANON_KEY_HERE' && lib && typeof lib.createClient === 'function') {
    window.supabase = lib.createClient(url, key);
  }
})();
