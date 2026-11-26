/* Table polls for Thanksgiving Day: a light question that changes through the day.
   Votes go through tg_poll_vote (one per phone per poll, changeable); results come from tg_poll_results.
   After voting, a phone sends a short live signal so other phones and the TV refresh right away. */
const POLLS = [
  { id: 'pie', q: 'Best pie?', options: ['Pumpkin', 'Apple', 'Pecan', 'Whichever is closest'] },
  { id: 'meat', q: 'White meat or dark meat?', options: ['White meat', 'Dark meat', 'Both, obviously'] },
  { id: 'side', q: 'Stuffing or mashed potatoes?', options: ['Stuffing', 'Mashed potatoes', 'Same forkful'] },
  { id: 'cranberry', q: 'Cranberry sauce?', options: ['Canned, ridges and all', 'Homemade', 'Skip it'] },
  { id: 'after', q: 'After dinner?', options: ['Nap', 'Football', 'Pie, round two'] },
  { id: 'gravy', q: 'How much gravy?', options: ['A little', 'A lot', 'Swimming in it'] },
  { id: 'leftover', q: 'Best leftover?', options: ['Turkey sandwich', 'Tourtière', 'Pie for breakfast'] },
];
// Starting 8 a.m. Eastern on Thanksgiving, a new poll every 75 minutes, cycling.
const POLL_START = Date.UTC(2026, 10, 26, 13), POLL_EVERY = 75 * 60e3;
function activePoll(now = Date.now()) {
  const i = Math.max(0, Math.floor((now - POLL_START) / POLL_EVERY));
  return POLLS[i % POLLS.length];
}
const pollIsLive = (now = Date.now()) => now >= POLL_START - 3 * 3600e3 && now < Date.UTC(2026, 10, 27, 8);

async function pollRpc(name, body) {
  const r = await fetch(`${SB_URL}/rest/v1/rpc/${name}`, {
    method: 'POST', headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }).catch(() => null);
  return r && r.ok ? r.json().catch(() => null) : null;
}
async function pollResults(poll) {
  const rows = (await pollRpc('tg_poll_results', { p_poll: poll.id })) || [];
  const counts = Object.fromEntries(poll.options.map((o) => [o, 0]));
  rows.forEach((r) => { if (r.choice in counts) counts[r.choice] = Number(r.votes); });
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return { counts, total };
}
function pollBars(poll, { counts, total }, mine) {
  const top = Math.max(...Object.values(counts));
  return poll.options.map((o) => {
    const n = counts[o], pct = total ? Math.round((n / total) * 100) : 0;
    return `<div class="pbar ${o === mine ? 'mine' : ''} ${n && n === top ? 'lead' : ''}">
      <span class="plabel">${o}${o === mine ? ' <em>your vote</em>' : ''}</span><span class="ppct">${pct}%</span>
      <i style="width:${pct}%"></i></div>`;
  }).join('');
}

/* A phone-sized poll card. `el` is the container; `signal(poll)` tells others a vote happened. */
function pollWidget(el, signal = () => {}) {
  let poll = null, mine = null, busy = false;
  async function render() {
    if (!pollIsLive()) { el.hidden = true; return; }
    const p = activePoll();
    if (!poll || p.id !== poll.id) { poll = p; mine = await pollRpc('tg_poll_mine', { p_poll: poll.id, p_key: deviceKey() }); }
    const res = await pollResults(poll);
    el.hidden = false;
    el.innerHTML = `<p class="caps pkick">Table poll</p><h3 class="pq">${poll.q}</h3>
      ${mine
        ? `<div class="pbars">${pollBars(poll, res, mine)}</div><p class="pfoot">${res.total} ${res.total === 1 ? 'vote' : 'votes'} · tap an answer to change yours · results are on the TV</p>
           <div class="popts small">${poll.options.map((o) => `<button type="button" class="link" data-vote="${o}">${o}</button>`).join('<span class="sep">·</span>')}</div>`
        : `<div class="popts">${poll.options.map((o) => `<button type="button" class="btn ghost" data-vote="${o}">${o}</button>`).join('')}</div>
           <p class="pfoot">One vote per phone. A new question every hour or so.</p>`}`;
  }
  el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-vote]');
    if (!b || busy) return;
    busy = true;
    const ok = await pollRpc('tg_poll_vote', { p_poll: poll.id, p_choice: b.dataset.vote, p_key: deviceKey() });
    if (ok) { mine = b.dataset.vote; signal(poll); }
    busy = false;
    render();
  });
  render();
  setInterval(render, 60e3); // picks up the next question when it rotates
  return { refresh: render };
}
