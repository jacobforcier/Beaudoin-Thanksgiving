/* Shared settings for the sign-up page and TV mode. The key is Supabase's public (anon) key; access is limited by row-level security. */
const SB_URL = 'https://jkgsytjstauxstiabhwz.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImprZ3N5dGpzdGF1eHN0aWFiaHd6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA2MDI2ODAsImV4cCI6MjEwNjE3ODY4MH0.M8OzkHtXxaqGddAfmN26F2it1P-kIgttIUXWBHzgi1g';
const ADDRESS = '1 Leonard Lane, Wilmington, MA 01887';
const ARRIVE = Date.UTC(2026, 10, 26, 18, 30); // 1:30 pm Eastern
const LAT = 42.5465, LON = -71.1737;
const DAY = { y: 2026, m: 11, d: 26 }; // Thanksgiving, Eastern time

/* A private random key for this phone. It never leaves the phone except to prove ownership when removing
   something; the database only ever stores its SHA-256 fingerprint. */
function deviceKey() {
  let k = null;
  try { k = localStorage.getItem('tgKey'); } catch {}
  if (!k) {
    k = Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => b.toString(16).padStart(2, '0')).join('');
    try { localStorage.setItem('tgKey', k); } catch {}
  }
  return k;
}
async function fingerprint(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}
// Ask the database to remove a photo or note; it checks the key against the owner (or an admin).
async function removeItem(kind, id, key = deviceKey()) {
  const r = await fetch(`${SB_URL}/rest/v1/rpc/tg_remove`, {
    method: 'POST', headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_table: kind, p_id: id, p_key: key }),
  }).catch(() => null);
  return !!(r && r.ok && (await r.json().catch(() => false)) === true);
}
