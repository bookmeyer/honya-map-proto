// アプリの外の窓口のページ（join.html・contact.html。v0.37.0）：Xの募集やメディアの方など、アプリを入れていない人向け
// ?shop=店番号 でお店を選んでおく。contact.html?k=media で「取材・メディア」を選んでおく
import { EVENTS_API, APP_VER } from './config.js?v=0.37.9';
import { mountInbox } from './inbox.js?v=0.37.9';

let ALL = null;
const load = async () => {
  if (ALL) return ALL;
  const get = (u) => fetch(u, { cache: 'no-cache' }).then((r) => r.json()).then((j) => (Array.isArray(j) ? j : j.stores || [])).catch(() => []);
  const [b, l] = await Promise.all([get('data/bookstores.json'), get('data/libraries.json')]);
  ALL = [...b, ...l].filter((s) => s && s.i && s.n).map((s) => ({ i: s.i, n: s.n, a: s.a || (s.aa ? s.aa + ' 付近' : s.p || ''), lib: s.t === 'l' }));
  return ALL;
};
const search = async (w) => { const all = await load(); const ws = w.split(/[\s　]+/).filter(Boolean); return all.filter((s) => ws.every((x) => (s.n + ' ' + s.a).includes(x))).slice(0, 8); };

(async () => {
  const root = document.getElementById('ib-root'); if (!root) return;
  const mode = root.dataset.mode === 'join' ? 'join' : 'contact';
  const p = new URLSearchParams(location.search);
  let store = null; const sid = p.get('shop');
  if (sid && /^[A-Za-z0-9_.:-]{1,40}$/.test(sid)) { const s = (await load()).find((x) => x.i === sid); if (s) store = { i: s.i, n: s.n, lib: s.lib }; }
  let api = EVENTS_API; try { const o = localStorage.getItem('meguri_api'); if (o && /^https?:\/\//.test(o) && /^(localhost|127\.0\.0\.1)$/.test(location.hostname)) api = o; } catch (e) {} // 手元で試すときだけ（アプリの apiBase と同じ）
  mountInbox(root, mode, { api, ver: APP_VER, search, store, kind: p.get('k') || '', onDone: () => window.scrollTo(0, 0) });
})();
