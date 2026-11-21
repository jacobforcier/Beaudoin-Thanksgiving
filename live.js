/* Live updates: a tiny client for Supabase Realtime (Phoenix websocket protocol), no library needed.
   live(tables, onChange, opts) calls onChange({ table, type, record, old }) for every insert/update/delete
   and reconnects on its own. opts:
     onStatus(up)            connection went up/down
     presence: { ...meta }   announce this visitor; onPresence(list of metas) whenever the set of visitors changes
     onBroadcast(event, payload)  short-lived signals from other visitors (nothing is stored)
   Returns { connected(), broadcast(event, payload), me }. */
function live(tables, onChange, opts = {}) {
  const me = Math.random().toString(36).slice(2, 10);
  const url = `${SB_URL.replace('https', 'wss')}/realtime/v1/websocket?apikey=${SB_KEY}&vsn=1.0.0`;
  const topic = 'realtime:thanksgiving';
  let ws, ref = 0, beat, retry = 1000, up = false, state = {};
  const send = (t, event, payload = {}) => ws && ws.readyState === 1 && ws.send(JSON.stringify({ topic: t, event, payload, ref: String(++ref), join_ref: '1' }));
  const status = (v) => { if (v !== up) { up = v; opts.onStatus && opts.onStatus(v); } };
  const presence = () => opts.onPresence && opts.onPresence(Object.entries(state).flatMap(([key, v]) => (v.metas || []).map((m) => ({ ...m, key }))));
  function connect() {
    try { ws = new WebSocket(url); } catch { return later(); }
    ws.onopen = () => {
      retry = 1000; state = {};
      send(topic, 'phx_join', {
        config: { broadcast: { self: false }, presence: { key: me }, postgres_changes: tables.map((table) => ({ event: '*', schema: 'public', table })) },
        access_token: SB_KEY,
      });
      clearInterval(beat);
      beat = setInterval(() => send('phoenix', 'heartbeat'), 25000);
    };
    ws.onmessage = (m) => {
      let msg; try { msg = JSON.parse(m.data); } catch { return; }
      const p = msg.payload || {};
      if (msg.event === 'phx_reply' && msg.topic === topic && p.response && p.response.postgres_changes !== undefined) {
        status(p.status === 'ok');
        if (opts.presence) send(topic, 'presence', { type: 'presence', event: 'track', payload: opts.presence });
      }
      if (msg.event === 'postgres_changes' && p.data) onChange({ table: p.data.table, type: p.data.type, record: p.data.record || {}, old: p.data.old_record || {} });
      if (msg.event === 'presence_state') { state = p; presence(); }
      if (msg.event === 'presence_diff') {
        Object.keys(p.leaves || {}).forEach((k) => delete state[k]);
        Object.assign(state, p.joins || {});
        presence();
      }
      if (msg.event === 'broadcast' && opts.onBroadcast) opts.onBroadcast(p.event, p.payload || {});
    };
    ws.onclose = () => { status(false); clearInterval(beat); state = {}; presence(); later(); };
    ws.onerror = () => { try { ws.close(); } catch {} };
  }
  function later() { setTimeout(connect, retry); retry = Math.min(retry * 2, 30000); }
  document.addEventListener('visibilitychange', () => { if (!document.hidden && (!ws || ws.readyState > 1)) { retry = 1000; connect(); } });
  connect();
  return {
    me,
    connected: () => up,
    broadcast: (event, payload) => send(topic, 'broadcast', { type: 'broadcast', event, payload }),
  };
}
