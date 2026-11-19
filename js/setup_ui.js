// はじめの設定（v0.21.0）：ハンドルネーム・自分のアイコン・プロフィール（9問）を決めてから、本めぐりが使えるように
// ぶっくまさん 11/4「ハンドルネームとプロフィール、アイコン設定後にアプリが使えるようにしてほしい。そうしないと入れないはず」
// → アイコンは絵（12）から選ぶか写真。プロフィールは9問すべて必須（性別だけ「答えない」あり）。もう使っている人も、次に開いたときに（記録はそのまま）
// ハンドルネームとアイコンは、この端末の中だけ（送らない）。プロフィールは名前以外の答えを統計データとして送る（profile_ui.js・events.js queueProfile）
import { $, esc, todayISO, icon } from './util.js?v=0.30.0';
import { S, save } from './state.js?v=0.30.0';
import * as E from './events.js?v=0.30.0';
import * as MAP from './map.js?v=0.30.0';
import { toast, refreshHud, openModal, closeModal } from './ui.js?v=0.30.0';
import { cleanHandle, makeAvatar } from './settings_ui.js?v=0.30.0';
import { profileFields, bindProfileFields, readProfileFields, missingOf, profileComplete, shortTitle, pointMissing, STAT_NOTE } from './profile_ui.js?v=0.30.0';

// ---- アイコンの絵（12）：アプリの見た目と同じ、太い墨のふち・べた塗り。選んだら PNG にして持つ ----
const ST = 'stroke="#1B1B1B" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"';
const svg = (bg, g) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64"><rect width="64" height="64" fill="${bg}"/>${g}</svg>`;
// 少々キモいキャラ（v0.30.0。11/20 ぶっくまさん「少々キモイキャラを入れて、違和感を演出」）の細い線と目
const T2 = 'stroke="#1B1B1B" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"';
const eye = (x, y, r = 2.6, px = 0.7, py = 0.3) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff" ${T2}/><circle cx="${x + px}" cy="${y + py}" r="${(r * 0.42).toFixed(2)}" fill="#1B1B1B"/>`;
export const AVATARS = [
  { id: 'book', n: '本', svg: svg('#FFD447', `<path d="M10 22 Q21 17 31 22 V47 Q21 42 10 47 Z" fill="#fff" ${ST}/><path d="M54 22 Q43 17 33 22 V47 Q43 42 54 47 Z" fill="#fff" ${ST}/><path d="M15 29 Q21 27 26 29 M15 35 Q21 33 26 35 M38 29 Q43 27 49 29" fill="none" stroke="#D9CDB4" stroke-width="2.5" stroke-linecap="round"/>`) },
  { id: 'cat', n: 'ねこ', svg: svg('#FF7AB6', `<path d="M17 27 L19 12 L29 20 Q32 19 35 20 L45 12 L47 27 Q51 34 47 42 Q41 51 32 51 Q23 51 17 42 Q13 34 17 27 Z" fill="#fff" ${ST}/><circle cx="26" cy="34" r="2.6" fill="#1B1B1B"/><circle cx="38" cy="34" r="2.6" fill="#1B1B1B"/><path d="M29 41 Q32 44 35 41" fill="none" stroke="#1B1B1B" stroke-width="2.5" stroke-linecap="round"/>`) },
  { id: 'glasses', n: 'めがね', svg: svg('#2F9BFF', `<circle cx="22" cy="34" r="9.5" fill="#fff" ${ST}/><circle cx="42" cy="34" r="9.5" fill="#fff" ${ST}/><path d="M31.5 32 Q32 29 32.5 32" fill="none" ${ST}/><path d="M12.5 31 L8 25 M51.5 31 L56 25" fill="none" ${ST}/>`) },
  { id: 'coffee', n: 'コーヒー', svg: svg('#B9794A', `<path d="M16 29 H43 V40 Q43 50 29.5 50 Q16 50 16 40 Z" fill="#fff" ${ST}/><path d="M43 32 Q52 32 52 38 Q52 44 43 44" fill="none" ${ST}/><path d="M24 23 Q21 18 25 13 M32 23 Q29 18 33 13" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"/>`) },
  { id: 'tsundoku', n: '積読おばけ', svg: svg('#7A8CA3',
    `<rect x="12" y="45" width="40" height="8" rx="1.5" fill="#FF6A48" ${ST}/>`
    + `<rect x="15" y="37" width="35" height="8" rx="1.5" fill="#FFD447" ${ST}/>`
    + `<rect x="17" y="29.5" width="31" height="7.5" fill="#1B1B1B"/>`
    + `<ellipse cx="27" cy="33.3" rx="3.4" ry="2.3" fill="#fff"/><ellipse cx="37" cy="33.3" rx="3.4" ry="2.3" fill="#fff"/>`
    + `<circle cx="27.6" cy="33.6" r="1.25" fill="#1B1B1B"/><circle cx="37.6" cy="33.6" r="1.25" fill="#1B1B1B"/>`
    + `<rect x="14" y="21.5" width="36" height="8" rx="1.5" fill="#2F9BFF" ${ST}/>`
    + `<path d="M19 45.5 V52.5 M46 37.5 V44.5" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".7"/>`
    + `<path d="M40 22 q0 -4.5 2 -4.5 q2 0 2 4.5 M44 22 q0 -5.5 2 -5.5 q2 0 2 5.5 M48 22.5 q0 -4 1.8 -4 q1.8 0 1.8 4" fill="#E9F0F7" ${T2}/>`) }, // 少々キモい（v0.30.0）
  { id: 'pencil', n: 'えんぴつ', svg: svg('#4FC07A', `<path d="M17 47 L19.5 38.5 L40 18 L46 24 L25.5 44.5 Z" fill="#FFD447" ${ST}/><path d="M17 47 L19.5 38.5 L25.5 44.5 Z" fill="#fff" ${ST}/><path d="M36 22 L42 28" fill="none" ${ST}/>`) },
  { id: 'star', n: 'ほし', svg: svg('#A86CFF', `<path d="M32 15 L36.4 26.4 L48.6 27.2 L39.2 35 L42.2 46.9 L32 40.4 L21.8 46.9 L24.8 35 L15.4 27.2 L27.6 26.4 Z" fill="#FFD447" ${ST}/>`) },
  { id: 'leaf', n: 'はっぱ', svg: svg('#FFF1D2', `<path d="M15 47 Q15 18 49 15 Q49 47 15 47 Z" fill="#4FC07A" ${ST}/><path d="M15 47 L39 25" fill="none" ${ST}/>`) },
  { id: 'honnomushi', n: '本の虫', svg: svg('#FFE9A8',
    `<circle cx="14" cy="49" r="5.5" fill="#9BE07A" ${ST}/><circle cx="21" cy="44" r="6.5" fill="#9BE07A" ${ST}/><circle cx="29" cy="38" r="7.5" fill="#9BE07A" ${ST}/>`
    + `<circle cx="40" cy="28" r="13" fill="#B6EE8E" ${ST}/>`
    + eye(34, 23, 2.6) + eye(41, 19.5, 2.9) + eye(48, 24, 2.4) + eye(37.5, 29, 2.2, -0.6) + eye(45.5, 30.5, 2.1, 0.5, -0.4)
    + `<path d="M40 36 q-1 3 0.5 6 l2.5 9 l-2.6 -2.2 l-1.6 3.2 l-1.7 -9.5 q-0.6 -3.5 0.4 -6.5" fill="#FF6A48" ${T2}/>`
    + `<path d="M35.5 35.5 q4.5 2.6 9 0" fill="none" ${T2}/>`) }, // 少々キモい（v0.30.0）
  { id: 'bird', n: 'とり', svg: svg('#8ED8F8', `<path d="M13 37 Q13 22 30 22 Q41 22 45 30 L53 32 L45 36 Q43 47 30 47 Q13 47 13 37 Z" fill="#FFD447" ${ST}/><circle cx="37" cy="30" r="2.6" fill="#1B1B1B"/><path d="M19 37 Q26 32 33 38" fill="none" ${ST}/>`) },
  { id: 'apple', n: 'りんご', svg: svg('#22305A', `<path d="M32 23 C26 17 14 19 14 31 C14 43 23 51 29 50 C31 49.5 33 49.5 35 50 C41 51 50 43 50 31 C50 19 38 17 32 23 Z" fill="#FF6A48" ${ST}/><path d="M32 23 Q32 17 35 12" fill="none" ${ST}/><path d="M35 15 Q42 10 46 16 Q39 20 35 15 Z" fill="#4FC07A" ${ST}/>`) },
  { id: 'heart', n: 'ハート', svg: svg('#FF6A48', `<path d="M32 49 C15 38 11 30 11 24 C11 17 17 13 23 13 C27 13 30 15 32 18 C34 15 37 13 41 13 C47 13 53 17 53 24 C53 30 49 38 32 49 Z" fill="#fff" ${ST}/>`) },
  { id: 'shiori', n: 'しおりおじさん', svg: svg('#FF9E7A',
    `<path d="M32 9 q-3 -3 -5 -1 M32 9 q3 -3 5 -1" fill="none" stroke="#C0392B" stroke-width="2.4" stroke-linecap="round"/>`
    + `<path d="M23 13 Q23 10 26 10 H38 Q41 10 41 13 V55 L32 50 L23 55 Z" fill="#FFF3D6" ${ST}/>`
    + `<circle cx="32" cy="15" r="1.8" fill="none" ${T2}/>`
    + `<path d="M25.5 25 q3 -2.2 5.6 -0.4 M33 24.6 q2.6 -1.8 5.6 0.4" fill="none" stroke="#1B1B1B" stroke-width="2.6" stroke-linecap="round"/>`
    + `<path d="M26.5 29.5 h4 M33.5 29.5 h4" stroke="#1B1B1B" stroke-width="2" stroke-linecap="round"/>`
    + `<path d="M28 30.6 q0.6 1 1.6 0.9 M34.6 30.6 q0.6 1 1.6 0.9" fill="none" stroke="#1B1B1B" stroke-width="1" stroke-linecap="round" opacity=".6"/>`
    + `<path d="M32 31 q-1.2 4 0.4 5.2" fill="none" stroke="#1B1B1B" stroke-width="1.6" stroke-linecap="round"/>`
    + `<path d="M26.5 39 q2.8 -2 5.5 -0.6 q2.7 -1.4 5.5 0.6 q-2.6 1.4 -5.5 0.4 q-2.9 1 -5.5 -0.4 Z" fill="#3A2A20"/>`
    + `<path d="M29.5 42.6 h5" stroke="#1B1B1B" stroke-width="1.6" stroke-linecap="round"/>`
    + `<circle cx="26.3" cy="35" r="1.6" fill="#FF9E9E" opacity=".55"/><circle cx="37.7" cy="35" r="1.6" fill="#FF9E9E" opacity=".55"/>`) }, // 少々キモい（v0.30.0）
  { id: 'dog', n: 'いぬ', svg: svg('#F2C9A0', `<ellipse cx="32" cy="35" rx="13.5" ry="12.5" fill="#fff" ${ST}/><path d="M19 29 Q11 31 13 45 Q20 43 21 36 Z M45 29 Q53 31 51 45 Q44 43 43 36 Z" fill="#B9794A" ${ST}/><circle cx="27" cy="33" r="2.4" fill="#1B1B1B"/><circle cx="37" cy="33" r="2.4" fill="#1B1B1B"/><ellipse cx="32" cy="39.5" rx="3.2" ry="2.3" fill="#1B1B1B"/>`) },
  { id: 'flower', n: 'はな', svg: svg('#FFB4A2', `${[[32, 21.5], [42, 28.8], [38.2, 40.5], [25.8, 40.5], [22, 28.8]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="7.5" fill="#fff" ${ST}/>`).join('')}<circle cx="32" cy="32" r="6.5" fill="#FFD447" ${ST}/>`) },
];
// 絵を PNG に（アイコンは PNG・JPEG だけ持つ。state.js の確かめ）
const svgPng = (s, N = 160) => new Promise((res, rej) => {
  const im = new Image();
  im.onload = () => { try { const cv = document.createElement('canvas'); cv.width = N; cv.height = N; cv.getContext('2d').drawImage(im, 0, 0, N, N); res(cv.toDataURL('image/png')); } catch (e) { rej(e); } };
  im.onerror = rej; im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s);
});
function avatarGrid(cur) {
  return `<div class="av-grid">${AVATARS.map((a) => `<button type="button" class="av-opt${cur === a.id ? ' on' : ''}" data-av="${a.id}" aria-label="${esc(a.n)}" aria-pressed="${cur === a.id}">${a.svg}</button>`).join('')}<label class="av-opt av-photo${cur === 'photo' ? ' on' : ''}" aria-label="スマホの写真から選ぶ"><input type="file" accept="image/*" hidden class="av-file">${icon('camera')}<span>写真を<br>選ぶ</span></label></div>`;
}
// 選んだら onPick({ kind：絵の名前か photo, url：PNG・JPEG のデータ })
function bindAvatarGrid(root, onPick) {
  const mark = (el) => root.querySelectorAll('.av-opt').forEach((x) => { x.classList.toggle('on', x === el); if (x.dataset.av) x.setAttribute('aria-pressed', String(x === el)); });
  root.querySelectorAll('.av-opt[data-av]').forEach((b) => b.addEventListener('click', async () => {
    const a = AVATARS.find((x) => x.id === b.dataset.av); if (!a) return;
    try { onPick({ kind: a.id, url: await svgPng(a.svg) }); mark(b); } catch (e) { toast('アイコンを作れませんでした。ほかの絵か写真で', 'warn'); }
  }));
  const f = root.querySelector('.av-file');
  if (f) f.addEventListener('change', async (e) => { const file = e.target.files[0]; if (!file) return; try { onPick({ kind: 'photo', url: await makeAvatar(file) }); mark(f.closest('.av-opt')); } catch (err) { toast('写真を読めませんでした。ほかの写真か絵で', 'warn'); } });
}
// ---- 設定から：アイコンを替える ----
export function openAvatarPicker(after) {
  openModal(`<h2>自分のアイコン</h2><p class="hint">地図の現在地に出ます。絵から選ぶか、「写真を選ぶ」でスマホの写真を使えます。写真はこの端末の中だけに置き、どこにも送りません。</p>${avatarGrid(S.settings.avatarKind || (S.settings.avatar ? 'photo' : ''))}<div class="actions"><button class="btn ghost wide" id="avp-close">閉じる</button></div>`);
  $('#avp-close').onclick = closeModal;
  bindAvatarGrid($('#modal-box'), ({ kind, url }) => { S.settings.avatar = url; S.settings.avatarKind = kind; save(); MAP.setAvatar(url); refreshHud(); closeModal(); toast('アイコンを替えました', 'ok'); if (after) after(); });
}
// ---- はじめの設定 ----
const SKIP = (() => { try { return /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && localStorage.getItem('meguri_nosetup') === '1'; } catch (e) { return false; } })(); // 手元の試しだけ、とばせる
export const setupDone = () => !!cleanHandle(S.settings.handle) && !!S.settings.avatar && profileComplete(S.profile);
export function requireSetup(cb) { if (SKIP || setupDone()) { if (cb) cb(); return; } showSetup(cb); }
export function showSetup(cb) {
  if ($('#setup')) return;
  const s = S.settings, a = (S.profile && S.profile.a) || {};
  let av = s.avatar ? { kind: s.avatarKind || 'photo', url: s.avatar } : null;
  const box = document.createElement('div'); box.id = 'setup'; box.className = 'onboard setup';
  box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', 'はじめの設定');
  box.innerHTML = `<div class="onboard-box setup-box">
    <div class="ob-catch"><b>はじめの設定</b>3つ決めると、本めぐりが始められます</div>
    <p class="setup-sub">あとから、設定でいつでも変えられます。</p>
    <section class="setup-sec" data-sec="name"><h3>1. ハンドルネーム<span class="req">必須</span></h3>
      <input type="text" id="su-name" maxlength="20" placeholder="例：本の虫" autocomplete="nickname" value="${esc(s.handle || '')}">
      <p class="muted small">見出しや、その日の物語に出ます。この端末の中だけに残し、運営には送りません。</p></section>
    <section class="setup-sec" data-sec="icon"><h3>2. 自分のアイコン<span class="req">必須</span></h3>
      <p class="muted small">地図の現在地に出ます。絵から選ぶか、「写真を選ぶ」でスマホの写真を使えます。写真はこの端末の中だけに残し、運営には送りません。</p>${avatarGrid(av ? av.kind : '')}</section>
    <section class="setup-sec" data-sec="profile"><h3>3. プロフィール<span class="req">必須</span></h3>${STAT_NOTE}${profileFields(a)}</section>
    <div class="su-foot"><button class="btn primary wide" id="su-go">はじめる</button></div>
  </div>`;
  document.body.appendChild(box);
  bindProfileFields(box); bindAvatarGrid(box, (p) => { av = p; });
  $('#su-go').onclick = () => {
    const name = cleanHandle($('#su-name').value), na = readProfileFields(box), miss = [];
    if (!name) miss.push(['[data-sec="name"]', 'ハンドルネーム']);
    if (!av) miss.push(['[data-sec="icon"]', 'アイコン']);
    for (const q of missingOf(na)) miss.push([`[data-q="${q.k}"]`, shortTitle(q)]);
    if (miss.length) { toast(`まだ決まっていないもの：${miss.slice(0, 4).map((m) => m[1]).join('・')}${miss.length > 4 ? ` ほか${miss.length - 4}つ` : ''}`, 'warn'); pointMissing(box, box.querySelector(miss[0][0])); return; }
    s.handle = name; s.avatar = av.url; s.avatarKind = av.kind; S.profile = { a: na, d: todayISO(), send: true }; save();
    E.queueProfile('put'); MAP.setAvatar(av.url); refreshHud(); box.remove();
    toast(`ようこそ、${name}さん。本めぐりを始めましょう`, 'ok'); if (cb) cb();
  };
}
