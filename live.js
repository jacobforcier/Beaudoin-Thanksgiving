/* Live updates: a tiny client for Supabase Realtime (Phoenix websocket protocol), no library needed.
   live(tables, onChange) calls onChange({ table, type, record, old }) for every insert/update/delete,
   and reconnects on its own. Returns { connected() }. */
function live(tables, onChange, onStatus = () => {}) {
  const url = `${SB_URL.replace('https', 'wss')}/realtime/v1/websocket?apikey=${SB_KEY}&vsn=1.0.0`;
  let ws, ref = 0, beat, retry = 1000, up = false;
  const send = (topic, event, payload = {}) => ws && ws.readyState === 1 && ws.send(JSON.stringify({ topic, event, payload, ref: String(++ref), join_ref: '1' }));
  const status = (v) => { if (v !== up) { up = v; onStatus(v); } };
  function connect() {
    try { ws = new WebSocket(url); } catch { return later(); }
    ws.onopen = () => {
      retry = 1000;
      send('realtime:thanksgiving', 'phx_join', {
        config: { broadcast: { self: false }, presence: { key: '' }, postgres_changes: tables.map((table) => ({ event: '*', schema: 'public', table })) },
        access_token: SB_KEY,
      });
      clearInterval(beat);
      beat = setInterval(() => send('phoenix', 'heartbeat'), 25000);
    };
    ws.onmessage = (m) => {
      let msg; try { msg = JSON.parse(m.data); } catch { return; }
      if (msg.event === 'phx_reply' && msg.topic === 'realtime:thanksgiving') status(msg.payload && msg.payload.status === 'ok');
      if (msg.event === 'postgres_changes' && msg.payload && msg.payload.data) {
        const d = msg.payload.data;
        onChange({ table: d.table, type: d.type, record: d.record || {}, old: d.old_record || {} });
      }
    };
    ws.onclose = () => { status(false); clearInterval(beat); later(); };
    ws.onerror = () => { try { ws.close(); } catch {} };
  }
  function later() { setTimeout(connect, retry); retry = Math.min(retry * 2, 30000); }
  document.addEventListener('visibilitychange', () => { if (!document.hidden && (!ws || ws.readyState > 1)) { retry = 1000; connect(); } });
  connect();
  return { connected: () => up };
}
