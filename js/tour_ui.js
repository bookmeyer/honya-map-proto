// 画面の案内（チュートリアル。v0.19.0）：最初の案内のあと、地図の画面で本物のボタンを1つずつ光らせて説明する（v0.20.2 で「自分のアイコン」を足して7つ）
// ぶっくまさん 11/3「一番最初に表示したとき、チュートリアルを表示できますか」→ 地図の上で6つを指さす案。とばせる。設定の「画面の案内」から、もう一度
import { RANGE_M } from './config.js?v=0.21.1';
import { $, esc } from './util.js?v=0.21.1';
import { S, save } from './state.js?v=0.21.1';
import { STORES } from './data.js?v=0.21.1';
import * as MAP from './map.js?v=0.21.1';
import * as E from './events.js?v=0.21.1';
import { NEAR } from './map_ui.js?v=0.21.1';
import { switchView, closeSheet } from './ui.js?v=0.21.1';

// el：光らせる部品（ok で出ているときだけ）／pin：地図の真ん中に近い店のピン
const STEPS = [
  { el: '#btn-locate', h: '現在地', p: () => `ここを押すと、いる場所から始まります。本屋や図書館から${RANGE_M}m以内に入ると、スタンプが押せます。` },
  { el: '#btn-settings', h: '自分のアイコン', p: () => 'はじめの設定で決めたアイコンが、地図の現在地に出ます。右上の歯車（設定）の「自分のアイコン」から、いつでも替えられます（絵か画像）。ハンドルネームとプロフィールも、ここで変えられます。' }, // v0.20.2（11/3 ぶっくまさん「アイコン設定もできることを伝えたい」）
  { pin: true, h: '店のピン', p: () => (MAP.M.map && MAP.M.map.getZoom() >= 10 ? 'ピンを押すと、店のページが開きます。' : '地図を大きくすると、店のピンが出ます。ピンを押すと、店のページが開きます。') + '朱は本屋、茶は古書店、空色は図書館。スタンプを押した店は若草になります。' },
  { el: '#radar-items', h: '近くの店', p: () => '近い店と、あと何mかが出ます。押すと、その店のページへ。', ok: (el) => el.childElementCount > 0 },
  { el: '#event-chip', h: '開催中のイベント', p: () => { const e = E.liveEvents()[0], nev = E.liveEvents().find(E.narrow); return `いまは「${e ? e.name : 'イベント'}」を開いています。${nev ? `参加店のピンには「${nev.frame.label || 'イベント'}」の札が付きます。` : ''}押すと、ラリーの画面でくわしく見られます。`; }, ok: (el) => !el.hidden && E.liveEvents().length > 0 },
  { el: '#read-btn', h: '読書をはじめる', p: () => '本を読んだ時間も、あなたの物語のページになります。電車でもカフェでも、押すだけで始まります。', ok: (el) => !el.hidden },
  { el: '#tabs', h: '下のタブ', p: () => 'ちかく：近くの店と、行きたい店。めぐり帳：押したスタンプと、本のカード。ラリー：お題とイベント。' },
];
let T = null;
// 地図の真ん中に近い店のピン（上の帯と下の札にかからない所）。見つからないときは光らせずに説明だけ
function pinRect() {
  const m = MAP.M.map; if (!m || m.getZoom() < 10) return null;
  const c = m.getContainer().getBoundingClientRect(), top = c.top + 170, bot = c.bottom - 300;
  const cx = c.left + c.width / 2, cy = (top + bot) / 2; let best = null, bd = Infinity;
  for (const s of NEAR.list.length ? NEAR.list.map((x) => x.s) : STORES) {
    if (s.demo) continue; const p = m.project([s.lo, s.la]); const x = c.left + p.x, y = c.top + p.y;
    if (x < c.left + 40 || x > c.right - 80 || y < top || y > bot) continue;
    const d = (x - cx) ** 2 + (y - cy) ** 2; if (d < bd) { bd = d; best = { x, y }; }
  }
  return best ? { left: best.x - 30, top: best.y - 60, width: 60, height: 64, round: true } : null;
}
function rectOf(st) {
  if (st.pin) return pinRect();
  const el = $(st.el); if (!el) return null; const r = el.getBoundingClientRect();
  return r.width && r.height ? { left: r.left, top: r.top, width: r.width, height: r.height } : null;
}
function place() {
  if (!T) return;
  const r = rectOf(T.list[T.i]), hole = T.box.querySelector('.tour-hole'), tip = T.box.querySelector('.tour-tip');
  const W = window.innerWidth, H = window.innerHeight, pad = 6;
  T.box.classList.toggle('dim', !r); hole.hidden = !r;
  if (r) Object.assign(hole.style, { left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px`, borderRadius: r.round ? '999px' : '18px' });
  const tw = Math.min(360, W - 32); tip.style.width = `${tw}px`; tip.style.left = `${Math.round((W - tw) / 2)}px`;
  const th = tip.offsetHeight;
  // 吹き出しは、光らせた所が上半分なら下に、下半分なら上に
  const y = !r ? (H - th) / 2 : r.top + r.height / 2 < H / 2 ? r.top + r.height + pad + 14 : r.top - pad - 14 - th;
  tip.style.top = `${Math.round(Math.max(12, Math.min(H - th - 12, y)))}px`;
}
function show() {
  const st = T.list[T.i], last = T.i === T.list.length - 1, tip = T.box.querySelector('.tour-tip');
  tip.innerHTML = `<div class="tour-n">${T.i + 1} / ${T.list.length}</div><h3>${esc(st.h)}</h3><p>${esc(st.p())}</p><div class="tour-act"><button class="btn ghost" data-t="skip">とばす</button><button class="btn primary" data-t="next">${last ? 'はじめる' : '次へ'}</button></div>`;
  tip.querySelector('[data-t="skip"]').onclick = endTour;
  tip.querySelector('[data-t="next"]').onclick = () => { if (last) endTour(); else { T.i++; show(); } };
  place(); tip.querySelector('[data-t="next"]').focus();
}
const onKey = (e) => { if (e.key === 'Escape') endTour(); };
export function startTour() {
  if (T) return;
  switchView('map'); closeSheet();
  const list = STEPS.filter((s) => !s.el || ($(s.el) && (!s.ok || s.ok($(s.el)))));
  const box = document.createElement('div'); box.id = 'tour'; box.className = 'tour'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', '画面の案内');
  box.innerHTML = '<div class="tour-hole" hidden></div><div class="tour-tip" aria-live="polite"></div>';
  document.body.appendChild(box); T = { i: 0, list, box };
  window.addEventListener('resize', place); document.addEventListener('keydown', onKey);
  show();
}
export function endTour() {
  if (!T) return; T.box.remove(); T = null;
  window.removeEventListener('resize', place); document.removeEventListener('keydown', onKey);
  if (!S.settings.tour) { S.settings.tour = 1; save(); }
}
// 最初の案内のあと：地図が落ち着いて、ほかの窓（参加コードのお知らせなど）が閉じてから、1回だけ
export function autoTour() {
  let n = 0;
  const tick = () => { if (S.settings.tour || T) return; const busy = !!$('#setup') || !$('#modal').hidden || !$('#onboard').hidden || !!document.querySelector('.capture:not([hidden])'); if (!busy) startTour(); else if (n++ < 240) setTimeout(tick, 500); };
  setTimeout(tick, 1500);
}
