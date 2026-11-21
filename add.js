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
$('pFile').addEventListener('change', () => {
  const f = $('pFile').files[0];
  if (!f) return;
  $('pPreview').src = URL.createObjectURL(f); $('pPreview').hidden = false; $('pPrompt').hidden = true;
});
$('photoForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = $('pFile').files[0];
  if (!f) return toast('Choose a photo first.');
  const btn = $('pSend'); btn.disabled = true; btn.textContent = 'Sending…';
  try {
    const blob = await shrink(f);
    const path = `thursday/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
    const up = await fetch(`${SB_URL}/storage/v1/object/tg-photos/${path}`, { method: 'POST', headers: { ...H, 'Content-Type': 'image/jpeg' }, body: blob });
    if (!up.ok) throw new Error('upload ' + up.status);
    const who = $('pWho').value.trim() || null;
    const row = await fetch(`${SB_URL}/rest/v1/tg_photos`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, who, caption: $('pCaption').value.trim() || null }) });
    if (!row.ok) throw new Error('row ' + row.status);
    if (who) store.set('tgName', who);
    e.target.reset(); $('pWho').value = who || '';
    $('pPreview').hidden = true; $('pPrompt').hidden = false;
    toast('It’s on the TV. Merci!');
  } catch {
    toast('That photo didn’t send. Please try again.');
  }
  btn.disabled = false; btn.textContent = 'Put it on the TV';
});

/* ---------- thankful note ---------- */
const grow = () => { const t = $('tBody'); t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; };
$('tBody').addEventListener('input', grow);
$('noteForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = $('tBody').value.trim();
  if (!body) return;
  const who = $('tWho').value.trim() || null;
  const r = await fetch(`${SB_URL}/rest/v1/tg_thanks`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ body, who }) }).catch(() => null);
  if (!r || !r.ok) return toast('That didn’t save. Please try again.');
  if (who) store.set('tgName', who);
  $('tBody').value = ''; grow();
  toast('It’s on the TV. Merci!');
});
