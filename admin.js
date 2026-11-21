/* Hosts' page: see every photo and thankful note, and remove anything.
   Unlocked by opening the private link (admin.html#k=...) once on a phone; the key is then kept on that
   phone only and removed from the address bar. The database checks the key's fingerprint on every removal. */
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const H = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` };
let toastT;
function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 3200); }

const fromLink = new URLSearchParams(location.hash.slice(1)).get('k');
if (fromLink) {
  try { localStorage.setItem('tgAdmin', fromLink); } catch {}
  history.replaceState(null, '', location.pathname); // keep the key out of the address bar and history
}
let key = null;
try { key = localStorage.getItem('tgAdmin'); } catch {}

const when = (t) => new Date(t).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' });

async function rpc(name, body) {
  const r = await fetch(`${SB_URL}/rest/v1/rpc/${name}`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
  return r && r.ok ? r.json() : null;
}

async function load() {
  const [photos, notes] = await Promise.all([
    fetch(`${SB_URL}/rest/v1/tg_photos?select=id,path,who,caption,created_at&order=created_at.desc`, { headers: H }).then((r) => r.json()).catch(() => []),
    fetch(`${SB_URL}/rest/v1/tg_thanks?select=id,body,who,created_at&order=created_at.desc`, { headers: H }).then((r) => r.json()).catch(() => []),
  ]);
  $('photoCount').textContent = photos.length ? `${photos.length} on the TV` : 'None yet';
  $('noteCount').textContent = notes.length ? `${notes.length} on the TV` : 'None yet';
  $('photos').innerHTML = photos.map((p) => `<li>
    <a href="${esc(`${SB_URL}/storage/v1/object/public/tg-photos/${p.path}`)}" target="_blank" rel="noopener"><img src="${esc(`${SB_URL}/storage/v1/object/public/tg-photos/${p.path}`)}" alt="" loading="lazy"></a>
    <p>${p.caption ? `<i>${esc(p.caption)}</i>` : ''}<span class="caps">${esc(p.who || 'No name')} · ${when(p.created_at)}</span></p>
    <button type="button" class="btn warn" data-kind="photo" data-id="${p.id}">Delete</button></li>`).join('');
  $('notes').innerHTML = notes.map((n) => `<li>
    <p><i>“${esc(n.body)}”</i><span class="caps">${esc(n.who || 'Anonymous')} · ${when(n.created_at)}</span></p>
    <button type="button" class="btn warn" data-kind="note" data-id="${n.id}">Delete</button></li>`).join('');
}

document.addEventListener('click', async (e) => {
  const b = e.target.closest('button[data-id]');
  if (!b) return;
  if (!confirm(b.dataset.kind === 'photo' ? 'Delete this photo? It comes off the TV right away.' : 'Delete this note? It comes off the TV right away.')) return;
  b.disabled = true; b.textContent = 'Deleting…';
  const ok = await removeItem(b.dataset.kind, b.dataset.id, key);
  toast(ok ? 'Deleted.' : 'That didn’t work. Is this phone still unlocked?');
  load();
});
$('forget').addEventListener('click', () => {
  if (!confirm('Lock this phone? You’ll need the private link again to get back in.')) return;
  try { localStorage.removeItem('tgAdmin'); } catch {}
  location.reload();
});

(async () => {
  const ok = key && (await rpc('tg_is_admin', { p_key: key })) === true;
  if (!ok) {
    $('adminStatus').textContent = 'This page is for the hosts. Open your private link on this phone to unlock it.';
    return;
  }
  $('adminStatus').textContent = 'This phone can see and remove every photo and note.';
  $('adminMain').hidden = false;
  load();
  let t;
  live(['tg_photos', 'tg_thanks'], () => { clearTimeout(t); t = setTimeout(load, 300); }, { presence: { kind: 'admin' } });
})();
