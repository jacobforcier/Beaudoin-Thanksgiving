/* Beaudoin Family Thanksgiving sign-up. Plain JS, no build step. */
const SB_URL = 'https://jkgsytjstauxstiabhwz.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImprZ3N5dGpzdGF1eHN0aWFiaHd6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA2MDI2ODAsImV4cCI6MjEwNjE3ODY4MH0.M8OzkHtXxaqGddAfmN26F2it1P-kIgttIUXWBHzgi1g';
const ADDRESS = '11 Chestnut Street, Wilmington, MA 01887';
const LAT = 42.5465, LON = -71.1737;
const DAY = { y: 2026, m: 11, d: 26 }; // Thanksgiving, Eastern time
const COURSES = [
  ['sides', 'Sides', 'Everything that goes next to the turkey'],
  ['desserts', 'Pies & Desserts', 'Room for about six'],
  ['extras', 'Something Else', 'Not needed, but bring it if you’d like to get creative'],
];
const PAN_CATS = ['sides', 'desserts'];
const HOST_COOK = (d) => /tourti/i.test(d.name) ? 'Sammy' : 'Danny &amp; Barb'; // who makes each host dish
const HIDDEN = ['homemade noodles']; // removed from the menu; rows still in the database

/* ---------- tiny Supabase REST client ---------- */
function table(name) {
  const base = `${SB_URL}/rest/v1/${name}`;
  const H = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation' };
  const run = async (method, qs, body) => {
    try {
      const r = await fetch(`${base}?${qs}`, { method, headers: H, body: body && JSON.stringify(body) });
      const data = await r.json().catch(() => null);
      return r.ok ? { data: data || [], error: null } : { data: null, error: data || r.status };
    } catch (e) { return { data: null, error: e }; }
  };
  return {
    list: (order) => run('GET', `select=*&order=${order}`),
    insert: (row) => run('POST', '', row),
    update: (row, filter) => run('PATCH', filter, row),
    remove: (filter) => run('DELETE', filter),
  };
}
const T_DISH = table('tg_dishes'), T_SIGN = table('tg_signups'), T_RSVP = table('tg_rsvps'), T_THANKS = table('tg_thanks');
const byId = (id) => `id=eq.${encodeURIComponent(id)}`;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
};
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const touch = matchMedia('(hover: none)').matches;
const myName = () => store.get('tgName') || '';
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];
const word = (n) => WORDS[n] ?? String(n);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const pretty = (s) => String(s ?? '').replace(/'/g, '’');

let dishes = [], signups = [], rsvps = [], thanks = [], loadedOnce = false;

/* ---------- Eastern-time date helpers ---------- */
function etToday() {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: 'numeric', day: 'numeric' })
    .formatToParts(new Date()).map((x) => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day };
}
function daysUntil() {
  const e = etToday();
  return Math.round((Date.UTC(DAY.y, DAY.m - 1, DAY.d) - Date.UTC(e.y, e.m - 1, e.d)) / 86400e3);
}

/* ---------- load ---------- */
async function load() {
  const [a, b, c, t] = await Promise.all([
    T_DISH.list('sort,created_at'), T_SIGN.list('created_at'), T_RSVP.list('created_at'), T_THANKS.list('created_at.desc'),
  ]);
  if (a.error || b.error) {
    if (!loadedOnce) $('cats').innerHTML = '<p class="loading">Couldn’t reach the sign-up sheet. Try refreshing in a moment.</p>';
    return;
  }
  const first = !loadedOnce; loadedOnce = true;
  dishes = a.data.filter((d) => (d.category === 'host' || COURSES.some((c) => c[0] === d.category)) && !HIDDEN.includes(d.name.trim().toLowerCase()));
  signups = b.data.filter((s) => dishes.some((d) => d.id === s.dish_id));
  if (c.data) rsvps = c.data;
  if (t.data) thanks = t.data;
  renderAll(first);
}
let reloadT;
const reloadSoon = () => { clearTimeout(reloadT); reloadT = setTimeout(load, 250); };
setInterval(() => { if (!document.hidden && !$('dlg').open) load(); }, 12000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) reloadSoon(); });

function renderAll(animate = false) {
  renderMeter(animate);
  renderMenu();
  renderRsvps();
  renderThanks();
  checkFullHouse();
}
const signsFor = (d) => signups.filter((s) => s.dish_id === d.id);
const courseNeeds = () => dishes.filter((x) => !x.locked && x.target && PAN_CATS.includes(x.category));

/* ---------- the status: who's at the table, what's still needed ---------- */
const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const spell = (n) => n < 20 ? ONES[n] : n < 100 ? TENS[Math.floor(n / 10)] + (n % 10 ? '-' + ONES[n % 10] : '') : String(n);
function renderMeter(animate) {
  const n = rsvps.reduce((s, r) => s + r.adults + r.kids, 0);
  const onTable = dishes.filter((d) => d.locked).length + signups.length;
  const needed = courseNeeds().filter((d) => signsFor(d).length < d.target);
  const head = n
    ? `<p class="headline">${cap(spell(n))} at the table</p><p class="subline">and ${spell(onTable)} ${onTable === 1 ? 'dish' : 'dishes'} on it</p>`
    : `<p class="headline">Pull up a chair</p><p class="subline">${spell(onTable)} ${onTable === 1 ? 'dish' : 'dishes'} on the table so far</p>`;
  const shown = needed.slice(0, 6), more = needed.length - shown.length;
  const need = needed.length
    ? `<p class="needed"><span class="caps">Still needed</span>${shown.map((d, i) =>
        `${i ? (i === shown.length - 1 && !more ? ' and ' : ', ') : ''}<button type="button" data-dish="${d.id}">${esc(pretty(d.name).toLowerCase())}</button>`).join('')}${more ? `, and ${spell(more)} more` : ''}</p>`
    : `<p class="needed done"><span class="caps">Still needed</span>Nothing. The table is set.</p>`;
  const cards = rsvps.map((r, i) => `<li class="pc" style="--i:${i}"><b>${esc(r.family)}</b><span>party of ${r.adults + r.kids}</span></li>`).join('')
    + `<li class="pc empty" style="--i:${rsvps.length}"><a href="#rsvpBlock"><b>${rsvps.length ? 'Your name?' : 'Be the first'}</b><span>RSVP below</span></a></li>`;
  $('meter').classList.toggle('animate', !!animate && !reduced);
  $('meter').innerHTML = `${head}${need}<ul class="cards">${cards}</ul>`;
}
$('meter').addEventListener('click', (e) => {
  const b = e.target.closest('[data-dish]');
  if (b) dishDialog(dishes.find((d) => d.id === b.dataset.dish));
});

/* ---------- the menu ---------- */
function renderMenu() {
  if (!dishes.length) return;
  const host = dishes.filter((d) => d.category === 'host');
  let html = `<section class="course"><div class="course-head"><h3>From Danny &amp; Barb’s Kitchen</h3></div><ul class="dishes">${host.map((d) =>
    `<li><div class="dish-row host"><span class="nm"><b>${esc(pretty(d.name))}</b>${d.hint ? `<small>${esc(d.hint)}</small>` : ''}</span><span class="lead"></span><span class="st"><span class="who">${HOST_COOK(d)}</span></span></div></li>`).join('')}</ul></section>`;
  html += COURSES.map(([id, name, kick]) => {
    const list = dishes.filter((d) => d.category === id);
    return `<section class="course"><div class="course-head"><h3>${name}</h3></div><p class="course-sub">${esc(kick)}</p>
      <ul class="dishes">${list.map(dishRow).join('')}</ul>
      <button type="button" class="add-other" data-add="${id}">Add something else</button></section>`;
  }).join('');
  $('cats').innerHTML = html;
}

function dishRow(d) {
  const s = signsFor(d), n = s.length, full = d.target && n >= d.target;
  let st;
  if (!n) st = '<span class="open">Open</span>';
  else {
    st = `<span class="who">${s.map((x) => esc(x.who)).join(', ')}</span>`;
    if (d.target) st += `<span class="n">${full ? 'Covered' : `${n} of ${d.target}`}</span>`;
  }
  const sub = [d.hint, d.added_by && !n ? `added by ${d.added_by}` : ''].filter(Boolean).join(' · ');
  return `<li><button type="button" class="dish-row ${full ? 'full' : ''}" data-dish="${d.id}">
    <span class="nm"><b>${esc(pretty(d.name))}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</span><span class="lead"></span><span class="st">${st}</span></button></li>`;
}

$('cats').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.add) return addDishDialog(b.dataset.add);
  if (b.dataset.dish) return dishDialog(dishes.find((d) => d.id === b.dataset.dish));
});

/* ---------- dialogs ---------- */
const dlg = $('dlg');
function openDialog(title, body, actions) {
  $('dlgTitle').textContent = title;
  $('dlgBody').innerHTML = body;
  $('dlgActions').innerHTML = actions.map((a, i) => `<button value="${i}" class="btn ${a.cls || ''}" ${a.submit ? '' : 'formnovalidate'}>${esc(a.label)}</button>`).join('');
  return new Promise((res) => {
    dlg.onclose = () => { const a = actions[+dlg.returnValue]; res(a ? a.value : null); dlg.returnValue = ''; };
    dlg.showModal();
    const f = dlg.querySelector('input:not([type=checkbox]), textarea');
    if (f && !f.value && !touch) f.focus(); else dlg.querySelector('h3').focus?.();
  });
}
dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
const field = (label, id, value = '', ph = '', required = false, max = 40) =>
  `<label class="line"><span class="caps">${label}</span><input id="${id}" maxlength="${max}" value="${esc(value)}" placeholder="${esc(ph)}" ${required ? 'required' : ''}></label>`;
const panTip = (cat) => PAN_CATS.includes(cat) ? '<p class="dlg-note" style="margin:14px 0 0">Please bring it in an aluminum pan, about 10″ × 12″, so it fits the chafing dishes.</p>' : '';

async function dishDialog(d) {
  if (!d) return;
  const s = signsFor(d), n = s.length;
  let edit = null;
  const acts = [{ label: 'Close', value: null, cls: 'ghost' }];
  if (d.added_by && !n) acts.push({ label: 'Remove dish', value: 'delete', cls: 'warn' });
  acts.push({ label: n ? 'I’ll bring one too' : 'I’ll bring it', value: 'ok', submit: true });
  const status = d.target ? (n >= d.target ? 'Covered, but doubles are welcome' : `${word(n)} of ${word(d.target)} so far`) : '';
  const p = openDialog(pretty(d.name),
    `<p class="dlg-note">${[d.hint, status].filter(Boolean).map((x) => esc(cap(x))).join(' · ') || 'Tap below to bring it.'}</p>
     ${n ? `<ul class="dlg-who">${s.map((x) => `<li><button type="button" data-s="${x.id}"><b>${esc(x.who)}</b><i>${esc(x.note || '')}</i><span class="edit">Edit</span></button></li>`).join('')}</ul>` : ''}
     <div class="dlg-fields">${field('Your name', 'dName', myName(), 'e.g. Jeff & Sue', true)}${field('Note', 'dNote', '', 'optional, e.g. homemade', false, 80)}</div>${panTip(d.category)}`, acts);
  $('dlgBody').querySelectorAll('[data-s]').forEach((b) => b.addEventListener('click', () => { edit = b.dataset.s; dlg.close(); }));
  const r = await p;
  if (edit) return signupDialog(signups.find((x) => x.id === edit));
  if (r === 'delete') {
    await T_DISH.remove(byId(d.id));
    toast(`${pretty(d.name)} was taken off the menu.`);
    return load();
  }
  const who = r === 'ok' && $('dName').value.trim();
  if (!who) return;
  store.set('tgName', who);
  const { error } = await T_SIGN.insert({ dish_id: d.id, who, note: $('dNote').value.trim() || null });
  if (error) return toast('That didn’t save. Please try again.');
  toast(`Thank you, ${who}. ${pretty(d.name)} is on the table.`);
  load();
}

async function signupDialog(s) {
  if (!s) return;
  const d = dishes.find((x) => x.id === s.dish_id);
  const r = await openDialog(d ? pretty(d.name) : 'Sign-up',
    `<div class="dlg-fields">${field('Name', 'dName', s.who, '', true)}${field('Note', 'dNote', s.note || '', 'optional', false, 80)}</div>`,
    [{ label: 'Close', value: null, cls: 'ghost' }, { label: 'Remove', value: 'remove', cls: 'warn' }, { label: 'Save', value: 'save', submit: true }]);
  if (r === 'save') {
    const who = $('dName').value.trim(); if (!who) return;
    await T_SIGN.update({ who, note: $('dNote').value.trim() || null }, byId(s.id));
    toast('Updated.');
  } else if (r === 'remove') {
    await T_SIGN.remove(byId(s.id));
    toast(`${d ? pretty(d.name) : 'That dish'} is open again.`);
  } else return;
  load();
}

async function addDishDialog(cat) {
  const course = COURSES.find((c) => c[0] === cat);
  const r = await openDialog(`Add to ${course[1]}`,
    `<div class="dlg-fields">${field('Dish', 'dItem', '', 'e.g. Deviled eggs', true, 60)}${field('Your name', 'dName', myName(), '', true)}${field('Note', 'dNote', '', 'optional', false, 80)}
     <label class="check"><input type="checkbox" id="dMine" checked> I’m bringing it</label></div>${panTip(cat)}`,
    [{ label: 'Cancel', value: null, cls: 'ghost' }, { label: 'Add to menu', value: 'ok', submit: true }]);
  if (r !== 'ok') return;
  const name = $('dItem').value.trim(), who = $('dName').value.trim(), note = $('dNote').value.trim() || null, mine = $('dMine').checked;
  if (!name || !who) return;
  store.set('tgName', who);
  const { data, error } = await T_DISH.insert({ category: cat, name, target: 1, added_by: who, sort: 100 });
  if (error || !data.length) return toast('That didn’t save. Please try again.');
  if (mine) await T_SIGN.insert({ dish_id: data[0].id, who, note });
  toast(mine ? `Thank you, ${who}. ${name} is on the menu.` : `${name} was added to the menu.`);
  load();
}

/* ---------- full house ---------- */
function checkFullHouse() {
  const need = courseNeeds();
  const full = need.length && need.every((d) => signsFor(d).length >= d.target);
  if (!full || store.get('tgFull')) return;
  store.set('tgFull', '1');
  const b = $('fullhouse');
  setTimeout(() => { b.classList.add('show'); chime(); }, 800);
  setTimeout(() => b.classList.remove('show'), 7000);
}
$('fullhouse').addEventListener('click', () => $('fullhouse').classList.remove('show'));

/* ---------- guests ---------- */
function renderRsvps() {
  const A = rsvps.reduce((s, r) => s + r.adults, 0), K = rsvps.reduce((s, r) => s + r.kids, 0);
  $('rsvpTotal').innerHTML = rsvps.length
    ? `${cap(word(A + K))} ${A + K === 1 ? 'guest' : 'guests'} so far <i>— ${word(A)} ${A === 1 ? 'adult' : 'adults'}${K ? `, ${word(K)} ${K === 1 ? 'kid' : 'kids'}` : ''}</i>`
    : '<i>No one has RSVP’d yet. Be the first.</i>';
  $('rsvpList').innerHTML = rsvps.map((r) => `<li><button type="button" data-r="${r.id}">
    <span class="fam">${esc(r.family)}${r.note ? `<small>${esc(r.note)}</small>` : ''}</span>
    <span class="cnt">${plural(r.adults, 'adult')}${r.kids ? ` · ${plural(r.kids, 'kid')}` : ''}</span></button></li>`).join('');
  $('rsvpList').hidden = !rsvps.length;
}
document.querySelectorAll('[data-step]').forEach((b) => b.addEventListener('click', () => {
  const [id, d] = b.dataset.step.split(':');
  const o = $(id);
  o.value = o.textContent = Math.max(0, Math.min(30, +o.textContent + +d));
}));
$('rsvpForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const family = $('rFamily').value.trim();
  const adults = +$('rAdults').textContent, kids = +$('rKids').textContent;
  if (!family) return;
  if (!adults && !kids) return toast('Add at least one person.');
  const { error } = await T_RSVP.insert({ family, adults, kids, note: $('rNote').value.trim() || null });
  if (error) return toast('That didn’t save. Please try again.');
  if (!myName()) store.set('tgName', family);
  e.target.reset(); $('rAdults').textContent = 2; $('rKids').textContent = 0;
  toast(`See you Thursday, ${family}.`);
  load();
});
$('rsvpList').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-r]');
  const r0 = b && rsvps.find((r) => r.id === b.dataset.r);
  if (!r0) return;
  const num = (label, id, v) => `<label class="line"><span class="caps">${label}</span><input id="${id}" type="number" inputmode="numeric" min="0" max="30" value="${v}"></label>`;
  const r = await openDialog(r0.family,
    `<div class="dlg-fields">${field('Family', 'eFam', r0.family, '', true)}${num('Adults', 'eA', r0.adults)}${num('Kids', 'eK', r0.kids)}${field('Note', 'eNote', r0.note || '', 'optional', false, 140)}</div>`,
    [{ label: 'Close', value: null, cls: 'ghost' }, { label: 'Remove', value: 'remove', cls: 'warn' }, { label: 'Save', value: 'save', submit: true }]);
  if (r === 'save') {
    const clamp = (v) => Math.max(0, Math.min(30, Math.round(+v || 0)));
    await T_RSVP.update({ family: $('eFam').value.trim() || r0.family, adults: clamp($('eA').value), kids: clamp($('eK').value), note: $('eNote').value.trim() || null }, byId(r0.id));
    toast('Updated.');
  } else if (r === 'remove') {
    await T_RSVP.remove(byId(r0.id));
    toast(`${r0.family} was removed. We’ll miss you.`);
  } else return;
  load();
});

/* ---------- thankful ---------- */
const myThanks = () => { try { return JSON.parse(store.get('tgMine') || '[]'); } catch { return []; } };
function renderThanks() {
  const mine = myThanks();
  $('thanksWall').innerHTML = thanks.length ? thanks.map((t) => `<figure class="quote"><p>${esc(t.body)}</p>
      <cite>${t.who ? esc(t.who) : 'Anonymous'}${mine.includes(t.id) ? `<button type="button" class="x" data-t="${t.id}">remove</button>` : ''}</cite></figure>`).join('')
    : '<p class="empty">Nothing here yet. Start us off?</p>';
}
$('thanksForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = $('tBody').value.trim();
  if (!body) return;
  const { data, error } = await T_THANKS.insert({ body, who: $('tWho').value.trim() || null });
  if (error || !data.length) return toast('That didn’t save. Please try again.');
  store.set('tgMine', JSON.stringify([...myThanks(), data[0].id]));
  $('tBody').value = ''; grow();
  toast('Added. Merci.');
  load();
});
$('thanksWall').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-t]');
  if (!b) return;
  await T_THANKS.remove(byId(b.dataset.t));
  load();
});
if (myName()) $('tWho').value = myName();
const grow = () => { const t = $('tBody'); t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; };
$('tBody').addEventListener('input', grow);

/* ---------- date, calendar, directions ---------- */
function renderDate() {
  const n = daysUntil();
  $('countdown').textContent = n === 0 ? 'Happy Thanksgiving'
    : n < 0 ? 'Thank you for a wonderful Thanksgiving'
    : n === 1 ? 'Tomorrow' : `${word(n)} days to go`;
}
const isApple = /iPad|iPhone|iPod|Macintosh/.test(navigator.userAgent) && 'ontouchend' in document;
$('directions').href = isApple
  ? `https://maps.apple.com/?daddr=${encodeURIComponent(ADDRESS)}`
  : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(ADDRESS)}`;
const GCAL = 'https://calendar.google.com/calendar/render?action=TEMPLATE'
  + '&text=' + encodeURIComponent('Beaudoin Family Thanksgiving')
  + '&dates=20261126/20261127'
  + '&location=' + encodeURIComponent(ADDRESS)
  + '&details=' + encodeURIComponent('Thanksgiving at Danny & Barb’s. Times coming soon.\nSign-ups: ' + location.origin + location.pathname);
$('calBtn').addEventListener('click', () => {
  const apple = `<a class="btn ${isApple ? '' : 'ghost'}" href="thanksgiving.ics">Apple or Outlook calendar</a>`;
  const google = `<a class="btn ${isApple ? 'ghost' : ''}" href="${GCAL}" target="_blank" rel="noopener">Google Calendar</a>`;
  openDialog('Add to your calendar',
    `<p class="dlg-note">Thursday, November 26 at Danny & Barb’s. It’s an all-day event until the times are set.</p>
     <div class="cal-opts">${isApple ? apple + google : google + apple}</div>`,
    [{ label: 'Close', value: null, cls: 'ghost' }]);
  $('dlgBody').querySelectorAll('a').forEach((a) => a.addEventListener('click', () => setTimeout(() => dlg.close(), 300)));
});

/* ---------- forecast ---------- */
const WMO = {
  0: 'sunny', 1: 'mostly sunny', 2: 'partly cloudy', 3: 'cloudy', 45: 'foggy', 48: 'foggy and icy',
  51: 'drizzly', 53: 'drizzly', 55: 'drizzly', 56: 'icy, with freezing drizzle', 57: 'icy, with freezing drizzle',
  61: 'rainy', 63: 'rainy', 65: 'very rainy', 66: 'icy, with freezing rain', 67: 'icy, with freezing rain',
  71: 'snowy', 73: 'snowy', 75: 'very snowy', 77: 'snowy', 80: 'showery', 81: 'showery', 82: 'stormy', 85: 'snowy', 86: 'very snowy', 95: 'stormy', 96: 'stormy', 99: 'stormy',
};
let weatherAt = 0;
function renderLive() {
  if (!weatherAt) return;
  const m = Math.floor((Date.now() - weatherAt) / 60e3);
  const t = new Date(weatherAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  $('liveText').innerHTML = `Live forecast <b>· updated ${m < 1 ? 'just now' : `${t}`}</b>`;
  $('live').hidden = false;
}
setInterval(renderLive, 30e3);
setInterval(() => { if (!document.hidden) weather(); }, 30 * 60e3);
async function weather() {
  const el = $('weather');
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=America%2FNew_York&forecast_days=16`;
    const w = await (await fetch(url)).json();
    const key = `${DAY.y}-${String(DAY.m).padStart(2, '0')}-${String(DAY.d).padStart(2, '0')}`;
    const i = w.daily.time.indexOf(key);
    if (i === -1) { el.innerHTML = '<span class="loading">The forecast for Thursday isn’t out yet. Check back closer to the day.</span>'; return; }
    const d = w.daily, code = d.weather_code[i];
    const hi = Math.round(d.temperature_2m_max[i]), lo = Math.round(d.temperature_2m_min[i]);
    const pop = d.precipitation_probability_max[i] ?? 0, wind = Math.round(d.wind_speed_10m_max[i]);
    const sky = WMO[code] || 'changeable';
    const note = pop >= 70 || code >= 95 || [56, 57, 65, 66, 67, 75, 82, 86].includes(code) ? 'Drive carefully, and leave extra time on the way over.'
      : hi < 32 || wind > 20 ? 'A cold one. Bundle up on the way in.'
      : pop >= 40 ? 'There’s a chance of rain, so bring an umbrella just in case.'
      : 'A nice day for it. Backyard football, anyone?';
    el.innerHTML = `Thursday looks ${sky}, with a high of ${hi}° and a low of ${lo}°.
      <em>${note}</em><small>Wilmington, MA · ${pop}% chance of precipitation · wind up to ${wind} mph${daysUntil() > 5 ? ' · may still change' : ''}</small>`;
    weatherAt = Date.now(); renderLive();
  } catch {
    el.innerHTML = '<span class="loading">The forecast isn’t available right now. Check back later.</span>';
  }
}

/* ---------- toast + sounds ---------- */
let toastT;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 3400);
}
let ac;
const audio = () => { try { ac = ac || new (window.AudioContext || window.webkitAudioContext)(); return ac; } catch { return null; } };
function chime() {
  const a = audio(); if (!a) return;
  [523, 659, 784].forEach((f, i) => {
    const o = a.createOscillator(), g = a.createGain(), t = a.currentTime + i * 0.12;
    o.type = 'sine'; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
    o.connect(g).connect(a.destination); o.start(t); o.stop(t + 0.9);
  });
}
function gobbleSound() {
  const a = audio(); if (!a) return;
  for (let k = 0; k < 4; k++) {
    const o = a.createOscillator(), g = a.createGain(), t = a.currentTime + k * 0.11;
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(520, t); o.frequency.linearRampToValueAtTime(340, t + 0.05); o.frequency.linearRampToValueAtTime(480, t + 0.09);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.04, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
    o.connect(g).connect(a.destination); o.start(t); o.stop(t + 0.11);
  }
}

/* ---------- the one secret: tap the title ---------- */
const GOBBLES = ['Gobble gobble.', 'Glouglou! (That’s turkey in French.)', 'Save room for pie.', 'Did someone say tourtière?'];
let gob = 0;
$('title').addEventListener('click', () => {
  gobbleSound();
  toast(GOBBLES[gob++ % GOBBLES.length]);
});

/* ---------- go ---------- */
renderDate();
setInterval(renderDate, 60e3);
load();
weather();
