/* TV mode: a slow, live slideshow for the living-room screen on Thursday.
   Slides: the invitation, who's here, then photos and thankful notes taking turns. */
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pretty = (s) => String(s ?? '').replace(/'/g, '’');
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const spell = (n) => n < 20 ? ONES[n] : n < 100 ? TENS[Math.floor(n / 10)] + (n % 10 ? '-' + ONES[n % 10] : '') : String(n);
const COURSES = ['host', 'sides', 'desserts', 'extras'];
const SECONDS = { title: 14, guests: 14, quote: 11, photo: 10, poll: 15, mosaic: 15 };
const PHOTO_URL = (path) => `${SB_URL}/storage/v1/object/public/tg-photos/${path}`;

const H = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` };
const get = (t, q) => fetch(`${SB_URL}/rest/v1/${t}?${q}`, { headers: H }).then((r) => r.ok ? r.json() : Promise.reject(r.status));
let data = { dishes: [], signups: [], rsvps: [], thanks: [], photos: [] };

async function load() {
  try {
    const [dishes, signups, rsvps, thanks, photos] = await Promise.all([
      get('tg_dishes', 'select=*&order=sort,created_at'), get('tg_signups', 'select=*&order=created_at'),
      get('tg_rsvps', 'select=*&order=created_at'), get('tg_thanks', 'select=*&order=created_at.desc'),
      get('tg_photos', 'select=*&order=created_at.desc').catch(() => []),
    ]);
    photos.slice(0, 40).forEach((p) => { const im = new Image(); im.src = PHOTO_URL(p.path); }); // preload so slides never pop in
    const shown = dishes.filter((d) => COURSES.includes(d.category) && !/specialty/i.test(d.name));
    data = { dishes: shown, signups: signups.filter((s) => shown.some((d) => d.id === s.dish_id)), rsvps, thanks, photos };
    build();
  } catch { setTimeout(load, 10000); }
}

/* ---------- slides ---------- */
function etToday() {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(new Date()).map((x) => [x.type, x.value]));
  return Math.round((Date.UTC(DAY.y, DAY.m - 1, DAY.d) - Date.UTC(+p.year, +p.month - 1, +p.day)) / 86400e3);
}
function slides() {
  const { dishes, signups, rsvps, thanks } = data, out = [];
  const days = etToday();
  out.push({ kind: 'title', html: `<p class="eyebrow">The Beaudoin Family</p><hr class="rule"><h1>Thanksgiving</h1>
    <p class="big">${days === 0 ? 'Happy Thanksgiving' : 'Thursday, November 26, 1 pm'} · at Danny &amp; Barb’s</p>
    <p class="soft">${days > 1 ? `${cap(spell(days))} days to go` : days === 1 ? 'Tomorrow' : 'So glad you’re here'}</p>` });
  const n = rsvps.reduce((s, r) => s + r.adults + r.kids, 0);
  if (rsvps.length) out.push({ kind: 'guests', html: `<p class="kicker">Around the table</p><h2>${cap(spell(n))} at the table</h2>
    <div class="cards">${rsvps.map((r) => `<div class="pc"><b>${esc(r.family)}</b><span class="caps">party of ${r.adults + r.kids}</span></div>`).join('')}</div>` });
  // photos and notes take turns so neither crowds out the other
  const notes = thanks.slice(0, 24).map((t) => ({ kind: 'quote', id: t.id, html: `<p class="kicker">Thankful for</p>
    <blockquote class="quote ${t.body.length > 70 ? 'long' : ''}">${esc(t.body)}</blockquote><p class="caps by">${t.who ? esc(t.who) : 'Anonymous'}</p>` }));
  const pics = data.photos.slice(0, 40).map((p, k) => ({ kind: 'photo', id: p.id, html: `<figure class="photo"><div class="print" style="--kx:${[-3, 3, -2, 2][k % 4]}%;--ky:${[-2, 2, 3, -3][k % 4]}%"><img src="${esc(PHOTO_URL(p.path))}" alt=""></div>
    <figcaption>${p.caption ? `<span class="cap">${esc(p.caption)}</span>` : ''}${p.who ? `<span class="caps">${esc(p.who)}</span>` : ''}</figcaption></figure>` }));
  if (!notes.length && !pics.length) out.push({ kind: 'quote', html: `<p class="kicker">Thankful for</p><h2>What are you thankful for?</h2><p class="soft">Scan the code in the corner to add a photo or a few words.</p>` });
  const mix = [];
  for (let i = 0; i < Math.max(notes.length, pics.length); i++) { if (pics[i]) mix.push(pics[i]); if (notes[i]) mix.push(notes[i]); }
  // weave in the table poll and, once there are a few photos, the "so far" mosaic
  const pollSlide = (k) => pollState && { kind: 'poll', id: 'poll' + k, html: pollHtml() };
  const mosaic = (k) => data.photos.length >= 3 && { kind: 'mosaic', id: 'mosaic' + k, html: mosaicHtml() };
  let k = 0;
  if (pollSlide(k)) out.push(pollSlide(k++));
  mix.forEach((s, i) => {
    out.push(s);
    if ((i + 1) % 8 === 0 && mosaic(i)) out.push(mosaic(i));
    else if ((i + 1) % 4 === 0 && pollSlide(k)) out.push(pollSlide(k++));
  });
  if (mix.length % 8 !== 0 && mosaic('end')) out.push(mosaic('end'));
  return out;
}

/* ---------- table poll + "so far" mosaic ---------- */
let pollState = null;
async function refreshPoll() {
  if (typeof pollIsLive !== 'function' || !pollIsLive()) { pollState = null; return; }
  const poll = activePoll();
  pollState = { poll, res: await pollResults(poll) };
  build();
}
function pollHtml() {
  const { poll, res } = pollState;
  return `<p class="kicker">Table poll</p><h2>${esc(poll.q)}</h2>
    <div class="tv-bars">${pollBars(poll, res, null)}</div>
    <p class="soft">${res.total ? `${res.total} ${res.total === 1 ? 'vote' : 'votes'} so far · ` : ''}Vote on your phone: scan the code in the corner</p>`;
}
function mosaicHtml() {
  const ph = data.photos.slice(0, 30), n = ph.length;
  const cols = Math.ceil(Math.sqrt(n * 1.9)), rows = Math.ceil(n / cols);
  return `<p class="kicker">The day so far</p><h2>Thanksgiving, so far</h2>
    <div class="mosaic" style="--cols:${cols};width:min(100%,calc(36vh * ${cols} / ${rows}))">
    ${ph.map((p, i) => `<img src="${esc(PHOTO_URL(p.path))}" alt="" style="--d:${(i * 0.09).toFixed(2)}s;--r:${[-2, 1.5, -1, 2.5, 0][i % 5]}deg">`).join('')}</div>`;
}

/* ---------- the show ---------- */
let deck = [], at = 0, timer, jumpTo = null, freshId = null;
function build() {
  const keep = deck[at] && (deck[at].id || deck[at].kind);
  deck = slides();
  const i = deck.findIndex((s) => (s.id || s.kind) === keep);
  at = i >= 0 ? i : Math.min(at, deck.length - 1);
  if (!$('stage').children.length) show(at);
  else { const cur = $('stage').querySelector('.slide.on'); if (cur && deck[at]) cur.innerHTML = deck[at].html; dots(); }
}
function dots() { $('dots').innerHTML = deck.map((_, i) => `<i class="${i === at ? 'on' : ''}"></i>`).join(''); }
function show(i) {
  if (!deck.length) return;
  at = (i + deck.length) % deck.length;
  const old = $('stage').querySelector('.slide.on');
  const el = document.createElement('section');
  el.className = 'slide'; el.innerHTML = deck[at].html;
  if (deck[at].id && deck[at].id === freshId) { el.classList.add('dropin'); freshId = null; }
  $('stage').appendChild(el);
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('on')));
  if (old) { old.classList.remove('on'); setTimeout(() => old.remove(), 1400); }
  dots();
  const secs = SECONDS[deck[at].kind] || 12, bar = $('progress');
  bar.classList.remove('run'); bar.style.transitionDuration = '0s'; void bar.offsetWidth;
  bar.style.transitionDuration = secs + 's'; bar.classList.add('run');
  clearTimeout(timer);
  timer = setTimeout(next, secs * 1000);
}
function next() {
  if (jumpTo) { const i = deck.findIndex((s) => s.id === jumpTo); jumpTo = null; if (i >= 0) return show(i); }
  show(at + 1);
}

/* ---------- live ---------- */
let noteT;
function note(msg) {
  const n = $('note'); n.textContent = msg; n.classList.add('show');
  clearTimeout(noteT); noteT = setTimeout(() => n.classList.remove('show'), 6000);
}
let reloadT;
live(['tg_dishes', 'tg_signups', 'tg_rsvps', 'tg_thanks', 'tg_photos'], ({ table, type, record }) => {
  clearTimeout(reloadT); reloadT = setTimeout(load, 300);
  if (type !== 'INSERT') return;
  if (table === 'tg_signups') {
    const d = data.dishes.find((x) => x.id === record.dish_id);
    note(`${record.who} is bringing ${d ? pretty(d.name).toLowerCase() : 'a dish'}`);
  } else if (table === 'tg_rsvps') note(`${record.family} just joined the table`);
  else if (table === 'tg_thanks') { jumpTo = record.id; note('A new note of thanks'); }
  else if (table === 'tg_photos') { jumpTo = freshId = record.id; note(record.who ? `A new photo from ${record.who}` : 'A new photo'); }
}, { onStatus: (up) => $('live').classList.toggle('up', up), presence: { kind: 'tv' }, onBroadcast: (ev) => { if (ev === 'vote') refreshPoll(); } });
setInterval(refreshPoll, 60e3);
setInterval(load, 5 * 60e3);

/* ---------- clock, controls, full screen, keep awake ---------- */
const clock = () => { $('clock').textContent = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); };
clock(); setInterval(clock, 15e3);
document.addEventListener('keydown', (e) => {
  if (['ArrowRight', ' ', 'PageDown'].includes(e.key)) { e.preventDefault(); show(at + 1); }
  if (['ArrowLeft', 'PageUp'].includes(e.key)) { e.preventDefault(); show(at - 1); }
  if (e.key === 'f') document.documentElement.requestFullscreen?.();
});
document.querySelector('.frame').addEventListener('click', (e) => show(at + (e.clientX < innerWidth / 3 ? -1 : 1)));
let wake = null;
async function stayAwake() { try { wake = await navigator.wakeLock?.request('screen'); } catch {} }
document.addEventListener('visibilitychange', () => { if (!document.hidden && $('start').classList.contains('gone')) stayAwake(); });
$('start').addEventListener('click', () => {
  document.documentElement.requestFullscreen?.().catch(() => {});
  stayAwake();
  $('start').classList.add('gone');
});
let idleT;
document.addEventListener('mousemove', () => { document.body.classList.remove('idle'); clearTimeout(idleT); idleT = setTimeout(() => document.body.classList.add('idle'), 2500); });

/* ---------- QR code: scan to add a photo or a note ---------- */
(function qr() {
  const url = new URL('add.html', location.href).href;
  const q = qrcode(0, 'M'); q.addData(url); q.make();
  const n = q.getModuleCount(), m = 4; // quiet zone
  let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c + m} ${r + m}h1v1h-1z`;
  $('qr').innerHTML = `<svg viewBox="0 0 ${n + m * 2} ${n + m * 2}" shape-rendering="crispEdges" aria-label="QR code to add a photo or note"><rect width="100%" height="100%" fill="#fffdf8"/><path d="${d}" fill="#2a1f17"/></svg>`;
})();

load();
refreshPoll();
