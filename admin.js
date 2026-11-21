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
    <span class="acts"><button type="button" class="btn ghost" data-kind="photo" data-id="${p.id}">Delete</button><button type="button" class="btn warn" data-block="photo" data-id="${p.id}">Delete &amp; block</button></span></li>`).join('');
  $('notes').innerHTML = notes.map((n) => `<li>
    <p><i>“${esc(n.body)}”</i><span class="caps">${esc(n.who || 'Anonymous')} · ${when(n.created_at)}</span></p>
    <span class="acts"><button type="button" class="btn ghost" data-kind="note" data-id="${n.id}">Delete</button><button type="button" class="btn warn" data-block="note" data-id="${n.id}">Delete &amp; block</button></span></li>`).join('');
  // posting switch and blocked phones
  const open = await rpc('tg_posting_open', {});
  $('posting').innerHTML = open === null ? '' : `<p>Photo and note posting is <b>${open ? 'open' : 'paused'}</b>.</p>
    <button type="button" class="btn ${open ? 'warn' : ''}" id="toggle" data-open="${open ? 0 : 1}">${open ? 'Pause posting for everyone' : 'Reopen posting'}</button>`;
  const blocked = (await rpc('tg_blocked_list', { p_key: key })) || [];
  $('blocked').innerHTML = blocked.length ? `<h3 class="caps">Blocked phones</h3><ul>${blocked.map((b, i) => `<li><span>Phone ${i + 1} · blocked ${when(b.created_at)}</span>
    <button type="button" class="link" data-unblock="${esc(b.owner_hash)}">Unblock</button></li>`).join('')}</ul>` : '';
}

document.addEventListener('click', async (e) => {
  const t = e.target.closest('#toggle, [data-unblock], [data-block]');
  if (t && t.id === 'toggle') {
    const open = t.dataset.open === '1';
    if (!confirm(open ? 'Reopen photo and note posting for everyone?' : 'Pause photo and note posting for everyone? Nothing already posted is removed.')) return;
    toast((await rpc('tg_set_posting', { p_open: open, p_key: key })) ? (open ? 'Posting is open.' : 'Posting is paused.') : 'That didn’t work.');
    return load();
  }
  if (t && t.dataset.unblock) {
    if (!confirm('Unblock this phone? It will be able to post again.')) return;
    toast((await rpc('tg_unblock', { p_hash: t.dataset.unblock, p_key: key })) ? 'Unblocked.' : 'That didn’t work.');
    return load();
  }
  if (t && t.dataset.block) {
    if (!confirm('Delete this, delete everything else this phone posted, and block it from posting again?')) return;
    t.disabled = true; t.textContent = 'Blocking…';
    const n = await rpc('tg_block', { p_table: t.dataset.block, p_id: t.dataset.id, p_key: key });
    toast(n === null || n < 0 ? 'That didn’t work.' : `Blocked. ${n} ${n === 1 ? 'post' : 'posts'} removed.`);
    return load();
  }
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
