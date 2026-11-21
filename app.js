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

/* ---------- the table ---------- */
// Seen from above: a chair fills and a place is set for each guest; each dish signed up lands on the runner.
const FOOD = { sides: '#b0812f', desserts: '#7a4a2a', extras: '#6f7d4e', host: '#7a4a2a' };
function renderMeter(animate) {
  const A = rsvps.reduce((s, r) => s + r.adults, 0), K = rsvps.reduce((s, r) => s + r.kids, 0), n = A + K;
  const W = 600, H = 220, ty0 = 58, ty1 = 178, cy = (ty0 + ty1) / 2;
  const perSide = Math.min(16, Math.max(6, Math.ceil(Math.max(0, n - 2) / 2)));
  const sx0 = 88, sx1 = 512, step = (sx1 - sx0) / (perSide - 1);
  const seats = [{ x: 26, y: cy, end: 'l' }, { x: 574, y: cy, end: 'r' }];
  const mid = (perSide - 1) / 2;
  [...Array(perSide).keys()].sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid) || a - b)
    .forEach((c) => { seats.push({ x: sx0 + c * step, y: 38, side: 't' }); seats.push({ x: sx0 + c * step, y: 198, side: 'b' }); });
  const delay = (i, base, per) => animate ? `style="transition-delay:${(base + i * per).toFixed(2)}s"` : '';
  let chairs = '', places = '';
  seats.forEach((s, i) => {
    const on = i < n;
    chairs += s.end
      ? `<rect class="chair ${on ? 'filled' : ''}" x="${s.x - 9}" y="${s.y - 16}" width="18" height="32" rx="4"/>`
      : `<rect class="chair ${on ? 'filled' : ''}" x="${s.x - 14}" y="${s.y - 9}" width="28" height="18" rx="4"/>`;
    const px = s.end === 'l' ? 68 : s.end === 'r' ? 532 : s.x;
    const py = s.end ? s.y : s.side === 't' ? 76 : 160;
    const rot = s.end === 'l' ? -90 : s.end === 'r' ? 90 : s.side === 'b' ? 180 : 0;
    places += `<g class="setting ${animate ? '' : (on ? 'on' : '')}" data-on="${on ? 1 : 0}" ${delay(i, 0, 0.04)} transform="translate(${px} ${py}) rotate(${rot})">
      <g class="pop"><path class="cutlery" d="M-15 -6 V8 M-17 -6 V-1 M-13 -6 V-1 M15 -6 V8"/><circle r="9.5" class="plate"/><circle r="6" class="plate-in"/></g></g>`;
  });
  const host = dishes.filter((x) => x.locked && !/turkey/i.test(x.name));
  const brought = signups.map((s) => dishes.find((x) => x.id === s.dish_id)).filter(Boolean);
  const onRunner = [...host, ...brought];
  const slots = [];
  for (let k = 0; k < 7; k++) for (const side of [-1, 1]) for (const row of [0, 1]) slots.push({ x: 300 + side * (68 + k * 24), y: row ? 129 : 107 });
  const shown = onRunner.slice(0, slots.length), extra = onRunner.length - shown.length;
  const food = shown.map((x, i) => {
    const pie = x.category === 'desserts' || x.locked;
    return `<g class="dish ${animate ? '' : 'on'}" ${delay(i, 0.45, 0.05)} transform="translate(${slots[i].x} ${slots[i].y})"><g class="pop">
      <circle r="9.5" fill="#fffdf8" stroke="#2a1f17" stroke-width=".8"/><circle r="6.2" fill="${FOOD[x.category]}"/>
      ${pie ? '<path d="M-4 -3 H4 M-5 0 H5 M-4 3 H4 M-3 -4.5 V4.5 M0 -5.5 V5.5 M3 -4.5 V4.5" stroke="#e9c98f" stroke-width=".7"/>' : '<circle r="2.2" cx="-1.5" cy="-1.5" fill="#fff" opacity=".35"/>'}
    </g></g>`;
  }).join('') + (extra > 0 ? `<text x="${300 + 68 + 7 * 24 + 4}" y="${cy}" class="caps" fill="#f4ede0" font-size="10" dominant-baseline="central">+${extra}</text>` : '');
  const need = courseNeeds(), covered = need.filter((x) => signsFor(x).length >= x.target).length;

  $('meter').innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${n} guests, ${signups.length} dishes signed up">
    <defs><radialGradient id="glow"><stop offset="0" stop-color="#f2c46b" stop-opacity=".8"/><stop offset="1" stop-color="#f2c46b" stop-opacity="0"/></radialGradient></defs>
    ${chairs}
    <rect x="48" y="${ty0}" width="504" height="${ty1 - ty0}" rx="5" fill="#ebe1cf" stroke="#2a1f17" stroke-width="1.2"/>
    <rect x="54" y="${ty0 + 6}" width="492" height="${ty1 - ty0 - 12}" rx="3" fill="none" stroke="#cdbfa8" stroke-width=".8"/>
    <rect x="72" y="95" width="456" height="46" fill="#8e2a2e"/>
    <path d="M72 99.5 H528 M72 136.5 H528" stroke="#f4ede0" stroke-width=".8" stroke-dasharray="3 2.5" opacity=".7"/>
    ${places}
    <circle cx="246" cy="118" r="17" fill="url(#glow)" class="glow"/><circle cx="354" cy="118" r="17" fill="url(#glow)" class="glow"/>
    <rect x="242" y="112" width="8" height="15" rx="1.5" fill="#fffdf8" stroke="#2a1f17" stroke-width=".7"/><path class="flame" d="M246 102 q4.5 5.5 0 9.5 q-4.5 -4 0 -9.5z" fill="#d9a441"/>
    <rect x="350" y="112" width="8" height="15" rx="1.5" fill="#fffdf8" stroke="#2a1f17" stroke-width=".7"/><path class="flame b" d="M354 102 q4.5 5.5 0 9.5 q-4.5 -4 0 -9.5z" fill="#d9a441"/>
    <ellipse cx="300" cy="118" rx="36" ry="21" fill="#fffdf8" stroke="#2a1f17" stroke-width="1"/>
    <ellipse cx="300" cy="118" rx="29" ry="15.5" fill="none" stroke="#b0812f" stroke-width=".7"/>
    <g transform="translate(300 118)">
      <ellipse cx="-17" cy="-6" rx="7" ry="4" transform="rotate(-25 -17 -6)" fill="#9a5b2a" stroke="#5a3b26" stroke-width=".7"/><circle cx="-23" cy="-9" r="2.4" fill="#fffdf8" stroke="#5a3b26" stroke-width=".6"/>
      <ellipse cx="-17" cy="6" rx="7" ry="4" transform="rotate(25 -17 6)" fill="#9a5b2a" stroke="#5a3b26" stroke-width=".7"/><circle cx="-23" cy="9" r="2.4" fill="#fffdf8" stroke="#5a3b26" stroke-width=".6"/>
      <ellipse cx="2" cy="0" rx="17" ry="11.5" fill="#b0702f" stroke="#5a3b26" stroke-width=".8"/>
      <ellipse cx="4" cy="-4" rx="9" ry="4.5" fill="#d9a05a" opacity=".55"/>
    </g>
    ${food}
  </svg>
  <p class="tally">${rsvps.length || signups.length
    ? `<b>${n}</b> ${n === 1 ? 'guest' : 'guests'}<span class="sep">·</span><b>${signups.length}</b> ${signups.length === 1 ? 'dish' : 'dishes'}<span class="sep">·</span><b>${covered}</b> of ${need.length} sides &amp; desserts covered`
    : 'The table is set and waiting for its first guests.'}</p>`;
  if (animate) requestAnimationFrame(() => setTimeout(() => {
    $('meter').querySelectorAll('.setting[data-on="1"], .dish').forEach((el) => el.classList.add('on'));
  }, reduced ? 0 : 200));
}

/* ---------- the menu ---------- */
function renderMenu() {
  if (!dishes.length) return;
  const host = dishes.filter((d) => d.category === 'host');
  let html = `<section class="course"><div class="course-head"><h3>From Uncle Danny’s Kitchen</h3></div><ul class="dishes">${host.map((d) =>
    `<li><div class="dish-row host"><span class="nm"><b>${esc(pretty(d.name))}</b>${d.hint ? `<small>${esc(d.hint)}</small>` : ''}</span><span class="lead"></span><span class="st"><span class="who">Uncle Danny</span></span></div></li>`).join('')}</ul></section>`;
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
  + '&details=' + encodeURIComponent('Thanksgiving at Uncle Danny’s. Times coming soon.\nSign-ups: ' + location.origin + location.pathname);
$('calBtn').addEventListener('click', () => {
  const apple = `<a class="btn ${isApple ? '' : 'ghost'}" href="thanksgiving.ics">Apple or Outlook calendar</a>`;
  const google = `<a class="btn ${isApple ? 'ghost' : ''}" href="${GCAL}" target="_blank" rel="noopener">Google Calendar</a>`;
  openDialog('Add to your calendar',
    `<p class="dlg-note">Thursday, November 26 at Uncle Danny’s. It’s an all-day event until the times are set.</p>
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
