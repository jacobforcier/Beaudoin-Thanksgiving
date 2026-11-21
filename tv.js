/* TV mode: a slow, live slideshow for the living-room screen on Thursday.
   Slides: the invitation, who's here, what's on the table, each thankful note, the forecast. */
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pretty = (s) => String(s ?? '').replace(/'/g, '’');
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const spell = (n) => n < 20 ? ONES[n] : n < 100 ? TENS[Math.floor(n / 10)] + (n % 10 ? '-' + ONES[n % 10] : '') : String(n);
const COURSES = ['host', 'sides', 'desserts', 'extras'];
const HIDDEN = ['homemade noodles'];
const HOST_COOK = (d) => /tourti/i.test(d.name) ? 'Sammy' : 'Danny & Barb';
const SECONDS = { title: 14, guests: 14, menu: 16, quote: 11, weather: 10, photo: 9 };
const PHOTO_URL = (path) => `${SB_URL}/storage/v1/object/public/tg-photos/${path}`;

const H = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` };
const get = (t, q) => fetch(`${SB_URL}/rest/v1/${t}?${q}`, { headers: H }).then((r) => r.ok ? r.json() : Promise.reject(r.status));
let data = { dishes: [], signups: [], rsvps: [], thanks: [], photos: [] }, sky = null;

async function load() {
  try {
    const [dishes, signups, rsvps, thanks, photos] = await Promise.all([
      get('tg_dishes', 'select=*&order=sort,created_at'), get('tg_signups', 'select=*&order=created_at'),
      get('tg_rsvps', 'select=*&order=created_at'), get('tg_thanks', 'select=*&order=created_at.desc'),
      get('tg_photos', 'select=*&order=created_at.desc').then((l) => l.filter((p) => !(p.who === 'Test' && /^TEST photo/.test(p.caption || '')))).catch(() => []),
    ]);  // (hides the one test photo from setup until it's deleted)
    photos.slice(0, 40).forEach((p) => { const im = new Image(); im.src = PHOTO_URL(p.path); }); // preload so slides never pop in
    const shown = dishes.filter((d) => COURSES.includes(d.category) && !HIDDEN.includes(d.name.trim().toLowerCase()) && !/specialty/i.test(d.name));
    data = { dishes: shown, signups: signups.filter((s) => shown.some((d) => d.id === s.dish_id)), rsvps, thanks, photos };
    build();
  } catch { setTimeout(load, 10000); }
}

async function weather() {
  try {
    const w = await (await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&daily=weather_code,temperature_2m_max,temperature_2m_min&current=temperature_2m&temperature_unit=fahrenheit&timezone=America%2FNew_York&forecast_days=16`)).json();
    const key = `${DAY.y}-${String(DAY.m).padStart(2, '0')}-${String(DAY.d).padStart(2, '0')}`, i = w.daily.time.indexOf(key);
    if (i === -1) return;
    const SKY = { 0: 'sunny', 1: 'mostly sunny', 2: 'partly cloudy', 3: 'cloudy', 45: 'foggy', 61: 'rainy', 63: 'rainy', 71: 'snowy', 73: 'snowy', 80: 'showery' };
    sky = { text: SKY[w.daily.weather_code[i]] || 'changeable', hi: Math.round(w.daily.temperature_2m_max[i]), lo: Math.round(w.daily.temperature_2m_min[i]),
      now: w.current ? Math.round(w.current.temperature_2m) : null };
    build();
  } catch {}
}

/* ---------- slides ---------- */
function etToday() {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(new Date()).map((x) => [x.type, x.value]));
  return Math.round((Date.UTC(DAY.y, DAY.m - 1, DAY.d) - Date.UTC(+p.year, +p.month - 1, +p.day)) / 86400e3);
}
function groupWho(list) {
  const m = new Map();
  list.forEach((x) => { const k = x.who.trim().toLowerCase(); const e = m.get(k); if (e) e[1]++; else m.set(k, [x.who.trim(), 1]); });
  return [...m.values()].map(([w, k]) => `${esc(w)}${k > 1 ? `<em>×${k}</em>` : ''}`).join(', ');
}
function slides() {
  const { dishes, signups, rsvps, thanks } = data, out = [];
  const days = etToday();
  out.push({ kind: 'title', html: `<p class="eyebrow">The Beaudoin Family</p><hr class="rule"><h1>Thanksgiving</h1>
    <p class="big">${days === 0 ? 'Happy Thanksgiving' : 'Thursday, November 26'} · at Danny &amp; Barb’s</p>
    <p class="soft">${days > 1 ? `${cap(spell(days))} days to go` : days === 1 ? 'Tomorrow' : 'So glad you’re here'}</p>` });
  const n = rsvps.reduce((s, r) => s + r.adults + r.kids, 0);
  if (rsvps.length) out.push({ kind: 'guests', html: `<p class="kicker">Around the table</p><h2>${cap(spell(n))} at the table</h2>
    <div class="cards">${rsvps.map((r) => `<div class="pc"><b>${esc(r.family)}</b><span class="caps">party of ${r.adults + r.kids}</span></div>`).join('')}</div>` });
  const rows = dishes.map((d) => {
    const s = signups.filter((x) => x.dish_id === d.id);
    if (d.locked) return `<div class="row"><span class="nm">${esc(pretty(d.name))}</span><span class="lead"></span><span class="who">${esc(HOST_COOK(d))}</span></div>`;
    return s.length ? `<div class="row"><span class="nm">${esc(pretty(d.name))}</span><span class="lead"></span><span class="who">${groupWho(s)}</span></div>` : '';
  }).filter(Boolean);
  // up to 12 dishes per slide (two columns of six) so it always fits a 720p screen
  for (let i = 0, k = 0; i < rows.length; i += 12, k++) {
    const chunk = rows.slice(i, i + 12);
    out.push({ kind: 'menu', id: 'menu' + k, html: `<div class="menu-slide"><p class="kicker">What’s on the table${k ? ', continued' : ''}</p><h2>The Menu</h2>
      <div class="menu ${chunk.length <= 5 ? 'one' : ''}">${chunk.join('')}</div></div>` });
  }
  // photos and notes take turns so neither crowds out the other
  const notes = thanks.slice(0, 24).map((t) => ({ kind: 'quote', id: t.id, html: `<p class="kicker">Thankful for</p>
    <blockquote class="quote ${t.body.length > 70 ? 'long' : ''}">${esc(t.body)}</blockquote><p class="caps by">${t.who ? esc(t.who) : 'Anonymous'}</p>` }));
  const pics = data.photos.slice(0, 40).map((p) => ({ kind: 'photo', id: p.id, html: `<figure class="photo"><img src="${esc(PHOTO_URL(p.path))}" alt="">
    <figcaption>${p.caption ? `<span class="cap">${esc(p.caption)}</span>` : ''}${p.who ? `<span class="caps">${esc(p.who)}</span>` : ''}</figcaption></figure>` }));
  for (let i = 0; i < Math.max(notes.length, pics.length); i++) { if (pics[i]) out.push(pics[i]); if (notes[i]) out.push(notes[i]); }
  if (sky) out.push({ kind: 'weather', html: `<p class="kicker">Outside today</p><h2>${cap(sky.text)}</h2>
    <p class="big">A high of ${sky.hi}° and a low of ${sky.lo}°${sky.now != null && days === 0 ? `, ${sky.now}° right now` : ''}</p><p class="soft">Wilmington, Massachusetts</p>` });
  return out;
}

/* ---------- the show ---------- */
let deck = [], at = 0, timer, jumpTo = null;
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
  else if (table === 'tg_photos') { jumpTo = record.id; note(record.who ? `A new photo from ${record.who}` : 'A new photo'); }
}, { onStatus: (up) => $('live').classList.toggle('up', up), presence: { kind: 'tv' } });
setInterval(load, 5 * 60e3);
setInterval(weather, 30 * 60e3);

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
weather();
