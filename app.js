/* Beaudoin Family Thanksgiving sign-up. Plain JS, no build step. */
const COURSES = [
  ['sides', 'Sides', 'Everything that goes next to the turkey'],
  ['desserts', 'Pies & Desserts', 'Room for about six'],
  ['extras', 'Something Else', 'Not needed, but bring it if you’d like to get creative'],
];
const NEED_CATS = ['sides', 'desserts']; // courses that count toward "covered"
const NO_PAN = /gravy|cranberr|roll|bread/i; // sides that don't go in a chafing dish
const HOST_COOK = (d) => /tourti/i.test(d.name) ? 'Sammy' : 'Danny &amp; Barb'; // who makes each host dish

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
    insert: (row) => { lastWrite = Date.now(); return run('POST', '', row); },
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

let dishes = [], signups = [], rsvps = [], thanks = [], loadedOnce = false, lastWrite = 0;
const seen = { s: new Set(), r: new Set() }; // ids already shown, so new ones can fade in like fresh ink

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
  const first = !loadedOnce; loadedOnce = true; lastLoad = Date.now();
  dishes = a.data.filter((d) => (d.category === 'host' || COURSES.some((c) => c[0] === d.category)));
  signups = b.data.filter((s) => dishes.some((d) => d.id === s.dish_id));
  if (c.data) rsvps = c.data;
  if (t.data) thanks = t.data;
  renderAll(first);
  if (first) setTimeout(() => maybeShowList(), 700);
}
let reloadT;
const reloadSoon = () => { clearTimeout(reloadT); reloadT = setTimeout(load, 250); };
// Polling is the fallback; with the live connection up, a slow safety refresh is enough.
let lastLoad = 0;
setInterval(() => {
  if (document.hidden || $('dlg').open) return;
  if (feed && feed.connected() && Date.now() - lastLoad < 120e3) return;
  load();
}, 12000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) reloadSoon(); });

function renderAll(animate = false) {
  const freshS = animate ? [] : signups.filter((x) => !seen.s.has(x.id)).map((x) => x.dish_id);
  const freshR = animate ? [] : rsvps.filter((x) => !seen.r.has(x.id)).map((x) => x.id);
  signups.forEach((x) => seen.s.add(x.id)); rsvps.forEach((x) => seen.r.add(x.id));
  setTimeout(() => {
    freshS.forEach((id) => document.querySelectorAll(`.dish-row[data-dish="${id}"]`).forEach(ink));
    freshR.forEach((id) => document.querySelectorAll(`.pc[data-r="${id}"], .ledger [data-r="${id}"]`).forEach(ink));
  });
  renderMeter(animate);
  renderMenu();
  renderRsvps();
  renderThanks();
  checkFullHouse();
}
const signsFor = (d) => signups.filter((s) => s.dish_id === d.id);
// "Your specialty" is an invitation row, not a dish: tapping it adds the person's own dessert to the menu.
const isSpecialty = (d) => d.category === 'desserts' && /specialty/i.test(d.name);
const courseNeeds = () => dishes.filter((x) => !x.locked && x.target && NEED_CATS.includes(x.category) && !isSpecialty(x));

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
  // On Thanksgiving Day the "still needed" line gives way to the photo wall and thankful notes.
  const dayOf = daysUntil() <= 0;
  const need = dayOf
    ? `<div class="day-tiles">
        <a class="day-tile" href="add.html"><span class="caps">Photos</span><b>Add a photo</b><small>It goes right on the TV</small></a>
        <a class="day-tile" href="#thanksBlock"><span class="caps">Giving thanks</span><b>What are you thankful for?</b><small>We’ll read a few at dinner</small></a>
      </div>`
    : needed.length
    ? `<p class="needed"><span class="caps">Still needed</span>${shown.map((d, i) =>
        `${i ? (i === shown.length - 1 && !more ? ' and ' : ', ') : ''}<button type="button" data-dish="${d.id}">${esc(pretty(d.name).toLowerCase())}</button>`).join('')}${more ? `, and ${spell(more)} more` : ''}</p>`
    : `<p class="needed done"><span class="caps">Still needed</span>Nothing. The table is set.</p>`;
  const cards = rsvps.map((r, i) => `<li class="pc" data-r="${r.id}" style="--i:${i}"><b>${esc(r.family)}</b><span>party of ${r.adults + r.kids}</span></li>`).join('')
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
    `<li><div class="dish-row host"><b class="nm">${esc(pretty(d.name))}</b><span class="lead"></span><span class="st"><span class="who"><span class="p">${HOST_COOK(d)}</span></span></span>${d.hint ? `<small class="hint">${esc(d.hint)}</small>` : ''}</div></li>`).join('')}</ul></section>`;
  html += COURSES.map(([id, name, kick]) => {
    const list = dishes.filter((d) => d.category === id).sort((a, b) => isSpecialty(a) - isSpecialty(b));
    return `<section class="course"><div class="course-head"><h3>${name}</h3></div><p class="course-sub">${esc(kick)}</p>
      <ul class="dishes">${list.map(dishRow).join('')}</ul>
      ${list.some(isSpecialty) ? '' : `<button type="button" class="add-other" data-add="${id}">Add something else</button>`}</section>`;
  }).join('');
  $('cats').innerHTML = html;
  paintLooking();
}

// Same person signing up twice shows once, with a count: "The Jacob Forciers ×2".
function groupWho(list) {
  const m = new Map();
  list.forEach((x) => { const k = x.who.trim().toLowerCase(); const e = m.get(k); if (e) e[1]++; else m.set(k, [x.who.trim(), 1]); });
  return [...m.values()];
}
function dishRow(d) {
  if (isSpecialty(d)) return `<li><button type="button" class="dish-row special" data-special="${d.category}">
    <b class="nm">${esc(pretty(d.name))}</b><span class="lead"></span><span class="st"><span class="who add">Add yours</span></span>${d.hint ? `<small class="hint">${esc(d.hint)}</small>` : ''}</button></li>`;
  const s = signsFor(d), n = s.length, full = d.target && n >= d.target;
  const who = n
    ? `<span class="who">${groupWho(s).map(([w, k]) => `<span class="p">${esc(w)}${k > 1 ? `<span class="x2">×${k}</span>` : ''}</span>`).join(', ')}</span>`
    : '<span class="who open">Open</span>';
  const count = n && d.target ? `<span class="n">${full ? 'Covered' : `${n} of ${d.target}`}</span>` : '';
  const sub = [d.hint, d.added_by && !n ? `added by ${d.added_by}` : ''].filter(Boolean).join(' · ');
  return `<li><button type="button" class="dish-row ${full ? 'full' : ''}" data-dish="${d.id}">
    <b class="nm">${esc(pretty(d.name))}</b><span class="lead"></span><span class="st">${who}${count}</span>${sub ? `<small class="hint">${esc(sub)}</small>` : ''}</button></li>`;
}

$('cats').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.special) return specialtyDialog(b.dataset.special);
  if (b.dataset.add) return addDishDialog(b.dataset.add);
  if (b.dataset.dish) return dishDialog(dishes.find((d) => d.id === b.dataset.dish));
});

/* ---------- dialogs ---------- */
const dlg = $('dlg');
// Smooth page transitions (View Transitions API): the tapped row grows into the dialog,
// and closing sets it back down onto the row. Browsers without support just open and close.
const canMorph = () => !!document.startViewTransition && !reduced;
let tapped = null, tappedAt = 0;
document.addEventListener('click', (e) => {
  const el = e.target.closest('.dish-row, .ledger button, .needed [data-dish]');
  if (el) { tapped = el; tappedAt = Date.now(); }
}, true);
let morphFrom = null;
function morph(from, to, change) {
  if (!canMorph() || !from || !from.isConnected) return change();
  from.style.viewTransitionName = 'card';
  dlg.classList.add('morphing');
  const t = document.startViewTransition(() => { from.style.viewTransitionName = ''; to.style.viewTransitionName = 'card'; change(); });
  t.finished.finally(() => { to.style.viewTransitionName = ''; });
}
function openDialog(title, body, actions) {
  $('dlgTitle').textContent = title;
  $('dlgBody').innerHTML = body;
  $('dlgActions').innerHTML = actions.map((a, i) => `<button value="${i}" class="btn ${a.cls || ''}" ${a.submit ? '' : 'formnovalidate'}>${esc(a.label)}</button>`).join('');
  morphFrom = Date.now() - tappedAt < 600 ? tapped : null;
  return new Promise((res) => {
    dlg.onclose = () => { const a = actions[+dlg.returnValue]; res(a ? a.value : null); dlg.returnValue = ''; };
    const open = () => {
      dlg.showModal();
      const f = dlg.querySelector('input:not([type=checkbox]), textarea');
      if (f && !f.value && !touch) f.focus(); else dlg.querySelector('h3').focus?.();
    };
    if (morphFrom) {
      morph(morphFrom, dlg, open);
    } else open();
  });
}
// Close through the same morph, so the box shrinks back into the row it came from.
$('dlgForm').addEventListener('submit', (e) => {
  if (!morphFrom || !canMorph() || !morphFrom.isConnected) return; // native close
  e.preventDefault();
  const value = e.submitter ? e.submitter.value : '';
  const from = morphFrom; morphFrom = null;
  dlg.style.viewTransitionName = 'card';
  const t = document.startViewTransition(() => { dlg.style.viewTransitionName = ''; from.style.viewTransitionName = 'card'; dlg.close(value); });
  t.finished.finally(() => { from.style.viewTransitionName = ''; });
});
dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
dlg.addEventListener('close', () => dlg.classList.remove('morphing')); // keep the plain fade-in from replaying after a morph
const field = (label, id, value = '', ph = '', required = false, max = 40) =>
  `<label class="line"><span class="caps">${label}</span><input id="${id}" maxlength="${max}" value="${esc(value)}" placeholder="${esc(ph)}" ${required ? 'required' : ''}></label>`;
const PAN_NOTE = (lead) => `<p class="dlg-note" style="margin:14px 0 0">${lead} an aluminum pan, about 10″ × 12″, so it fits the chafing dishes.</p>`;
const panTip = (d) => d.category === 'sides' && !NO_PAN.test(d.name) ? PAN_NOTE('Please bring it in') : '';

async function dishDialog(d) {
  if (!d) return;
  const s = signsFor(d), n = s.length;
  let edit = null;
  const acts = [{ label: 'Close', value: null, cls: 'ghost' }];
  if (d.added_by && !n) acts.push({ label: 'Remove dish', value: 'delete', cls: 'warn' });
  acts.push({ label: n ? 'I’ll bring one too' : 'I’ll bring it', value: 'ok', submit: true });
  const status = d.target ? (n >= d.target ? 'Covered, but doubles are welcome' : n ? `${word(n)} of ${word(d.target)} so far` : `${word(d.target)} needed`) : '';
  const p = openDialog(pretty(d.name),
    `<p class="dlg-note">${[d.hint, status].filter(Boolean).map((x) => esc(cap(x))).join(' · ') || 'Tap below to bring it.'}</p>
     ${n ? `<ul class="dlg-who">${s.map((x) => `<li><button type="button" data-s="${x.id}"><b>${esc(x.who)}</b><i>${esc(x.note || '')}</i><span class="edit">Edit</span></button></li>`).join('')}</ul>` : ''}
     <div class="dlg-fields">${field('Your name', 'dName', myName(), 'e.g. Jeff & Sue', true)}
       <div class="stepper qty"><span class="caps">How many</span><button type="button" data-q="-1" aria-label="Fewer">−</button><output id="dQty">1</output><button type="button" data-q="1" aria-label="More">+</button></div>
       ${field('Note', 'dNote', '', 'optional, e.g. homemade', false, 80)}</div>${panTip(d)}`, acts);
  $('dlgBody').querySelectorAll('[data-s]').forEach((b) => b.addEventListener('click', () => { edit = b.dataset.s; dlg.close(); }));
  const okBtn = $('dlgActions').querySelector('button:last-child'), okLabel = okBtn.textContent;
  $('dlgBody').querySelectorAll('[data-q]').forEach((b) => b.addEventListener('click', () => {
    const q = Math.max(1, Math.min(4, +$('dQty').textContent + +b.dataset.q));
    $('dQty').textContent = q;
    okBtn.textContent = q > 1 ? `I’ll bring ${word(q)}` : okLabel;
  }));
  // tell everyone else someone has this dish open, until the box closes
  const ping = () => feed.broadcast('looking', { dish: d.id });
  ping(); const pingT = setInterval(ping, 4000);
  const r = await p;
  clearInterval(pingT); feed.broadcast('done', { dish: d.id });
  if (edit) return signupDialog(signups.find((x) => x.id === edit));
  if (r === 'delete') {
    await T_DISH.remove(byId(d.id));
    toast(`${pretty(d.name)} was taken off the menu.`);
    return load();
  }
  const who = r === 'ok' && $('dName').value.trim();
  if (!who) return;
  store.set('tgName', who);
  const qty = +$('dQty').textContent || 1, note = $('dNote').value.trim() || null;
  const { error } = await T_SIGN.insert(Array.from({ length: qty }, () => ({ dish_id: d.id, who, note })));
  if (error) return toast('That didn’t save. Please try again.');
  toast(`Thank you, ${who}. ${pretty(d.name)}${qty > 1 ? ` ×${qty}` : ''} is on the table.`);
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
     <label class="check"><input type="checkbox" id="dMine" checked> I’m bringing it</label></div>${cat === 'sides' ? PAN_NOTE('If it’s a hot dish, please bring it in') : ''}`,
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

async function specialtyDialog(cat) {
  const okLabel = 'Add it to the menu';
  const p = openDialog('What’s your specialty?',
    `<p class="dlg-note">Cake, cookies, bars, anything sweet. It goes on the menu under your name.</p>
     <div class="dlg-fields">${field('Dessert', 'dItem', '', 'e.g. Ricotta cherry cake', true, 60)}${field('Your name', 'dName', myName(), '', true)}
       <div class="stepper qty"><span class="caps">How many</span><button type="button" data-q="-1" aria-label="Fewer">−</button><output id="dQty">1</output><button type="button" data-q="1" aria-label="More">+</button></div>
       ${field('Note', 'dNote', '', 'optional', false, 80)}</div>`,
    [{ label: 'Close', value: null, cls: 'ghost' }, { label: okLabel, value: 'ok', submit: true }]);
  $('dlgBody').querySelectorAll('[data-q]').forEach((b) => b.addEventListener('click', () => {
    $('dQty').textContent = Math.max(1, Math.min(4, +$('dQty').textContent + +b.dataset.q));
  }));
  if (await p !== 'ok') return;
  const name = $('dItem').value.trim(), who = $('dName').value.trim(), note = $('dNote').value.trim() || null, qty = +$('dQty').textContent || 1;
  if (!name || !who) return;
  store.set('tgName', who);
  // no target: an extra dessert is a bonus, so it never shows up as "still needed"
  const { data, error } = await T_DISH.insert({ category: cat, name, target: null, added_by: who, sort: 100 });
  if (error || !data.length) return toast('That didn’t save. Please try again.');
  await T_SIGN.insert(Array.from({ length: qty }, () => ({ dish_id: data[0].id, who, note })));
  toast(`Thank you, ${who}. ${name}${qty > 1 ? ` ×${qty}` : ''} is on the menu.`);
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
  const { data, error } = await T_THANKS.insert({ body, who: $('tWho').value.trim() || null, owner_hash: await fingerprint(deviceKey()) });
  if (error && (error.code === '42501' || /row-level security/i.test(error.message || ''))) return toast('Posting is closed right now.');
  if (error || !data.length) return toast('That didn’t save. Please try again.');
  store.set('tgMine', JSON.stringify([...myThanks(), data[0].id]));
  $('tBody').value = ''; grow();
  toast('Added. Merci.');
  load();
});
$('thanksWall').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-t]');
  if (!b) return;
  const ok = await removeItem('note', b.dataset.t);
  toast(ok ? 'Removed.' : 'That one can’t be removed from this phone.');
  load();
});
if (myName()) $('tWho').value = myName();
const grow = () => { const t = $('tBody'); t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; };
$('tBody').addEventListener('input', grow);

/* ---------- date, calendar, directions ---------- */
let hereNow = 0; // other people on the page right now (live presence)
function renderDate() {
  const n = daysUntil();
  $('countdown').textContent = (n === 0 ? (Date.now() < ARRIVE ? 'Happy Thanksgiving · see you at 1' : 'Happy Thanksgiving')
    : n < 0 ? 'Thank you for a wonderful Thanksgiving'
    : n === 1 ? 'Tomorrow' : `${word(n)} days to go`)
    + (hereNow > 0 ? ` · ${word(hereNow)} ${hereNow === 1 ? 'other' : 'others'} here now` : '');
  // one quiet line about the photo and thankful-note wall; on the day it speaks to people at the party
  const share = $('shareLine');
  share.hidden = n <= 0; // on the day the photo and thanks tiles under the invitation do this job
  share.classList.toggle('today', n <= 0);
  share.innerHTML = n <= 0
    ? 'Share a photo or what you’re thankful for. It goes right on the TV. <a href="add.html">Add yours</a>'
    : 'New this year: on Thursday, share photos and what you’re thankful for, and they’ll play on the TV at Danny &amp; Barb’s. <a href="add.html">Add yours</a>';
}
const isApple = /iPad|iPhone|iPod|Macintosh/.test(navigator.userAgent) && 'ontouchend' in document;
$('directions').href = isApple
  ? `https://maps.apple.com/?daddr=${encodeURIComponent(ADDRESS)}`
  : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(ADDRESS)}`;
const GCAL = 'https://calendar.google.com/calendar/render?action=TEMPLATE'
  + '&text=' + encodeURIComponent('Beaudoin Family Thanksgiving')
  + '&dates=20261126T180000Z/20261127T000000Z'
  + '&location=' + encodeURIComponent(ADDRESS)
  + '&details=' + encodeURIComponent('Thanksgiving at Danny & Barb’s. Arrive at 1 pm.\nSign-ups: ' + location.origin + location.pathname);
$('calBtn').addEventListener('click', () => {
  const apple = `<a class="btn ${isApple ? '' : 'ghost'}" href="thanksgiving.ics">Apple or Outlook calendar</a>`;
  const google = `<a class="btn ${isApple ? 'ghost' : ''}" href="${GCAL}" target="_blank" rel="noopener">Google Calendar</a>`;
  openDialog('Add to your calendar',
    `<p class="dlg-note">Thursday, November 26, 1 pm at Danny & Barb’s, 1 Leonard Lane, Wilmington. Includes a reminder the day before.</p>
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

/* ---------- "Your list for today": what this person signed up to bring ---------- */
const isToday = () => daysUntil() === 0;
const norm = (s) => String(s || '').trim().toLowerCase();
function listName() { return store.get('tgListName') || myName(); }
function bringers() {
  const m = new Map();
  signups.forEach((s) => { const k = norm(s.who); if (k && !m.has(k)) m.set(k, s.who.trim()); });
  return [...m.values()].sort((a, b) => a.localeCompare(b));
}
function myItems(name) {
  const byDish = new Map();
  signups.filter((s) => norm(s.who) === norm(name)).forEach((s) => {
    const e = byDish.get(s.dish_id) || { n: 0, notes: [] };
    e.n++; if (s.note) e.notes.push(s.note);
    byDish.set(s.dish_id, e);
  });
  return [...byDish].map(([id, e]) => ({ d: dishes.find((x) => x.id === id), ...e })).filter((x) => x.d);
}
const packed = () => { try { return JSON.parse(store.get('tgPacked') || '[]'); } catch { return []; } };

async function pickName() {
  const names = bringers();
  if (!names.length) return null;
  // the dialog stacks its buttons bottom-up, so list them in reverse to read A to Z
  const opts = [{ label: 'I’m not bringing anything', value: '—', cls: 'ghost' }, ...names.slice().reverse().map((n) => ({ label: n, value: n, cls: 'ghost pick-name' }))];
  const r = await openDialog('Who’s bringing food?', '<p class="dlg-note">Pick the name you signed up under, and we’ll show you what you’re bringing today.</p>', opts);
  if (r) store.set('tgListName', r);
  return r;
}

async function showList(fromLink = false) {
  let name = listName();
  if (!name || !myItems(name).length) {
    if (!fromLink && store.get('tgListName') === '—') return;
    name = await pickName();
    if (!name || name === '—') return;
  }
  const items = myItems(name);
  if (!items.length) return fromLink && toast('Nothing on the menu under that name yet.');
  const done = packed();
  const rows = items.map(({ d, n, notes }) => `<li><label class="pack">
      <input type="checkbox" data-pack="${d.id}" ${done.includes(d.id) ? 'checked' : ''}>
      <span><b>${esc(pretty(d.name))}${n > 1 ? ` <em>×${n}</em>` : ''}</b>
      ${[notes.join(', '), d.category === 'sides' && !NO_PAN.test(d.name) ? 'in an aluminum pan' : ''].filter(Boolean).map((x) => `<small>${esc(x)}</small>`).join('')}</span></label></li>`).join('');
  const p = openDialog('Your list for today',
    `<p class="dlg-note">${esc(name)}, here’s what you’re bringing. Tick things off as they go in the car.</p>
     <ul class="pack-list">${rows}</ul>
     <p class="dlg-note pack-where">Arrive at 1 pm · 1 Leonard Lane, Wilmington · <a href="${esc($('directions').href)}" target="_blank" rel="noopener">Directions</a></p>
     <p class="bon pack-bon">Happy Thanksgiving!</p>
     <p class="pack-other"><button type="button" class="link" id="notMe">Not ${esc(name)}?</button></p>`,
    [{ label: 'Got it', value: 'ok', submit: true }]);
  $('dlgBody').addEventListener('change', (e) => {
    const c = e.target.closest('[data-pack]'); if (!c) return;
    const s = new Set(packed()); c.checked ? s.add(c.dataset.pack) : s.delete(c.dataset.pack);
    store.set('tgPacked', JSON.stringify([...s]));
    if (items.every(({ d }) => s.has(d.id))) toast('All packed. See you at 1!');
  });
  let swap = false;
  $('notMe').addEventListener('click', () => { swap = true; dlg.close(); });
  await p;
  if (swap) { store.set('tgListName', ''); const n = await pickName(); if (n && n !== '—') showList(true); }
}
function maybeShowList() {
  if (!isToday()) return;
  $('listLink').hidden = false;
  // once per day, and only until the evening
  const today = etToday(); const key = `${today.y}-${today.m}-${today.d}`;
  if (store.get('tgListShown') === key || Date.now() > ARRIVE + 4 * 3600e3) return;
  store.set('tgListShown', key);
  showList();
}
$('listLink').addEventListener('click', () => showList(true));

/* ---------- live updates ---------- */
function ink(el) { el.classList.remove('fresh'); void el.offsetWidth; el.classList.add('fresh'); }
const feed = live(['tg_dishes', 'tg_signups', 'tg_rsvps', 'tg_thanks'], ({ table, type, record }) => {
  reloadSoon();
  if (type !== 'INSERT' || Date.now() - lastWrite < 5000) return;
  if (table === 'tg_signups') {
    const d = dishes.find((x) => x.id === record.dish_id);
    toast(`${record.who} just signed up for ${d ? pretty(d.name).toLowerCase() : 'a dish'}.`);
  } else if (table === 'tg_rsvps') toast(`${record.family} just RSVP’d.`);
  else if (table === 'tg_thanks') toast('Someone just added what they’re thankful for.');
}, {
  presence: { kind: 'page' },
  onPresence: (list) => { hereNow = list.filter((m) => m.kind === 'page' && m.key !== feed.me).length; renderDate(); },
  onBroadcast: (event, p) => {
    if (!p.dish) return;
    if (event === 'looking') looking.set(p.dish, Date.now() + 7000); else looking.delete(p.dish);
    paintLooking();
  },
});

/* "Someone is signing up for this…" on any dish another visitor has open right now */
const looking = new Map();
function paintLooking() {
  const now = Date.now();
  looking.forEach((until, id) => { if (until < now) looking.delete(id); });
  document.querySelectorAll('.dish-row .looking').forEach((el) => { if (!looking.has(el.parentElement.dataset.dish)) el.remove(); });
  looking.forEach((_, id) => {
    const row = document.querySelector(`.dish-row[data-dish="${id}"]`);
    if (row && !row.querySelector('.looking')) row.insertAdjacentHTML('beforeend', '<small class="looking">Someone is signing up for this…</small>');
  });
}
setInterval(paintLooking, 1500);

/* ---------- go ---------- */
renderDate();
setInterval(renderDate, 60e3);
load();
weather();
