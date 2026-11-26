/* "Add yours": the page the TV's QR code opens. Sends a photo or a thankful note straight to TV mode. */
const $ = (id) => document.getElementById(id);
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
};
const H = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` };
let toastT;
function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 3600); }
const name = store.get('tgName') || '';
$('pWho').value = name; $('tWho').value = name;

/* ---------- is posting open for this phone? (paused by the hosts, or this phone was blocked) ---------- */
async function canPost() {
  const r = await fetch(`${SB_URL}/rest/v1/rpc/tg_can_post`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_hash: await fingerprint(deviceKey()) }) }).catch(() => null);
  if (!r || !r.ok) return true; // if the check itself is unavailable, let the database decide
  return (await r.json().catch(() => true)) !== false;
}
function showClosed() {
  document.body.classList.add('is-closed');
  $('closed').hidden = false;
}
canPost().then((ok) => { if (!ok) showClosed(); });

/* ---------- photos are for the day itself: Thanksgiving 6 a.m. Eastern through the end of Friday ----------
   Thankful notes stay open all week. A phone unlocked with the hosts' link can post photos any time. */
const PHOTOS_OPEN = Date.UTC(2026, 10, 26, 11), PHOTOS_CLOSE = Date.UTC(2026, 10, 28, 5);
(async function photoWindow() {
  const now = Date.now();
  if (now >= PHOTOS_OPEN && now < PHOTOS_CLOSE) return;
  let host = false;
  try { const k = localStorage.getItem('tgAdmin'); if (k) {
    const r = await fetch(`${SB_URL}/rest/v1/rpc/tg_is_admin`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_key: k }) });
    host = r.ok && (await r.json()) === true;
  } } catch {}
  const soon = $('photoSoon');
  if (host) {
    soon.innerHTML = '<p class="sub">Photos open for everyone on Thanksgiving morning. This phone is unlocked for the hosts, so you can post now.</p>';
  } else {
    $('photoForm').hidden = true;
    soon.innerHTML = now < PHOTOS_OPEN
      ? '<p class="soon-big">Photos open Thanksgiving morning.</p><p class="sub">In the meantime, add what you’re thankful for below.</p>'
      : '<p class="soon-big">Photos are closed now.</p><p class="sub">Thank you for sharing the day. Happy Thanksgiving!</p>';
  }
  soon.hidden = false;
})();

/* ---------- photo ---------- */
// Shrink to at most 1600px and re-encode as JPEG on the phone: uploads stay small and the photo's
// location data (EXIF) never leaves the phone.
async function shrink(file) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => createImageBitmap(file));
  const s = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise((res, rej) => c.toBlob((b) => b ? res(b) : rej(new Error('encode')), 'image/jpeg', 0.84));
}
const MAX = 10;
let picked = [];
function showPicked() {
  const pick = $('pick');
  $('pThumbs').querySelectorAll('img').forEach((im) => URL.revokeObjectURL(im.src));
  $('pThumbs').innerHTML = picked.map((f) => `<img src="${URL.createObjectURL(f)}" alt="">`).join('');
  $('pThumbs').classList.toggle('one', picked.length === 1);
  pick.classList.toggle('has', picked.length > 0);
  $('pCount').textContent = picked.length > 1 ? `${picked.length} photos chosen · tap the box to change` : picked.length ? 'Tap the photo to change it' : '';
  $('pSend').textContent = picked.length > 1 ? `Put all ${picked.length} on the TV` : 'Put it on the TV';
}
$('pFile').addEventListener('change', () => {
  picked = [...$('pFile').files].filter((f) => f.type.startsWith('image/') || !f.type).slice(0, MAX);
  if ($('pFile').files.length > MAX) toast(`Up to ${MAX} at a time. The first ${MAX} are ready to send.`);
  showPicked();
});
$('photoForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!picked.length) return toast('Choose a photo first.');
  const btn = $('pSend'); btn.disabled = true;
  const who = $('pWho').value.trim() || null, caption = $('pCaption').value.trim() || null;
  const sent = []; let closedNow = false;
  for (let i = 0; i < picked.length; i++) {
    btn.textContent = picked.length > 1 ? `Sending ${i + 1} of ${picked.length}…` : 'Sending…';
    try {
      const blob = await shrink(picked[i]);
      const path = `thursday/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
      const up = await fetch(`${SB_URL}/storage/v1/object/tg-photos/${path}`, { method: 'POST', headers: { ...H, 'Content-Type': 'image/jpeg' }, body: blob });
      if (!up.ok) throw new Error('upload ' + up.status);
      const row = await fetch(`${SB_URL}/rest/v1/tg_photos`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify({ path, who, caption, owner_hash: await fingerprint(deviceKey()) }) });
      if (row.status === 401 || row.status === 403) { closedNow = true; break; }
      if (!row.ok) throw new Error('row ' + row.status);
      const [saved] = await row.json();
      remember('photo', saved);
      sent.push(URL.createObjectURL(blob));
    } catch { /* keep going; report below */ }
  }
  btn.disabled = false;
  if (closedNow && !sent.length) { showClosed(); return; }
  const failed = picked.length - sent.length;
  if (!sent.length) { showPicked(); return toast('Those didn’t send. Please try again.'); }
  if (who) store.set('tgName', who);
  // clear the form completely before showing the thank-you
  picked = []; $('pFile').value = ''; $('pCaption').value = ''; showPicked();
  celebrate({ who, imgs: sent, msg: (sent.length > 1 ? `Your ${sent.length} photos are on the TV.` : 'Your photo is on the TV.') + (failed ? ` ${failed} didn’t make it, so try ${failed > 1 ? 'those' : 'that one'} again.` : '') });
});

/* ---------- thankful note ---------- */
const grow = () => { const t = $('tBody'); t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; };
$('tBody').addEventListener('input', grow);
$('noteForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = $('tBody').value.trim();
  if (!body) return;
  const who = $('tWho').value.trim() || null;
  const r = await fetch(`${SB_URL}/rest/v1/tg_thanks`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify({ body, who, owner_hash: await fingerprint(deviceKey()) }) }).catch(() => null);
  if (r && (r.status === 401 || r.status === 403)) return showClosed();
  if (!r || !r.ok) return toast('That didn’t save. Please try again.');
  const [saved] = await r.json().catch(() => [null]);
  if (saved) remember('note', saved);
  if (who) store.set('tgName', who);
  $('tBody').value = ''; grow();
  celebrate({ who, quote: body, msg: 'Your words are on the TV.' });
});

/* ---------- the "Merci!" card after something is sent ---------- */
function celebrate({ who, imgs = [], quote, msg }) {
  $('doneTitle').textContent = who ? `Merci, ${who}!` : 'Merci!';
  $('donePhotos').className = 'tc-photos n' + Math.min(imgs.length, 4);
  $('donePhotos').innerHTML = imgs.slice(0, 4).map((src) => `<img src="${src}" alt="">`).join('');
  $('doneQuote').hidden = !quote; $('doneQuote').textContent = quote || '';
  $('doneMsg').textContent = msg;
  $('done').hidden = false;
  requestAnimationFrame(() => $('done').classList.add('show'));
  $('doneAgain').focus();
}
$('doneAgain').addEventListener('click', () => {
  $('done').classList.remove('show');
  setTimeout(() => { $('done').hidden = true; }, 300);
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

/* ---------- "Sent from this phone": take back anything posted by accident ---------- */
const mine = () => { try { return JSON.parse(store.get('tgSent') || '[]'); } catch { return []; } };
function remember(kind, row) {
  if (!row || !row.id) return;
  store.set('tgSent', JSON.stringify([{ kind, id: row.id, path: row.path || null, body: row.body || null }, ...mine()].slice(0, 60)));
  renderMine();
}
function renderMine() {
  const list = mine();
  $('mine').hidden = !list.length;
  $('mineList').innerHTML = list.map((m) => `<li data-id="${m.id}">${m.kind === 'photo'
    ? `<img src="${SB_URL}/storage/v1/object/public/tg-photos/${m.path}" alt="">`
    : `<span class="q">“${String(m.body).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))}”</span>`}
    <button type="button" class="link" data-kind="${m.kind}" data-id="${m.id}">Remove</button></li>`).join('');
}
$('mineList').addEventListener('click', async (e) => {
  const b = e.target.closest('button[data-id]');
  if (!b) return;
  if (!confirm(b.dataset.kind === 'photo' ? 'Take this photo off the TV?' : 'Take this note off the TV?')) return;
  b.disabled = true; b.textContent = 'Removing…';
  const ok = await removeItem(b.dataset.kind, b.dataset.id);
  // if it's already gone (removed elsewhere), forget it too
  store.set('tgSent', JSON.stringify(mine().filter((m) => m.id !== b.dataset.id)));
  renderMine();
  toast(ok ? 'Removed. It’s off the TV.' : 'Removed from this list.');
});
renderMine();

/* ---------- today's table poll, at the top (it's what the TV's QR code leads to) ---------- */
const pollFeed = live([], () => {}, { onBroadcast: (ev) => { if (ev === 'vote') pollCard.refresh(); } });
const pollCard = pollWidget($('pollCard'), (pl) => pollFeed.broadcast('vote', { poll: pl.id }));
