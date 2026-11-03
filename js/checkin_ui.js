// スタンプを押す：チェックイン → スタンプの画面（道中のまとめ・読書）→ シェア・紙ふぶき
import { PG, WALK } from './config.js?v=0.17.3';
import { weekKey, stars, esc, $, fmtDist, icon, $$, emit, fmtMin } from './util.js?v=0.17.3';
import { S } from './state.js?v=0.17.3';
import { sfx, haptic } from './audio.js?v=0.17.3';
import { POS } from './position.js?v=0.17.3';
import { isFeat, placeWord, rarityOf, pickOpen, BYID, stampSVG, rarityText, stampInk } from './data.js?v=0.17.3';
import * as G from './game.js?v=0.17.3';
import * as E from './events.js?v=0.17.3';
import { stampImage, shareBlob } from './share.js?v=0.17.3';
import * as J from './journey.js?v=0.17.3';
import * as R from './reading.js?v=0.17.3';
import { openModal, closeModal, closeSheet, refreshHud, toast } from './ui.js?v=0.17.3';
import { applyMapStates, openSheet } from './map_ui.js?v=0.17.3';
import { startCard } from './card_ui.js?v=0.17.3';

// ---------- チェックイン → スタンプ ----------
export function startCheckin(st, near) {
  const stamped = G.hasStamp(st.i); const feat = isFeat(st.i); const featGot = (S.featDone[weekKey()] || []).includes(st.i);
  const note = near ? (stamped ? `この${placeWord(st)}のスタンプはもう持っています。もう一度押すと少しページが増え、常連度が上がります。` : `射程内です。この${placeWord(st)}だけのスタンプ（${stars(rarityOf(st))}）が押せます。${feat && !featGot ? ` 今週の推し店なので +${PG.feat}ページ。` : ''}`) : '店から離れています（位置がないか、射程の外）。「来た記録」として自己申告で残します。スタンプは押せません。';
  openModal(`<h2>${esc(st.n)}</h2><div class="status-card ${near ? 'shu' : 'sumi'}">${esc(note)}</div>
    <div class="field"><label for="ci-memo">一言メモ（任意・100字まで）</label><textarea id="ci-memo" maxlength="100" placeholder="例：文庫の棚が広い。店員さんの手書きPOPがよかった"></textarea></div>
    <div class="note">位置（座標）は送りません。${S.settings.sendLog === false ? '参加の記録も送らない設定です。' : '送るのは、この店の番号と日時など（名前のない、ランダムな番号といっしょに。設定で止められます）。'}</div>
    <div class="actions"><button class="btn primary" id="ci-save">${near ? 'スタンプを押す' : '記録だけ残す'}</button><button class="btn ghost" id="ci-cancel">やめる</button></div>`);
  $('#ci-cancel').onclick = closeModal;
  $('#ci-save').onclick = () => { const pkBefore = pickOpen(st); const volBefore = G.volume(); const seg = J.arrive(st, { near, trial: POS.fake }); /* 前の店からの道のり・読書（v0.14）。スタンプの記録より先に */ const res = G.checkin(st, { near, memo: $('#ci-memo').value.trim(), trial: POS.fake }); res.lv.before = Math.min(res.lv.before, volBefore); const evr = E.onCheckin(st, { near, trial: POS.fake }); const evPg = evr.bonus.reduce((t, b) => t + b.pg, 0); if (evPg) res.lv.after = G.addPages(evPg).after; /* イベントの参加店で押したページ（v0.17.3） */ closeModal(); closeSheet(); applyMapStates(); refreshHud(); showCapture(st, res, near, evr, seg); if (E.hasCard(st) && !pkBefore && pickOpen(st) && (st.demo || S.settings.sendLog !== false)) toast('📖 書店員さんの手書きのカードが見られるようになりました（店のページ）', 'ok'); };
}
// 道中のまとめ（v0.14）：前の店からの距離・歩いたページ・読書・あいだにあった本屋
function segHTML(st, g) {
  if (!g) return ''; const rows = [];
  if (g.from) { const pg = Math.floor((g.walked || 0) / WALK.pageM); rows.push(`<div class="ts-h">前の店（${esc(g.fn)}）から ${fmtDist(g.m)}</div>`); if (pg) rows.push(`<div>歩いたページ <b>+${pg}</b>${g.add >= WALK.pageM ? '<span class="muted small">（閉じていた分は、まっすぐの距離で）</span>' : ''}</div>`); }
  for (const r of g.reads || []) rows.push(`<div class="ts-read" data-r="${esc(r.id)}"><div>📖 読書${r.title ? `『${esc(r.title)}』` : ''} ${fmtMin(r.min)} <b class="nw">+${r.pg}ページ</b>${r.pl ? `<span class="muted small">（${esc(R.placeText(r.pl))}）</span>` : ''}</div>${r.id === g.autoId ? '<div class="muted small">「おわる」が押されていなかったので、ここまでの時間にしました</div><button class="linkish" data-undo="1">読んでいなかったときは、ここを押す</button>' : ''}</div>`); // 前の店からあとの読書（v0.14.4）
  const a = g.from ? BYID.get(g.from) : null; const btw = a ? J.betweenStores(a, st).filter((s) => !G.hasStamp(s.i)).slice(0, 3) : [];
  if (btw.length) rows.push(`<div class="ts-btw"><div class="muted small">あいだにあった本屋（まっすぐの線のそば）</div>${btw.map((s) => `<div class="b"><span>${esc(s.n)}</span><button class="btn" data-want="${esc(s.i)}">${S.wants.includes(s.i) ? '行きたい ✓' : '行きたい'}</button></div>`).join('')}</div>`);
  return rows.length ? `<div class="trip-sum">${rows.join('')}</div>` : '';
}
export function showCapture(st, res, near, evr = { frames: [], titles: [], progress: [], bonus: [] }, seg = null) {
  const { gain, isNew, lv, rewards, r, regUp } = res; const fr = evr.frames[0] || null;
  if (near) { sfx.stamp(); haptic([30, 30, 90]); if (isNew && r === 3) setTimeout(() => sfx.rare(), 250); } if (lv.after > lv.before) setTimeout(() => sfx.levelup(), 500); if (regUp) setTimeout(() => sfx.regular(), lv.after > lv.before ? 1500 : 800);
  $('#capture-box').innerHTML = `<div class="big">${stampSVG(st, near, 250, { rank: G.regularInfo(st.i).rank, ev: fr })}</div>
    <h2>${near ? (isNew ? `${esc(st.n)}のスタンプを押した！` : `${esc(st.n)}に、また来た`) : `${esc(st.n)}に来た（記録だけ）`}</h2>
    <div class="stars">${near ? stars(r) + ' ' + esc(rarityText(st)) : ''}</div>
    <div class="gain">+${gain}ページ</div>${(evr.bonus || []).map((b) => `<div class="evline" style="--evc:${esc(b.color)}">${esc(b.ev)}　+${b.pg}ページ（${b.n}店目）</div>`).join('')}
    ${fr ? `<div class="evline" style="--evc:${esc(fr.color)}">${esc(fr.ev)}の${fr.label ? `「${esc(fr.label)}」の` : ''}枠が付いた</div>` : ''}${evr.progress.map((p) => `<div class="lvup">${esc(p.name)}　${Math.min(p.n, p.goal)}/${p.goal}軒</div>`).join('')}${evr.titles.map((t) => `<div class="lvup">🏅 記念の称号「${esc(t)}」</div>`).join('')}
    ${lv.after > lv.before ? `<div class="lvup">📖 第${lv.after}巻に入った！</div>` : ''}${rewards.map((x) => `<div class="lvup">${esc(x)}</div>`).join('')}${segHTML(st, seg)}
    <div class="actions" style="margin-top:18px"><button class="btn primary wide" id="cp-card">${icon('barcode')}この${placeWord(st)}で本と出会った</button><div class="muted small" style="grid-column:1/-1;width:100%;text-align:center">買った本の裏のバーコードを読むと +${PG.card}ページ〜</div>${near && !POS.fake && !st.demo && !R.activeTrip() ? `<button class="btn wide" id="cp-read">📖 読書をはじめる</button><div class="muted small" style="width:100%;text-align:center">読んだ時間だけページが増えます（1分で1ページ）</div>` : ''}${near ? `<button class="btn wide" id="cp-share">${icon('share')}スタンプをシェア</button>` : ''}<button class="btn ghost wide" id="cp-close">閉じる</button></div>`;
  $('#capture').hidden = false; $$('#capture .burst, #capture .confetti').forEach((el) => el.remove());
  if (near) { const bb = document.createElement('div'); bb.className = 'burst'; $('#capture').prepend(bb); if (isNew || regUp || lv.after > lv.before || evr.titles.length) confetti($('#capture'), [stampInk(st).main, '#FFD447', '#FFFFFF', '#2F9BFF', '#4FC07A']); }
  $('#cp-close').onclick = () => { $('#capture').hidden = true; openSheet(st.i, true); };
  $('#cp-card').onclick = () => { $('#capture').hidden = true; startCard(st); };
  if ($('#cp-share')) $('#cp-share').onclick = () => shareStampUI(st);
  if ($('#cp-read')) $('#cp-read').onclick = () => { $('#capture').hidden = true; emit('read-start', {}); };
  $$('#capture .ts-read [data-undo]').forEach((b) => { b.onclick = () => { const box = b.closest('.ts-read'); if (R.undoRead(box.dataset.r)) { box.textContent = '📖 この読書は記録しませんでした'; refreshHud(); } }; });
  $$('#capture [data-want]').forEach((b) => { b.onclick = () => { const r2 = G.toggleWant(b.dataset.want); b.textContent = r2.on ? '行きたい ✓' : '行きたい'; applyMapStates(); r2.rewards.forEach((x) => toast(x, 'ok')); }; });
}
export async function shareStampUI(st, opts = {}) { try { const fr = E.storeFrame(st.i); const tags = [...new Set(['#本めぐり', ...String((fr && fr.hashtag) || '').split(/\s+/).filter(Boolean)])].join(' '); const blob = await stampImage(st, Object.assign({ ev: fr, tags }, opts)); const reg = G.regularInfo(st.i); const text = opts.regular ? `${st.n}の常連度は「${reg.name}」（来店${reg.days}日） ${tags}` : `${st.n}のスタンプを押した${fr ? `（${fr.ev}）` : ''} ${tags}`; const r = await shareBlob(blob, `honya-${st.i}.png`, `${st.n}のスタンプ`, text); if (r !== 'cancel') { G.noteShare(opts.regular ? 'regular' : 'stamp', st.i, r); toast(r === 'saved' ? '画像を保存しました' : 'シェアしました', 'ok'); } } catch (e) { toast('画像にできませんでした', 'warn'); } }
// ---------- 紙ふぶき（スタンプを押したときの演出） ----------
function confetti(host, colors) {
  const cv = document.createElement('canvas'); cv.className = 'confetti'; host.appendChild(cv);
  const dpr = Math.min(2, window.devicePixelRatio || 1); const W = host.clientWidth, H = host.clientHeight; cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + 'px'; cv.style.height = H + 'px'; const g = cv.getContext('2d'); g.scale(dpr, dpr);
  const P = []; for (let i = 0; i < 110; i++) { const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.6, sp = 5 + Math.random() * 9; P.push({ x: W / 2 + (Math.random() - 0.5) * 60, y: H * 0.4, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, s: 5 + Math.random() * 6, c: colors[i % colors.length], r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.35, k: Math.random() < 0.4 ? 1 : 0 }); }
  let t0 = null;
  const loop = (t) => { if (t0 == null) t0 = t; const dt = (t - t0) / 1000; g.clearRect(0, 0, W, H); for (const p of P) { p.vy += 0.22; p.vx *= 0.985; p.x += p.vx; p.y += p.vy; p.r += p.vr; g.save(); g.translate(p.x, p.y); g.rotate(p.r); g.fillStyle = p.c; g.globalAlpha = Math.max(0, Math.min(1, 2.2 - dt)); if (p.k) { g.beginPath(); g.arc(0, 0, p.s / 2, 0, Math.PI * 2); g.fill(); } else g.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); g.restore(); } if (dt < 2.3 && cv.isConnected) requestAnimationFrame(loop); else cv.remove(); };
  requestAnimationFrame(loop);
}
