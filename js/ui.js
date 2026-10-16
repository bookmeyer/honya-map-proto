// 画面の部品：見出し帯・タブ・店のシート・モーダル・スタンプの演出・カード・さがす・追加
import { RANGE_M, SENSE_M, TERRITORY_M, XP, levelOf, xpForLevel, INK } from './config.js?v=0.6.3';
import { S, save, inkRefill } from './state.js?v=0.6.3';
import { STORES, BYID, FEAT, isFeat, rarityOf, rarityText, stampSVG, stampInk, search, addCustom, hideStore, renameStore, lookupIsbn, DATA_DATE } from './data.js?v=0.6.3';
import * as G from './game.js?v=0.6.3';
import * as MAP from './map.js?v=0.6.3';
import { POS, setPos, startWatch, setTrial, setFollow, hasPos, jumped } from './position.js?v=0.6.3';
import { sfx, haptic, unlock } from './audio.js?v=0.6.3';
import { stampImage, cardImage, shareBlob } from './share.js?v=0.6.3';
import { $, $$, esc, dist, bearing, arrowOf, fmtDist, fmtDate, todayISO, prefOf, stars, icon, on, emit, weekKey } from './util.js?v=0.6.3';

export let currentView = 'map';
export let currentSub = 'stamps';
export const NEAR = { list: [], inRange: new Set() };
let scanStopper = null, lastBuzz = 0, lastGlowTick = 0;

// ---------- 小物 ----------
export function toast(msg, kind = '') { const box = $('#toasts'); const t = document.createElement('div'); t.className = 'toast ' + kind; t.textContent = msg; box.appendChild(t); while (box.children.length > 3) box.firstChild.remove(); setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; setTimeout(() => t.remove(), 300); }, 2600); }
export function openModal(html) { $('#modal-box').innerHTML = html; $('#modal').hidden = false; $('#modal-box').scrollTop = 0; }
export function closeModal() { if (scanStopper) { try { scanStopper(); } catch (e) {} scanStopper = null; } $('#modal').hidden = true; $('#modal-box').innerHTML = ''; }
export function confirmBox(container, msg, onYes, yesLabel = '消す') { container.innerHTML = `<div class="status-card sumi">${esc(msg)}</div><div class="actions"><button class="btn danger" id="cf-yes">${esc(yesLabel)}</button><button class="btn ghost" id="cf-no">やめる</button></div>`; $('#cf-no', container).onclick = () => { container.innerHTML = ''; }; $('#cf-yes', container).onclick = () => { container.innerHTML = ''; onYes(); }; }
export function switchView(v) {
  currentView = v; if (v !== 'map') closeSheet();
  $$('.view').forEach((el) => el.classList.toggle('active', el.id === 'view-' + v));
  $$('#tabs button').forEach((b) => b.classList.toggle('active', b.dataset.view === v));
  if (v === 'map') MAP.resize();
  emit('view', v);
}
export function setSub(s) { currentSub = s; emit('view', currentView); }
export function refreshHud() {
  const lv = levelOf(S.xp), cur = xpForLevel(lv), next = xpForLevel(lv + 1);
  $('#lv-label').textContent = `Lv.${lv}`; $('#xp-fill').style.width = `${Math.round(((S.xp - cur) / (next - cur)) * 100)}%`;
  $('#brand-title').textContent = G.currentTitle() || '本屋あるき見習い';
  const ink = G.inkState(); $('#ink-dots').innerHTML = Array.from({ length: ink.max }, (_, i) => `<i class="${i < ink.n ? '' : 'off'}"></i>`).join('');
  $('#tab-dot').hidden = true; // お題は達成と同時に受け取るので、赤い点はいまは使わない
}

// ---------- 現在地まわりの表示（レーダーの帯・最初のクエスト・縁の光） ----------
function setGlow(d) {
  const g = $('#glow'); if (d == null || d > SENSE_M || d <= RANGE_M) { g.className = 'glow'; g.style.opacity = '0'; return; }
  const t = (d - RANGE_M) / (SENSE_M - RANGE_M);
  g.className = 'glow beat'; g.style.setProperty('--beat', `${(0.35 + t * 1.3).toFixed(2)}s`); g.style.opacity = (0.25 + (1 - t) * 0.75).toFixed(2);
  const gap = 350 + t * 1500; if (Date.now() - lastBuzz > gap) { lastBuzz = Date.now(); haptic(18); if (Date.now() - lastGlowTick > gap) { lastGlowTick = Date.now(); sfx.tick(1 - t); } }
}
export function updateNear() {
  const strip = $('#radar-items'), quest = $('#first-quest');
  if (!hasPos()) { NEAR.list = []; NEAR.inRange = new Set(); strip.innerHTML = ''; quest.hidden = true; setGlow(null); applyMapStates(); emit('near'); return; }
  const cand = []; for (const s of STORES) { if (Math.abs(s.la - POS.lat) > 0.03 || Math.abs(s.lo - POS.lon) > 0.036) continue; cand.push({ s, d: dist(POS.lat, POS.lon, s.la, s.lo) }); }
  cand.sort((a, b) => a.d - b.d); NEAR.list = cand.slice(0, 30);
  const now = new Set(NEAR.list.filter((x) => x.d <= RANGE_M).map((x) => x.s.i));
  const entered = [...now].filter((id) => !NEAR.inRange.has(id)); NEAR.inRange = now;
  if (entered.length) { haptic([60, 40, 60, 40, 120]); sfx.enter(); const g = $('#glow'); g.className = 'glow gold'; g.style.opacity = '1'; setTimeout(() => { if (g.className === 'glow gold') { g.className = 'glow'; g.style.opacity = '0'; } }, 900); const first = BYID.get(entered[0]); toast(`📍 ${first.n}${entered.length > 1 ? ` ほか${entered.length - 1}店` : ''} が射程に入りました`, 'ok'); }
  else { const nd = NEAR.list.find((x) => !G.hasStamp(x.s.i)); setGlow(nd ? nd.d : null); }
  const target = NEAR.list.find((x) => !G.hasStamp(x.s.i));
  if (target && !now.size) { quest.hidden = false; quest.innerHTML = `${icon('pin')}<span>いちばん近い本屋 <b>${esc(target.s.n)}</b> まで あと${fmtDist(Math.max(0, target.d - RANGE_M))} ${arrowOf(bearing(POS.lat, POS.lon, target.s.la, target.s.lo))}</span>`; quest.onclick = () => openSheet(target.s.i); } else quest.hidden = true;
  strip.innerHTML = NEAR.list.slice(0, 8).map(({ s, d }) => `<div class="rchip ${d <= RANGE_M ? 'in' : ''}" data-id="${esc(s.i)}"><div class="n">${G.hasStamp(s.i) ? '🔴 ' : ''}${isFeat(s.i) ? '👑 ' : ''}${esc(s.n)}</div><div class="d"><span>${d <= RANGE_M ? '射程内！' : `あと${fmtDist(d - RANGE_M)} ${arrowOf(bearing(POS.lat, POS.lon, s.la, s.lo))}`}</span><span class="stars">${'★'.repeat(rarityOf(s))}</span></div></div>`).join('');
  $$('#radar-items .rchip').forEach((el) => el.addEventListener('click', () => openSheet(el.dataset.id)));
  applyMapStates(); emit('near');
  const sheet = $('#sheet'); if (!sheet.hidden && sheet.dataset.id) openSheet(sheet.dataset.id, true);
}
export function applyMapStates() {
  const states = new Map();
  for (const s of STORES) states.set(s.i, { stamp: G.hasStamp(s.i) ? 1 : 0, near: NEAR.inRange.has(s.i) ? 1 : 0, feat: isFeat(s.i) ? 1 : 0, want: S.wants.includes(s.i) ? 1 : 0, st: G.stateOf(s.i) });
  MAP.setStates(states);
  MAP.setTerritory(Object.keys(S.stamps).map((id) => { const s = BYID.get(id); if (!s) return null; const rk = G.regularInfo(id).rank; return Object.assign({}, s, { rank: rk, rad: TERRITORY_M * (1 + 0.25 * Math.min(4, Math.max(0, rk - 1))) }); }).filter(Boolean));
}

// ---------- 現在地・お試し ----------
export function locate() {
  unlock();
  if (POS.fake) { setTrialUI(false); }
  const ok = startWatch({ onFirst: (p) => { MAP.flyTo(p.lon, p.lat, 15); toast(`現在地（誤差 約${Math.round(p.acc)}m）`); }, onError: (err) => { $('#btn-locate').classList.remove('on'); toast(err && err.code === 1 ? '位置の許可がありません。ブラウザの設定で許可できます。「お試し歩き」でも試せます' : '位置が取れませんでした。「お試し歩き」でも試せます', 'warn'); } });
  if (!ok) { toast('この端末では位置が使えません。「お試し歩き」で試せます', 'warn'); return; }
  $('#btn-locate').classList.add('on'); if (hasPos()) MAP.flyTo(POS.lon, POS.lat, 15); else toast('現在地を確かめています…');
}
export function setTrialUI(onFlag) {
  setTrial(onFlag);
  $('#btn-trial').classList.toggle('on', onFlag); $('#btn-trial').classList.toggle('trial', onFlag); $('#trial-banner').hidden = !onFlag; $('#btn-warp').hidden = !onFlag; $('#btn-locate').classList.remove('on');
  if (onFlag) toast('お試し歩き：地図を押すと、そこにいることになります'); else { MAP.setMe(POS); updateNear(); }
}
export function warp(target) {
  let st = target; if (!st) { const pool = STORES.filter((s) => !s.demo && !G.hasStamp(s.i)); st = pool[Math.floor(Math.random() * pool.length)]; }
  const lat = st.la + 0.0004, lon = st.lo + 0.0005; MAP.jumpTo(lon, lat, 16); setPos(lat, lon, 10, true); toast(`${st.n} の近くへワープしました`);
}

// ---------- 店のシート ----------
export function openSheet(id, quiet) {
  const st = BYID.get(id); if (!st) return;
  const vs = G.visitsOf(id), cs = G.cardsOf(id), want = S.wants.includes(id), stamp = S.stamps[id], r = rarityOf(st), feat = isFeat(st.i), reg = G.regularInfo(id);
  const d = hasPos() ? dist(POS.lat, POS.lon, st.la, st.lo) : null; const near = d != null && d <= RANGE_M && !jumped();
  const b = [];
  if (st.demo) b.push('<span class="badge">見本（実在しません）</span>'); if (st.custom) b.push('<span class="badge">自分で追加</span>'); if (st.fix) b.push('<span class="badge">名前を直した（この端末）</span>'); if (st.ov) b.push('<span class="badge">名前を確認ずみ</span>'); if (st.cf || st.x) b.push('<span class="badge ao">公式一覧で確認</span>');
  if (feat) b.push(`<span class="badge feat">${icon('crown')}今週の推し店</span>`); if (st.u) b.push('<span class="badge">古書店</span>');
  b.push(stamp ? `<span class="badge shu">スタンプ ${fmtDate(stamp.d)}</span>${stamp.trial ? '<span class="badge trial">体験</span>' : ''}` : vs.length ? `<span class="badge sumi">記録 ${vs.length}回</span>` : '<span class="badge">まだ</span>');
  if (cs.length) b.push(`<span class="badge">カード${cs.length}枚</span>`); if (want) b.push(`<span class="badge gold">${icon('star')}行きたい</span>`); if (near) b.push('<span class="badge gold">射程内</span>');
  const rec = st.rec ? `<div class="staff"><div class="who">${esc(st.rec.who)}の手放せない1冊</div><div class="title">${esc(st.rec.title)}</div><div>${esc(st.rec.say)}</div><div class="muted small">棚：${esc(st.rec.shelf)}</div></div>` : '';
  const hist = vs.length ? `<div class="muted small" style="margin-top:8px">${vs.slice(-3).reverse().map((v) => `${fmtDate(v.d)}${v.near ? '（スタンプ）' : '（記録）'}${v.memo ? '「' + esc(v.memo) + '」' : ''}`).join('<br>')}</div>` : '';
  const distText = d == null ? '現在地なし' : jumped() ? '位置が大きく飛んだので、少し待ってから（1分）' : near ? `射程内（約${fmtDist(d)}）` : `ここから約${fmtDist(d)}（あと${fmtDist(d - RANGE_M)}で射程内）`;
  $('#sheet-body').innerHTML = `
    <div class="sheet-head"><div class="stamp-sm">${stampSVG(st, !!stamp, 72, { rank: reg.rank })}</div><div style="min-width:0"><h2>${esc(st.n)}</h2><div class="stars">${stars(r)} <span class="muted small">${esc(rarityText(st))}</span></div></div></div>
    <div style="margin-top:8px">${b.join('')}</div>
    <div class="muted small">${esc(st.a || (st.custom ? '' : '住所の情報なし（地図データより）'))}　${esc(prefOf(st))}</div>
    <div class="muted small">${esc(distText)}</div>${st.demo || st.custom ? '' : `<div class="muted small">店の情報：${st.x ? 'チェーンの公式店舗一覧' : `OpenStreetMap（${DATA_DATE} 取得）`}。${st.c ? '最終確認 ' + st.c.slice(0, 4) + '年' + Number(st.c.slice(5)) + '月' + (st.cf || st.x ? '（公式の店舗一覧で確認）' : '') : '確認日の記録なし'}。${st.cf || st.x ? '' : '閉店や名前の変更が反映されていないことがあります'}</div>`}${st.demo ? '' : `<div class="reg"><span class="badge ${reg.rank >= 3 ? 'shu' : reg.rank >= 2 ? 'gold' : ''}">常連度 ${reg.rank ? esc(reg.name) : 'まだ'}</span><span class="muted small">来店 ${reg.days}日${reg.next ? `・あと${reg.toNext}日で「${esc(reg.next.name)}」` : '・最高位'}</span><div class="regbar"><i style="width:${reg.pct}%"></i></div></div>`}${rec}${hist}
    <div class="actions">
      <button class="btn primary wide" data-act="checkin">${near ? (stamp ? `${icon('ink')}もう一度押す（来店）` : `${icon('ink')}スタンプを押す${feat ? `（+${XP.feat}）` : ''}`) : '来た記録だけ（スタンプなし）'}</button>
      <button class="btn" data-act="card">${icon('barcode')}本と出会った</button>
      <button class="btn" data-act="want">${icon('star')}${want ? '行きたいを外す' : '行きたい'}</button>
      ${stamp ? `<button class="btn" data-act="share">${icon('share')}シェア</button>` : ''}${reg.rank >= 2 ? `<button class="btn" data-act="regshare">${icon('crown')}常連度シェア</button>` : ''}
      ${POS.fake && !near ? `<button class="btn wide" data-act="warp">${icon('warp')}この店へワープ</button>` : ''}
      ${st.demo || st.custom ? '' : '<button class="btn ghost" data-act="report">閉店している</button><button class="btn ghost" data-act="rename">名前が違う</button>'}
    </div><div id="sheet-extra"></div>`;
  $$('#sheet-body [data-act]').forEach((btn) => btn.addEventListener('click', () => { sfx.click(); const a = btn.dataset.act;
    if (a === 'checkin') startCheckin(st, near); else if (a === 'card') startCard(st); else if (a === 'share') shareStampUI(st); else if (a === 'regshare') shareStampUI(st, { regular: true }); else if (a === 'warp') warp(st);
    else if (a === 'report') confirmBox($('#sheet-extra'), 'この店を地図から外しますか？（閉店した店・本屋ではない店。この端末だけ。記録の書き出しに含まれます。設定から戻せます）', () => { hideStore(st); save(); MAP.setStores(STORES); applyMapStates(); updateNear(); closeSheet(); toast(`${st.n} を外しました`); }, '外す');
    else if (a === 'rename') { const x = $('#sheet-extra'); x.innerHTML = `<div class="field"><label for="rn-name">いまの正しい店名</label><input type="text" id="rn-name" value="${esc(st.n)}" maxlength="60"></div><div class="actions"><button class="btn primary" id="rn-ok">直す</button><button class="btn ghost" id="rn-no">やめる</button></div>`; $('#rn-name').focus(); $('#rn-no').onclick = () => { x.innerHTML = ''; }; $('#rn-ok').onclick = () => { const n = $('#rn-name').value.trim(); if (!n || n === st.n) { x.innerHTML = ''; return; } renameStore(st, n); save(); MAP.setStores(STORES); applyMapStates(); updateNear(); toast('名前を直しました（この端末だけ。記録の書き出しに含まれます）', 'ok'); openSheet(id, true); }; }
    else { const r2 = G.toggleWant(id); applyMapStates(); refreshHud(); openSheet(id, true); r2.rewards.forEach((x) => toast(x, 'ok')); } }));
  const sheet = $('#sheet'); sheet.dataset.id = id; sheet.hidden = false;
  if (!quiet) { if (currentView !== 'map') switchView('map'); MAP.flyTo(st.lo, st.la, 14); G.noteLook(id).forEach((x) => toast(x, 'ok')); refreshHud(); }
}
export function closeSheet() { const s = $('#sheet'); s.hidden = true; s.dataset.id = ''; }

// ---------- チェックイン → スタンプ ----------
export function startCheckin(st, near) {
  const stamped = G.hasStamp(st.i); const feat = isFeat(st.i); const featGot = (S.featDone[weekKey()] || []).includes(st.i); const ink = G.inkState();
  if (near && !stamped && ink.n <= 0) { const m = Math.ceil(ink.nextMs / 60000); openModal(`<h2>インクが切れています</h2><div class="status-card sumi">スタンプを押すにはインクが要ります。あと${m}分で1つ回復します（最大${INK.max}、${INK.rechargeMs / 60000}分に1つ）。</div><div class="actions"><button class="btn ghost wide" id="ik-close">閉じる</button></div>`); $('#ik-close').onclick = closeModal; sfx.nope(); return; }
  const note = near ? (stamped ? 'この店のスタンプはもう持っています。もう一度押すと少し経験値が入り、常連度が上がります。' : `射程内です。この店だけのスタンプ（${stars(rarityOf(st))}）が押せます。インクを1つ使います（残り${ink.n}）。${feat && !featGot ? ` 今週の推し店なので +${XP.feat} XP。` : ''}`) : '店から離れています（位置がないか、射程の外）。「来た記録」として自己申告で残します。スタンプは押せません。';
  openModal(`<h2>${esc(st.n)}</h2><div class="status-card ${near ? 'shu' : 'sumi'}">${esc(note)}</div>
    <div class="field"><label for="ci-memo">一言メモ（任意・100字まで）</label><textarea id="ci-memo" maxlength="100" placeholder="例：文庫の棚が広い。店員さんの手書きPOPがよかった"></textarea></div>
    <div class="note">位置はこの画面の中で距離を出すためだけに使い、どこにも送りません。記録はこの端末の中だけに残ります。</div>
    <div class="actions"><button class="btn primary" id="ci-save">${near ? 'スタンプを押す' : '記録だけ残す'}</button><button class="btn ghost" id="ci-cancel">やめる</button></div>`);
  $('#ci-cancel').onclick = closeModal;
  $('#ci-save').onclick = () => { const res = G.checkin(st, { near, memo: $('#ci-memo').value.trim(), trial: POS.fake }); if (res.inkEmpty) { closeModal(); startCheckin(st, near); return; } closeModal(); closeSheet(); applyMapStates(); refreshHud(); showCapture(st, res, near); };
}
export function showCapture(st, res, near) {
  const { gain, isNew, lv, rewards, r, regUp } = res;
  if (near) { sfx.stamp(); haptic([30, 30, 90]); if (isNew && r === 3) setTimeout(() => sfx.rare(), 250); } if (lv.after > lv.before) setTimeout(() => sfx.levelup(), 500); if (regUp) setTimeout(() => sfx.regular(), lv.after > lv.before ? 1500 : 800);
  $('#capture-box').innerHTML = `<div class="big">${stampSVG(st, near, 250, { rank: G.regularInfo(st.i).rank })}</div>
    <h2>${near ? (isNew ? `${esc(st.n)}のスタンプを押した！` : `${esc(st.n)}に、また来た`) : `${esc(st.n)}に来た（記録だけ）`}</h2>
    <div class="stars">${near ? stars(r) + ' ' + esc(rarityText(st)) : ''}</div>
    <div class="gain">+${gain} XP</div>
    ${lv.after > lv.before ? `<div class="lvup">レベルアップ！ Lv.${lv.after}</div>` : ''}${rewards.map((x) => `<div class="lvup">${esc(x)}</div>`).join('')}
    <div class="actions" style="margin-top:18px"><button class="btn primary wide" id="cp-card">${icon('barcode')}この店で本と出会った → カード（+${XP.card}〜）</button>${near ? `<button class="btn wide" id="cp-share">${icon('share')}スタンプをシェア</button>` : ''}<button class="btn ghost wide" id="cp-close">閉じる</button></div>`;
  $('#capture').hidden = false; $$('#capture .burst, #capture .confetti').forEach((el) => el.remove());
  if (near) { const bb = document.createElement('div'); bb.className = 'burst'; $('#capture').prepend(bb); if (isNew || regUp || lv.after > lv.before) confetti($('#capture'), [stampInk(st).main, '#d9a521', '#ffffff', '#6d4fc3', '#2e8b57']); }
  $('#cp-close').onclick = () => { $('#capture').hidden = true; openSheet(st.i, true); };
  $('#cp-card').onclick = () => { $('#capture').hidden = true; startCard(st); };
  if ($('#cp-share')) $('#cp-share').onclick = () => shareStampUI(st);
}
export async function shareStampUI(st, opts = {}) { try { const blob = await stampImage(st, opts); const reg = G.regularInfo(st.i); const text = opts.regular ? `${st.n}の常連度は「${reg.name}」（来店${reg.days}日） #本屋の地図` : `${st.n}のスタンプを押した #本屋の地図`; const r = await shareBlob(blob, `honya-${st.i}.png`, `${st.n}のスタンプ`, text); if (r !== 'cancel') { G.noteShare(); toast(r === 'saved' ? '画像を保存しました' : 'シェアしました', 'ok'); } } catch (e) { toast('画像にできませんでした', 'warn'); } }

// ---------- カード ----------
export function startCard(st) {
  openModal(`<h2>この店で本と出会った</h2><p class="hint">${esc(st.n)}</p>
    <div class="note">カードは +${XP.card} XP。今日この店でスタンプを押していれば「店で出会った」+${XP.cardInStore}。</div>
    <div class="actions"><button class="btn primary wide" id="cd-scan">${icon('camera')}本の裏のバーコードを読む</button><button class="btn" id="cd-manual">ISBNを入力</button><button class="btn" id="cd-free">名前を自分で書く</button><button class="btn ghost wide" id="cd-cancel">やめる</button></div><div id="cd-area"></div>`);
  $('#cd-cancel').onclick = closeModal; $('#cd-manual').onclick = () => manualIsbn(st); $('#cd-free').onclick = () => cardForm(st, null); $('#cd-scan').onclick = () => scanIsbn(st);
}
function manualIsbn(st) {
  $('#cd-area').innerHTML = `<div class="field"><label for="cd-isbn">ISBN（978か979で始まる13桁。ハイフンは省いてよい）</label><input type="text" id="cd-isbn" inputmode="numeric" placeholder="9784..."></div><div class="actions"><button class="btn primary wide" id="cd-look">本をさがす</button></div><div id="cd-msg" class="muted small"></div>`;
  $('#cd-isbn').focus();
  const go = async () => { const isbn = $('#cd-isbn').value.replace(/[^0-9Xx]/g, ''); if (!/^97[89]\d{10}$/.test(isbn)) { $('#cd-msg').textContent = '13桁のISBNを入れてください'; return; } $('#cd-msg').textContent = 'openBDに問い合わせています…'; const b = await lookupIsbn(isbn); if (!b) { $('#cd-msg').textContent = 'この本の情報が見つかりませんでした。「名前を自分で書く」で続けられます。'; return; } cardForm(st, b); };
  $('#cd-look').onclick = go; $('#cd-isbn').addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
}
async function scanIsbn(st) {
  const area = $('#cd-area'); area.innerHTML = `<video id="scanner" playsinline muted autoplay></video><div id="cd-msg" class="muted small">バーコード（978か979で始まる方）をカメラに向けてください</div><div class="actions"><button class="btn ghost wide" id="cd-stop">カメラを止める</button></div>`;
  const video = $('#scanner'); const msg = $('#cd-msg'); let stopped = false, stream = null, reader = null;
  const stop = () => { stopped = true; try { if (reader && reader.reset) reader.reset(); } catch (e) {} if (stream) stream.getTracks().forEach((t) => t.stop()); };
  scanStopper = stop; $('#cd-stop').onclick = () => { stop(); area.innerHTML = ''; };
  const onCode = async (code) => { code = String(code).replace(/[^0-9]/g, ''); if (!/^97[89]\d{10}$/.test(code)) return false; stop(); haptic(40); msg.textContent = `読み取り：${code}。openBDに問い合わせています…`; const b = await lookupIsbn(code); cardForm(st, b || { isbn: code, title: '', author: '', publisher: '', cover: '' }); return true; };
  try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false }); video.srcObject = stream; await video.play(); }
  catch (e) { msg.textContent = 'カメラが使えませんでした（https でないか、許可されていません）。ISBNの入力で続けられます。'; return; }
  if ('BarcodeDetector' in window) { try { const det = new window.BarcodeDetector({ formats: ['ean_13'] }); const loop = async () => { if (stopped) return; try { const codes = await det.detect(video); for (const c of codes) { if (await onCode(c.rawValue)) return; } } catch (e) {} requestAnimationFrame(loop); }; loop(); return; } catch (e) {} }
  try { if (!window.ZXing) await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
    const hints = new Map(); hints.set(window.ZXing.DecodeHintType.POSSIBLE_FORMATS, [window.ZXing.BarcodeFormat.EAN_13]); reader = new window.ZXing.BrowserMultiFormatReader(hints, 300); reader.decodeFromStream(stream, video, (result) => { if (result && !stopped) onCode(result.getText()); });
  } catch (e) { msg.textContent = '読み取りの部品を読み込めませんでした。ISBNの入力で続けられます。'; }
}
function cardForm(st, b) {
  if (scanStopper) { try { scanStopper(); } catch (e) {} scanStopper = null; }
  const has = !!b && !!b.title; const { inStore, total } = G.cardBonus(st);
  openModal(`<h2>カードを作る</h2>
    <div class="card-full"><div class="cover">${b && b.cover ? `<img src="${esc(b.cover)}" alt="" referrerpolicy="no-referrer">` : '<div class="notitle">表紙なし</div>'}</div>
      <div style="flex:1;min-width:0">${has ? `<div><b>${esc(b.title)}</b></div><div class="muted small">${esc(b.author)}${b.publisher ? '／' + esc(b.publisher) : ''}</div>` : `<div class="field"><label for="cd-title">本の名前</label><input type="text" id="cd-title" placeholder="書名（わかれば著者も）"></div>`}
      <div class="muted small" style="margin-top:6px">${esc(st.n)}　${fmtDate(todayISO())}</div><div class="muted small">${inStore ? '🏪 店で出会った +' + XP.cardInStore : ''}</div></div></div>
    <div class="field"><label for="cd-why">なぜ手に取ったか（任意・100字まで）</label><textarea id="cd-why" maxlength="100" placeholder="例：表紙の青に目がとまった。店員さんの手書きPOPに「泣いた」とあった"></textarea></div>
    <label class="chk"><input type="checkbox" id="cd-pub"> このカードを公開する（本番では「みんなの出会い」に流れます。試作では「公開」の札が付くだけ）</label>
    <div class="note">表紙はopenBDから毎回表示するだけで、保存しません。記録はこの端末の中だけに残ります。</div>
    <div class="actions"><button class="btn primary" id="cd-save">カードにする（+${total} XP）</button><button class="btn ghost" id="cd-cancel2">やめる</button></div>`);
  $('#cd-cancel2').onclick = closeModal;
  $('#cd-save').onclick = () => { const title = has ? b.title : ($('#cd-title') ? $('#cd-title').value.trim() : ''); if (!title) { toast('本の名前を入れてください', 'warn'); return; }
    const book = Object.assign({ isbn: '', author: '', publisher: '', cover: '' }, b || {}, { title }); const res = G.makeCard(st, book, $('#cd-why').value.trim(), $('#cd-pub').checked);
    closeModal(); applyMapStates(); refreshHud(); sfx.reveal(); haptic([30, 40, 30]); toast(`カードができました +${res.total} XP${res.lv.after > res.lv.before ? `　レベルアップ！ Lv.${res.lv.after}` : ''}`, 'ok'); res.rewards.forEach((x) => toast(x, 'ok')); setSub('cards'); switchView('zukan'); };
}
export function openCard(id) {
  const c = S.cards.find((x) => x.id === id); if (!c) return;
  openModal(`<h2>カード</h2><div class="card-full"><div class="cover">${c.cover ? `<img src="${esc(c.cover)}" alt="" referrerpolicy="no-referrer">` : '<div class="notitle">表紙なし</div>'}</div>
      <div style="flex:1;min-width:0"><div><b>${esc(c.title)}</b></div><div class="muted small">${esc(c.author)}${c.publisher ? '／' + esc(c.publisher) : ''}</div><div style="margin-top:8px">${esc(c.sn)}</div><div class="muted small">${fmtDate(c.d)}${c.pub ? '・公開' : '・自分だけ'}</div>${c.why ? `<div class="why">${esc(c.why)}</div>` : ''}</div></div>
    <div class="actions"><button class="btn primary" id="cv-img">${icon('share')}画像にする</button><button class="btn" id="cv-store">店を地図で見る</button><button class="btn danger" id="cv-del">${icon('trash')}消す</button><button class="btn ghost" id="cv-close">閉じる</button></div><div id="cv-out"></div>`);
  $('#cv-close').onclick = closeModal; $('#cv-store').onclick = () => { closeModal(); openSheet(c.s); };
  $('#cv-del').onclick = () => confirmBox($('#cv-out'), 'このカードを消しますか？ 戻せません。', () => { G.deleteCard(id); closeModal(); toast('消しました'); });
  $('#cv-img').onclick = async () => { try { const blob = await cardImage(c); const r = await shareBlob(blob, `card-${c.d}.png`, c.title, `${c.sn}で『${c.title}』と出会った #本屋の地図`); if (r !== 'cancel') toast(r === 'saved' ? '画像を保存しました' : 'シェアしました', 'ok'); } catch (e) { $('#cv-out').innerHTML = '<p class="muted small">画像にできませんでした（表紙の画像が外部のため、ブラウザが書き出しを止めることがあります）。</p>'; } };
}

// ---------- さがす・追加 ----------
export function setupSearch() {
  const inp = $('#search'), res = $('#search-results');
  inp.addEventListener('input', () => { if (!inp.value.trim()) { res.hidden = true; res.innerHTML = ''; return; } const hits = search(inp.value);
    res.innerHTML = hits.map((s) => `<div class="item" data-id="${esc(s.i)}">${isFeat(s.i) ? '👑 ' : ''}${esc(s.n)} <span class="stars">${'★'.repeat(rarityOf(s))}</span><div class="muted small">${esc(s.a || prefOf(s))}</div></div>`).join('') || '<div class="item muted">見つかりません。＋ で地図に追加できます</div>'; res.hidden = false;
    $$('#search-results .item[data-id]').forEach((el) => el.addEventListener('click', () => { res.hidden = true; inp.value = ''; const st = BYID.get(el.dataset.id); openSheet(st.i); MAP.flyTo(st.lo, st.la, 15); })); });
  inp.addEventListener('blur', () => setTimeout(() => { res.hidden = true; }, 200));
}
export function startAdd() {
  const c = MAP.center();
  openModal(`<h2>地図にない本屋を追加</h2><p class="hint">追加した店はこの端末の記録にだけ使えます（本番では確認のあと地図に載ります。店名は文字だけ）。</p>
    <div class="field"><label for="ad-name">店の名前</label><input type="text" id="ad-name" placeholder="例：○○書店 △△店"></div><label class="chk"><input type="checkbox" id="ad-used"> 古書店</label>
    <div class="field"><label>場所</label><label class="chk"><input type="radio" name="ad-pos" value="center" checked> いま地図の真ん中（${c.lat.toFixed(4)}, ${c.lng.toFixed(4)}）</label><label class="chk"><input type="radio" name="ad-pos" value="here" ${hasPos() ? '' : 'disabled'}> いまいる場所</label></div>
    <div class="actions"><button class="btn primary" id="ad-save">追加する</button><button class="btn ghost" id="ad-cancel">やめる</button></div>`);
  $('#ad-cancel').onclick = closeModal; $('#ad-name').focus();
  $('#ad-save').onclick = () => { const n = $('#ad-name').value.trim(); if (!n) { toast('店の名前を入れてください', 'warn'); return; } let la = c.lat, lo = c.lng; if ($('input[name=ad-pos]:checked').value === 'here' && hasPos()) { la = POS.lat; lo = POS.lon; }
    const st = { i: 'u' + Date.now(), n, la: +la.toFixed(5), lo: +lo.toFixed(5), u: $('#ad-used').checked ? 1 : undefined }; addCustom(st); save(); MAP.setStores(STORES); applyMapStates(); updateNear(); closeModal(); toast('追加しました', 'ok'); openSheet(st.i); };
}
// ---------- 自分のアイコン：選んだ画像を丸く小さく切り抜く（端末の中だけ。どこにも送らない） ----------
export async function makeAvatar(file) {
  const url = URL.createObjectURL(file);
  try {
    let im; try { im = await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch (e) { im = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; }); }
    const w = im.width || im.naturalWidth, h = im.height || im.naturalHeight; if (!w || !h) throw new Error('bad image');
    const N = 160; const cv = document.createElement('canvas'); cv.width = N; cv.height = N; const g = cv.getContext('2d');
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, N, N); g.beginPath(); g.arc(N / 2, N / 2, N / 2, 0, Math.PI * 2); g.clip();
    const side = Math.min(w, h); g.drawImage(im, (w - side) / 2, (h - side) / 2, side, side, 0, 0, N, N);
    let q = 0.86, out = cv.toDataURL('image/jpeg', q); while (out.length > 120000 && q > 0.4) { q -= 0.12; out = cv.toDataURL('image/jpeg', q); }
    return out;
  } finally { URL.revokeObjectURL(url); }
}
export function devRefillInk() { inkRefill(); refreshHud(); toast('インクを満タンにしました（試作用）'); }

// ---------- 紙ふぶき（スタンプを押したときの演出） ----------
function confetti(host, colors) {
  const cv = document.createElement('canvas'); cv.className = 'confetti'; host.appendChild(cv);
  const dpr = Math.min(2, window.devicePixelRatio || 1); const W = host.clientWidth, H = host.clientHeight; cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + 'px'; cv.style.height = H + 'px'; const g = cv.getContext('2d'); g.scale(dpr, dpr);
  const P = []; for (let i = 0; i < 110; i++) { const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.6, sp = 5 + Math.random() * 9; P.push({ x: W / 2 + (Math.random() - 0.5) * 60, y: H * 0.4, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, s: 5 + Math.random() * 6, c: colors[i % colors.length], r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.35, k: Math.random() < 0.4 ? 1 : 0 }); }
  let t0 = null;
  const loop = (t) => { if (t0 == null) t0 = t; const dt = (t - t0) / 1000; g.clearRect(0, 0, W, H); for (const p of P) { p.vy += 0.22; p.vx *= 0.985; p.x += p.vx; p.y += p.vy; p.r += p.vr; g.save(); g.translate(p.x, p.y); g.rotate(p.r); g.fillStyle = p.c; g.globalAlpha = Math.max(0, Math.min(1, 2.2 - dt)); if (p.k) { g.beginPath(); g.arc(0, 0, p.s / 2, 0, Math.PI * 2); g.fill(); } else g.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); g.restore(); } if (dt < 2.3 && cv.isConnected) requestAnimationFrame(loop); else cv.remove(); };
  requestAnimationFrame(loop);
}
