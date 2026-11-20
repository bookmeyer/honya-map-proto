// はじめの画面と、ブラウザで遊ぶ人への案内（v0.28.0）
// 11/19 ぶっくまさん「まずはブラウザの場合の課題があると思います。ホーム画面に追加を促したり、移行時の問題とか」
//   →「２は一番最初にもいれるのはどう？」→「ぜんぶ提案のとおりで」（案：戦略/書店まわり位置ゲーム/修正案_ブラウザ版の課題_2026-11-19.md）
// ・いちばん最初の画面を、開いた場所で変える：SNSのアプリの中 →「Safari／Chromeで開いてください」／スマホのブラウザ →「ホーム画面に追加してから始める」
//   ／ホーム画面のアイコン・パソコン → すぐ説明へ
// ・SNSのアプリの中では、上に帯（開くたび。× でその回は閉じる）。LINE は URL に印を付けて、Safari／Chrome で開き直してもらう
// ・ホーム画面に追加の声かけは、最初の画面と、最初のスタンプの直後の2回まで（音・光・振動なし。帯で）
// ・iPhone の Safari → アイコンの引っ越しは、引き継ぎコードで。移したあと、もとの場所で開くと「記録は移した先にあります」の帯
import { $, esc, mobileOS, isStandalone, icon } from './util.js?v=0.32.7';
import { S, save } from './state.js?v=0.32.7';
import { openModal, closeModal, toast } from './ui.js?v=0.32.7';
import { openGiveCode, checkMoved } from './transfer_ui.js?v=0.32.7';

// ---------- 開いた場所 ----------
// SNSなどのアプリの中のブラウザなら、その名前（わからないアプリは 'app'）。ふつうのブラウザ・ホーム画面のアイコンなら ''
const IN_APP = [[/\bLine\//i, 'LINE'], [/Instagram/, 'Instagram'], [/FBAN|FBAV|FB_IAB|FBIOS/, 'Facebook'], [/musical_ly|BytedanceWebview|TikTok/i, 'TikTok'], [/Twitter/i, 'X'], [/YJApp/i, 'Yahoo! JAPAN'], [/KAKAOTALK/i, 'カカオトーク'], [/\bGSA\//, 'Google']];
export function inAppName(ua = navigator.userAgent || '') {
  if (isStandalone()) return '';
  for (const [re, n] of IN_APP) if (re.test(ua)) return n;
  const os = mobileOS();
  if (os === 'android' && /; wv\)/.test(ua)) return 'app'; // Android のアプリの中の画面（WebView）
  if (os === 'ios' && /iPhone|iPad|iPod/.test(ua) && !/Safari\//.test(ua)) return 'app'; // iPhone のアプリの中の画面（Safari の名前が入らない）
  return '';
}
const browserName = () => (mobileOS() === 'android' ? 'Chrome' : 'Safari');
const whereText = (n) => (n === 'app' ? 'アプリの中の画面' : `${n}のアプリの中`);

// LINE の中で開いたら、URL に印（openExternalBrowser=1）を付けて開き直す → LINE が Safari／Chrome で開いてくれる。1回だけ
export function lineEscape() {
  if (inAppName() !== 'LINE') return false;
  const u = new URL(location.href); if (u.searchParams.get('openExternalBrowser') === '1') return false;
  u.searchParams.set('openExternalBrowser', '1'); location.replace(u.toString()); return true;
}
// 外のブラウザで開いたら、印は URL から外す（ブックマークやホーム画面に残さない）
export function stripLineMark() {
  if (inAppName()) return;
  const u = new URL(location.href); if (!u.searchParams.has('openExternalBrowser')) return;
  u.searchParams.delete('openExternalBrowser'); try { history.replaceState(history.state, '', u.pathname + u.search + u.hash); } catch (e) {}
}
const plainURL = () => { const u = new URL(location.href); u.searchParams.delete('openExternalBrowser'); u.hash = ''; return u.toString(); };
// Android：Chrome で開くリンク（多くのアプリで、押すだけで Chrome に移れる）
const chromeLink = () => { const u = new URL(plainURL()); return `intent://${u.host}${u.pathname}${u.search}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(u.toString())};end`; };
async function copyURL() { try { await navigator.clipboard.writeText(plainURL()); toast(`URLをコピーしました。${browserName()}に貼り付けて開いてください`, 'ok'); } catch (e) { toast(`コピーできませんでした。${plainURL()} を${browserName()}に入れてください`, 'warn'); } }

// ---------- ホーム画面に追加（Android は、ブラウザが用意する「追加する」ボタンを使う） ----------
let BIP = null; const bipWait = [];
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); BIP = e; bipWait.splice(0).forEach((f) => f()); });
window.addEventListener('appinstalled', () => { BIP = null; });
async function installNow() { const e = BIP; if (!e) return false; BIP = null; try { await e.prompt(); const c = await e.userChoice; return c && c.outcome === 'accepted'; } catch (err) { return false; } }

// やり方（iPhone／Android）。iPhone の X などは、アプリの中かどうか見分けられないので、1行足す
export function homeSteps(os = mobileOS()) {
  if (os === 'ios') return '<ol class="plain"><li>共有ボタン（四角に上向きの矢印）を押す。画面の下か、アドレスバーの横にあります。見当たらないときは「…」から</li><li>「ホーム画面に追加」→「追加」を押す</li><li>ホーム画面にできた「本めぐり」のアイコンから開く</li></ol><p class="hint">X などのアプリから開いたときは、先に画面の下の Safari のマーク（方位磁石）を押して、Safari で開いてください。</p>';
  return '<ol class="plain"><li>右上のメニュー（︙）を押す</li><li>「ホーム画面に追加」か「アプリをインストール」を押す</li><li>ホーム画面にできた「本めぐり」のアイコンから開く</li></ol>';
}
const homeWhy = (os) => (os === 'ios' ? 'Safariで開いているだけだと、しばらく開かないうちに、スタンプなどの記録が消えることがあります（Safariの決まりです）。' : 'ブラウザで開いているだけだと、端末の空きが少ないときなどに、記録が消えることがあります。');
const inAppSteps = (os) => `<ol class="plain"><li>画面の上か下の「…」（または共有のマーク）を押す</li><li>「${os === 'android' ? 'Chromeで開く' : 'Safariで開く'}」「ブラウザで開く」などを押す</li><li>見つからないときは「URLをコピー」を押して、${os === 'android' ? 'Chrome' : 'Safari'}に貼り付ける</li></ol>`;

const ART_HOME = `<svg viewBox="0 0 200 200"><circle cx="100" cy="100" r="92" fill="#FBEFD6" stroke="#1B1B1B" stroke-width="2.5"/><rect x="64" y="34" width="72" height="132" rx="12" fill="#FFFFFF" stroke="#1B1B1B" stroke-width="2.5"/>${[76, 93, 110].map((x) => [50, 68, 86].map((y) => `<rect x="${x}" y="${y}" width="14" height="14" rx="4" fill="#D9CDB4"/>`).join('')).join('')}<rect x="85" y="106" width="30" height="30" rx="8" fill="#FF6A48" stroke="#1B1B1B" stroke-width="2"/><text x="100" y="128" text-anchor="middle" font-size="18" fill="#1B1B1B" font-family="Mochiy Pop P One, Zen Maru Gothic, sans-serif">本</text><circle cx="115" cy="106" r="9" fill="#FFD447" stroke="#1B1B1B" stroke-width="2"/><path d="M110.5 106h9M115 101.5v9" stroke="#1B1B1B" stroke-width="2.5" stroke-linecap="round"/><rect x="88" y="154" width="24" height="4" rx="2" fill="#1B1B1B"/></svg>`;
const ART_OUT = `<svg viewBox="0 0 200 200"><circle cx="100" cy="100" r="92" fill="#FBEFD6" stroke="#1B1B1B" stroke-width="2.5"/><rect x="52" y="40" width="66" height="122" rx="12" fill="#FFFFFF" stroke="#1B1B1B" stroke-width="2.5"/><rect x="60" y="54" width="50" height="8" rx="4" fill="#D9CDB4"/><rect x="60" y="70" width="50" height="60" rx="6" fill="#EFE6D2"/><circle cx="142" cy="78" r="26" fill="#2F9BFF" stroke="#1B1B1B" stroke-width="2.5"/><path d="M142 60l6 18-6 18-6-18z" fill="#FFFFFF" stroke="#1B1B1B" stroke-width="1.5" stroke-linejoin="round"/><path d="M142 60l6 18h-12z" fill="#FF6A48" stroke="#1B1B1B" stroke-width="1.5" stroke-linejoin="round"/><path d="M104 120q22 4 30-16" fill="none" stroke="#1B1B1B" stroke-width="3" stroke-linecap="round"/><path d="M128 100l7 3 2-8" fill="none" stroke="#1B1B1B" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><rect x="73" y="150" width="24" height="4" rx="2" fill="#1B1B1B"/></svg>`;

// ---------- いちばん最初の画面（まだ説明を見ていない人だけ） ----------
export function startGate(next) {
  const app = inAppName(), os = mobileOS();
  if (isStandalone() || (!app && !os)) { next(); return; } // ホーム画面のアイコン・パソコンは、すぐ説明へ
  S.settings.homeTip = 1; S.settings.homeAsk = Math.max(1, S.settings.homeAsk || 0); save(); // 声かけの1回目
  const box = $('#onboard-box'); $('#onboard').hidden = false;
  const stay = '<button class="btn wide" id="gt-stay">このまま始める</button>';
  const bind = () => { $('#gt-stay').onclick = () => next(); if ($('#gt-copy')) $('#gt-copy').onclick = copyURL; };
  if (app) { // SNSなどのアプリの中：ここではホーム画面に追加できないので、先に Safari／Chrome へ
    box.innerHTML = `<div class="ob-catch"><b>本めぐり</b>本屋をめぐって、本とめぐりあう</div><div class="art gate-art">${ART_OUT}</div><h2 class="gate-h">${browserName()}で開いてください</h2>
      <p>いまは${esc(whereText(app))}で開いています。ここでは、スタンプなどの記録が残りにくく、ホーム画面にも置けません。</p>${inAppSteps(os)}
      <div class="actions gate-actions">${os === 'android' ? `<a class="btn primary wide" id="gt-chrome" href="${esc(chromeLink())}">Chromeで開く</a>` : ''}<button class="btn ${os === 'android' ? '' : 'primary '}wide" id="gt-copy">URLをコピー</button>${stay}</div>`;
    bind(); return;
  }
  const draw = () => {
    const canAdd = os === 'android' && !!BIP;
    box.innerHTML = `<div class="ob-catch"><b>本めぐり</b>本屋をめぐって、本とめぐりあう</div><div class="art gate-art">${ART_HOME}</div><h2 class="gate-h">ホーム画面に追加してから始めると、記録が消えにくくなります</h2>
      <p>${homeWhy(os)}</p>${canAdd ? '' : homeSteps(os)}
      <div class="actions gate-actions">${canAdd ? '<button class="btn primary wide" id="gt-add">ホーム画面に追加する</button>' : ''}${stay}</div>`;
    bind();
    if ($('#gt-add')) $('#gt-add').onclick = async () => {
      const ok = await installNow();
      if (!ok) { draw(); return; }
      box.innerHTML = `<div class="art">${ART_HOME}</div><h2>ホーム画面に追加しました</h2><p>ホーム画面の「本めぐり」から開いてください。ここで続けても、記録は同じです。</p><div class="actions gate-actions">${stay}</div>`; bind();
    };
  };
  draw();
  if (os === 'android' && !BIP) bipWait.push(() => { if (!$('#onboard').hidden && $('#gt-stay') && !$('#gt-add')) draw(); }); // あとから「追加する」が使えるようになったら出し直す
}

// ---------- 上の帯（静かに。× でその回だけ閉じる） ----------
export function showBand(key, text, actions = [], ic = 'alert', stack = false) {
  if ($(`#band-${key}`)) return;
  const d = document.createElement('div'); d.className = 'banner band' + (stack ? ' stack' : ''); /* stack：文が長いときは、ボタンを2段目に */ d.id = `band-${key}`;
  d.innerHTML = `${icon(ic)}<span class="band-t">${esc(text)}</span>${actions.map(([label], k) => `<button type="button" data-k="${k}">${esc(label)}</button>`).join('')}<button type="button" class="band-x" aria-label="閉じる">×</button>`;
  actions.forEach(([, fn], k) => { d.querySelector(`[data-k="${k}"]`).onclick = fn; });
  d.querySelector('.band-x').onclick = () => d.remove();
  $('#banners').appendChild(d);
}
export const hideBand = (key) => { const d = $(`#band-${key}`); if (d) d.remove(); };

// SNSなどのアプリの中のやり方（帯の「やり方」・設定の「記録を守る」から）
export function openInAppHelp() {
  const app = inAppName(), os = mobileOS(); const has = Object.keys(S.stamps).length + S.cards.length > 0;
  openModal(`<h2>${browserName()}で開いてください</h2><p>いまは${esc(whereText(app || 'app'))}で開いています。ここでは、スタンプなどの記録が残りにくく、ホーム画面にも置けません。</p>${inAppSteps(os)}
    ${has ? `<p class="hint">いまの記録は、引き継ぎコードで移せます。先にここで「引き継ぎコードを出す」を押し、${browserName()}で開いた本めぐりの最初の画面（または設定の「コードで受け取る」）で入れてください。</p>` : ''}
    <div class="actions">${os === 'android' ? `<a class="btn primary" href="${esc(chromeLink())}">Chromeで開く</a>` : ''}<button class="btn ${os === 'android' ? '' : 'primary'}" id="ia-copy">URLをコピー</button>${has ? '<button class="btn" id="ia-code">引き継ぎコードを出す</button>' : ''}<button class="btn ghost" id="ia-ok">閉じる</button></div>`);
  $('#ia-copy').onclick = copyURL; $('#ia-ok').onclick = closeModal; if ($('#ia-code')) $('#ia-code').onclick = () => { closeModal(); openGiveCode(); };
}

// 記録を守るために（ホーム画面に追加のやり方）。iPhone で記録がある人には、引き継ぎコードでの移し方も
export function homeTip() {
  if (inAppName()) { openInAppHelp(); return; }
  S.settings.homeTip = 1; save();
  const os = mobileOS(); const ios = os === 'ios'; const has = Object.keys(S.stamps).length + S.cards.length > 0;
  const move = ios && has ? '<p class="hint">いまの記録の移し方：iPhoneでは、ホーム画面のアイコンとSafariとで、記録の置き場所が別になります。①先にここで「引き継ぎコードを出す」を押す ②ホーム画面に追加する ③アイコンから開いた本めぐりの最初の画面で、コードを入れる。</p>' : '';
  const add = os === 'android' && BIP ? '<button class="btn primary" id="ht-add">ホーム画面に追加する</button>' : '';
  openModal(`<h2>記録を守るために</h2><p>${homeWhy(os)}ホーム画面に追加して、アイコンから開くと消えにくくなります。</p>${add ? '' : homeSteps(os)}${move}<div class="actions">${add}${move ? '<button class="btn primary" id="ht-code">引き継ぎコードを出す</button>' : ''}<button class="btn ${move || add ? 'ghost' : 'primary'}" id="ht-ok">わかった</button></div>`);
  $('#ht-ok').onclick = closeModal;
  if ($('#ht-code')) $('#ht-code').onclick = () => { closeModal(); openGiveCode(); };
  if ($('#ht-add')) $('#ht-add').onclick = async () => { const ok = await installNow(); closeModal(); if (ok) toast('ホーム画面に追加しました。これからはアイコンから開いてください', 'ok'); };
}

// ---------- 開いたときの帯 ----------
export function startBands() {
  const app = inAppName();
  if (app) showBand('inapp', `${whereText(app)}で開いています。記録が残りにくいので、${browserName()}で開いてください`, [['やり方', openInAppHelp]]);
  if (S.settings.moved && !S.settings.movedStay) movedBand();
  // コードで移したかを確かめる（預けた側だけ。サーバーが「受け取られた」と答えたら帯）
  let last = 0; const check = () => { if (!S.settings.moveId || Date.now() - last < 60000) return; last = Date.now(); checkMoved().then((moved) => { if (moved) movedBand(); }); };
  // はじめての1回だけ：地図にない本屋の知らせかた（v0.32.2）
  if (!S.settings.addTip) setTimeout(() => { if (S.settings.addTip || document.visibilityState !== 'visible' || $('#modal-box') && !$('#modal-box').closest('[hidden]') && $('#modal-box').offsetParent) return; S.settings.addTip = 1; save(); showBand('addtip', '地図にない本屋は、その場所を長押し（パソコンは右クリック）か、右上の＋で知らせられます', [['わかった', () => hideBand('addtip')]], 'add'); setTimeout(() => hideBand('addtip'), 14000); }, 9000);
  setTimeout(check, 3500); document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
}
function movedBand() {
  showBand('moved', '記録は、移した先（ホーム画面のアイコンや新しい端末）にあります。ここで続けると、記録が分かれます', [['ここで続ける', () => { S.settings.movedStay = 1; save(); hideBand('moved'); }]], 'alert', true);
}

// ---------- 最初のスタンプの直後に、もう1回だけ（声かけは全部で2回まで） ----------
export function homeNudge() {
  if (isStandalone() || inAppName() || !mobileOS()) return;
  if ((S.settings.homeAsk || 0) >= 2) return;
  if (Object.values(S.stamps).filter((x) => !x.trial).length !== 1) return;
  S.settings.homeAsk = 2; save();
  setTimeout(() => showBand('home', 'このスタンプを守るために、ホーム画面に追加しませんか', [['やり方', () => { hideBand('home'); homeTip(); }]], 'add'), 1200); // 注意の印ではなく「＋」で（すすめるだけなので）
}
