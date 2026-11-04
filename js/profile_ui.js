// プロフィール（v0.20.0〜）：世代・性別・本の買い方など
// v0.20.1：名前（ハンドルネーム）以外の答えは、統計データとして使う（ぶっくまさん 11/3「プロフィールは名前以外の情報を統計データとして使用。」）。画面の上でそう知らせ、答えた分を運営に送る
// v0.21.0：9問すべて必須（性別だけ「答えない」あり）。はじめの設定（setup_ui.js）と同じ部品で入れる（ぶっくまさん 11/4「ハンドルネームとプロフィール、アイコン設定後にアプリが使えるように」）
// 送るのは答え（コード）と名前のない端末の番号だけ。運営が見るのは人数の集計だけ。「答えをすべて消す」と、運営からも消える（次に開いたときに、もう一度答えていただく）
import { PROFILE_Q, PREFS } from './config.js?v=0.22.2';
import { $, $$, esc, todayISO } from './util.js?v=0.22.2';
import { S, save } from './state.js?v=0.22.2';
import * as E from './events.js?v=0.22.2';
import { openModal, closeModal, toast } from './ui.js?v=0.22.2';

const prefCode = (i) => String(i + 1).padStart(2, '0'); // 都道府県は JIS の番号（01 北海道 〜 47 沖縄県）
const optsOf = (q) => (q.pref ? PREFS.map(([n], i) => [prefCode(i), n]) : q.o);
// 9問すべて答えたか（いくつか選ぶものは1つ以上）
export const profileComplete = (p) => !!(p && p.a) && PROFILE_Q.every((q) => { const v = p.a[q.k]; return q.max ? Array.isArray(v) && v.length > 0 : typeof v === 'string' && v !== ''; });
export const missingOf = (a) => PROFILE_Q.filter((q) => (q.max ? !(a[q.k] || []).length : !a[q.k]));
export const shortTitle = (q) => q.t.replace(/（.*?）/g, '');
// 統計データとして使うことのお知らせ（はじめの設定とプロフィールの画面の上に）
export const STAT_NOTE = `<div class="pf-send"><b>名前（ハンドルネーム）以外の答えは、統計データとして使います。</b>
  <p class="muted small">運営に届くのは、ここで選んだ答えと、名前のない端末の番号だけです。名前・メールアドレス・位置は送りません。集計は人数だけ（例：20代が○人）で、ひとりひとりの答えは出しません。店ごとの集計は、その店に10人以上いるときだけ使います。性別は「答えない」も選べます。中学生以下の方は、保護者の方と相談してから入れてください。<a href="privacy.html" target="_blank" rel="noopener">プライバシーポリシー</a></p></div>`;
// 質問の部品（a：いまの答え）。1つ選ぶものは「選んでください」から、いくつか選ぶものは札
export function profileFields(a) {
  const one = (q) => `<div class="field" data-q="${q.k}"><label for="pf-${q.k}">${esc(q.t)}<span class="req">必須</span></label><select id="pf-${q.k}"><option value="">選んでください</option>${optsOf(q).map(([v, t]) => `<option value="${v}"${a[q.k] === v ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select></div>`;
  const many = (q) => `<fieldset class="pf-multi" data-q="${q.k}" data-k="${q.k}" data-max="${q.max}"><legend>${esc(q.t)}<span class="req">必須</span></legend>${q.o.map(([v, t]) => `<label class="pf-chip"><input type="checkbox" value="${v}"${(a[q.k] || []).includes(v) ? ' checked' : ''}><span>${esc(t)}</span></label>`).join('')}</fieldset>`;
  return PROFILE_Q.map((q) => (q.max ? many(q) : one(q))).join('');
}
export function bindProfileFields(root) {
  root.querySelectorAll('.pf-multi').forEach((fs) => fs.addEventListener('change', (ev) => { const max = Number(fs.dataset.max); if (fs.querySelectorAll('input:checked').length > max) { ev.target.checked = false; toast(`${max}つまで選べます`, 'warn'); } }));
}
export function readProfileFields(root) {
  const na = {};
  for (const q of PROFILE_Q) {
    if (q.max) { const v = [...root.querySelectorAll(`.pf-multi[data-k="${q.k}"] input:checked`)].map((x) => x.value); if (v.length) na[q.k] = v; } else { const el = root.querySelector(`#pf-${q.k}`); if (el && el.value) na[q.k] = el.value; }
  }
  return na;
}
// まだの質問を目立たせて、そこへ動かす
export function pointMissing(root, el) { if (!el) return; el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.add('need'); setTimeout(() => el.classList.remove('need'), 1800); }
export function profileSummary() { return profileComplete(S.profile) ? '入れた答え（名前はのぞく）は、統計データとして使います' : 'まだ答えていない質問があります'; }
export function openProfile(onDone) {
  const a = (S.profile && S.profile.a) || {}, had = !!(S.profile && Object.keys(S.profile.a).length);
  openModal(`<h2>プロフィール</h2>${STAT_NOTE}${profileFields(a)}
    <div class="actions"><button class="btn primary" id="pf-save">保存する</button><button class="btn ghost" id="pf-cancel">やめる</button></div>
    ${had ? '<p class="muted small" style="margin-top:14px">答えを運営から消したいときは「答えをすべて消す」。消すと、次に開いたときに、もう一度答えていただきます。</p><div class="actions"><button class="btn ghost" id="pf-clear">答えをすべて消す</button></div>' : ''}`);
  const box = $('#modal-box'); bindProfileFields(box);
  $('#pf-cancel').onclick = closeModal;
  const done = (msg) => { save(); closeModal(); toast(msg, 'ok'); if (onDone) onDone(); };
  if ($('#pf-clear')) $('#pf-clear').onclick = () => { S.profile = { a: {}, d: todayISO(), send: false }; E.queueProfile('del'); done('答えをすべて消しました（運営からも消します）'); };
  $('#pf-save').onclick = () => {
    const na = readProfileFields(box), miss = missingOf(na);
    if (miss.length) { toast(`まだ答えていない質問：${miss.slice(0, 3).map(shortTitle).join('・')}${miss.length > 3 ? ` ほか${miss.length - 3}つ` : ''}`, 'warn'); pointMissing(box, box.querySelector(`[data-q="${miss[0].k}"]`)); return; }
    S.profile = { a: na, d: todayISO(), send: true }; E.queueProfile('put');
    done('プロフィールを保存しました（名前以外の答えは、統計データとして使います）');
  };
}
