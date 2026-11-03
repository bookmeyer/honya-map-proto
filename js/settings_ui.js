// 設定の画面と、そこから開くもの：見た目・着せ替え・アイコン・ハンドルネーム・参加コード・送るもののお知らせ・記録を守る・Googleマップの★
import { SKINS, MAP_SKINS, APP_VER } from './config.js?v=0.17.0';
import { $, esc, fmtDist, icon, $$, mobileOS, isStandalone, emit, todayISO } from './util.js?v=0.17.0';
import { S, save, parseImport, replace, reset, exportJSON } from './state.js?v=0.17.0';
import { sfx } from './audio.js?v=0.17.0';
import { POS } from './position.js?v=0.17.0';
import { addCustom, STORES, DATA_DATE, rebuild, unhideAll } from './data.js?v=0.17.0';
import * as MAP from './map.js?v=0.17.0';
import * as E from './events.js?v=0.17.0';
import * as GI from './gimport.js?v=0.17.0';
import { openModal, closeModal, toast, refreshHud, switchView, confirmBox } from './ui.js?v=0.17.0';
import { applyMapStates, updateNear, updateAreaChip, setTrialUI } from './map_ui.js?v=0.17.0';

// ---------- Googleマップの★を読み込む ----------
export function googleHelp() {
  openModal(`<h2>Googleマップの★を読み込む</h2>
    <p class="hint">Googleマップで★（スター）や保存リストに入れた本屋を、このアプリの「行きたい」にまとめて入れます。</p>
    <ol class="steps"><li><a href="https://takeout.google.com/" target="_blank" rel="noopener">Google データエクスポート（Takeout）</a>を開きます</li><li>「選択をすべて解除」を押し、「マップ（マイプレイス）」と「保存済み」にだけチェックを入れます</li><li>いちばん下の「次のステップ」→「エクスポートを作成」。準備ができるとメールが届きます</li><li>届いたzipを開くと、★は「Saved Places.json」（マップ（マイプレイス）の中）か、「保存済み」フォルダの「スター付き」のCSVに入っています。ほかの保存リストもCSVで入っています</li><li>設定の「Googleマップの★」→「読み込む」で、そのファイルを選びます（いくつでも選べます）</li></ol>
    <div class="note">Googleマップと自動でつなぐ口はGoogleが用意していないため、ファイルで受け渡します。ファイルはこの端末の中で読むだけで、どこにも送りません。ファイル名は時期によって少し違うことがあります。</div>
    <div class="actions"><button class="btn ghost wide" id="gh-close">閉じる</button></div>`);
  $('#gh-close').onclick = closeModal;
}
export async function importGoogleFiles(files) {
  let places = [], bad = 0;
  for (const f of files) { try { places = places.concat(GI.parseGoogle(await f.text())); } catch (e) { bad++; } }
  if (!places.length) { toast(bad ? '読めませんでした（Googleデータエクスポートの .json か .csv を選んでください）' : '場所が見つかりませんでした', 'warn'); return; }
  const r = GI.matchGoogle(places); const addable = r.misses.filter((p) => p.bookish && p.lat != null); const others = r.misses.filter((p) => !(p.bookish && p.lat != null));
  openModal(`<h2>Googleマップの保存リスト</h2><p class="hint">${places.length}件のうち、地図にある本屋・図書館 ${r.hits.length}件${addable.length ? `・地図にない本屋らしい店 ${addable.length}件` : ''}</p>
    ${r.hits.length ? `<div class="list gi">${r.hits.map((h, i) => `<label class="item"><input type="checkbox" data-h="${i}" ${h.want ? 'checked disabled' : 'checked'}><div class="main"><div class="name">${esc(h.st.n)}</div><div class="sub">Google：${esc(h.p.name || '（名前なし）')}${h.d != null ? '・' + fmtDist(h.d) : ''}${h.want ? '・すでに行きたい' : ''}</div></div></label>`).join('')}</div>` : ''}
    ${addable.length ? `<h3>地図にない本屋らしい店</h3><p class="hint">チェックした店を自分の地図に足して「行きたい」にします（この端末だけ）。</p><div class="list gi">${addable.map((p, i) => `<label class="item"><input type="checkbox" data-a="${i}" checked><div class="main"><div class="name">${esc(p.name)}</div><div class="sub">${esc(p.address || '')}</div></div></label>`).join('')}</div>` : ''}
    ${others.length ? `<details class="chap"><summary><span>地図に見当たらない ${others.length}件</span></summary><div class="muted small">${others.slice(0, 120).map((p) => esc(p.name || '（名前なし）')).join('、')}${others.length > 120 ? '…' : ''}</div></details>` : ''}
    <div class="actions"><button class="btn primary wide" id="gi-ok" ${r.hits.length || addable.length ? '' : 'disabled'}>${icon('heart')}行きたいに入れる</button><button class="btn ghost wide" id="gi-cancel">やめる</button></div>`);
  $('#gi-cancel').onclick = closeModal;
  $('#gi-ok').onclick = () => {
    let n = 0;
    $$('#modal-box [data-h]').forEach((cb) => { const h = r.hits[+cb.dataset.h]; if (cb.checked && !cb.disabled && !S.wants.includes(h.st.i)) { S.wants.push(h.st.i); n++; } });
    let k = 0; $$('#modal-box [data-a]').forEach((cb) => { if (!cb.checked) return; const p = addable[+cb.dataset.a]; const st = { i: 'u' + Date.now().toString(36) + (k++), n: p.name, la: +p.lat.toFixed(5), lo: +p.lon.toFixed(5), a: p.address || undefined }; addCustom(st); S.wants.push(st.i); n++; });
    S.gimport = { at: Date.now(), n }; save(); MAP.setStores(STORES); applyMapStates(); updateNear(); refreshHud(); closeModal(); updateAreaChip();
    toast(`${n}店を「行きたい」に入れました`, 'ok');
  };
}
// ---------- 設定 ----------
export function renderSettings() {
  const s = S.settings; const hid = Object.keys(S.hidden);
  $('#settings-pane').innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px"><button class="icon-btn" id="st-back" aria-label="戻る" style="transform:rotate(180deg)">${icon('chevron')}</button><h2 style="margin:0">設定</h2></div>
    <div class="setting"><div><div class="l">見た目</div><div class="s">明るい見た目が基本です。「自動」にすると端末の設定に合わせます</div></div><div class="seg3" id="st-theme">${['auto', 'light', 'dark'].map((t) => `<button data-t="${t}" class="${s.theme === t ? 'active' : ''}">${{ auto: '自動', light: '明', dark: '暗' }[t]}</button>`).join('')}</div></div>
    <div class="setting stack"><div><div class="l">着せ替え</div><div class="s">画面の色と地図の色を選べます（明るい見た目のとき）。ピンとスタンプの色は変わりません</div>
      <div class="skins"><div class="sk-h">画面</div>${Object.entries(SKINS).map(([k, x]) => `<button class="skin${(s.skin || 'remon') === k ? ' on' : ''}" data-skin="${k}"><i style="background:linear-gradient(135deg,${x.sw[0]} 50%,${x.sw[1]} 50%)"></i>${esc(x.name)}</button>`).join('')}
      <div class="sk-h">地図</div>${Object.entries(MAP_SKINS).map(([k, x]) => `<button class="skin${(s.mapSkin || 'cream') === k ? ' on' : ''}" data-mapskin="${k}"><i style="background:linear-gradient(135deg,${x.bg} 50%,${x.water} 50%)"></i>${esc(x.name)}</button>`).join('')}</div></div></div>
    <div class="setting"><div><div class="l">ハンドルネーム</div><div class="s">${S.settings.handle ? esc(S.settings.handle) : 'まだありません。見出し・プロフィール・シェアする画像に出ます'}</div></div><button class="btn" id="st-name">${S.settings.handle ? '変える' : '付ける'}</button></div>
    <div class="setting"><div><div class="l">参加コード</div><div class="s">${s.joinCode ? `「${esc(s.joinCode)}」で参加中（お試しの人だけのイベントが見えます）` : 'お試しなどで渡されたコードを入れると、その人たちだけのイベントが見えます'}</div></div><button class="btn" id="st-join">${s.joinCode ? '変える' : '入れる'}</button></div>
    <div class="setting"><div><div class="l">参加の記録を送る</div><div class="s">参加の人数を数えるのと、書店員さんの手書きのカードを開くための記録を送ります。位置・名前・メモは送りません${(S.outbox || []).length ? `（まだ送っていない記録 ${S.outbox.length}件）` : ''}<details class="more"><summary>くわしく</summary>送るのは、スタンプを押した店の番号・日時・店の近くで押したか・お試し歩きか・どのイベントかと、名前のない、ランダムな番号です。手書きのカードを開くときは、店の番号とランダムな番号を送ります（その店で押した記録と照らし合わせるため）。本のカードは送りません。止めても、イベントの枠は付きます（手書きのカードは見られなくなります）。</details></div></div><button class="switch ${s.sendLog !== false ? 'on' : ''}" id="st-send" role="switch" aria-checked="${s.sendLog !== false}" aria-label="参加の記録を送る"></button></div>
    <div class="setting"><div><div class="l">自分のアイコン</div><div class="s">地図の現在地に出ます。写真はこの端末の中だけに置き、どこにも送りません</div></div><div class="avatar-ctl">${s.avatar ? `<img class="avatar" src="${esc(s.avatar)}" alt="">` : ''}<label class="btn">${s.avatar ? '替える' : '選ぶ'}<input type="file" id="st-avatar" accept="image/*" hidden></label>${s.avatar ? '<button class="btn ghost" id="st-avatar-del">外す</button>' : ''}</div></div>
    <div class="setting"><div><div class="l">図書館も地図に出す</div><div class="s">全国の公共図書館（約3,500館）。大学・学校の図書館は入っていません</div></div><button class="switch ${s.showLib !== false ? 'on' : ''}" id="st-lib" role="switch" aria-checked="${s.showLib !== false}" aria-label="図書館も地図に出す"></button></div>
    <div class="setting"><div><div class="l">行きたい店のお知らせ</div><div class="s">行きたい店に近づくと、地図の下でお知らせします（アプリを開いて現在地を追っているあいだ）</div></div><button class="switch ${s.wantAlert !== false ? 'on' : ''}" id="st-want" role="switch" aria-checked="${s.wantAlert !== false}" aria-label="行きたい店のお知らせ"></button></div>
    ${s.wantAlert !== false ? `<div class="setting"><div><div class="l">お知らせする距離</div><div class="s">この距離に入ったときと、500mに入ったとき</div></div><div class="seg3" id="st-want-m">${[1000, 2000, 5000].map((m) => `<button data-m="${m}" class="${(s.wantAlertM || 2000) === m ? 'active' : ''}">${m / 1000}km</button>`).join('')}</div></div>` : ''}
    <div class="setting"><div><div class="l">読んだ場所を残す</div><div class="s">読書をはじめた所とおわった所を、この端末の中だけに残します（送りません）。物語に「○○書店のそばで」「移動しながら」と書き、地図に📖の印を出します</div></div><button class="switch ${s.readPlace !== false ? 'on' : ''}" id="st-readplace" role="switch" aria-checked="${s.readPlace !== false}" aria-label="読んだ場所を残す"></button></div>
    <div class="setting stack"><div><div class="l">Googleマップの★</div><div class="s">Googleマップで★を付けた本屋を「行きたい」にまとめて入れます${S.gimport ? `（前回 ${S.gimport.n}店）` : ''}</div></div><div class="avatar-ctl"><button class="btn ghost" id="st-ghelp">読み込み方</button><label class="btn">読み込む<input type="file" id="st-gimport" accept=".json,.csv,application/json,text/csv" multiple hidden></label></div></div>
    <div class="setting"><div><div class="l">音</div><div class="s">スタンプを押したとき・巻が進んだとき（近づいたときは鳴りません）</div></div><button class="switch ${s.sound ? 'on' : ''}" id="st-sound" role="switch" aria-checked="${s.sound}" aria-label="音"></button></div>
    <div class="setting"><div><div class="l">お試し歩き</div><div class="s">地図を押した場所に自分がいることにする（家で試す用）</div></div><button class="switch ${POS.fake ? 'on' : ''}" id="st-trial" role="switch" aria-checked="${POS.fake}" aria-label="お試し歩き"></button></div>
    <h3>記録</h3>
    ${mobileOS() ? `<div class="setting"><div><div class="l">記録を守る</div><div class="s">${isStandalone() ? 'ホーム画面のアイコンから開いています。記録が消えにくい開き方です' : 'ホーム画面に追加して、アイコンから開くと、記録が消えにくくなります'}</div></div>${isStandalone() ? '' : '<button class="btn" id="st-home">やり方</button>'}</div>` : ''}
    <div class="setting"><div><div class="l">書き出す</div><div class="s">（読んだ場所・最後にいた場所も入ります。人に渡さないでください）スタンプ・カード・ページをファイルに</div></div><button class="btn" id="st-export">書き出す</button></div>
    <div class="setting"><div><div class="l">読み込む</div><div class="s">書き出したファイルから置き換え</div></div><label class="btn">読み込む<input type="file" id="st-import" accept="application/json" hidden></label></div>
    <div class="setting"><div><div class="l">店の情報の直し</div><div class="s">${hid.length || Object.keys(S.renames || {}).length ? `閉店 ${hid.length}件・名前の直し ${Object.keys(S.renames || {}).length}件（この端末の地図。書き出しに含まれます）` : 'まだありません（店のページの「閉店している」「名前が違う」から）'}。「運営にも知らせる」を選ぶと、確かめてから、みんなの地図も直します${(S.repOut || []).length ? `（まだ送れていない報告 ${S.repOut.length}件）` : ''}</div></div><button class="btn" id="st-unhide" ${hid.length || Object.keys(S.renames || {}).length ? '' : 'disabled'}>戻す</button></div>
    <div class="setting"><div><div class="l">すべて消す</div><div class="s">この端末の記録を消します。戻せません</div></div><button class="btn danger" id="st-clear">消す</button></div>
    <div id="st-area"></div>
    <h3>試作のための道具</h3>
    <div class="setting"><div><div class="l">端末の確認</div><div class="s">位置・カメラ・保存が使えるか</div></div><button class="btn" id="st-diag">確認</button></div>
    <div id="st-diag-out"></div>
    <h3>このアプリについて</h3>
    <div class="about">本めぐり v${APP_VER}（試作）。本屋をめぐって、本とめぐりあう。本屋と図書館の位置ゲームです。<br>歩きながら画面を見ないでください。運転中は使わないでください。お店では、店の方やほかのお客さんの迷惑にならないようにお願いします。<br>位置（座標）は、この端末の中で距離を出すためだけに使い、送りません。参加の人数を数えるために、スタンプを押した店の番号・日時・店の近くで押したか・お試し歩きか・どのイベントかを、名前のない、ランダムな番号といっしょに、本をつなぐ（tsunagubooks.com）へ送ります（設定で止められます）。そのほかの記録は、この端末の中だけに残ります。<br>画面を出すために、Google Fonts（文字）・jsDelivr（地図のプログラム）・OpenFreeMap（地図の絵。見ている範囲）へ、本を調べるときは openBD（その本の番号）へつなぎます。このとき、端末のIPアドレスやブラウザの種類が相手に届きます。<br><br>
      店の位置：© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors（ODbL）。地図：<a href="https://openfreemap.org/" target="_blank" rel="noopener">OpenFreeMap</a>・<a href="https://openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a>。本の情報と表紙：<a href="https://openbd.jp/" target="_blank" rel="noopener">openBD</a>（表紙は紹介のための参照表示で、保存しません）。書名でさがす：<a href="https://ndlsearch.ndl.go.jp/" target="_blank" rel="noopener">国立国会図書館サーチ</a>の API（国立国会図書館の書誌データ・<a href="https://creativecommons.org/licenses/by/4.0/deed.ja" target="_blank" rel="noopener">CC BY 4.0</a>。著者名の表し方を整えて出しています。送るのは、さがす言葉だけです）。地図の描画：MapLibre GL JS。文字：Google Fonts。<br>
      店のデータは ${DATA_DATE} 時点の OpenStreetMap（有志が作る地図）で、閉店や名前の変更が反映されていない店があります。店のページの「閉店している」で外せ、「名前が違う」で直せます（この端末だけ。記録の書き出しに含まれます）。</div>`;
  $('#st-back').onclick = () => switchView('map');
  $$('#st-theme button').forEach((b) => b.addEventListener('click', () => { s.theme = b.dataset.t; save(); applyTheme(); renderSettings(); }));
  $('#st-avatar').addEventListener('change', async (e) => { const f = e.target.files[0]; if (!f) return; try { const url = await makeAvatar(f); s.avatar = url; save(); await MAP.setAvatar(url); toast('アイコンを設定しました。地図の現在地に出ます', 'ok'); } catch (err) { toast('この画像は使えませんでした（別の写真でお試しください）', 'warn'); } e.target.value = ''; renderSettings(); });
  if ($('#st-avatar-del')) $('#st-avatar-del').onclick = () => { s.avatar = ''; save(); MAP.setAvatar(null); renderSettings(); toast('アイコンを外しました'); };
  $('#st-lib').onclick = () => { s.showLib = s.showLib === false; save(); rebuild(); MAP.setStores(STORES); applyMapStates(); updateNear(); refreshHud(); toast(s.showLib ? '図書館を地図に出しました' : '図書館を地図から隠しました'); renderSettings(); };
  $('#st-want').onclick = () => { s.wantAlert = s.wantAlert === false; save(); renderSettings(); };
  $$('#st-want-m button').forEach((b) => b.addEventListener('click', () => { s.wantAlertM = +b.dataset.m; save(); renderSettings(); }));
  $('#st-ghelp').onclick = googleHelp;
  $('#st-gimport').addEventListener('change', async (e) => { const fs = [...e.target.files]; e.target.value = ''; if (fs.length) await importGoogleFiles(fs); renderSettings(); });
  $('#st-name').onclick = () => nameModal(renderSettings);
  $('#st-join').onclick = () => joinModal(renderSettings);
  $('#st-send').onclick = () => { E.setSendLog(s.sendLog === false); renderSettings(); toast(S.settings.sendLog === false ? '参加の記録を送るのを止めました' : '参加の記録を送るようにしました', 'ok'); };
  $('#st-readplace').onclick = () => { s.readPlace = s.readPlace === false; save(); renderSettings(); emit('records'); toast(s.readPlace === false ? '読んだ場所を残すのを止めました（地図の印も消えます）' : '読んだ場所を残すようにしました', 'ok'); }; // 読んだ場所（v0.15.0）
  $$('#view-settings [data-skin]').forEach((b) => { b.onclick = () => { s.skin = b.dataset.skin; save(); applySkin(); renderSettings(); }; }); // 着せ替え（v0.15.2）
  $$('#view-settings [data-mapskin]').forEach((b) => { b.onclick = () => { s.mapSkin = b.dataset.mapskin; save(); applySkin(); renderSettings(); toast('地図の色を変えました（地図のタブで見られます）', 'ok'); }; });
  $('#st-sound').onclick = () => { s.sound = !s.sound; save(); renderSettings(); if (s.sound) sfx.click(); };
  $('#st-trial').onclick = () => { setTrialUI(!POS.fake); renderSettings(); };
  $('#st-export').onclick = exportFile;
  if ($('#st-home')) $('#st-home').onclick = homeTip;
  $('#st-import').addEventListener('change', async (e) => { const f = e.target.files[0]; if (!f) return; try { const d = parseImport(await f.text()); confirmBox($('#st-area'), `読み込むと、いまの記録（スタンプ${Object.keys(S.stamps).length}・カード${S.cards.length}）は置き換わります。`, () => { replace(d); rebuild(); MAP.setStores(STORES); applyMapStates(); refreshHud(); toast('読み込みました', 'ok'); renderSettings(); }, '置き換える'); } catch (err) { toast('読み込めませんでした（このアプリで書き出したファイルを選んでください）', 'warn'); } e.target.value = ''; });
  $('#st-unhide').onclick = () => { unhideAll(); save(); MAP.setStores(STORES); applyMapStates(); updateNear(); toast('戻しました', 'ok'); renderSettings(); };
  $('#st-clear').onclick = () => confirmBox($('#st-area'), 'この端末の記録（スタンプ・訪問・カード・行きたい・追加した店・ページ）をすべて消します。戻せません。', () => { reset(); rebuild(); MAP.setStores(STORES); applyMapStates(); refreshHud(); toast('消しました'); renderSettings(); });
  $('#st-diag').onclick = async () => { const out = $('#st-diag-out'); const rows = []; rows.push(['位置', navigator.geolocation ? '使える' : '使えない']); rows.push(['カメラ', navigator.mediaDevices && navigator.mediaDevices.getUserMedia ? '使える' : '使えない']); rows.push(['バーコード読み取り（標準）', 'BarcodeDetector' in window ? 'あり' : 'なし（代わりの部品を使います）']); let storage = '?'; try { localStorage.setItem('__t', '1'); localStorage.removeItem('__t'); storage = '使える'; } catch (e) { storage = '使えない'; } rows.push(['保存', storage]); rows.push(['https', location.protocol === 'https:' ? 'はい' : 'いいえ（位置とカメラにはhttpsが要ります）']); rows.push(['ホーム画面に追加', window.matchMedia('(display-mode: standalone)').matches ? '追加ずみ' : '未追加']);  rows.push(['共有', navigator.share ? '使える' : '使えない（画像は保存になります）']); out.innerHTML = `<div class="status-card">${rows.map(([k, v]) => `<div><b>${k}</b>：${v}</div>`).join('')}</div>`; };
}
export function applyTheme() {
  const t = S.settings.theme; const dark = t === 'dark' || (t === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'; applySkin(); MAP.setTheme(dark ? 'dark' : 'light');
}
// 着せ替え（v0.15.2。v0.15.3 で正式に）：明るい見た目のときだけ、画面の色の変数を上書きする。地図の色も（明るいときだけ効く）
export function applySkin() {
  const el = document.documentElement; const sk = Object.hasOwn(SKINS, S.settings.skin || '') ? SKINS[S.settings.skin] : SKINS.remon;
  for (const k of new Set(Object.values(SKINS).flatMap((x) => Object.keys(x.v)))) el.style.removeProperty(k);
  if (el.dataset.theme !== 'dark') for (const [k, v] of Object.entries(sk.v)) el.style.setProperty(k, v);
  MAP.setMapSkin(S.settings.mapSkin);
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
// ---------- ハンドルネーム ----------
export const cleanHandle = (s) => String(s || '').replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 20);
export function nameModal(after) {
  const cur = S.settings.handle || '';
  openModal(`<h2>ハンドルネーム</h2><p class="hint">見出し・プロフィール・その日の物語・シェアする画像に出ます。この端末の中だけに残ります。</p>
    <div class="field"><label for="nm-in">名前（20字まで）</label><input type="text" id="nm-in" maxlength="20" value="${esc(cur)}" placeholder="例：本の虫" autocomplete="nickname"></div>
    <div class="actions"><button class="btn primary" id="nm-ok">決める</button>${cur ? '<button class="btn ghost" id="nm-clear">外す</button>' : '<button class="btn ghost" id="nm-cancel">やめる</button>'}</div>`);
  const inp = $('#nm-in'); inp.focus(); inp.select();
  const finish = (v) => { S.settings.handle = v; save(); closeModal(); refreshHud(); if (after) after(); toast(v ? `「${v}」にしました` : '名前を外しました', 'ok'); };
  $('#nm-ok').onclick = () => { const v = cleanHandle(inp.value); if (!v) { toast('名前を入れてください', 'warn'); return; } finish(v); };
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#nm-ok').click(); });
  if ($('#nm-clear')) $('#nm-clear').onclick = () => finish('');
  if ($('#nm-cancel')) $('#nm-cancel').onclick = closeModal;
}
// ---------- 参加コード・送るもののお知らせ（v0.10） ----------
const SEND_TEXT = '<ul class="plain"><li><b>送るもの</b>：スタンプを押した店の番号と日時、店の近くで押したか・お試し歩きか・どのイベントか（参加の人数を数えるため。名前のない、ランダムな番号といっしょに）</li><li><b>手書きのカードを開くとき</b>：店の番号と、ランダムな番号（その店で押した記録と照らし合わせるため）</li><li><b>店の情報を知らせるとき</b>（「運営にも知らせる」を選んだときだけ）：店の番号・名前・ひとこと（地図にない店は、その店の場所）と、ランダムな番号</li><li><b>送らないもの</b>：位置の座標・移動の記録・読んだ場所・名前・メモ・本のカード</li><li>設定の「参加の記録を送る」で、いつでも止められます</li></ul>';
export function joinNotice(code) {
  S.settings.privacyV10 = 1; save();
  openModal(`<h2>お試しに参加しました</h2><p>参加コード「${esc(code)}」が入りました。お試しの人だけのイベントが、ラリーの画面と地図に出ます。</p>${SEND_TEXT}<div class="actions"><button class="btn primary wide" id="jn-ok">はじめる</button></div>`);
  $('#jn-ok').onclick = closeModal;
}
export function privacyNotice() {
  S.settings.privacyV10 = 1; save();
  openModal(`<h2>お知らせ</h2><p>イベント（期間限定のスタンプの枠など）が始まるのにあわせて、参加の人数を数えるための記録を送るようになりました。</p>${SEND_TEXT}<div class="actions"><button class="btn primary" id="pv-ok">わかった</button><button class="btn ghost" id="pv-set">設定を見る</button></div>`);
  $('#pv-ok').onclick = closeModal; $('#pv-set').onclick = () => { closeModal(); switchView('settings'); };
}
// ---------- 記録を守る：ホーム画面に追加（v0.10.1） ----------
// iPhone の Safari は、しばらく開かないサイトの記録を消すことがある。ホーム画面のアイコンから開けば消えにくい
// iPhone ではアイコンと Safari で記録の置き場所が別なので、記録がある人には書き出し→読み込みを案内する
export function exportFile() {
  const blob = new Blob([exportJSON()], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `honya-map-${todayISO()}.json`; document.body.appendChild(a); a.click(); a.remove(); toast('書き出しました', 'ok');
}
export function homeTip() {
  S.settings.homeTip = 1; save();
  const ios = mobileOS() === 'ios'; const has = Object.keys(S.stamps).length + S.cards.length > 0;
  const why = ios ? 'Safariで開いているだけだと、しばらく開かないうちに、スタンプなどの記録が消えることがあります（Safariの決まりです）。' : 'ブラウザで開いているだけだと、端末の空きが少ないときなどに、記録が消えることがあります。';
  const steps = ios ? '<ol class="plain"><li>Safariで本めぐりを開く</li><li>共有ボタン（四角に上向きの矢印）を押す</li><li>「ホーム画面に追加」→「追加」を押す</li></ol>' : '<ol class="plain"><li>右上のメニュー（︙）を押す</li><li>「ホーム画面に追加」か「アプリをインストール」を押す</li></ol>';
  const move = ios && has ? '<p class="hint">いまの記録の移し方：iPhoneでは、ホーム画面のアイコンとSafariとで、記録の置き場所が別になります。先にここで「書き出す」を押してファイルにし、アイコンから開いた本めぐりの設定で「読み込む」を選んでください。</p>' : '';
  openModal(`<h2>記録を守るために</h2><p>${why}ホーム画面に追加して、アイコンから開くと消えにくくなります。</p>${steps}${move}<div class="actions">${move ? '<button class="btn primary" id="ht-export">書き出す</button>' : ''}<button class="btn ${move ? 'ghost' : 'primary'}" id="ht-ok">わかった</button></div>`);
  $('#ht-ok').onclick = closeModal; if ($('#ht-export')) $('#ht-export').onclick = exportFile;
}
export function joinModal(after) {
  const cur = S.settings.joinCode || '';
  openModal(`<h2>参加コード</h2><p class="hint">お試しなどで渡されたコードを入れると、その人たちだけのイベントが見えます。</p><div class="field"><label for="jc-in">コード（英数字と - _）</label><input type="text" id="jc-in" maxlength="40" value="${esc(cur)}" autocomplete="off" autocapitalize="off"></div><div class="actions"><button class="btn primary" id="jc-ok">決める</button>${cur ? '<button class="btn ghost" id="jc-clear">外す</button>' : '<button class="btn ghost" id="jc-cancel">やめる</button>'}</div>`);
  const inp = $('#jc-in'); inp.focus();
  const finish = async (v) => { closeModal(); await E.setJoinCode(v); applyMapStates(); refreshHud(); if (after) after(); toast(v ? `参加コード「${v}」を入れました` : '参加コードを外しました', 'ok'); };
  $('#jc-ok').onclick = () => { const v = inp.value.trim().toLowerCase(); if (!/^[a-z0-9_-]{2,40}$/.test(v)) { toast('英数字と - _ の2〜40字で入れてください', 'warn'); return; } finish(v); };
  if ($('#jc-clear')) $('#jc-clear').onclick = () => finish('');
  if ($('#jc-cancel')) $('#jc-cancel').onclick = closeModal;
}
