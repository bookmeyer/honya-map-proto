// プロフィール（v0.20.0〜）：世代・性別・本の買い方など。どれも答えなくてよい
// v0.20.1：名前（ハンドルネーム）以外の答えは、統計データとして使う（ぶっくまさん 11/3「プロフィールは名前以外の情報を統計データとして使用。」）。画面の上でそう知らせ、答えた分を運営に送る
// 送るのは答え（コード）と名前のない端末の番号だけ。運営が見るのは人数の集計だけ。「答えをすべて消す」と、運営からも消える（events.js queueProfile）
import { PROFILE_Q, PREFS } from './config.js?v=0.20.2';
import { $, $$, esc, todayISO } from './util.js?v=0.20.2';
import { S, save } from './state.js?v=0.20.2';
import * as E from './events.js?v=0.20.2';
import { openModal, closeModal, toast } from './ui.js?v=0.20.2';

const prefCode = (i) => String(i + 1).padStart(2, '0'); // 都道府県は JIS の番号（01 北海道 〜 47 沖縄県）
const has = () => !!(S.profile && Object.keys(S.profile.a).length);
export function profileSummary() { return has() ? '入れた答え（名前はのぞく）は、統計データとして使います' : 'まだ入れていません'; }
export function openProfile(onDone) {
  const a = (S.profile && S.profile.a) || {}, had = has();
  const one = (q, opts) => `<div class="field"><label for="pf-${q.k}">${esc(q.t)}</label><select id="pf-${q.k}"><option value="">答えない</option>${opts.map(([v, t]) => `<option value="${v}"${a[q.k] === v ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select></div>`;
  const many = (q) => `<fieldset class="pf-multi" data-k="${q.k}" data-max="${q.max}"><legend>${esc(q.t)}</legend>${q.o.map(([v, t]) => `<label class="pf-chip"><input type="checkbox" value="${v}"${(a[q.k] || []).includes(v) ? ' checked' : ''}><span>${esc(t)}</span></label>`).join('')}</fieldset>`;
  openModal(`<h2>プロフィール</h2>
    <div class="pf-send"><b>名前（ハンドルネーム）以外の答えは、統計データとして使います。</b>
    <p class="muted small">運営に届くのは、ここで選んだ答えと、名前のない端末の番号だけです。名前・メールアドレス・位置は送りません。集計は人数だけ（例：20代が○人）で、ひとりひとりの答えは出しません。店ごとの集計は、その店に10人以上いるときだけ使います。どれも答えなくて大丈夫です。中学生以下の方は、保護者の方と相談してから入れてください。<a href="privacy.html" target="_blank" rel="noopener">プライバシーポリシー</a></p></div>
    ${PROFILE_Q.map((q) => (q.pref ? one(q, PREFS.map(([n], i) => [prefCode(i), n])) : q.max ? many(q) : one(q, q.o))).join('')}
    <div class="actions"><button class="btn primary" id="pf-save">保存する</button>${had ? '<button class="btn ghost" id="pf-clear">答えをすべて消す</button>' : ''}<button class="btn ghost" id="pf-cancel">やめる</button></div>`);
  $$('#modal-box .pf-multi').forEach((fs) => fs.addEventListener('change', (ev) => { const max = Number(fs.dataset.max); if (fs.querySelectorAll('input:checked').length > max) { ev.target.checked = false; toast(`${max}つまで選べます`, 'warn'); } }));
  $('#pf-cancel').onclick = closeModal;
  const done = (msg) => { save(); closeModal(); toast(msg, 'ok'); if (onDone) onDone(); };
  if ($('#pf-clear')) $('#pf-clear').onclick = () => { S.profile = { a: {}, d: todayISO(), send: false }; E.queueProfile('del'); done('答えをすべて消しました（運営からも消します）'); };
  $('#pf-save').onclick = () => {
    const na = {};
    for (const q of PROFILE_Q) {
      if (q.max) { const v = [...$$(`#modal-box .pf-multi[data-k="${q.k}"] input:checked`)].map((x) => x.value); if (v.length) na[q.k] = v; } else { const v = $(`#pf-${q.k}`).value; if (v) na[q.k] = v; }
    }
    const any = Object.keys(na).length > 0;
    S.profile = { a: na, d: todayISO(), send: any };
    if (any) E.queueProfile('put'); else if (had) E.queueProfile('del');
    done(any ? 'プロフィールを保存しました（名前以外の答えは、統計データとして使います）' : had ? '答えを消しました（運営からも消します）' : 'プロフィールを保存しました');
  };
}
