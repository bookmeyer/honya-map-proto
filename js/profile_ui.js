// プロフィール（v0.20.0）：世代・性別・本の買い方など。どれも答えなくてよい。答えはこの端末に残し、運営に送るのは本人が同意したときだけ
// ぶっくまさん 11/3「プロフィールに 世代・性別・年間購入冊数 ほか、マーケティングの観点で必要なものを設定できるようにして」→「ぜんぶ提案の通りで」
// 送るのは答え（コード）と名前のない端末の番号だけ。運営が見るのは人数の集計だけ。オフにすると、送った答えをサーバーから消す（events.js queueProfile）
import { PROFILE_Q, PREFS } from './config.js?v=0.20.0';
import { $, $$, esc, todayISO } from './util.js?v=0.20.0';
import { S, save } from './state.js?v=0.20.0';
import * as E from './events.js?v=0.20.0';
import { openModal, closeModal, toast } from './ui.js?v=0.20.0';

const prefCode = (i) => String(i + 1).padStart(2, '0'); // 都道府県は JIS の番号（01 北海道 〜 47 沖縄県）
export function profileSummary() {
  const p = S.profile; if (!p || !Object.keys(p.a).length) return 'まだ入れていません';
  return p.send ? '運営に送っています（人数の集計に使います）' : 'この端末の中だけ（運営には送っていません）';
}
export function openProfile(onDone) {
  const a = (S.profile && S.profile.a) || {}, send0 = !!(S.profile && S.profile.send);
  const one = (q, opts) => `<div class="field"><label for="pf-${q.k}">${esc(q.t)}</label><select id="pf-${q.k}"><option value="">答えない</option>${opts.map(([v, t]) => `<option value="${v}"${a[q.k] === v ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select></div>`;
  const many = (q) => `<fieldset class="pf-multi" data-k="${q.k}" data-max="${q.max}"><legend>${esc(q.t)}</legend>${q.o.map(([v, t]) => `<label class="pf-chip"><input type="checkbox" value="${v}"${(a[q.k] || []).includes(v) ? ' checked' : ''}><span>${esc(t)}</span></label>`).join('')}</fieldset>`;
  openModal(`<h2>プロフィール</h2><p class="hint">どれも答えなくて大丈夫です。答えは、この端末に残ります。</p>
    ${PROFILE_Q.map((q) => (q.pref ? one(q, PREFS.map(([n], i) => [prefCode(i), n])) : q.max ? many(q) : one(q, q.o))).join('')}
    <div class="pf-send"><label class="chk"><input type="checkbox" id="pf-send"${send0 ? ' checked' : ''}> 集計に使うことに同意して、運営に送る</label>
    <p class="muted small">送るのは、ここで選んだ答えと、名前のない端末の番号だけです。名前・メールアドレス・位置は送りません。運営が見るのは人数の集計（例：20代が○人）だけで、本屋さんや出版社に伝えるときも集計だけです。店ごとの集計は、その店に10人以上いるときだけ見ます。オフにすると、送った答えをサーバーから消します。<a href="privacy.html" target="_blank" rel="noopener">プライバシーポリシー</a></p></div>
    <div class="actions"><button class="btn primary" id="pf-save">保存する</button><button class="btn ghost" id="pf-cancel">やめる</button></div>`);
  $$('#modal-box .pf-multi').forEach((fs) => fs.addEventListener('change', (ev) => { const max = Number(fs.dataset.max); if (fs.querySelectorAll('input:checked').length > max) { ev.target.checked = false; toast(`${max}つまで選べます`, 'warn'); } }));
  $('#pf-cancel').onclick = closeModal;
  $('#pf-save').onclick = () => {
    const na = {};
    for (const q of PROFILE_Q) {
      if (q.max) { const v = [...$$(`#modal-box .pf-multi[data-k="${q.k}"] input:checked`)].map((x) => x.value); if (v.length) na[q.k] = v; } else { const v = $(`#pf-${q.k}`).value; if (v) na[q.k] = v; }
    }
    const any = Object.keys(na).length > 0, send = $('#pf-send').checked && any;
    S.profile = { a: na, d: todayISO(), send }; save();
    if (send) E.queueProfile('put'); else if (send0) E.queueProfile('del');
    closeModal(); toast(send ? 'プロフィールを保存しました。運営に送ります（人数の集計に使います）' : send0 ? 'プロフィールを保存しました。運営に送った答えは消します' : 'プロフィールを保存しました（この端末の中だけ）', 'ok');
    if (onDone) onDone();
  };
}
