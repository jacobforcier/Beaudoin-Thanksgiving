/* Beaudoin Family Thanksgiving sign-up. Plain JS, no build step. */
const SB_URL = 'https://jkgsytjstauxstiabhwz.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImprZ3N5dGpzdGF1eHN0aWFiaHd6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA2MDI2ODAsImV4cCI6MjEwNjE3ODY4MH0.M8OzkHtXxaqGddAfmN26F2it1P-kIgttIUXWBHzgi1g';
const ADDRESS = '11 Chestnut Street, Wilmington, MA 01887';
const LAT = 42.5465, LON = -71.1737;
const DAY = { y: 2026, m: 11, d: 26 }; // Thanksgiving, Eastern time
const CATS = [
  ['sides', 'Sides', 'The good stuff next to the turkey'],
  ['desserts', 'Pies & Desserts', 'Room for about six'],
  ['extras', 'Something Else', 'Not needed, but bring it if you want to get creative'],
  ['paper', 'Paper Goods & Containers', 'The unsung heroes'],
];
const PAN_CATS = ['sides', 'desserts'];

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
const myName = () => store.get('tgName') || '';
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

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

/* ---------- dish emoji ---------- */
const EMOJI = [[/turkey/i, '🦃'], [/tourti|pork pie/i, '🥧'], [/potato/i, '🥔'], [/gravy/i, '🥣'], [/stuff/i, '🍞'], [/mac/i, '🧀'],
  [/bean/i, '🫛'], [/corn/i, '🌽'], [/squash/i, '🎃'], [/cranberr/i, '🍒'], [/roll|bread|biscuit/i, '🥖'], [/pumpkin/i, '🥧'],
  [/apple/i, '🍎'], [/pecan|pie/i, '🥧'], [/cake|special/i, '🍰'], [/cookie|bar/i, '🍪'], [/veggie|carrot/i, '🥕'], [/chip|salsa/i, '🌶️'],
  [/noodle/i, '🍜'], [/salad/i, '🥗'], [/cheese/i, '🧀'], [/wine/i, '🍷'], [/cider|drink|juice|soda/i, '🧃'], [/plate/i, '🍽️'],
  [/napkin|cup/i, '🥤'], [/container|foil|wrap/i, '🥡']];
const CAT_EMOJI = { host: '🦃', sides: '🥘', desserts: '🍰', extras: '🧺', paper: '🍽️' };
const dishEmoji = (d) => (EMOJI.find(([re]) => re.test(d.name)) || [0, CAT_EMOJI[d.category]])[1];

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
  dishes = a.data; signups = b.data;
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
const people = () => rsvps.reduce((s, r) => s + r.adults + r.kids, 0);

/* ---------- the table (hero meter) ---------- */
function renderMeter(animate) {
  const n = people();
  const perSide = Math.min(18, Math.max(8, Math.ceil(n / 2)));
  const W = 600, x0 = 50, x1 = 550, step = (x1 - x0) / (perSide - 1);
  let seats = '', plates = '';
  for (let i = 0; i < perSide * 2; i++) {
    const top = i % 2 === 0, k = Math.floor(i / 2);
    const x = x0 + k * step, y = top ? 22 : 148;
    seats += `<circle class="seat" cx="${x}" cy="${y}" r="11"/>`;
    const delay = animate ? `transition-delay:${(i * 0.05).toFixed(2)}s` : '';
    plates += `<g class="plate ${animate ? '' : (i < n ? 'on' : '')}" data-on="${i < n ? 1 : 0}" style="${delay}">
      <circle cx="${x}" cy="${y}" r="11" fill="#fff" stroke="#d4692a" stroke-width="2"/><circle cx="${x}" cy="${y}" r="6" fill="none" stroke="#e8c9a3" stroke-width="1.5"/></g>`;
  }
  // dishes: host items first, then one emoji per sign-up
  const host = dishes.filter((d) => d.locked);
  const list = [...host, ...signups.map((s) => dishes.find((d) => d.id === s.dish_id)).filter(Boolean)].slice(0, 40);
  const rows = list.length > 20 ? [list.slice(0, Math.ceil(list.length / 2)), list.slice(Math.ceil(list.length / 2))] : [list];
  let food = '';
  rows.forEach((row, r) => {
    const y = rows.length === 1 ? 91 : 77 + r * 28;
    const gap = Math.min(26, 470 / Math.max(row.length, 1));
    const start = W / 2 - ((row.length - 1) * gap) / 2;
    row.forEach((d, i) => {
      const idx = r * rows[0].length + i;
      const delay = animate ? `transition-delay:${(0.4 + idx * 0.06).toFixed(2)}s` : '';
      food += `<text class="dish ${animate ? '' : 'on'}" x="${start + i * gap}" y="${y}" text-anchor="middle" dominant-baseline="middle" style="${delay}">${dishEmoji(d)}</text>`;
    });
  });
  const dishCount = signups.length;
  $('meter').innerHTML = `<svg viewBox="0 0 ${W} 170" role="img" aria-label="${n} people coming, ${dishCount} dishes signed up">
    ${seats}
    <rect x="22" y="45" width="556" height="80" rx="40" fill="#a8703f"/>
    <rect x="22" y="45" width="556" height="80" rx="40" fill="url(#grain)" opacity=".35"/>
    <rect x="30" y="52" width="540" height="66" rx="33" fill="#fbf2e2" stroke="#e3cfae" stroke-width="2"/>
    <defs><pattern id="grain" width="40" height="8" patternUnits="userSpaceOnUse"><path d="M0 4 Q10 2 20 4 T40 4" stroke="#7d4f28" fill="none" stroke-width="1"/></pattern></defs>
    ${plates}${food}
  </svg>
  <p class="meter-label"><b>${n}</b> ${n === 1 ? 'person' : 'people'} coming · <b>${dishCount}</b> ${dishCount === 1 ? 'dish' : 'dishes'} on the table</p>`;
  if (animate) requestAnimationFrame(() => setTimeout(() => {
    $('meter').querySelectorAll('.plate[data-on="1"], .dish').forEach((el) => el.classList.add('on'));
  }, reduced ? 0 : 150));
}

/* ---------- menu ---------- */
function renderMenu() {
  if (!dishes.length) return;
  const host = dishes.filter((d) => d.category === 'host');
  let html = `<div class="card host"><h3>Uncle Danny’s got these</h3><ul>${host.map((d) =>
    `<li><span class="e">${dishEmoji(d)}</span><div><b>${esc(d.name)}</b>${d.hint ? ` <span>· ${esc(d.hint)}</span>` : ''}</div></li>`).join('')}</ul></div>`;
  html += CATS.map(([id, name, kick]) => {
    const list = dishes.filter((d) => d.category === id);
    return `<section class="cat"><div class="cat-head"><h3>${name}</h3></div><p class="sub" style="margin:-6px 0 10px">${esc(kick)}</p>
      <div class="dishes">${list.map(dishCard).join('')}</div>
      <button type="button" class="add-other" data-add="${id}">+ Add something else</button></section>`;
  }).join('');
  $('cats').innerHTML = html;
}

function dishCard(d) {
  const s = signsFor(d), n = s.length;
  const full = d.target && n >= d.target;
  const chip = d.target
    ? `<span class="chip ${full ? 'ok' : ''}">${full ? 'all set ✓' : `${n} of ${d.target}`}</span>`
    : n ? `<span class="chip ok">${n} bringing</span>` : '';
  const canDelete = d.added_by && !n;
  return `<article class="card dish-card ${full ? 'full' : ''}">
    ${canDelete ? `<button type="button" class="x" data-del="${d.id}" aria-label="Remove ${esc(d.name)}">✕</button>` : ''}
    <div class="dish-top"><span class="e">${dishEmoji(d)}</span>
      <div class="nm"><b>${esc(d.name)}</b>${d.hint ? `<small>${esc(d.hint)}</small>` : ''}${d.added_by && !d.last_year ? `<small>Added by ${esc(d.added_by)}</small>` : ''}</div>${canDelete ? '' : chip}</div>
    ${d.last_year ? `<p class="last">Last year: ${esc(d.last_year)}</p>` : ''}
    ${n ? `<ul class="who">${s.map((x) => `<li><button type="button" data-sign="${x.id}"><b>${esc(x.who)}</b>${x.note ? ` <i>· ${esc(x.note)}</i>` : ''}</button></li>`).join('')}</ul>` : ''}
    <button type="button" class="bring" data-bring="${d.id}">${n ? '+ I’ll bring one too' : '+ I’ll bring this'}</button>
  </article>`;
}

$('cats').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.add) return addDishDialog(b.dataset.add);
  if (b.dataset.bring) return bringDialog(dishes.find((d) => d.id === b.dataset.bring), e);
  if (b.dataset.sign) return signupDialog(signups.find((s) => s.id === b.dataset.sign));
  if (b.dataset.del) return deleteDish(dishes.find((d) => d.id === b.dataset.del));
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
    const f = dlg.querySelector('input:not([type=checkbox])');
    if (f && !f.value) f.focus();
  });
}
dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
const panTip = (cat) => PAN_CATS.includes(cat) ? '<p class="dlg-note">🍳 Please bring it in an aluminum pan (about 10″×12″) so it fits the chafing dishes.</p>' : '';

async function bringDialog(d) {
  if (!d) return;
  const r = await openDialog(`Bring ${d.name}?`,
    `${d.hint ? `<p class="dlg-note">${esc(d.hint)}</p>` : ''}
     <label class="field">Your name / family<input id="dName" maxlength="40" required value="${esc(myName())}" placeholder="e.g. Jeff & Sue"></label>
     <label class="field">Note (optional)<input id="dNote" maxlength="80" placeholder="e.g. homemade, 1 pan"></label>${panTip(d.category)}`,
    [{ label: 'Never mind', value: null, cls: 'ghost' }, { label: 'I’ll bring it', value: 'ok', submit: true }]);
  const who = r && $('dName').value.trim();
  if (!who) return;
  store.set('tgName', who);
  const note = $('dNote').value.trim() || null;
  const { error } = await T_SIGN.insert({ dish_id: d.id, who, note });
  if (error) return toast('Hmm, that didn’t save. Try again?');
  toast(`${dishEmoji(d)} Thanks, ${who}! ${d.name} is on the list.`);
  load();
}

async function signupDialog(s) {
  if (!s) return;
  const d = dishes.find((x) => x.id === s.dish_id);
  const r = await openDialog(d ? d.name : 'Sign-up',
    `<label class="field">Name / family<input id="dName" maxlength="40" required value="${esc(s.who)}"></label>
     <label class="field">Note (optional)<input id="dNote" maxlength="80" value="${esc(s.note || '')}"></label>`,
    [{ label: 'Close', value: null, cls: 'ghost' }, { label: 'Remove me', value: 'remove', cls: 'warn' }, { label: 'Save', value: 'save', submit: true }]);
  if (r === 'save') {
    const who = $('dName').value.trim(); if (!who) return;
    await T_SIGN.update({ who, note: $('dNote').value.trim() || null }, byId(s.id));
    toast('Updated ✏️');
  } else if (r === 'remove') {
    await T_SIGN.remove(byId(s.id));
    toast(`${d ? d.name : 'That dish'} is open again.`);
  } else return;
  load();
}

async function addDishDialog(cat) {
  const catName = CATS.find((c) => c[0] === cat)[1];
  const r = await openDialog(`Add to ${catName}`,
    `<label class="field">What is it?<input id="dItem" maxlength="60" required placeholder="e.g. Deviled eggs"></label>
     <label class="field">Your name / family<input id="dName" maxlength="40" required value="${esc(myName())}"></label>
     <label class="field">Note (optional)<input id="dNote" maxlength="80" placeholder="e.g. Mémère’s recipe"></label>
     <label class="check"><input type="checkbox" id="dMine" checked> I’m bringing it</label>${panTip(cat)}`,
    [{ label: 'Cancel', value: null, cls: 'ghost' }, { label: 'Add it', value: 'ok', submit: true }]);
  if (r !== 'ok') return;
  const name = $('dItem').value.trim(), who = $('dName').value.trim(), note = $('dNote').value.trim() || null, mine = $('dMine').checked;
  if (!name || !who) return;
  store.set('tgName', who);
  const { data, error } = await T_DISH.insert({ category: cat, name, target: 1, added_by: who, sort: 100 });
  if (error || !data.length) return toast('Hmm, that didn’t save. Try again?');
  if (mine) await T_SIGN.insert({ dish_id: data[0].id, who, note });
  toast(mine ? `${dishEmoji(data[0])} ${name} added. Thanks, ${who}!` : `${name} added to the list.`);
  load();
}

async function deleteDish(d) {
  if (!d) return;
  const r = await openDialog(`Remove ${d.name}?`, '<p class="dlg-note">Nobody’s signed up for it yet, so it’s safe to take off the list.</p>',
    [{ label: 'Keep it', value: null, cls: 'ghost' }, { label: 'Remove', value: 'ok', cls: 'warn' }]);
  if (r !== 'ok') return;
  await T_DISH.remove(byId(d.id));
  toast(`${d.name} removed.`);
  load();
}

/* ---------- full house ---------- */
function checkFullHouse() {
  const need = dishes.filter((d) => !d.locked && d.target && ['sides', 'desserts'].includes(d.category));
  const full = need.length && need.every((d) => signsFor(d).length >= d.target);
  if (!full || store.get('tgFull')) return;
  store.set('tgFull', '1');
  const b = $('fullhouse');
  setTimeout(() => { b.classList.add('show'); chime(); }, 800);
  setTimeout(() => b.classList.remove('show'), 7000);
}
$('fullhouse').addEventListener('click', () => $('fullhouse').classList.remove('show'));

/* ---------- RSVP ---------- */
function renderRsvps() {
  const A = rsvps.reduce((s, r) => s + r.adults, 0), K = rsvps.reduce((s, r) => s + r.kids, 0);
  $('rsvpTotal').textContent = rsvps.length
    ? `So far: ${plural(A, 'adult')}${K ? ` · ${plural(K, 'kid')}` : ''}`
    : 'No RSVPs yet. Be the first!';
  $('rsvpList').innerHTML = rsvps.map((r) => `<li><button type="button" data-r="${r.id}">
    <span class="fam">${esc(r.family)}${r.note ? `<span class="note">${esc(r.note)}</span>` : ''}</span>
    <span class="cnt">${plural(r.adults, 'adult')}${r.kids ? ` · ${plural(r.kids, 'kid')}` : ''}</span></button></li>`).join('');
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
  if (!adults && !kids) return toast('Add at least one person 🙂');
  const { error } = await T_RSVP.insert({ family, adults, kids, note: $('rNote').value.trim() || null });
  if (error) return toast('Hmm, that didn’t save. Try again?');
  if (!myName()) store.set('tgName', family);
  e.target.reset(); $('rAdults').textContent = 2; $('rKids').textContent = 0;
  toast(`🦃 See you Thursday, ${family}!`);
  load();
});
$('rsvpList').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-r]');
  const r0 = b && rsvps.find((r) => r.id === b.dataset.r);
  if (!r0) return;
  const r = await openDialog(r0.family,
    `<label class="field">Family / name<input id="eFam" maxlength="40" required value="${esc(r0.family)}"></label>
     <div class="steppers" style="margin-bottom:12px">
       <label class="field" style="flex:1">Adults<input id="eA" type="number" min="0" max="30" value="${r0.adults}"></label>
       <label class="field" style="flex:1">Kids<input id="eK" type="number" min="0" max="30" value="${r0.kids}"></label></div>
     <label class="field">Note<input id="eNote" maxlength="140" value="${esc(r0.note || '')}"></label>`,
    [{ label: 'Close', value: null, cls: 'ghost' }, { label: 'Remove', value: 'remove', cls: 'warn' }, { label: 'Save', value: 'save', submit: true }]);
  if (r === 'save') {
    const clamp = (v) => Math.max(0, Math.min(30, Math.round(+v || 0)));
    await T_RSVP.update({ family: $('eFam').value.trim() || r0.family, adults: clamp($('eA').value), kids: clamp($('eK').value), note: $('eNote').value.trim() || null }, byId(r0.id));
    toast('Updated ✏️');
  } else if (r === 'remove') {
    await T_RSVP.remove(byId(r0.id));
    toast(`${r0.family} removed. We’ll miss you!`);
  } else return;
  load();
});

/* ---------- gratitude wall ---------- */
const LEAF = [['#fbe1c4', '🍂'], ['#f6d2b8', '🍁'], ['#e9e3c6', '🌾'], ['#f3dccb', '🍂'], ['#e4e9d3', '🍃']];
const myThanks = () => { try { return JSON.parse(store.get('tgMine') || '[]'); } catch { return []; } };
function renderThanks() {
  const mine = myThanks();
  $('thanksWall').innerHTML = thanks.length ? thanks.map((t, i) => {
    const [c, em] = LEAF[i % LEAF.length];
    return `<div class="leaf" style="--c:${c};--e:'${em}'"><p>${esc(t.body)}</p>${t.who ? `<small>— ${esc(t.who)}</small>` : ''}
      ${mine.includes(t.id) ? `<button type="button" class="x" data-t="${t.id}" aria-label="Remove">✕</button>` : ''}</div>`;
  }).join('') : '<p class="empty">No leaves yet. Start us off?</p>';
}
$('thanksForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = $('tBody').value.trim();
  if (!body) return;
  const { data, error } = await T_THANKS.insert({ body, who: $('tWho').value.trim() || null });
  if (error || !data.length) return toast('Hmm, that didn’t save. Try again?');
  store.set('tgMine', JSON.stringify([...myThanks(), data[0].id]));
  $('tBody').value = '';
  toast('🍂 Added to the wall. Merci!');
  load();
});
$('thanksWall').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-t]');
  if (!b) return;
  await T_THANKS.remove(byId(b.dataset.t));
  load();
});
if (myName()) { $('tWho').value = myName(); }

/* ---------- date, countdown, calendar, directions ---------- */
function renderDate() {
  const n = daysUntil();
  if (n === 0) {
    $('kicker').textContent = 'Happy Thanksgiving!';
    $('countdown').textContent = 'Today’s the day. See you at Uncle Danny’s! 🦃';
  } else if (n < 0) {
    $('countdown').textContent = 'Thanks for a wonderful Thanksgiving. See you next year! 🧡';
  } else {
    $('countdown').textContent = n === 1 ? 'Tomorrow! 🦃' : `${n} days to go 🍂`;
  }
}
const isApple = /iPad|iPhone|iPod|Macintosh/.test(navigator.userAgent) && 'ontouchend' in document;
$('directions').href = isApple
  ? `https://maps.apple.com/?daddr=${encodeURIComponent(ADDRESS)}`
  : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(ADDRESS)}`;
const GCAL = 'https://calendar.google.com/calendar/render?action=TEMPLATE'
  + '&text=' + encodeURIComponent('🦃 Beaudoin Family Thanksgiving')
  + '&dates=20261126/20261127'
  + '&location=' + encodeURIComponent(ADDRESS)
  + '&details=' + encodeURIComponent('Thanksgiving at Uncle Danny’s. Times coming soon.\nSign-ups: ' + location.origin + location.pathname);
$('calBtn').addEventListener('click', () => {
  const apple = `<a class="btn" href="thanksgiving.ics">🍎 Apple / Outlook Calendar</a>`;
  const google = `<a class="btn ${isApple ? 'ghost' : ''}" href="${GCAL}" target="_blank" rel="noopener">📆 Google Calendar</a>`;
  openDialog('Add Thanksgiving to your calendar',
    `<p class="dlg-note">Thursday 11/26 at Uncle Danny’s, 11 Chestnut St, Wilmington. Added as an all-day event until times are set.</p>
     <div class="cal-opts">${isApple ? apple + google : google + apple.replace('class="btn"', 'class="btn ghost"')}</div>`,
    [{ label: 'Close', value: null, cls: 'ghost' }]);
  $('dlgBody').querySelectorAll('a').forEach((a) => a.addEventListener('click', () => setTimeout(() => dlg.close(), 300)));
});

/* ---------- weather ---------- */
const WMO = {
  0: ['☀️', 'Sunny'], 1: ['🌤️', 'Mostly sunny'], 2: ['⛅', 'Partly cloudy'], 3: ['☁️', 'Cloudy'], 45: ['🌫️', 'Foggy'], 48: ['🌫️', 'Icy fog'],
  51: ['🌦️', 'Light drizzle'], 53: ['🌦️', 'Drizzle'], 55: ['🌧️', 'Heavy drizzle'], 56: ['🧊', 'Freezing drizzle'], 57: ['🧊', 'Freezing drizzle'],
  61: ['🌧️', 'Light rain'], 63: ['🌧️', 'Rain'], 65: ['🌧️', 'Heavy rain'], 66: ['🧊', 'Freezing rain'], 67: ['🧊', 'Freezing rain'],
  71: ['🌨️', 'Light snow'], 73: ['🌨️', 'Snow'], 75: ['❄️', 'Heavy snow'], 77: ['🌨️', 'Snow grains'], 80: ['🌦️', 'Showers'], 81: ['🌧️', 'Showers'],
  82: ['⛈️', 'Heavy showers'], 85: ['🌨️', 'Snow showers'], 86: ['❄️', 'Heavy snow showers'], 95: ['⛈️', 'Thunderstorms'], 96: ['⛈️', 'Thunderstorms'], 99: ['⛈️', 'Thunderstorms'],
};
async function weather() {
  const el = $('weather');
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=America%2FNew_York&forecast_days=16`;
    const w = await (await fetch(url)).json();
    const key = `${DAY.y}-${DAY.m}-${DAY.d}`;
    const i = w.daily.time.indexOf(key);
    if (i === -1) { el.innerHTML = '<p class="loading">The Thanksgiving forecast isn’t available yet. Check back closer to the day.</p>'; return; }
    const d = w.daily, code = d.weather_code[i];
    const hi = Math.round(d.temperature_2m_max[i]), lo = Math.round(d.temperature_2m_min[i]);
    const pop = d.precipitation_probability_max[i] ?? 0, wind = Math.round(d.wind_speed_10m_max[i]);
    const [ico, txt] = WMO[code] || ['🌡️', 'Weather'];
    const verdict = pop >= 70 || code >= 95 || [56, 57, 65, 66, 67, 75, 82, 86].includes(code) ? 'Looks like a couch-and-football-on-TV kind of day 📺'
      : hi < 32 || wind > 20 ? 'Game on, but bundle up 🧣'
      : pop >= 40 ? 'Maybe. Keep a jacket by the door 🧥'
      : 'Walk and backyard football are ON 🏈';
    el.innerHTML = `<span class="wx-ico">${ico}</span><div>
      <p class="big">${txt}, ${hi}° / ${lo}°F</p>
      <p class="meta">${pop}% chance of precipitation · wind up to ${wind} mph</p>
      <p class="verdict">${verdict}</p>
      <p class="meta">Thanksgiving forecast for Wilmington, MA${daysUntil() > 5 ? ' (still a ways out, may change)' : ''}</p></div>`;
  } catch {
    el.innerHTML = '<p class="loading">Couldn’t get the forecast right now. Check back later.</p>';
  }
}

/* ---------- toast + sounds ---------- */
let toastT;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 3200);
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

/* ---------- the one secret: tap the turkey ---------- */
const GOBBLES = ['Gobble gobble! 🦃', 'Glouglou! (that’s turkey in French) 🦃', 'Save room for pie. 🥧', 'Gobble gobble! 🦃', 'Did someone say tourtière? 🥧'];
let gob = 0;
$('turkey').addEventListener('click', () => {
  const t = $('turkey');
  t.classList.remove('gobble'); void t.offsetWidth; t.classList.add('gobble');
  gobbleSound();
  toast(GOBBLES[gob++ % GOBBLES.length]);
});

/* ---------- a few falling leaves ---------- */
if (!reduced) {
  const L = ['🍂', '🍁', '🍂', '🍁', '🍂', '🍃'];
  $('leaves').innerHTML = L.map((e, i) => {
    const dur = 22 + Math.random() * 14;
    return `<i style="left:${(i * 17 + Math.random() * 10) % 100}%;font-size:${14 + Math.random() * 10}px;animation-duration:${dur}s;animation-delay:${-Math.random() * dur}s">${e}</i>`;
  }).join('');
}

/* ---------- go ---------- */
renderDate();
setInterval(renderDate, 60e3);
load();
weather();
